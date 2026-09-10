import { duplicate, invalid, notFound } from '../../kit/app-error.ts'
import { writeAudit } from '../../kit/audit.ts'
import { db, inTx, type Db, type Tx } from '../../kit/db.ts'
import { duplicateIndexOf } from '../../kit/duplicate.ts'
import { cleanOptional } from '../../kit/text.ts'
import type {
  Appointment,
  AppointmentSlot,
  AppointmentStatus,
} from '../../../prisma/generated/client.ts'

/**
 * การจองล่วงหน้า — **ยังไม่ใช่คิว**
 *
 * (ผู้ใช้ตัดสิน 2026-09-01: "ข้อ 1 และ 2 จะยังไม่ใช่คิวจริง เพราะยังไงพอมาหน้างานก็จะ
 * ต้องจัดคิวจริงใหม่ตามการรักษาอยู่แล้ว")
 *
 * ใบจองกลายเป็นคิวเมื่อมีคนกด check-in ที่เคาน์เตอร์เท่านั้น — ดู `checkIn` ใน
 * `visit.service.ts` · ไม่มีงานเบื้องหลังที่แปลงให้เอง เพราะการจองที่ลูกค้าไม่มาก็มี
 * และคิวที่มีคนไม่อยู่จริงคือคิวที่หมอเรียกแล้วเงียบ
 */

const MODULE = 'appointment'
const LABEL = 'การจอง'

const PET_NAME_MAX = 200
const REASON_MAX = 1_000
const CANCEL_REASON_MAX = 500

export const APPOINTMENT_PAGE_SIZE = 50
export const APPOINTMENT_PAGE_SIZE_MAX = 200

/** ช่วงเวลาทั้งสี่ — เรียงตามเวลาจริงของวัน ใช้เป็นลำดับแสดงผลด้วย */
export const APPOINTMENT_SLOTS = [
  'MORNING_1',
  'MORNING_2',
  'AFTERNOON_1',
  'AFTERNOON_2',
] as const satisfies readonly AppointmentSlot[]

/**
 * เพดานจำนวนคิวต่อช่วงเวลา — ค่าคงที่ในโค้ด ไม่ใช่ค่าที่แก้จากหน้าเว็บ (ผู้ใช้ตัดสิน
 * 2026-09-08) เท่ากันทั้ง 4 ช่วง
 *
 * **นับเฉพาะ `BOOKED`** — `PENDING` ยังไม่ใช่คำมั่นของคลินิก ปล่อยให้ลูกค้าจองเข้ามา
 * ได้เรื่อย ๆ พนักงานเป็นคนคัดกรองทีหลังตอนโทรยืนยัน (ดู `confirmAppointment`)
 */
const MAX_BOOKED_PER_SLOT = 8

/**
 * ช่วงนี้ยังรับเพิ่มได้ไหม — เรียกก่อน insert/update ที่จะทำให้แถวกลายเป็น `BOOKED`
 * เสมอ ไม่ว่าจะสร้างใหม่เป็น `BOOKED` ตรง ๆ หรือยืนยันจาก `PENDING`
 */
async function requireSlotCapacity(bookedOn: Date, slot: AppointmentSlot, at: Tx | Db): Promise<void> {
  const count = await at.appointment.count({
    where: { bookedOn, slot, status: 'BOOKED', deletedAt: null },
  })

  if (count >= MAX_BOOKED_PER_SLOT) {
    throw invalid(`ช่วงเวลานี้เต็มแล้ว (สูงสุด ${MAX_BOOKED_PER_SLOT} คิวต่อช่วง)`, {
      field: 'slot',
      slot,
    })
  }
}

/**
 * วันที่จองรับเข้ามาเป็น `YYYY-MM-DD`
 *
 * **เก็บเป็น `@db.Date` ไม่ใช่ timestamp** — การจองเป็นของ "วันที่" ไม่ใช่ "ขณะเวลา" ·
 * เก็บเป็น timestamp แปลว่าต้องตอบว่ากี่โมง ซึ่งไม่มีคำตอบ และ timezone จะทำให้
 * การจองวันที่ 1 กลายเป็นวันที่ 2 สำหรับคนที่เปิดดูจากคนละเขตเวลา
 */
