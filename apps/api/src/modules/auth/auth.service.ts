import { createHash, randomBytes } from 'node:crypto'
import { db, inTx, type Tx } from '../../kit/db.ts'
import { invalid, unauthorized } from '../../kit/app-error.ts'
import { permissionsOf } from '../../kit/permissions.ts'
import { writeAudit } from '../../kit/audit.ts'

/**
 * เข้าและออกจากระบบฝั่งหลังบ้าน — ชื่อผู้ใช้กับรหัสผ่าน
 *
 * ฝั่งเจ้าของสัตว์อยู่คนละไฟล์ (`owner-auth`) เพราะเป็นคนละกลไกกันทั้งหมด
 * ดู `docs/standards/auth.md`
 */

/** สิบชั่วโมง = หนึ่งวันทำงาน · นับจากตอนล็อกอิน **ไม่ต่ออายุ** */
const SESSION_HOURS = 10

/**
 * รหัสผิดกี่ครั้งถึงล็อก
 *
 * ล็อกแล้ว **ไม่ปลดเอง** ต้องมีผู้ดูแลมาปลด — ดู `///` บน `user.lockedAt` ในสคีมา
 */
const LOGIN_ATTEMPT_LIMIT = 5

/** 32 ไบต์สุ่ม = เดาไม่ได้ในทางปฏิบัติ */
const TOKEN_BYTES = 32

/** ความยาวรหัสผ่านขั้นต่ำตอนตั้งใหม่ */
const MIN_PASSWORD_LENGTH = 6

/**
 * hash ของ token ที่เก็บลงตาราง
 *
 * **sha256 ไม่ใช่ argon2 โดยตั้งใจ** — token คือสุ่ม 32 ไบต์อยู่แล้ว ไม่มีอะไรให้เดา
 * และฟังก์ชันนี้ทำงานทุก request · เป้าหมายคือ "ฐานที่หลุดออกไปใช้อะไรไม่ได้" เท่านั้น
 * ต่างจากรหัสผ่านที่คนตั้งเอง ซึ่งเดาได้และต้องทำให้การเดาแต่ละครั้งแพง
 */
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/**
 * hash ปลอมสำหรับเทียบตอนไม่มีบัญชีนั้นอยู่จริง
 *
 * คำนวณครั้งเดียวตอนโหลดไฟล์ · มีไว้ให้เส้นทาง "ไม่มีผู้ใช้คนนี้" ใช้เวลาเท่ากับ
 * เส้นทาง "มีแต่รหัสผิด" · ไม่มีตัวนี้ การตอบกลับที่เร็วกว่าจะบอกคนที่กำลังไล่เดาว่า
 * ชื่อผู้ใช้ไหนมีอยู่จริง ซึ่งเป็นครึ่งหนึ่งของงานที่เขาต้องทำ
 */
const DUMMY_HASH = await Bun.password.hash('dummy-password-for-timing-equalisation')

export type MeResult = {
  id: bigint
  username: string
  mustChangePassword: boolean
  role: { id: bigint; name: string }
  permissions: string[]
  /**
   * พนักงานเจ้าของบัญชี — `null` = บัญชีที่ไม่ได้ผูกกับใคร (เช่นบัญชี `system`)
   *
   * มีไว้ให้หน้าจอเรียกชื่อจริงแทนชื่อผู้ใช้ · ไม่มีก็แสดง `username` แทน
   */
  employee: { id: bigint; firstName: string; lastName: string; nickname: string | null } | null
}

export type LoginInput = {
  username: string
  password: string
  ip?: string | undefined
  userAgent?: string | undefined
}

export type LoginResult = MeResult & { token: string }

/**
 * บันทึกความพยายามเข้าระบบหนึ่งครั้ง
 *
 * **เรียกนอกทรานแซกชันเสมอ** — บันทึกที่ล้มเหลวไปพร้อมกับการล็อกอินที่ล้มเหลว
 * คือบันทึกที่ไม่มีวันมีแถวของการล็อกอินที่ล้มเหลวเลย ซึ่งกลับหัวกับเหตุผลที่มันมีอยู่
 */
async function recordAttempt(input: {
  identifier: string
  result: 'SUCCESS' | 'FAILED_NO_USER' | 'FAILED_PASSWORD' | 'FAILED_SUSPENDED' | 'FAILED_LOCKED' | 'LOGOUT'
  userId?: bigint | null
  ip?: string | undefined
  userAgent?: string | undefined
}): Promise<void> {
  await db.loginLog.create({
    data: {
      identifier: input.identifier.slice(0, 255),
      result: input.result,
      userId: input.userId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent?.slice(0, 500) ?? null,
    },
  })
}

