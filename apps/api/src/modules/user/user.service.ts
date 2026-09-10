import { randomInt } from 'node:crypto'
import { inUse, notFound } from '../../kit/app-error.ts'
import { writeAudit } from '../../kit/audit.ts'
import { db, inTx, type Db, type Tx } from '../../kit/db.ts'
import { asDuplicate } from '../../kit/duplicate.ts'
import { cleanRequired } from '../../kit/text.ts'
import { revokeSessionsOf } from '../auth/auth.service.ts'
import type { User } from '../../../prisma/generated/client.ts'

/**
 * ผู้ใช้ระบบ — การระงับและปลดระงับ
 *
 * **บัญชีลบไม่ได้** ตาราง `user` ไม่มี `deletedAt` เลย เพราะ `createdBy` ของทุกตาราง
 * ชี้มาที่มัน · แถวที่หายไปคือประวัติที่อ้างคนที่ไม่มีอยู่ (ดู `///` บนหัว `User`)
 *
 * การระงับจึงเป็นที่ที่ "ลบบัญชี" ไปจบ — คนลาออก คนที่สงสัยว่าบัญชีถูกยึด และคนที่
 * ถูกลบออกจากทะเบียนพนักงาน ทั้งหมดมาจบที่นี่
 *
 * **ผู้ดูแลไม่เคยรู้รหัสของใคร** (ผู้ใช้ตัดสิน 2026-08-26) — ไม่มีช่องให้พิมพ์รหัส
 * ไม่มีเส้นที่ตั้งรหัสให้คนอื่น · ระบบสุ่มให้ตอนเปิดบัญชี คืนกลับไปครั้งเดียว แล้วเก็บ
 * แต่ hash · อยากได้อีกต้องรีเซ็ต ซึ่งได้รหัสคนละตัว
 *
 * ยังไม่มี `update` / `list` — ยังไม่มีใบสั่ง
 */

const MODULE = 'user'

const USERNAME_MAX = 50

/**
 * ความยาวของรหัสที่ระบบสุ่มให้ — ตัวเลขล้วน 10 หลัก (ผู้ใช้ตัดสิน 2026-08-26)
 *
 * ตัวเลขล้วนเพราะรหัสนี้เดินทางด้วยปาก แชท หรือกระดาษ ไปถึงคนที่ต้องพิมพ์ต่อ ·
 * ตัวอักษรปนตัวเลขอ่านผิดได้ระหว่างทาง (`l` กับ `1`, `O` กับ `0`) แล้วคนที่พิมพ์ตามจะเข้า
 * ไม่ได้โดยไม่มีใครรู้ว่าพลาดตรงไหน
 *
 * สิบหลักคือ 10^10 ความเป็นไปได้ และมันมีอายุแค่จนกว่าเจ้าตัวจะเข้าครั้งแรก เพราะ
 * `mustChangePassword` บังคับเปลี่ยนทันที
 */
const PASSWORD_DIGITS = 10

/**
 * สุ่มรหัสตัวเลข — **`randomInt` ของ node:crypto ไม่ใช่ `Math.random`**
 *
 * `Math.random` เดาต่อได้เมื่อรู้ค่าก่อนหน้า ซึ่งพอสำหรับการสุ่มลำดับ แต่ไม่พอสำหรับ
 * ของที่เป็นทางเข้าระบบของคน · `randomInt` ดึงจากแหล่งสุ่มของระบบปฏิบัติการ
 *
 * ต่อทีละหลักเพื่อให้ทุกหลักมีโอกาสเท่ากันจริง รวมหลักแรกที่เป็น 0 — สุ่มเป็นช่วง
 * แล้วเติมศูนย์หน้าจะได้การกระจายที่ถูกต้องเหมือนกัน แต่แบบนี้อ่านแล้วเห็นเลยว่าทำอะไร
 */
function generatePassword(): string {
  let out = ''
  for (let i = 0; i < PASSWORD_DIGITS; i += 1) out += String(randomInt(0, 10))
  return out
}

const username = (raw: string) =>
  cleanRequired(raw, { field: 'username', label: 'ชื่อผู้ใช้', max: USERNAME_MAX })

