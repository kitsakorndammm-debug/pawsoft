import { notFound, unauthorized } from './app-error.ts'
import { db, type Db, type Tx } from './db.ts'
import { tokenFrom, type ActorContext } from './actor.ts'
import { ownerMe } from '../modules/owner-auth/owner-auth.service.ts'
import { OWNER_SESSION_COOKIE } from '../modules/owner-auth/owner-auth.routes.ts'

/**
 * ตัวตนของ**เจ้าของสัตว์** ที่ล็อกอินด้วย Google — คนละฝั่งกับ `actor.ts`
 *
 * `actor.ts` ตอบว่า "พนักงานคนไหนสั่ง" และคำตอบเป็น `user.id` · ที่นี่ตอบว่า
 * "ลูกค้าคนไหนกำลังดูอยู่" และคำตอบเป็น `pet_owner_account.id` ซึ่งเป็นคนละตาราง
 *
 * **ไม่มี permission key ฝั่งนี้ และจะไม่มี** — บัญชีเจ้าของสัตว์ไม่ได้ถือสิทธิ์อะไรเลย
 * มันเห็นเฉพาะข้อมูลของตัวเอง ซึ่งบังคับด้วยการกรองด้วย id จากเซสชัน ไม่ใช่ด้วย key ·
 * key ที่ผูกกับบัญชีฝั่งนี้จะเป็นสวิตช์ที่เปิดให้เห็นข้อมูลของคนอื่นได้ ซึ่งไม่ควรมีอยู่
 */

/**
 * รูปเดียวกับฝั่งพนักงาน — **ต่างกันแค่ชื่อ cookie ที่อ่าน**
 *
 * ใช้ `ActorContext` ตัวเดิมแทนที่จะประกาศรูปใหม่ · รูปที่เขียนเองจะไม่ตรงกับ context
 * จริงของ Elysia (`cookie.value` เป็น `unknown` เพราะ cookie ถือ payload ที่เซ็นได้)
 * แล้วทุก route ที่เรียกจะต้อง cast ทิ้ง ซึ่งเป็นการปิดตาคอมไพเลอร์ตรงจุดที่ต้องการมันที่สุด
 */
export type OwnerActorContext = ActorContext

export type OwnerActor = {
  /** `pet_owner_account.id` — **ไม่ใช่ `owner.id`** */
  accountId: bigint
  email: string
  displayName: string
}

/** ต้องล็อกอินฝั่งลูกค้า — โยน 401 ถ้าไม่ */
export async function getOwnerActor(ctx: OwnerActorContext): Promise<OwnerActor> {
  const me = await ownerMe(tokenFrom(ctx, OWNER_SESSION_COOKIE))

  return { accountId: me.id, email: me.email, displayName: me.displayName }
}

/**
 * แถวใน `owner` ที่ผูกกับบัญชีนี้
 *
 * **`null` เป็นเรื่องปกติ ไม่ใช่ error** — ลูกค้าที่เพิ่งล็อกอิน Google ครั้งแรกยังไม่มี
 * ใครจับคู่ให้ · หน้าเว็บฝั่งลูกค้าต้องรับมือได้ ด้วยการบอกว่า "ยังไม่มีข้อมูลในระบบ
 * ติดต่อคลินิกเพื่อเชื่อมบัญชี" แทนที่จะพัง
 */
export async function ownerRowOf(
  accountId: bigint,
  at: Tx | Db = db,
): Promise<{ id: bigint; code: string; name: string } | null> {
  return at.owner.findFirst({
    where: { petOwnerAccountId: accountId, deletedAt: null },
    select: { id: true, code: true, name: true },
  })
}

/**
 * แถวใน `owner` ที่ผูกกับบัญชีนี้ — **โยน 401 ถ้ายังไม่ได้จับคู่**
 *
 * ใช้กับเส้นที่ต้องมีตัวตนจริงถึงจะทำได้ (จองคิว ดูสัตว์ของตัวเอง) · `403` จะบอกว่า
 * "มีสิทธิ์ไม่พอ" ซึ่งไม่ตรง — เขาไม่ได้ขาดสิทธิ์ เขายังไม่มีตัวตนในระบบให้ผูกกับอะไร
 */
export async function requireOwnerRow(
  accountId: bigint,
  at: Tx | Db = db,
): Promise<{ id: bigint; code: string; name: string }> {
  const row = await ownerRowOf(accountId, at)
  if (!row) {
    throw unauthorized('บัญชีนี้ยังไม่ได้เชื่อมกับข้อมูลลูกค้า — ติดต่อคลินิกเพื่อเชื่อมบัญชี')
  }

  return row
}

/**
 * **สัตว์ตัวนี้เป็นของบัญชีที่ล็อกอินอยู่จริงหรือเปล่า**
 *
 * นี่คือด่านที่กันข้อมูลรั่วข้ามบัญชี · ลูกค้าที่ล็อกอินอยู่ส่ง `petId` อะไรมาก็ได้
 * และถ้าไม่ตรวจ เขาจะอ่านประวัติสัตว์ของคนอื่นได้ด้วยการเดาเลข
 *
 * **โยน 404 ไม่ใช่ 403** — `403` ยืนยันว่าเลขนี้มีอยู่จริงแต่เป็นของคนอื่น ซึ่งเป็น
 * ข้อมูลที่เขาไม่ควรได้ · `404` ทำให้สัตว์ของคนอื่นกับเลขที่ไม่มีอยู่ แยกกันไม่ออก
 */
export async function requireOwnPet(
  ownerId: bigint,
  petId: bigint,
  at: Tx | Db = db,
): Promise<void> {
  const found = await at.pet.count({ where: { id: petId, ownerId, deletedAt: null } })
  if (found === 0) throw notFound('ไม่พบสัตว์นี้')
}

/** ใบจองใบนี้เป็นของลูกค้าคนนี้จริงหรือเปล่า — เหตุผลเดียวกับ `requireOwnPet` */
export async function requireOwnAppointment(
  ownerId: bigint,
  appointmentId: bigint,
  at: Tx | Db = db,
): Promise<void> {
  const found = await at.appointment.count({
    where: { id: appointmentId, ownerId, deletedAt: null },
  })
  if (found === 0) throw notFound('ไม่พบใบจองนี้')
}