function cleanBookedOn(raw: string): Date {
  const value = raw.trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw invalid('วันที่จองต้องอยู่ในรูป YYYY-MM-DD', { field: 'bookedOn', value })
  }

  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) {
    throw invalid('วันที่จองไม่ใช่วันที่ที่มีอยู่จริง', { field: 'bookedOn', value })
  }

  return date
}

/** วันนี้ตามเวลาไทย ตัดเวลาทิ้ง — ใช้เทียบว่าจองย้อนหลังหรือเปล่า */
export function todayDate(now: Date = new Date()): Date {
  const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1_000)

  return new Date(
    `${bangkok.getUTCFullYear()}-${String(bangkok.getUTCMonth() + 1).padStart(2, '0')}-${String(
      bangkok.getUTCDate(),
    ).padStart(2, '0')}T00:00:00Z`,
  )
}

export async function findAppointment(id: bigint, tx?: Tx): Promise<Appointment> {
  const row = await (tx ?? db).appointment.findFirst({ where: { id, deletedAt: null } })
  if (!row) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })

  return row
}

export type ListAppointmentsInput = {
  /** วันเดียว — `YYYY-MM-DD` · จอ "การจองของวันนี้" ใช้ตัวนี้ */
  bookedOn?: string | undefined
  slot?: AppointmentSlot | undefined
  status?: AppointmentStatus | undefined
  ownerId?: bigint | undefined
  page?: number | undefined
  pageSize?: number | undefined
}