/**
 * บทบาทต้องมีอยู่จริงและยังไม่ถูกลบ
 *
 * ไม่ตรวจแล้วฐานปฏิเสธด้วย FK error ซึ่งออกไปเป็น 500 — คนกรอกฟอร์มเห็น "ระบบขัดข้อง"
 * ทั้งที่สิ่งที่เกิดคือเขาเลือกบทบาทที่เพิ่งถูกลบไป
 *
 * FK มองไม่เห็น `deletedAt` ด้วย: บทบาทที่ถูก soft delete ยังมีแถวอยู่ ฐานจึงยอมให้ชี้
 * ทั้งที่ไม่ควร
 */
async function requireRole(roleId: bigint, at: Tx | Db): Promise<void> {
  const role = await at.role.findFirst({ where: { id: roleId, deletedAt: null } })
  if (!role) throw notFound('ไม่พบบทบาทนี้', { roleId: String(roleId) })
}

/** พนักงานเจ้าของบัญชีต้องมีอยู่จริงและยังไม่ถูกลบ — ด้วยเหตุผลเดียวกับบทบาท */
async function requireEmployee(employeeId: bigint, at: Tx | Db): Promise<void> {
  const employee = await at.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
  })
  if (!employee) throw notFound('ไม่พบพนักงานคนนี้', { employeeId: String(employeeId) })
}

export type CreateUserInput = {
  username: string
  roleId: bigint
  /**
   * พนักงานเจ้าของบัญชี
   *
   * **ว่างได้ที่ชั้นนี้ ไม่บังคับ** (ผู้ใช้ตัดสิน 2026-08-26 — บังคับที่หน้าจอแทน)
   *
   * เขียนไว้ให้ชัดว่าเป็นการตัดสินใจ ไม่ใช่ของตก · ผลที่ตามมาคือบัญชีที่ไม่ผูกพนักงาน
   * สร้างผ่าน API ได้ และบัญชีแบบนั้นผ่าน `unsuspendUser` เสมอ เพราะด่านที่นั่นถามว่า
   * พนักงานพ้นสภาพหรือยัง ซึ่งไม่มีพนักงานให้ถาม
   */
  employeeId?: bigint | null | undefined
}

export type CreateUserResult = {
  user: User
  /**
   * รหัสที่สุ่มให้ — **คืนที่นี่ครั้งเดียว ไม่มีที่ไหนเก็บอีก**
   *
   * ห้ามเขียนลงบันทึก ห้ามใส่ใน response ของเส้นอื่น · ตารางเก็บแต่ hash
   */
  password: string
}

/**
 * เปิดบัญชีให้พนักงานหนึ่งคน
 *
 * **รหัสมาจากระบบ ไม่ได้มาจากคนกด** — ผู้ดูแลจึงบอกรหัสของใครไม่ได้ แม้แต่ของตัวเอง
 * ที่เพิ่งเปิดให้คนอื่น เพราะเห็นครั้งเดียวตอนนี้แล้วมันหายไป
 *
 * `mustChangePassword` เป็น `true` ตั้งแต่เปิด — รหัสที่เดินทางผ่านแชทหรือกระดาษ
 * ใช้ได้ครั้งเดียวจนกว่าเจ้าตัวจะตั้งใหม่ (ดู `///` บนหัว `User`)
 */
