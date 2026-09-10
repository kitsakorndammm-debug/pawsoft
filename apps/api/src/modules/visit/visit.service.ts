import { invalid, notFound } from '../../kit/app-error.ts'
import { writeAudit } from '../../kit/audit.ts'
import { db, inTx, type Db, type Tx } from '../../kit/db.ts'
import { duplicateIndexOf } from '../../kit/duplicate.ts'
import { cleanOptional } from '../../kit/text.ts'
import { createAppointment, todayDate } from '../appointment/appointment.service.ts'
import type { Appointment, AppointmentSlot, TriageLevel, Visit, VisitStatus } from '../../../prisma/generated/client.ts'

/**
 * คิวหน้างาน — **นี่คือคิวจริง**
 *
 * เกิดได้ 3 ทาง และทั้งสามจบที่ตารางนี้เหมือนกัน:
 *
 *   จองออนไลน์ → มาถึง → `checkIn({ appointmentId })`
 *   โทรจอง     → มาถึง → `checkIn({ appointmentId })`
 *   เดินเข้ามา → `checkIn({ ... })` ตรง ๆ
 *
 * **ลำดับเรียกไม่ใช่เลขคิว** · เลขคิวออกตามลำดับมาถึงและไม่เปลี่ยนอีกเลย ส่วนลำดับที่
 * จะได้เจอหมอคำนวณสด ๆ จาก `triage` แล้วค่อย `arrivedAt` — เคสแดงที่มาทีหลังจึงขึ้น
 * หัวแถวได้โดยที่ไม่มีใครถูกเปลี่ยนเลขบัตร
 */

const MODULE = 'visit'
const LABEL = 'คิว'

const PET_NAME_MAX = 200
const OWNER_NAME_MAX = 200
const PHONE_MAX = 30
const TEXT_MAX = 2_000

export const VISIT_PAGE_SIZE = 50
export const VISIT_PAGE_SIZE_MAX = 200

/**
 * สถานะที่ยัง**อยู่ในคลินิก** — จอคิวแสดงเท่านี้
 *
 * **`AWAITING_PAYMENT` อยู่ในนี้ด้วย** · คนที่ตรวจเสร็จแล้วแต่ยังไม่จ่ายเงินยังยืนอยู่
 * ที่เคาน์เตอร์จริง ๆ — เขายังเป็นงานค้างของคลินิก
 *
 * เดิมมีแค่สองตัวแรก ซึ่งแปลว่าพอหมอกดตรวจเสร็จ คิวนั้นหายจากจอทันที แล้วเคาน์เตอร์
 * ไม่มีทางกดเก็บเงินได้เลย (เจอตอนวัดจริง 2026-09-01: ชิปสรุปขึ้น "รอชำระ 0"
 * ทั้งที่มีสี่ราย)
 *
 * `DONE` ไม่อยู่ในนี้ เพราะคนนั้นกลับบ้านไปแล้ว
 */
export const LIVE_STATUSES = [
  'WAITING',
  'IN_PROGRESS',
  'AWAITING_PAYMENT',
] as const satisfies readonly VisitStatus[]

/**
 * น้ำหนักเป็นข้อความ — เหตุผลเดียวกับ `pet.service.ts`
 */
function cleanWeight(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null

  const value = raw.trim()
  if (value.length === 0) return null

  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw invalid('น้ำหนักต้องเป็นตัวเลข ทศนิยมไม่เกินสองตำแหน่ง', { field: 'weightKg', value })
  }
  if (Number(value) <= 0) throw invalid('น้ำหนักต้องมากกว่า 0', { field: 'weightKg', value })

  return value
}

export async function findVisit(id: bigint, tx?: Tx): Promise<Visit> {
  const row = await (tx ?? db).visit.findFirst({ where: { id, deletedAt: null } })
  if (!row) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })

  return row
}

export type BookNextVisitAppointmentInput = {
  visitId: bigint
  bookedOn: string
  slot: AppointmentSlot
}