function listWhere(input: ListAppointmentsInput) {
  return {
    deletedAt: null,
    ...(input.bookedOn !== undefined ? { bookedOn: cleanBookedOn(input.bookedOn) } : {}),
    ...(input.slot !== undefined ? { slot: input.slot } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
  }
}

/**
 * ใบจองพร้อม**ชื่อ**สัตว์และเจ้าของ — ไม่ใช่แค่ id
 *
 * ตารางจองต้องอ่านออกโดยไม่ต้องยิงถามทีละใบ · คืนแต่ `petId` แปลว่าหน้าจอต้องโชว์
 * "สัตว์ #13" ซึ่งเป็นเลขในฐานที่ไม่มีความหมายกับใครเลย (เจอจากภาพจริง 2026-09-01)
 */
export type AppointmentRow = Appointment & {
  pet: { id: bigint; name: string } | null
  owner: { id: bigint; code: string; name: string; phone: string | null }
}

export type ListAppointmentsResult = {
  rows: AppointmentRow[]
  page: number
  pageSize: number
  total: number
}

export async function listAppointments(
  input: ListAppointmentsInput = {},
  tx?: Tx,
): Promise<ListAppointmentsResult> {
  const page = Math.max(Math.floor(input.page ?? 1), 1)
  const pageSize = Math.min(
    Math.max(Math.floor(input.pageSize ?? APPOINTMENT_PAGE_SIZE), 1),
    APPOINTMENT_PAGE_SIZE_MAX,
  )

  const at = tx ?? db
  const where = listWhere(input)

  const [rows, total] = await Promise.all([
    at.appointment.findMany({
      where,
      // วันแล้วช่วง — ลำดับที่คนอ่านตารางวันคาดหวัง
      orderBy: [{ bookedOn: 'asc' }, { slot: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        pet: { select: { id: true, name: true } },
        owner: { select: { id: true, code: true, name: true, phone: true } },
      },
    }),
    at.appointment.count({ where }),
  ])

  return { rows, page, pageSize, total }
}

export type CreateAppointmentInput = {
  bookedOn: string
  slot: AppointmentSlot
  ownerId: bigint
  petId?: bigint | null
  /** ชื่อสัตว์ที่ลูกค้าบอกมา — ใช้เมื่อยังไม่มีแถวใน `pet` */
  petNameText?: string | null
  reason?: string | null
  /**
   * สถานะเริ่มต้น — ค่าปริยายคือ `BOOKED`
   *
   * **เส้นของลูกค้าส่ง `PENDING` มา** · พนักงานที่รับสายคุยกับลูกค้าอยู่แล้วตอนกรอก
   * จึงยืนยันได้ทันที ส่วนใบที่กดมาเองยังไม่มีใครคุยด้วย
   */
  status?: AppointmentStatus | undefined
}

/**
 * ใครเป็นคนจอง — **ฝ่ายใดฝ่ายหนึ่ง ไม่ใช่ทั้งคู่**
 *
 * ตารางนี้เป็นตารางเดียวในระบบที่คนนอกเขียนได้ · `staffUserId` มาจากพนักงานที่รับสาย
 * (ทาง `PHONE`) · `ownerAccountId` มาจากลูกค้าที่ล็อกอิน Google (ทาง `ONLINE`)
 */
export type Booker =
  | { kind: 'staff'; userId: bigint }
  | { kind: 'owner'; accountId: bigint }

async function requireRefs(
  input: { ownerId: bigint; petId: bigint | null },
  at: Tx | Db,
): Promise<void> {
  const owner = await at.owner.count({ where: { id: input.ownerId, deletedAt: null } })
  if (owner === 0) throw notFound('ไม่พบเจ้าของที่เลือก', { field: 'ownerId' })

  if (input.petId === null) return

  const pet = await at.pet.findFirst({
    where: { id: input.petId, deletedAt: null },
    select: { ownerId: true, name: true, deceasedOn: true },
  })
  if (!pet) throw notFound('ไม่พบสัตว์ที่เลือก', { field: 'petId' })

  /**
   * **สัตว์ต้องเป็นของเจ้าของที่เลือก**
   *
   * ไม่มีตัวนี้ ลูกค้าที่ล็อกอินอยู่จะจองให้สัตว์ของคนอื่นได้ด้วยการส่ง `petId` ที่เดาเอา ·
   * เป็นการรั่วของข้อมูลข้ามบัญชี ไม่ใช่แค่ข้อมูลผิด
   */
  if (pet.ownerId !== input.ownerId) {
    throw invalid('สัตว์ที่เลือกไม่ใช่ของเจ้าของคนนี้', { field: 'petId' })
  }
  if (pet.deceasedOn !== null) {
    throw invalid(`"${pet.name}" ถูกบันทึกว่าเสียชีวิตแล้ว`, { field: 'petId' })
  }
}

export async function createAppointment(
  input: CreateAppointmentInput,
  booker: Booker,
  outerTx?: Tx,
): Promise<Appointment> {
  const bookedOn = cleanBookedOn(input.bookedOn)
  const petId = input.petId ?? null
  const petNameText = cleanOptional(input.petNameText, {
    field: 'petNameText',
    label: 'ชื่อสัตว์',
    max: PET_NAME_MAX,
  })

  /**
   * **ต้องรู้ว่าจองให้สัตว์ตัวไหน อย่างน้อยเป็นชื่อ**
   *
   * ฐานบังคับด้วย CHECK อยู่แล้ว · ปฏิเสธที่นี่เพื่อให้ได้ข้อความที่บอกว่าต้องทำอะไร
   */
  if (petId === null && petNameText === null) {
    throw invalid('ระบุสัตว์ที่จะพามา หรืออย่างน้อยพิมพ์ชื่อสัตว์', { field: 'petId' })
  }

  // จองย้อนหลังไม่ได้ — ใบจองของเมื่อวานไม่มีใครไปรับได้แล้ว
  if (bookedOn < todayDate()) {
    throw invalid('จองย้อนหลังไม่ได้', { field: 'bookedOn' })
  }

  await requireRefs({ ownerId: input.ownerId, petId }, outerTx ?? db)

  const data = {
    bookedOn,
    slot: input.slot,
    ownerId: input.ownerId,
    petId,
    petNameText,
    reason: cleanOptional(input.reason, { field: 'reason', label: 'อาการ', max: REASON_MAX }),
    source: booker.kind === 'staff' ? ('PHONE' as const) : ('ONLINE' as const),
    /**
     * ค่าปริยายของฐานคือ `BOOKED` — ส่งมาเมื่อไหร่ถึงจะเปลี่ยน
     *
     * เส้นของลูกค้าส่ง `PENDING` เพราะยังไม่มีพนักงานคุยด้วย · **ลืมส่งต่อตรงนี้แล้ว
     * ใบจะกลายเป็น `BOOKED` เงียบ ๆ โดย typecheck ไม่ฟ้อง** (พลาดจริง 2026-09-01)
     */
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(booker.kind === 'staff'
      ? { createdBy: booker.userId, updatedBy: booker.userId }
      : { createdByOwnerAccountId: booker.accountId }),
  }

  try {
    return await inTx(outerTx, async (tx) => {
      // เช็คในทรานแซกชันเดียวกับ insert — กันสองคนจองพร้อมกันแล้วเพดานหลุด
      if (data.status === undefined || data.status === 'BOOKED') {
        await requireSlotCapacity(bookedOn, input.slot, tx)
      }

      const created = await tx.appointment.create({ data })

      /**
       * **บันทึกเฉพาะตอนพนักงานเป็นคนจอง**
       *
       * `audit_log.user_id` ชี้ `user.id` เสมอและบังคับ (ดู `///` บนหัว `AuditLog`) ·
       * ลูกค้าที่จองเองไม่มีเลขนั้น และการยัดเลขของใครสักคนลงไปแปลว่าบันทึกโกหกว่า
       * พนักงานคนนั้นเป็นคนทำ
       *
       * ใบจองไม่ได้หายไปไหน — `source` กับ `createdByOwnerAccountId` บนแถวของมันเอง
       * บอกครบอยู่แล้วว่าใครจองและจองมาทางไหน
       */
      if (booker.kind === 'staff') {
        await writeAudit(tx, {
          action: `${MODULE}.create`,
          module: MODULE,
          recordId: created.id,
          after: {
            bookedOn: input.bookedOn,
            slot: created.slot,
            ownerId: Number(created.ownerId),
            source: created.source,
          },
          userId: booker.userId,
        })
      }

      return created
    })
  } catch (e) {
    if (duplicateIndexOf(e) === 'appointment_no_double_booking_key') {
      throw duplicate('สัตว์ตัวนี้ถูกจองในวันและช่วงเวลานี้ไปแล้ว', { field: 'slot' })
    }

    throw e
  }
}

/**
 * ยกเลิก — **ต้องบอกเหตุผล**
 *
 * ฐานบังคับด้วย CHECK · เหตุผลคือสิ่งที่พนักงานอ่านตอนลูกค้าโทรมาถามว่าทำไมถูกยกเลิก
 */
export async function cancelAppointment(
  id: bigint,
  reason: string,
  actorId: bigint | null,
  outerTx?: Tx,
): Promise<Appointment> {
  const existing = await findAppointment(id, outerTx)

  if (existing.status === 'ARRIVED') {
    throw invalid('ลูกค้ามาถึงแล้ว ยกเลิกใบจองนี้ไม่ได้', { field: 'status' })
  }
  if (existing.status === 'CANCELLED') return existing

  const value = cleanOptional(reason, {
    field: 'cancelReason',
    label: 'เหตุผลที่ยกเลิก',
    max: CANCEL_REASON_MAX,
  })
  if (value === null) throw invalid('ระบุเหตุผลที่ยกเลิก', { field: 'cancelReason' })

  return inTx(outerTx, async (tx) => {
    const updated = await tx.appointment.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelReason: value,
        ...(actorId === null ? {} : { updatedBy: actorId }),
      },
    })

    // เหตุผลเดียวกับตอนสร้าง — ลูกค้ายกเลิกเองไม่มี `user.id` ให้บันทึก
    if (actorId !== null) {
      await writeAudit(tx, {
        action: `${MODULE}.cancel`,
        module: MODULE,
        recordId: id,
        before: { status: existing.status },
        after: { status: 'CANCELLED', cancelReason: value },
        userId: actorId,
      })
    }

    return updated
  })
}