export async function createUser(
  input: CreateUserInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<CreateUserResult> {
  const value = username(input.username)
  const password = generatePassword()
  const passwordHash = await Bun.password.hash(password)

  try {
    const user = await inTx(outerTx, async (tx) => {
      await requireRole(input.roleId, tx)
      if (input.employeeId != null) await requireEmployee(input.employeeId, tx)

      const created = await tx.user.create({
        data: {
          username: value,
          passwordHash,
          roleId: input.roleId,
          employeeId: input.employeeId ?? null,
          createdBy: actorId,
          updatedBy: actorId,
        },
      })

      await writeAudit(tx, {
        action: `${MODULE}.create`,
        module: MODULE,
        recordId: created.id,
        // รหัสไม่อยู่ในนี้ และห้ามใส่ — บันทึกอ่านได้ทีหลังโดยคนที่ไม่ใช่ผู้ดูแล
        after: {
          username: value,
          roleId: String(input.roleId),
          employeeId: input.employeeId == null ? null : String(input.employeeId),
        },
        userId: actorId,
      })

      return created
    })

    return { user, password }
  } catch (e) {
    return asDuplicate(e, {
      message: 'มีบัญชีที่ใช้ชื่อนี้อยู่แล้ว',
      field: 'username',
      value,
    })
  }
}

export type UserAccount = {
  id: bigint
  username: string
  roleId: bigint
  employeeId: bigint | null
  /** ชื่อบทบาท — พ่วงมาให้ dialog ไม่ต้องยิงซ้ำเพื่อแปล id เป็นคำ */
  roleName: string
  suspendedAt: Date | null
  lockedAt: Date | null
  lockCount: number
  mustChangePassword: boolean
  lastLoginAt: Date | null
}

/**
 * บัญชีของพนักงานคนหนึ่ง — `null` ถ้ายังไม่ได้เปิดให้
 *
 * **ไม่มีหน้าตารางบัญชี** (FE แจ้ง 2026-08-26) — จัดการผ่าน dialog ที่เปิดจากแถวพนักงาน
 * หน้าจอจึงถือ `employeeId` ไม่ใช่ `userId` และคำถามแรกที่มันต้องถามคือ "คนนี้มีบัญชีไหม"
 *
 * **`null` ไม่ใช่ error** — พนักงานที่ยังไม่มีบัญชีเป็นเรื่องปกติ · dialog เปิดมาแล้วเจอ
 * สองหน้าตา: ยังไม่มีบัญชี (ปุ่มเปิดบัญชี) หรือมีแล้ว (ปุ่มจัดการ)
 *
 * ไม่คืน `passwordHash` — ไม่มีหน้าจอไหนใช้ และของที่ไม่ออกไปคือของที่หลุดไม่ได้
 */
export async function findAccountOfEmployee(
  employeeId: bigint,
  tx?: Tx,
): Promise<UserAccount | null> {
  const row = await (tx ?? db).user.findFirst({
    where: { employeeId },
    include: { role: { select: { name: true } } },
  })

  if (!row) return null

  return {
    id: row.id,
    username: row.username,
    roleId: row.roleId,
    employeeId: row.employeeId,
    roleName: row.role.name,
    suspendedAt: row.suspendedAt,
    lockedAt: row.lockedAt,
    lockCount: row.lockCount,
    mustChangePassword: row.mustChangePassword,
    lastLoginAt: row.lastLoginAt,
  }
}

export type UpdateUserInput = {
  username?: string | undefined
  roleId?: bigint | undefined
}

/**
 * แก้บัญชี — **และเตะเจ้าตัวออกเมื่อมีอะไรเปลี่ยนจริง**
 *
 * (ผู้ใช้ตัดสิน 2026-08-26 — แก้ `username` หรือ `roleId` อย่างใดอย่างหนึ่งก็ตัดเซสชัน)
 *
 * สองฟิลด์นี้เปลี่ยนคนละเรื่อง แต่ลงเอยเหมือนกัน:
 *
 *   - `roleId` เปลี่ยนว่าคนนี้ทำอะไรได้ · สิทธิ์อ่านสดจากฐานทุก request อยู่แล้ว
 *     แต่หน้าเว็บที่เปิดค้างยังวาดเมนูตามชุดเก่า แล้วปุ่มที่กดไม่ได้จะอ่านเหมือนระบบพัง
 *   - `username` เปลี่ยนสิ่งที่เขาใช้เข้าระบบ · เซสชันเก่ายังผูกกับตัวตนที่พิมพ์ต่อไม่ได้
 *
 * **ตัดเฉพาะตอนที่ค่าต่างจากเดิมจริง** — ฟอร์มส่งทุกฟิลด์กลับมาตอนกดบันทึก คนที่เปิดดู
 * แล้วกดบันทึกเฉย ๆ ไม่ควรหลุดจากระบบ
 *
 * รหัสผ่านไม่อยู่ที่นี่ — คนละคำสั่ง (`resetPassword`) และผู้ดูแลตั้งรหัสให้ใครไม่ได้อยู่แล้ว
 */
export async function updateUser(
  id: bigint,
  input: UpdateUserInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<User> {
  const at = outerTx ?? db
  const existing = await at.user.findUnique({ where: { id } })
  if (!existing) throw notFound('ไม่พบบัญชีผู้ใช้นี้', { id: String(id) })

  const value = input.username === undefined ? undefined : username(input.username)

  const nameChanged = value !== undefined && value !== existing.username
  const roleChanged = input.roleId !== undefined && input.roleId !== existing.roleId

  if (!nameChanged && !roleChanged) return existing

  if (roleChanged && input.roleId !== undefined) await requireRole(input.roleId, at)

  try {
    return await inTx(outerTx, async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(nameChanged ? { username: value } : {}),
          ...(roleChanged ? { roleId: input.roleId } : {}),
          updatedBy: actorId,
        },
      })

      await revokeSessionsOf(id, tx)

      /**
       * ย้ายบัญชีออกจากบทบาทผู้อนุมัติ แล้วใบอาจไม่เหลือคนเซ็น (2026-08-29)
       *
       * **ทางนี้คือทางจริงของการ "เลิกให้คนนี้เป็นผู้อนุมัติ"** — `deleteRole` ลบบทบาท
       * ที่ยังมีบัญชีถืออยู่ไม่ได้เลย (`guardDelete`) ผู้ดูแลจึงต้องย้ายคนออกก่อนเสมอ
       * และการย้ายออกนี่แหละที่ทำให้ใบไม่เหลือคนเซ็น ไม่ใช่การลบบทบาทในขั้นถัดไป
       *
       * **ถามเฉพาะตอนบทบาทเปลี่ยน** — แก้ชื่อผู้ใช้ไม่กระทบว่าใครเซ็นใบไหนได้
       */

      await writeAudit(tx, {
        action: `${MODULE}.update`,
        module: MODULE,
        recordId: id,
        before: {
          ...(nameChanged ? { username: existing.username } : {}),
          ...(roleChanged ? { roleId: String(existing.roleId) } : {}),
        },
        after: {
          ...(nameChanged ? { username: value } : {}),
          ...(roleChanged ? { roleId: String(input.roleId) } : {}),
        },
        userId: actorId,
      })

      return updated
    })
  } catch (e) {
    return asDuplicate(e, {
      message: 'มีบัญชีที่ใช้ชื่อนี้อยู่แล้ว',
      field: 'username',
      value: value ?? existing.username,
    })
  }
}