/**
 * หมอกดนัดครั้งถัดไปจากหน้ารักษา — **ยืม `createAppointment` จากโมดูล `appointment`**
 * เอาเจ้าของและสัตว์มาจากคิวนี้เอง ไม่ให้หมอเลือกใหม่ (ต้องตรงกับตัวที่กำลังรักษาอยู่)
 *
 * **อยู่ที่นี่ ไม่ใช่ใน `appointment.service.ts`** — `visit.service.ts` ยืม `todayDate`
 * จาก `appointment.service.ts` อยู่แล้ว (ทางเดียว) ถ้าให้ `appointment.service.ts`
 * ยืม `findVisit` กลับมาที่นี่จะเป็นการเรียกวนระหว่างสองโมดูล
 *
 * **บังคับว่าคิวต้องผูกเจ้าของแล้ว** (ผู้ใช้ตัดสิน 2026-09-08) — คิว walk-in ที่ยังไม่มี
 * แม้แต่ชื่อเจ้าของ ไม่มีใครให้นัดครั้งถัดไปกลับไปหา ไม่จำกัดสถานะของคิว — นัดได้แม้
 * ปิดคิว (`DONE`) ไปแล้ว เพดานที่นั่งต่อช่วงเวลา (สูงสุด 8) เป็นกฎที่ยืมมาจาก
 * `createAppointment` เอง ไม่ต้องเขียนซ้ำที่นี่
 */