/**
 * นับรหัสผิดหนึ่งครั้ง และล็อกเมื่อครบ
 *
 * **อยู่นอกทรานแซกชันของ `login`** เพราะ `login` โยน error ทิ้ง ซึ่งจะ rollback
 * การนับไปด้วย แล้วตัวนับจะไม่ขยับเลยตลอดกาล
 */
async function countFailure(userId: bigint): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { failedAttempts: true, lockCount: true },
  })
  if (!user) return

  const next = user.failedAttempts + 1
  const shouldLock = next >= LOGIN_ATTEMPT_LIMIT

  await db.user.update({
    where: { id: userId },
    data: {
      failedAttempts: next,
      ...(shouldLock ? { lockedAt: new Date(), lockCount: user.lockCount + 1 } : {}),
    },
  })
}

/** อ่านว่าบัญชีนี้เป็นใครและถือสิทธิ์อะไร */
async function describe(userId: bigint): Promise<MeResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      mustChangePassword: true,
      role: { select: { id: true, name: true, isSystem: true } },
      employee: {
        select: { id: true, firstName: true, lastName: true, nickname: true },
      },
    },
  })

  if (!user) throw unauthorized('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่')

  return {
    id: user.id,
    username: user.username,
    mustChangePassword: user.mustChangePassword,
    role: { id: user.role.id, name: user.role.name },
    permissions: await permissionsOf(user.role.id, user.role.isSystem),
    employee: user.employee,
  }
}

/**
 * เข้าสู่ระบบ
 *
 * **ทุกเหตุผลที่ล็อกอินไม่ผ่าน ตอบข้อความเดียวกันหมด** — ชื่อผู้ใช้ไม่มี · รหัสผิด ·
 * ถูกระงับ · ถูกล็อก · ข้อความที่ต่างกันคือแผนที่ให้คนที่กำลังไล่เดา ว่าเดาถูกไปแล้ว
 * กี่ส่วน
 *
 * **ตรวจรหัสผ่านก่อนตรวจว่าถูกระงับหรือถูกล็อกเสมอ** ด้วยเหตุผลเดียวกัน — สลับลำดับ
 * เมื่อไหร่ เวลาที่ใช้ตอบจะบอกได้ว่าบัญชีนั้นมีอยู่จริง
 *
 * ตัด `username` หัวท้าย แต่ **ไม่ตัดรหัสผ่าน** — ช่องว่างในรหัสอาจตั้งใจใส่
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  const username = input.username.trim()
  const { password } = input

  if (username.length === 0 || password.length === 0) {
    throw invalid('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน')
  }

  const REFUSE = () => unauthorized('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')

  const user = await db.user.findUnique({
    where: { username },
    select: { id: true, passwordHash: true, suspendedAt: true, lockedAt: true },
  })

  if (!user) {
    // เทียบกับ hash ปลอมเพื่อให้ใช้เวลาเท่าเส้นทางที่มีบัญชีจริง
    await Bun.password.verify(password, DUMMY_HASH)
    await recordAttempt({
      identifier: username,
      result: 'FAILED_NO_USER',
      ip: input.ip,
      userAgent: input.userAgent,
    })
    throw REFUSE()
  }

  const passwordOk = await Bun.password.verify(password, user.passwordHash)

  if (!passwordOk) {
    await countFailure(user.id)
    await recordAttempt({
      identifier: username,
      result: 'FAILED_PASSWORD',
      userId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
    })
    throw REFUSE()
  }

  if (user.suspendedAt) {
    await recordAttempt({
      identifier: username,
      result: 'FAILED_SUSPENDED',
      userId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
    })
    throw REFUSE()
  }

  if (user.lockedAt) {
    await recordAttempt({
      identifier: username,
      result: 'FAILED_LOCKED',
      userId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
    })
    throw REFUSE()
  }

  const token = randomBytes(TOKEN_BYTES).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000)

  await inTx(undefined, async (tx) => {
    await tx.userSession.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt,
        ip: input.ip ?? null,
        userAgent: input.userAgent?.slice(0, 500) ?? null,
      },
    })

    await tx.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lastLoginAt: new Date() },
    })
  })

  await recordAttempt({
    identifier: username,
    result: 'SUCCESS',
    userId: user.id,
    ip: input.ip,
    userAgent: input.userAgent,
  })

  return { ...(await describe(user.id)), token }
}

/**
 * ใครถือ token นี้อยู่
 *
 * **ตรวจซ้ำว่าถูกระงับหรือถูกล็อกหรือยังทุกครั้ง** ไม่ใช่แค่ตอนล็อกอิน · การระงับบัญชี
 * จึงมีผลทันที ไม่ใช่ตอนที่เขาล็อกอินรอบหน้า (ซึ่งอาจไม่มีวันมาถึงถ้าเขาเปิดค้างไว้)
 *
 * **หมดอายุแล้วลบแถวทิ้งเลย** — แถวที่หมดอายุไม่มีประโยชน์กับใคร และการเก็บไว้แปลว่า
 * ตารางโตขึ้นเรื่อย ๆ ด้วยของที่ไม่มีใครอ่าน
 *
 * อัปเดต `lastSeenAt` แต่ **ไม่ขยับ `expiresAt`**
 */