/**
 * ออกรหัสใหม่ให้บัญชีหนึ่ง — **และตัดเซสชันที่เปิดอยู่**
 *
 * คนกดรีเซ็ตด้วยเหตุผลข้อใดข้อหนึ่งใน: เจ้าตัวลืมรหัส หรือมีคนสงสัยว่าบัญชีถูกยึด ·
 * กรณีหลังถ้าไม่ตัดเซสชัน คนที่ยึดไปยังใช้งานต่อได้อีกสิบชั่วโมงจนกว่าเซสชันจะหมดอายุ
 * ทั้งที่ผู้ดูแลเพิ่งลงมือแก้ไปแล้ว · แยกสองกรณีจากกันไม่ได้ตอนกด จึงตัดทั้งสองกรณี
 *
 * **ปลดล็อกไปด้วยถ้าบัญชีถูกล็อกอยู่** — ล็อกเกิดจากเดารหัสผิดซ้ำ ๆ ซึ่งเป็นเหตุผลที่คน
 * มาขอรหัสใหม่ตั้งแต่แรก · ออกรหัสใหม่แล้วยังล็อกอยู่ แปลว่ารหัสที่เพิ่งให้ไปใช้ไม่ได้
 * และผู้ดูแลต้องกดปุ่มที่สองโดยไม่มีอะไรบอกว่าต้องกด
 *
 * **ไม่แตะการระงับ** — รีเซ็ตรหัสไม่ใช่การคืนทางเข้าระบบ · การปลดระงับเป็นคำสั่งของ
 * ตัวเองที่ต้องมีคนตัดสินใจกด
 */
export async function resetPassword(
  id: bigint,
  actorId: bigint,
  outerTx?: Tx,
): Promise<{ password: string }> {
  const existing = await (outerTx ?? db).user.findUnique({ where: { id } })
  if (!existing) throw notFound('ไม่พบบัญชีผู้ใช้นี้', { id: String(id) })

  const password = generatePassword()
  const passwordHash = await Bun.password.hash(password)

  await inTx(outerTx, async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        // ปลดล็อกไปด้วย · `lockCount` ไม่ถูกล้าง — มันเป็นประวัติ ไม่ใช่สถานะ
        lockedAt: null,
        failedAttempts: 0,
        updatedBy: actorId,
      },
    })

    await revokeSessionsOf(id, tx)

    await writeAudit(tx, {
      action: `${MODULE}.reset-password`,
      module: MODULE,
      recordId: id,
      // รหัสไม่อยู่ในนี้ และห้ามใส่ · บันทึกอ่านได้ทีหลังโดยคนที่ไม่ใช่ผู้ดูแล
      before: { mustChangePassword: existing.mustChangePassword },
      after: { mustChangePassword: true },
      userId: actorId,
    })
  })

  return { password }
}