export async function bookNextVisitAppointment(
  input: BookNextVisitAppointmentInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Appointment> {
  const visit = await findVisit(input.visitId, outerTx)

  if (visit.ownerId === null) {
    throw invalid('คิวนี้ยังไม่ผูกเจ้าของสัตว์ — ต้องผูกก่อนถึงจะนัดครั้งถัดไปได้', {
      field: 'ownerId',
    })
  }

  return createAppointment(
    {
      bookedOn: input.bookedOn,
      slot: input.slot,
      ownerId: visit.ownerId,
      petId: visit.petId,
      petNameText: visit.petId === null ? visit.walkInPetName : null,
    },
    { kind: 'staff', userId: actorId },
    outerTx,
  )
}

/**
 * เลขคิวถัดไปของวัน
 *
 * **นับจากเลขสูงสุดของวันนั้น ไม่ใช่จำนวนแถว** — คิวที่ถูกยกเลิกยังกินเลขอยู่ และ
 * ต้องกินต่อไป: ลูกค้าที่ถือบัตรเลข 7 อยู่ไม่ควรเจอคนที่สองถือเลข 7 เพราะคิวเดิม
 * ถูกยกเลิกไปแล้ว
 *
 * ชนกันได้ถ้าสองเคาน์เตอร์กดพร้อมกัน — unique index เป็นคนตัดสิน ส่วน `checkIn`
 * ลองใหม่ (ดูที่นั่น)
 */
async function nextQueueNumber(queueDate: Date, at: Tx | Db): Promise<number> {
  const top = await at.visit.findFirst({
    where: { queueDate },
    orderBy: { queueNumber: 'desc' },
    select: { queueNumber: true },
  })

  return (top?.queueNumber ?? 0) + 1
}

export type CheckInInput = {
  /** ใบจองที่ลูกค้าถือมา — ไม่ส่ง = walk-in */
  appointmentId?: bigint | null
  ownerId?: bigint | null
  petId?: bigint | null
  /** ใช้เมื่อยังไม่มีแถวใน `pet` — เคสฉุกเฉิน หรือลูกค้าใหม่ที่ยังไม่ได้กรอกทะเบียน */
  walkInPetName?: string | null
  walkInOwnerName?: string | null
  walkInOwnerPhone?: string | null
  triage?: TriageLevel | undefined
  symptom?: string | null
  weightKg?: string | null
}

function cleanCheckIn(input: CheckInInput) {
  return {
    walkInPetName: cleanOptional(input.walkInPetName, {
      field: 'walkInPetName',
      label: 'ชื่อสัตว์',
      max: PET_NAME_MAX,
    }),
    walkInOwnerName: cleanOptional(input.walkInOwnerName, {
      field: 'walkInOwnerName',
      label: 'ชื่อผู้พามา',
      max: OWNER_NAME_MAX,
    }),
    walkInOwnerPhone: cleanOptional(input.walkInOwnerPhone, {
      field: 'walkInOwnerPhone',
      label: 'เบอร์ผู้พามา',
      max: PHONE_MAX,
    }),
    symptom: cleanOptional(input.symptom, { field: 'symptom', label: 'อาการ', max: TEXT_MAX }),
    weightKg: cleanWeight(input.weightKg),
    triage: input.triage ?? ('NORMAL' as TriageLevel),
  }
}

/**
 * ลงทะเบียนหน้างาน — **จุดเดียวที่คิวเกิดขึ้น**
 *
 * รับใบจองก็ได้ ไม่รับก็ได้ · ส่ง `appointmentId` มาแล้วจะคัดลอกเจ้าของและสัตว์จากใบนั้น
 * มาให้ (ผู้เรียกไม่ต้องส่งซ้ำ) และปิดใบจองเป็น `ARRIVED` ในทรานแซกชันเดียวกัน —
 * ไม่งั้นจะมีวินาทีที่คิวเกิดแล้วแต่ใบจองยังว่าง แล้วอีกเคาน์เตอร์รับใบเดิมซ้ำได้
 *
 * **`petId` ไม่บังคับเลย** (ผู้ใช้กำหนด 2026-09-01) · สัตว์ที่กำลังจะตายถูกอุ้มเข้ามา
 * โดยคนที่ไม่ใช่เจ้าของ — บังคับกรอกทะเบียนก่อนเปิดคิว แปลว่าระบบยืนขวางการรักษา
 */
export async function checkIn(
  input: CheckInInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Visit> {
  const data = cleanCheckIn(input)
  const at = outerTx ?? db
  const queueDate = todayDate()

  let ownerId = input.ownerId ?? null
  let petId = input.petId ?? null
  const appointmentId = input.appointmentId ?? null

  if (appointmentId !== null) {
    const appointment = await at.appointment.findFirst({
      where: { id: appointmentId, deletedAt: null },
      select: { id: true, status: true, ownerId: true, petId: true, petNameText: true, bookedOn: true },
    })
    if (!appointment) throw notFound('ไม่พบใบจองนี้', { field: 'appointmentId' })

    if (appointment.status !== 'BOOKED') {
      throw invalid(
        appointment.status === 'ARRIVED'
          ? 'ใบจองนี้ถูกใช้เปิดคิวไปแล้ว'
          : 'ใบจองนี้ใช้ไม่ได้แล้ว',
        { field: 'appointmentId', status: appointment.status },
      )
    }

    /**
     * **ยังไม่ถึงวันนัด — เช็คอินไม่ได้** (ผู้ใช้ตัดสิน 2026-09-09)
     *
     * คิวที่เกิดจาก `checkIn` ลงเป็นวันนี้เสมอ (`queueDate` ด้านบน) ไม่ใช่วันที่นัดไว้
     * ในใบจอง — กดเช็คอินใบจองวันพรุ่งนี้ก่อนเวลาจะได้คิว "วันนี้" ไปเงียบ ๆ ทั้งที่
     * ลูกค้ายังไม่ได้มาจริง · นัดที่ถึงวันแล้วหรือเลยมาแล้วยังเช็คอินได้ตามปกติ
     */
    if (appointment.bookedOn > queueDate) {
      throw invalid('ยังไม่ถึงวันนัด — เช็คอินได้เมื่อถึงวันที่นัดไว้', {
        field: 'appointmentId',
        bookedOn: appointment.bookedOn.toISOString().slice(0, 10),
      })
    }

    // ค่าจากใบจองเป็นหลัก — ผู้เรียกไม่ต้องส่งซ้ำ และส่งมาขัดกันไม่ได้
    ownerId = appointment.ownerId
    petId = appointment.petId ?? petId
    if (petId === null && data.walkInPetName === null) {
      data.walkInPetName = appointment.petNameText
    }
  }

  if (petId === null && data.walkInPetName === null) {
    throw invalid('ระบุสัตว์ หรืออย่างน้อยพิมพ์ชื่อสัตว์ที่พามา', { field: 'petId' })
  }

  if (petId !== null) {
    const pet = await at.pet.findFirst({
      where: { id: petId, deletedAt: null },
      select: { ownerId: true },
    })
    if (!pet) throw notFound('ไม่พบสัตว์ที่เลือก', { field: 'petId' })

    // สัตว์รู้ว่าเจ้าของเป็นใครอยู่แล้ว — ไม่ต้องเชื่อค่าที่ส่งมา
    ownerId = pet.ownerId
  } else if (ownerId !== null) {
    const owner = await at.owner.count({ where: { id: ownerId, deletedAt: null } })
    if (owner === 0) throw notFound('ไม่พบเจ้าของที่เลือก', { field: 'ownerId' })
  }

  /**
   * ลองใหม่เมื่อเลขคิวชน — สองเคาน์เตอร์กดพร้อมกันจะอ่านเลขสูงสุดตัวเดียวกัน
   *
   * ไม่ใช่ความผิดของคนที่กดทีหลัง และเขาไม่ควรเห็น error · ลองใหม่ได้เลขถัดไปที่ว่างจริง
   */
  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await inTx(outerTx, async (tx) => {
        const queueNumber = await nextQueueNumber(queueDate, tx)

        const created = await tx.visit.create({
          data: {
            queueNumber,
            queueDate,
            triage: data.triage,
            ownerId,
            petId,
            walkInPetName: data.walkInPetName,
            walkInOwnerName: data.walkInOwnerName,
            walkInOwnerPhone: data.walkInOwnerPhone,
            appointmentId,
            symptom: data.symptom,
            weightKg: data.weightKg,
            createdBy: actorId,
            updatedBy: actorId,
          },
        })

        // ใบจองปิดในทรานแซกชันเดียวกับคิวที่มันกลายเป็น
        if (appointmentId !== null) {
          await tx.appointment.update({
            where: { id: appointmentId },
            data: { status: 'ARRIVED', updatedBy: actorId },
          })
        }

        await writeAudit(tx, {
          action: `${MODULE}.check-in`,
          module: MODULE,
          recordId: created.id,
          after: {
            queueNumber: created.queueNumber,
            triage: created.triage,
            petId: petId === null ? null : Number(petId),
            appointmentId: appointmentId === null ? null : Number(appointmentId),
          },
          userId: actorId,
        })

        return created
      })
    } catch (e) {
      if (duplicateIndexOf(e) !== 'visit_queue_number_per_day_key') throw e
      lastError = e
    }
  }

  throw lastError
}