export async function me(token: string): Promise<MeResult> {
  if (token.length === 0) throw unauthorized('กรุณาเข้าสู่ระบบ')

  const session = await db.userSession.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      user: { select: { id: true, suspendedAt: true, lockedAt: true } },
    },
  })

  if (!session) throw unauthorized('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่')

  if (session.expiresAt <= new Date()) {
    await db.userSession.delete({ where: { id: session.id } })
    throw unauthorized('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่')
  }

  if (session.user.suspendedAt || session.user.lockedAt) {
    throw unauthorized('บัญชีนี้ใช้งานไม่ได้ กรุณาติดต่อผู้ดูแลระบบ')
  }

  await db.userSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  })

  return describe(session.user.id)
}

/**
 * ออกจากระบบ
 *
 * **ไม่โยน error เมื่อ token ใช้ไม่ได้** — คนที่กดออกจากระบบด้วยเซสชันที่หมดอายุไปแล้ว
 * ได้สิ่งที่เขาต้องการอยู่ดี · การตอบว่าล้มเหลวมีแต่จะทำให้หน้าจอค้างอยู่ในสถานะที่
 * ออกไม่ได้
 */
export async function logout(token: string): Promise<void> {
  if (token.length === 0) return

  const tokenHash = hashToken(token)

  const session = await db.userSession.findUnique({
    where: { tokenHash },
    select: { userId: true, user: { select: { username: true } } },
  })

  await db.userSession.deleteMany({ where: { tokenHash } })

  if (session) {
    await recordAttempt({
      identifier: session.user.username,
      result: 'LOGOUT',
      userId: session.userId,
    })
  }
}

/**
 * เปลี่ยนรหัสผ่านของตัวเอง
 *
 * **ไม่ขอรหัสเดิม** — เซสชันคือด่านแล้ว · คนที่ถือเซสชันอยู่คือคนที่พิสูจน์ตัวไปแล้ว
 * และเส้นนี้มีไว้ให้บัญชีที่ยังใช้รหัสที่ผู้ดูแลออกให้ ซึ่งเขาก็รู้รหัสนั้นอยู่แล้ว
 *
 * **ไม่รับ `userId` จากผู้เรียก** — มันมาจากเซสชัน จึงไม่มีการตรวจความเป็นเจ้าของ
 * ให้ลืม
 *
 * **ถอนทุกเซสชันรวมของตัวเอง** · คนที่เปลี่ยนรหัสเพราะสงสัยว่ามีคนอื่นเข้าถึงบัญชีอยู่
 * ต้องการให้คนนั้นหลุดออกไป ไม่ใช่ให้เขาอยู่ต่อจนกว่าเซสชันจะหมดอายุเอง
 */
export async function changePassword(userId: bigint, newPassword: string): Promise<void> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw invalid(`รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`)
  }

  const passwordHash = await Bun.password.hash(newPassword)

  await inTx(undefined, async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false, updatedBy: userId },
    })

    await tx.userSession.deleteMany({ where: { userId } })

    // `after` ไม่มีรหัสอยู่ในนั้น — `writeAudit` ตัด `passwordHash` ทิ้งอยู่แล้ว
    // แต่ไม่ส่งไปตั้งแต่ต้นชัดเจนกว่าการพึ่งตัวกรอง
    await writeAudit(tx, {
      action: 'user.change-password',
      module: 'user',
      recordId: userId,
      after: { mustChangePassword: false },
      userId,
    })
  })
}

/**
 * ถอนทุกเซสชันของบัญชีหนึ่ง
 *
 * รับ `tx` เพื่อให้ commit ไปพร้อมกับการเปลี่ยนแปลงที่ทำให้ต้องถอน — ดู `///` บน
 * `UserSession` ในสคีมาว่ามีสามเหตุอะไรบ้าง
 */
export async function revokeSessionsOf(userId: bigint, tx?: Tx): Promise<void> {
  await inTx(tx, async (t) => {
    await t.userSession.deleteMany({ where: { userId } })
  })
}