/**
 * ปลดบัญชีที่ถูกล็อกเพราะเดารหัสผิดซ้ำ ๆ
 *
 * **การล็อกไม่มีวันหมดอายุเอง** (ดู `///` บนหัว `User`) — ตารางเก็บ `lockedAt` ไม่ใช่
 * `lockedUntil` เพราะเวลาหมดอายุแปลว่าคนที่ไล่เดารหัสรอได้ ก็กลับมาเดาต่อได้เรื่อย ๆ
 * โดยไม่มีใครรู้ · ล็อกที่ต้องมีคนมาปลด คือล็อกที่มีคนเห็น
 *
 * **`failedAttempts` ถูกล้างด้วย** — ไม่ล้างแล้วบัญชีจะกลับไปโดนล็อกทันทีที่พิมพ์ผิด
 * ครั้งเดียว เพราะตัวนับยังค้างอยู่ที่เพดาน
 *
 * **`lockCount` ไม่ถูกล้าง** — มันคือจำนวนครั้งที่บัญชีนี้ถูกไล่เดารหัสตลอดอายุ
 * ซึ่งเป็นของที่ผู้ดูแลอ่านตอนตัดสินใจว่าจะปลดให้ไหม
 *
 * **ปลดซ้ำไม่ทำอะไรเลย** — บัญชีที่ไม่ได้ถูกล็อกไม่มีอะไรให้ปลด และไม่มีเหตุการณ์ให้บันทึก
 */
export async function unlockUser(
  id: bigint,
  actorId: bigint,
  outerTx?: Tx,
): Promise<void> {
  const existing = await (outerTx ?? db).user.findUnique({ where: { id } })
  if (!existing) throw notFound('ไม่พบบัญชีผู้ใช้นี้', { id: String(id) })

  if (existing.lockedAt === null) return

  const wasLockedAt = existing.lockedAt

  await inTx(outerTx, async (tx) => {
    await tx.user.update({
      where: { id },
      data: { lockedAt: null, failedAttempts: 0, updatedBy: actorId },
    })

    await writeAudit(tx, {
      action: `${MODULE}.unlock`,
      module: MODULE,
      recordId: id,
      before: { lockedAt: wasLockedAt.toISOString(), failedAttempts: existing.failedAttempts },
      after: { lockedAt: null, failedAttempts: 0 },
      userId: actorId,
    })
  })
}

/**
 * ระงับบัญชี — เข้าระบบไม่ได้ และเซสชันที่เปิดอยู่ถูกตัดทันที
 *
 * **ตัดเซสชันด้วย ไม่ใช่แค่ตั้งธง** — ไม่ตัดแล้วคนที่ถูกระงับยังใช้งานต่อได้จนกว่าเซสชัน
 * จะหมดอายุ ซึ่งนานถึงสิบชั่วโมง · ยืม `revokeSessionsOf` จาก `auth` แทนที่จะลบแถวเอง
 * เพราะโมดูลที่เป็นเจ้าของตารางเป็นเจ้าของกฎของมัน
 *
 * **ระงับซ้ำไม่ทำอะไรเลย** — ไม่ทับว่าใครระงับก่อน ไม่เขียนบันทึกเพิ่ม · การระงับเกิด
 * ครั้งเดียว คำขอครั้งที่สองไม่ใช่เหตุการณ์ที่สอง
 */
export async function suspendUser(
  id: bigint,
  actorId: bigint,
  outerTx?: Tx,
): Promise<void> {
  const existing = await (outerTx ?? db).user.findUnique({ where: { id } })
  if (!existing) throw notFound('ไม่พบบัญชีผู้ใช้นี้', { id: String(id) })

  if (existing.suspendedAt !== null) return

  await inTx(outerTx, async (tx) => {
    await tx.user.update({
      where: { id },
      data: { suspendedAt: new Date(), suspendedBy: actorId, updatedBy: actorId },
    })

    await revokeSessionsOf(id, tx)




    await writeAudit(tx, {
      action: `${MODULE}.suspend`,
      module: MODULE,
      recordId: id,
      before: { suspendedAt: null },
      after: { suspendedAt: new Date().toISOString() },
      userId: actorId,
    })
  })
}