export type QueueRow = Visit & {
  pet: { id: bigint; code: string; name: string } | null
  owner: { id: bigint; code: string; name: string; phone: string | null } | null
}

/**
 * คิวของวัน — **เรียงตามลำดับที่จะได้เจอหมอ ไม่ใช่ตามเลขคิว**
 *
 * `triage` ก่อน แล้วค่อย `arrivedAt` · enum เรียงตามลำดับที่ประกาศไว้ในสคีมา
 * (`EMERGENCY` `URGENT` `NORMAL`) ซึ่งเรียงจากด่วนที่สุดอยู่แล้วโดยตั้งใจ — เปลี่ยน
 * ลำดับใน enum เมื่อไหร่ ลำดับคิวเปลี่ยนตามทันที
 *
 * **คำนวณสด ไม่เก็บเป็นคอลัมน์** · เก็บลำดับไว้แปลว่าทุกครั้งที่เคสแดงเข้ามา ต้องไล่
 * เขียนทับทุกแถวที่เหลือ แล้ววันที่เขียนไม่ครบจะมีสองคนถือลำดับเดียวกัน
 */
export async function listQueue(
  input: { date?: string | undefined; includeDone?: boolean | undefined } = {},
  tx?: Tx,
): Promise<QueueRow[]> {
  const queueDate =
    input.date === undefined ? todayDate() : new Date(`${input.date.trim()}T00:00:00Z`)

  if (Number.isNaN(queueDate.getTime())) {
    throw invalid('วันที่ต้องอยู่ในรูป YYYY-MM-DD', { field: 'date' })
  }

  return (tx ?? db).visit.findMany({
    where: {
      queueDate,
      deletedAt: null,
      ...(input.includeDone ? {} : { status: { in: [...LIVE_STATUSES] } }),
    },
    orderBy: [{ triage: 'asc' }, { arrivedAt: 'asc' }, { id: 'asc' }],
    include: {
      pet: { select: { id: true, code: true, name: true } },
      owner: { select: { id: true, code: true, name: true, phone: true } },
    },
  })
}

