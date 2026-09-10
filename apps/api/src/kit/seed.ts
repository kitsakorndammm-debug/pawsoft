import { randomBytes } from 'node:crypto'
import { db } from './db.ts'
import { syncPermissions } from './permissions.ts'

/**
 * ทำให้ฐานมีของขั้นต่ำที่ระบบต้องมีถึงจะทำงานได้
 *
 * เรียกตอนบูต **ก่อนเปิดพอร์ต** และ **ไม่มี try/catch** — seed ที่ล้มเหลวต้องหยุดการ
 * บูต ไม่ใช่ปล่อยให้ระบบขึ้นมาโดยไม่มีตาราง `permission` ที่ตรง แล้วตอบ 403 ผิด ๆ
 * ให้ทุกคน
 */

/**
 * บัญชีระบบ — เจ้าของ `createdBy` ของแถวที่ไม่มีคนจริงอยู่เบื้องหลัง
 *
 * ได้รหัสสุ่มที่ไม่มีใครรู้ และ **ถูกระงับทันที** · มันไม่ได้มีไว้ให้ใครล็อกอิน
 * มีไว้ให้ `createdBy` ชี้เท่านั้น
 */
async function ensureSystemUser(): Promise<bigint> {
  const existing = await db.user.findUnique({ where: { username: 'system' }, select: { id: true } })
  if (existing) return existing.id

  const role = await db.role.findFirst({ where: { isSystem: true }, select: { id: true } })

  const roleId =
    role?.id ??
    (
      await db.role.create({
        // `createdBy: 1n` คือเลขเดียวที่โค้ดฝังไว้ได้ — แถวแรกของ `user` ยังไม่มี
        // ตอนบรรทัดนี้ทำงาน และบทบาทต้องมีก่อนถึงจะสร้างผู้ใช้ได้
        data: { name: 'ผู้ดูแลระบบ', isSystem: true, createdBy: 1n, updatedBy: 1n },
        select: { id: true },
      })
    ).id

  const system = await db.user.create({
    data: {
      username: 'system',
      passwordHash: await Bun.password.hash(randomBytes(32).toString('hex')),
      roleId,
      mustChangePassword: false,
      // `createdBy` ว่าง — แถวนี้คือจุดที่ทุกอย่างเริ่ม ไม่มีใครสร้างมัน
    },
    select: { id: true },
  })

  // ระงับเป็นขั้นที่สอง เพราะ `suspendedBy` ต้องใช้ id ของตัวเอง ซึ่งยังไม่มีตอน create
  // และ CHECK บังคับให้คู่ At/By มาด้วยกัน
  await db.user.update({
    where: { id: system.id },
    data: { suspendedAt: new Date(), suspendedBy: system.id },
  })

  return system.id
}

/**
 * เครื่องนี้เป็นเครื่องพัฒนาหรือเปล่า
 *
 * **`APP_ENV` ต้องเป็น `local` เป๊ะ ๆ** — ไม่ใช่ "ไม่ใช่ production" · ค่าที่ไม่ได้ตั้ง
 * ค่าที่พิมพ์ผิด และค่าที่ยังไม่มีใครคิดถึง ต้องตกไปฝั่งเข้มงวดทั้งหมด
 *
 * เขียนแบบ `!== 'production'` เมื่อไหร่ เครื่องที่ลืมตั้ง env จะกลายเป็นเครื่อง dev
 * โดยอัตโนมัติ — ซึ่งรวมถึงเครื่องจริงที่ deploy พลาด
 */
const isLocal = () => process.env['APP_ENV'] === 'local'

/** ความยาวขั้นต่ำของรหัสผู้ดูแล — ผ่อนได้เฉพาะเครื่อง dev */
const MIN_PASSWORD_LENGTH = 12

/**
 * บัญชีผู้ดูแลคนแรก
 *
 * **ไม่มีรหัสตั้งต้นในซอร์ส — ไม่ตั้ง env ก็ไม่บูต** · รหัสที่เขียนไว้ในโค้ดคือรหัสที่
 * เผยแพร่แล้ว: มันอยู่ใน git และเหมือนกันทุกเครื่องที่เคยรันโค้ดนี้
 *
 * **เครื่อง dev ตั้งรหัสสั้นได้** (ผู้ใช้กำหนด 2026-09-01: ขอ `admin` / `1234`) ·
 * เครื่องจริงยังบังคับ 12 ตัวเหมือนเดิม — กฎอยู่ที่ `isLocal()` ที่เดียว
 *
 * **`mustChangePassword` ก็ผ่อนตาม** — บังคับเปลี่ยนรหัสตอนเข้าครั้งแรกแปลว่ารหัส
 * ที่ตั้งไว้ใช้ได้ครั้งเดียว ซึ่งขัดกับเหตุผลที่อยากได้รหัสสั้นบนเครื่อง dev ตั้งแต่ต้น
 */
async function ensureAdminUser(systemUserId: bigint): Promise<void> {
  const existing = await db.user.findUnique({ where: { username: 'admin' }, select: { id: true } })
  if (existing) return

  const password = process.env['SEED_ADMIN_PASSWORD'] ?? ''
  const local = isLocal()

  if (password.length === 0) {
    throw new Error('SEED_ADMIN_PASSWORD ต้องตั้งใน .env — ระบบไม่บูตจนกว่าจะตั้ง')
  }

  if (!local && password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `SEED_ADMIN_PASSWORD ต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร ` +
        '(ผ่อนได้เฉพาะ APP_ENV=local) — ระบบไม่บูตจนกว่าจะตั้ง',
    )
  }

  if (local && password.length < MIN_PASSWORD_LENGTH) {
    // เตือนไว้ให้เห็นตอนบูต — คนที่ก๊อป .env ของ dev ไปใช้ที่อื่นจะได้รู้ตัว
    console.warn(
      `[seed] รหัส admin สั้นกว่า ${MIN_PASSWORD_LENGTH} ตัว — ใช้ได้เพราะ APP_ENV=local เท่านั้น`,
    )
  }

  const role = await db.role.findFirst({ where: { isSystem: true }, select: { id: true } })
  if (!role) throw new Error('ไม่พบบทบาทระบบ')

  await db.user.create({
    data: {
      username: 'admin',
      passwordHash: await Bun.password.hash(password),
      roleId: role.id,
      mustChangePassword: !local,
      createdBy: systemUserId,
      updatedBy: systemUserId,
    },
  })
}

export async function seed(): Promise<void> {
  await syncPermissions()
  const systemUserId = await ensureSystemUser()
  await ensureAdminUser(systemUserId)
}