/**
 * ปลดระงับ — กลับมาเข้าระบบได้
 *
 * ล้างทั้ง `suspendedAt` และ `suspendedBy` พร้อมกัน · CHECK ใน `patch.sql` บังคับให้
 * สองค่านี้เดินทางด้วยกัน ตัวเดียวคือสถานะครึ่ง ๆ ที่ไม่มีใครอ่านออก
 *
 * ไม่ได้คืนเซสชันเก่าให้ — เซสชันถูกลบไปแล้วตอนระงับ เจ้าตัวต้องล็อกอินใหม่
 *
 * **ปลดไม่ได้ถ้าพนักงานที่ผูกอยู่ยังพ้นสภาพหรือถูกลบ** (ผู้ใช้ตัดสิน 2026-08-26) —
 * บัญชีถูกระงับเพราะคนคนนั้นออกไป ปลดตอนนี้แปลว่าคนที่ไม่ได้เป็นพนักงานแล้วล็อกอิน
 * เข้ามาได้ · คืนสภาพพนักงานก่อน แล้วค่อยปลดบัญชี — สองขั้นที่แยกกันโดยตั้งใจ
 */
export async function unsuspendUser(
  id: bigint,
  actorId: bigint,
  outerTx?: Tx,
): Promise<void> {
  const existing = await (outerTx ?? db).user.findUnique({ where: { id } })
  if (!existing) throw notFound('ไม่พบบัญชีผู้ใช้นี้', { id: String(id) })

  // Not suspended: nothing to lift, and nothing to record.
  if (existing.suspendedAt === null) return

  await requireEmployeeStillWorking(existing.employeeId, outerTx)

  // Held in its own binding: the early return above proves it is not null, but that
  // narrowing does not survive into the closure below.
  const wasSuspendedAt = existing.suspendedAt

  await inTx(outerTx, async (tx) => {
    await tx.user.update({
      where: { id },
      data: { suspendedAt: null, suspendedBy: null, updatedBy: actorId },
    })

    await writeAudit(tx, {
      action: `${MODULE}.unsuspend`,
      module: MODULE,
      recordId: id,
      before: { suspendedAt: wasSuspendedAt.toISOString() },
      after: { suspendedAt: null },
      userId: actorId,
    })
  })
}

/**
 * พนักงานที่ผูกกับบัญชีนี้ต้องยังทำงานอยู่ ถึงจะปลดระงับได้
 *
 * **บัญชีที่ไม่ได้ผูกพนักงานผ่านเสมอ** — บัญชีระบบเป็นตัวอย่าง · ไม่มีพนักงานให้ตรวจ
 * ก็ไม่มีอะไรให้ปฏิเสธ
 *
 * `IN_USE` ไม่ใช่ `INVALID` เพราะคำขอไม่ได้ผิดรูป — สถานะของอีกตารางต่างหากที่ยังไม่พร้อม
 * และผู้ใช้แก้ได้เองด้วยการคืนสภาพพนักงาน
 */
async function requireEmployeeStillWorking(
  employeeId: bigint | null,
  tx?: Tx,
): Promise<void> {
  if (employeeId === null) return

  const employee = await (tx ?? db).employee.findUnique({ where: { id: employeeId } })

  if (!employee || employee.deletedAt !== null) {
    throw inUse('ปลดระงับไม่ได้ เพราะพนักงานคนนี้ถูกลบไปแล้ว', {
      field: 'employeeId',
      employeeId: String(employeeId),
    })
  }

  if (employee.workStatus === 'TERMINATED') {
    throw inUse('ปลดระงับไม่ได้ เพราะพนักงานคนนี้ยังพ้นสภาพอยู่ — คืนสภาพก่อน', {
      field: 'workStatus',
      employeeId: String(employeeId),
    })
  }
}

/** บัญชีของพนักงานคนนี้ — `null` ถ้ายังไม่ได้เปิดบัญชีให้ */
export async function findUserByEmployee(
  employeeId: bigint,
  tx?: Tx,
): Promise<User | null> {
  return (tx ?? db).user.findFirst({ where: { employeeId } })
}