export type ListVisitsInput = {
  petId?: bigint | undefined
  ownerId?: bigint | undefined
  status?: VisitStatus | undefined
  page?: number | undefined
  pageSize?: number | undefined
}

export type ListVisitsResult = { rows: Visit[]; page: number; pageSize: number; total: number }

/** ประวัติการรักษา — ใหม่สุดขึ้นก่อน ต่างจาก `listQueue` ที่เรียงตามลำดับเรียก */
export async function listVisits(
  input: ListVisitsInput = {},
  tx?: Tx,
): Promise<ListVisitsResult> {
  const page = Math.max(Math.floor(input.page ?? 1), 1)
  const pageSize = Math.min(
    Math.max(Math.floor(input.pageSize ?? VISIT_PAGE_SIZE), 1),
    VISIT_PAGE_SIZE_MAX,
  )

  const at = tx ?? db
  const where = {
    deletedAt: null,
    ...(input.petId !== undefined ? { petId: input.petId } : {}),
    ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  }

  const [rows, total] = await Promise.all([
    at.visit.findMany({
      where,
      orderBy: [{ queueDate: 'desc' }, { arrivedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    at.visit.count({ where }),
  ])

  return { rows, page, pageSize, total }
}

/**
 * เปลี่ยนระดับความเร่งด่วน — **เคสที่ทรุดลงระหว่างรอ**
 *
 * สัตว์ที่มานั่งรอด้วยอาการธรรมดาแล้วอาการแย่ลง ต้องขึ้นหัวแถวได้ทันที · เลขคิวไม่เปลี่ยน
 */
export async function setTriage(
  id: bigint,
  triage: TriageLevel,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Visit> {
  const existing = await findVisit(id, outerTx)
  if (existing.triage === triage) return existing

  if (existing.status === 'DONE' || existing.status === 'CANCELLED') {
    throw invalid('คิวนี้ปิดไปแล้ว', { field: 'status', status: existing.status })
  }

  return inTx(outerTx, async (tx) => {
    const updated = await tx.visit.update({ where: { id }, data: { triage, updatedBy: actorId } })

    await writeAudit(tx, {
      action: `${MODULE}.set-triage`,
      module: MODULE,
      recordId: id,
      before: { triage: existing.triage },
      after: { triage },
      userId: actorId,
    })

    return updated
  })
}

/**
 * เรียกเข้าตรวจ — `WAITING` → `IN_PROGRESS`
 *
 * `calledAt` ตั้งพร้อมกับสถานะเสมอ · ฐานบังคับด้วย CHECK ว่าสองอย่างนี้ต้องมาด้วยกัน
 * เพราะรายงาน "รอเฉลี่ยกี่นาที" คำนวณจากมัน
 */
export async function callVisit(
  id: bigint,
  vetEmployeeId: bigint | null,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Visit> {
  const existing = await findVisit(id, outerTx)

  if (existing.status !== 'WAITING') {
    throw invalid('เรียกได้เฉพาะคิวที่กำลังรออยู่', { field: 'status', status: existing.status })
  }

  if (vetEmployeeId !== null) {
    const vet = await (outerTx ?? db).employee.count({
      where: { id: vetEmployeeId, deletedAt: null },
    })
    if (vet === 0) throw notFound('ไม่พบพนักงานที่เลือก', { field: 'vetEmployeeId' })
  }

  return inTx(outerTx, async (tx) => {
    const updated = await tx.visit.update({
      where: { id },
      data: { status: 'IN_PROGRESS', calledAt: new Date(), vetEmployeeId, updatedBy: actorId },
    })

    await writeAudit(tx, {
      action: `${MODULE}.call`,
      module: MODULE,
      recordId: id,
      before: { status: existing.status },
      after: { status: 'IN_PROGRESS', vetEmployeeId: vetEmployeeId === null ? null : Number(vetEmployeeId) },
      userId: actorId,
    })

    return updated
  })
}

/**
 * ตรวจเสร็จ — `IN_PROGRESS` → `AWAITING_PAYMENT`
 *
 * **หมอจบแค่ตรงนี้ ไม่ใช่ `DONE`** · แคชเชียร์เป็นคนปิดอีกที และคลินิกต้องรู้ว่ามีกี่ราย
 * ค้างอยู่ตรงเคาน์เตอร์
 */
export async function finishExam(
  id: bigint,
  input: { diagnosis?: string | null; note?: string | null; weightKg?: string | null },
  actorId: bigint,
  outerTx?: Tx,
): Promise<Visit> {
  const existing = await findVisit(id, outerTx)

  if (existing.status !== 'IN_PROGRESS') {
    throw invalid('ปิดการตรวจได้เฉพาะคิวที่กำลังตรวจอยู่', {
      field: 'status',
      status: existing.status,
    })
  }

  const diagnosis = cleanOptional(input.diagnosis, {
    field: 'diagnosis',
    label: 'ผลวินิจฉัย',
    max: TEXT_MAX,
  })
  const note = cleanOptional(input.note, { field: 'note', label: 'บันทึก', max: TEXT_MAX })
  const weightKg = cleanWeight(input.weightKg)

  return inTx(outerTx, async (tx) => {
    const updated = await tx.visit.update({
      where: { id },
      data: {
        status: 'AWAITING_PAYMENT',
        diagnosis,
        note,
        ...(weightKg === null ? {} : { weightKg }),
        updatedBy: actorId,
      },
    })

    /**
     * น้ำหนักล่าสุดของสัตว์อัปเดตตาม — **แต่ค่าของครั้งนี้ยังอยู่ที่ `visit`**
     *
     * `pet.weightKg` เป็นแค่ค่าไว้โชว์ตอนเปิดประวัติ · ใบสั่งยาของครั้งนี้อ่านจาก
     * `visit.weightKg` เสมอ ไม่งั้นครั้งหน้าที่ชั่งใหม่ ใบเก่าจะอ่านได้คนละแบบ
     */
    if (weightKg !== null && updated.petId !== null) {
      await tx.pet.update({
        where: { id: updated.petId },
        data: { weightKg, updatedBy: actorId },
      })
    }

    await writeAudit(tx, {
      action: `${MODULE}.finish-exam`,
      module: MODULE,
      recordId: id,
      before: { status: existing.status },
      after: { status: 'AWAITING_PAYMENT' },
      userId: actorId,
    })

    return updated
  })
}

/** ปิดคิว — `AWAITING_PAYMENT` → `DONE` · `doneAt` ตั้งพร้อมกัน ฐานบังคับไว้ */
export async function closeVisit(id: bigint, actorId: bigint, outerTx?: Tx): Promise<Visit> {
  const existing = await findVisit(id, outerTx)

  if (existing.status !== 'AWAITING_PAYMENT') {
    throw invalid('ปิดคิวได้เฉพาะรายที่ตรวจเสร็จแล้ว', {
      field: 'status',
      status: existing.status,
    })
  }

  return inTx(outerTx, async (tx) => {
    const updated = await tx.visit.update({
      where: { id },
      data: { status: 'DONE', doneAt: new Date(), updatedBy: actorId },
    })

    await writeAudit(tx, {
      action: `${MODULE}.close`,
      module: MODULE,
      recordId: id,
      before: { status: existing.status },
      after: { status: 'DONE' },
      userId: actorId,
    })

    return updated
  })
}

/**
 * ลูกค้ากลับก่อน หรือยกเลิกคิว
 *
 * **ไม่ลบแถว** — เวลาที่เขารอคือข้อมูลที่คลินิกต้องเห็น · `LEFT` กับ `CANCELLED`
 * ต่างกันที่ฝ่ายไหนเป็นคนเลิก
 */
export async function abandonVisit(
  id: bigint,
  status: 'LEFT' | 'CANCELLED',
  actorId: bigint,
  outerTx?: Tx,
): Promise<Visit> {
  const existing = await findVisit(id, outerTx)

  if (existing.status === 'DONE') throw invalid('คิวนี้ปิดไปแล้ว', { field: 'status' })
  if (existing.status === status) return existing

  return inTx(outerTx, async (tx) => {
    const updated = await tx.visit.update({ where: { id }, data: { status, updatedBy: actorId } })

    await writeAudit(tx, {
      action: `${MODULE}.abandon`,
      module: MODULE,
      recordId: id,
      before: { status: existing.status },
      after: { status },
      userId: actorId,
    })

    return updated
  })
}

/**
 * ผูกคิวเข้ากับสัตว์และเจ้าของที่รู้ทีหลัง
 *
 * (ผู้ใช้กำหนด 2026-09-01: "สามารถเชื่อมงานกับสัตว์และผู้ใช้ในระบบได้ภายหลัง")
 *
 * เคสแดงถูกเปิดคิวไปก่อนโดยมีแค่ชื่อที่เขียนหน้างาน · พอญาติมาถึงและกรอกทะเบียนเสร็จ
 * ค่อยผูกเข้าด้วยกัน — **ประวัติการรักษาที่บันทึกไปแล้วยังอยู่ที่แถวเดิม** ไม่ต้องย้าย
 * ไปไหน เพราะรายการยาและการรักษาชี้มาที่ `visit.id` ไม่ใช่ที่ `pet.id`
 *
 * **ไม่ลบชื่อที่เขียนหน้างานทิ้ง** — มันคือสิ่งที่พนักงานเห็นตอนนั้น และเป็นหลักฐานว่า
 * คิวนี้เคยเป็นเคสที่ไม่รู้ตัวตน
 */
export async function linkVisit(
  id: bigint,
  input: { petId: bigint },
  actorId: bigint,
  outerTx?: Tx,
): Promise<Visit> {
  const at = outerTx ?? db
  const existing = await findVisit(id, outerTx)

  if (existing.petId !== null) {
    throw invalid('คิวนี้ผูกกับสัตว์อยู่แล้ว', { field: 'petId' })
  }

  const pet = await at.pet.findFirst({
    where: { id: input.petId, deletedAt: null },
    select: { id: true, ownerId: true },
  })
  if (!pet) throw notFound('ไม่พบสัตว์ที่เลือก', { field: 'petId' })

  return inTx(outerTx, async (tx) => {
    const updated = await tx.visit.update({
      where: { id },
      // เจ้าของมาจากสัตว์เสมอ — สัตว์รู้ว่าตัวเองเป็นของใคร
      data: { petId: pet.id, ownerId: pet.ownerId, updatedBy: actorId },
    })

    await writeAudit(tx, {
      action: `${MODULE}.link`,
      module: MODULE,
      recordId: id,
      before: { petId: null, walkInPetName: existing.walkInPetName },
      after: { petId: Number(pet.id), ownerId: Number(pet.ownerId) },
      userId: actorId,
    })

    return updated
  })
}

/* ------------------------------------------------------------------ *
 * ประวัติการรักษาฝั่งลูกค้า
 *
 * (ผู้ใช้กำหนด 2026-09-01: "3. ดูประวัติรักษา")
 * ------------------------------------------------------------------ */

export type MyVisitRow = {
  id: bigint
  queueDate: Date
  status: VisitStatus
  petId: bigint | null
  petName: string | null
  symptom: string | null
  diagnosis: string | null
  vetName: string | null
}

/**
 * ประวัติการรักษาของลูกค้าคนนี้ — **เฉพาะครั้งที่ตรวจจบแล้ว**
 *
 * **ไม่รวมคิวที่ยังเดินอยู่** · คิววันนี้ที่หมอยังตรวจไม่เสร็จมี `diagnosis` ว่างหรือ
 * เขียนค้างไว้ครึ่งทาง · ลูกค้าที่เปิดอ่านตอนนั้นจะเห็นข้อมูลที่ยังไม่ใช่ข้อสรุป แล้ว
 * เข้าใจผิดว่าหมอวินิจฉัยว่าอย่างนั้นจริง ๆ
 *
 * `LEFT` กับ `CANCELLED` ก็ไม่รวม — ไม่มีการรักษาเกิดขึ้นในสองกรณีนั้น
 */
export async function listMyVisits(
  ownerId: bigint,
  input: { page?: number | undefined; pageSize?: number | undefined } = {},
  tx?: Tx,
): Promise<{ rows: MyVisitRow[]; page: number; pageSize: number; total: number }> {
  const page = Math.max(Math.floor(input.page ?? 1), 1)
  const pageSize = Math.min(
    Math.max(Math.floor(input.pageSize ?? VISIT_PAGE_SIZE), 1),
    VISIT_PAGE_SIZE_MAX,
  )

  const at = tx ?? db
  const where = {
    deletedAt: null,
    ownerId,
    status: { in: ['DONE', 'AWAITING_PAYMENT'] as VisitStatus[] },
  }

  const [found, total] = await Promise.all([
    at.visit.findMany({
      where,
      orderBy: [{ queueDate: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        queueDate: true,
        status: true,
        petId: true,
        walkInPetName: true,
        symptom: true,
        diagnosis: true,
        pet: { select: { name: true } },
        vetEmployee: { select: { firstName: true, lastName: true } },
      },
    }),
    at.visit.count({ where }),
  ])

  const rows = found.map((r) => ({
    id: r.id,
    queueDate: r.queueDate,
    status: r.status,
    petId: r.petId,
    petName: r.pet?.name ?? r.walkInPetName,
    symptom: r.symptom,
    diagnosis: r.diagnosis,
    vetName:
      r.vetEmployee === null
        ? null
        : `${r.vetEmployee.firstName} ${r.vetEmployee.lastName}`.trim(),
  }))

  return { rows, page, pageSize, total }
}

/**
 * ประวัติการรักษาครั้งเดียว — รูปเดียวกับแถวใน `listMyVisits`
 *
 * เงื่อนไขเดียวกับลิสต์ทุกข้อ (เป็นของลูกค้าคนนี้ · ตรวจจบแล้ว) รวมอยู่ใน `where`
 * เดียว — ไม่พบไม่ว่าจะเพราะเป็นของคนอื่นหรือเพราะยังไม่จบ ก็ตอบ 404 เหมือนกัน
 * (เหตุผลเดียวกับ `requireOwnPet`: ไม่บอกว่าเลขนี้มีอยู่จริงแต่เป็นของคนอื่น)
 */
export async function findMyVisit(ownerId: bigint, id: bigint, tx?: Tx): Promise<MyVisitRow> {
  const at = tx ?? db

  const row = await at.visit.findFirst({
    where: {
      id,
      ownerId,
      deletedAt: null,
      status: { in: ['DONE', 'AWAITING_PAYMENT'] as VisitStatus[] },
    },
    select: {
      id: true,
      queueDate: true,
      status: true,
      petId: true,
      walkInPetName: true,
      symptom: true,
      diagnosis: true,
      pet: { select: { name: true } },
      vetEmployee: { select: { firstName: true, lastName: true } },
    },
  })

  if (!row) throw notFound('ไม่พบประวัติการรักษานี้', { id: String(id) })

  return {
    id: row.id,
    queueDate: row.queueDate,
    status: row.status,
    petId: row.petId,
    petName: row.pet?.name ?? row.walkInPetName,
    symptom: row.symptom,
    diagnosis: row.diagnosis,
    vetName:
      row.vetEmployee === null
        ? null
        : `${row.vetEmployee.firstName} ${row.vetEmployee.lastName}`.trim(),
  }
}

/** ครั้งนี้เป็นของลูกค้าคนนี้จริงไหม — **404 ไม่ใช่ 403** เหตุผลเดียวกับ `requireOwnPet` */
export async function requireOwnVisit(
  ownerId: bigint,
  visitId: bigint,
  tx?: Tx,
): Promise<void> {
  const found = await (tx ?? db).visit.count({
    where: { id: visitId, ownerId, deletedAt: null },
  })
  if (found === 0) throw notFound('ไม่พบประวัติการรักษานี้')
}