/**
 * ถึงเวลาแล้วไม่มา — **ต่างจาก `CANCELLED`**
 *
 * ไม่มีใครบอกล่วงหน้า · แยกไว้เพราะเป็นตัวเลขที่คลินิกต้องรู้ (ลูกค้าที่ไม่มาบ่อยควร
 * ถูกโทรยืนยันก่อน) และรวมกับการยกเลิกแปลว่าตอบคำถามนี้ไม่ได้อีก
 *
 * **ไม่มีงานเบื้องหลังตั้งค่านี้ให้เอง** — พนักงานเป็นคนกดตอนปิดวัน เพราะคนที่มาสาย
 * สองชั่วโมงก็ยังมา และระบบไม่รู้ว่าคลินิกปิดกี่โมง
 */
export async function markNoShow(
  id: bigint,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Appointment> {
  const existing = await findAppointment(id, outerTx)

  if (existing.status !== 'BOOKED') {
    throw invalid('ทำได้เฉพาะใบจองที่ยังรออยู่', { field: 'status', status: existing.status })
  }

  return inTx(outerTx, async (tx) => {
    const updated = await tx.appointment.update({
      where: { id },
      data: { status: 'NO_SHOW', updatedBy: actorId },
    })

    await writeAudit(tx, {
      action: `${MODULE}.no-show`,
      module: MODULE,
      recordId: id,
      before: { status: existing.status },
      after: { status: 'NO_SHOW' },
      userId: actorId,
    })

    return updated
  })
}

/**
 * พนักงานยืนยันใบที่ลูกค้าจองออนไลน์ — `PENDING` → `BOOKED`
 *
 * (ผู้ใช้กำหนด 2026-09-01: "พนักงานจะเป็นคนคอนเฟิร์มคิวเอง ให้ลูกค้าจัดคิวจองเองหัวปวดแน่")
 *
 * **ยืนยันได้จาก `PENDING` เท่านั้น** · ใบที่ `BOOKED` อยู่แล้วไม่ต้องยืนยันซ้ำ และใบที่
 * `CANCELLED` ไปแล้วต้องให้ลูกค้าจองใหม่ ไม่ใช่ปลุกกลับมาเงียบ ๆ
 *
 * **ไม่รับพารามิเตอร์ให้แก้วันหรือช่วงเวลาที่นี่** — พนักงานที่คุยแล้วต้องเลื่อนวัน ให้ใช้
 * `updateAppointment` ตามปกติ · รวมสองอย่างเข้าด้วยกันแปลว่าการยืนยันกับการแก้ไข
 * ปนกันใน audit เดียว แล้วตอบไม่ได้ว่าลูกค้าตกลงกับวันไหน
 */
export async function confirmAppointment(
  id: bigint,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Appointment> {
  const existing = await findAppointment(id, outerTx)

  if (existing.status !== 'PENDING') {
    throw invalid('ยืนยันได้เฉพาะใบที่รอยืนยันอยู่', {
      field: 'status',
      status: existing.status,
    })
  }

  return inTx(outerTx, async (tx) => {
    // เช็คในทรานแซกชันเดียวกับ update — ช่วงอาจเต็มไปแล้วระหว่างที่ใบนี้รอพนักงานโทรกลับ
    await requireSlotCapacity(existing.bookedOn, existing.slot, tx)

    const updated = await tx.appointment.update({
      where: { id },
      data: {
        status: 'BOOKED',
        confirmedAt: new Date(),
        confirmedBy: actorId,
        updatedBy: actorId,
      },
    })

    await writeAudit(tx, {
      action: `${MODULE}.confirm`,
      module: MODULE,
      recordId: id,
      before: { status: existing.status },
      after: { status: 'BOOKED' },
      userId: actorId,
    })

    return updated
  })
}

/** ลบ — soft delete · ใบที่ใช้ไปแล้ว (มีคิว) ลบไม่ได้ */
export async function deleteAppointment(
  id: bigint,
  actorId: bigint,
  outerTx?: Tx,
): Promise<void> {
  const at = outerTx ?? db
  const existing = await at.appointment.findUnique({ where: { id } })
  if (!existing) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })
  if (existing.deletedAt !== null) return

  const visits = await at.visit.count({ where: { appointmentId: id, deletedAt: null } })
  if (visits > 0) {
    throw invalid('ใบจองนี้ถูกใช้เปิดคิวไปแล้ว ลบไม่ได้', { field: 'id' })
  }

  await inTx(outerTx, async (tx) => {
    await tx.appointment.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorId },
    })

    await writeAudit(tx, {
      action: `${MODULE}.delete`,
      module: MODULE,
      recordId: id,
      before: { slot: existing.slot, ownerId: Number(existing.ownerId) },
      after: null,
      userId: actorId,
    })
  })
}
