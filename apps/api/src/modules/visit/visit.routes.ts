import { ok, paged } from '../../kit/response.ts'
import {
  Elysia,
  t } from 'elysia'

import { invalid } from '../../kit/app-error.ts'
import {
  getActor,
  guardMedicalWrite,
  guardReceptionRead,
  guardReceptionWrite,
  parseId,
  parseIdFilter,
  refuseUnknownFields,
  refuseUnknownQuery,
} from '../../kit/route-guard.ts'
import {
  abandonVisit,
  bookNextVisitAppointment,
  callVisit,
  checkIn,
  closeVisit,
  finishExam,
  findVisit,
  linkVisit,
  listQueue,
  listVisits,
  setTriage,
  VISIT_PAGE_SIZE,
  type QueueRow,
} from './visit.service.ts'
import {
  addVisitDrug,
  addVisitService,
  getVisitBill,
  removeVisitDrug,
  removeVisitService,
} from './visit-item.service.ts'
import { APPOINTMENT_SLOTS } from '../appointment/appointment.service.ts'
import type { Appointment, TriageLevel, Visit, VisitStatus } from '../../../prisma/generated/client.ts'

/**
 * คิวหน้างาน
 *
 * เส้นที่คนใช้บ่อยที่สุดคือ `GET /api/visits/queue` — จอที่เปิดค้างไว้ทั้งวัน ·
 * มันคืนคิว **เรียงตามลำดับที่จะได้เจอหมอ** ไม่ใช่ตามเลขคิว (ดู `listQueue`)
 */

/**
 * **เส้นไหนเป็นของหมอ เส้นไหนเป็นของเคาน์เตอร์** (ผู้ใช้ตัดสิน 2026-09-01)
 *
 *   เคาน์เตอร์ (`reception:write`)   เปิดคิว · เรียก · เปลี่ยนระดับ · ผูกสัตว์ · กลับก่อน
 *   หมอ (`medical:write`)            วินิจฉัย · จ่ายยา · สั่งการรักษา · ปิดการตรวจ
 *
 * เดิมใช้ key เดียวกันหมด ซึ่งแปลว่าพนักงานเคาน์เตอร์ทุกคนเขียนผลวินิจฉัยลงประวัติ
 * สัตว์ได้ · **การวินิจฉัยและการสั่งยาเป็นงานของผู้มีใบประกอบวิชาชีพ** ไม่ใช่ของ
 * ทุกคนที่เปิดคิวได้
 *
 * **อ่านยังใช้ `reception:read`** — คนที่เห็นคิวควรเห็นว่าเคสนี้วินิจฉัยว่าอะไร ·
 * สิ่งที่ต้องกันคือการเขียน
 */

const QUEUE_QUERY_KEYS = new Set(['date', 'includeDone'])
const LIST_QUERY_KEYS = new Set(['petId', 'ownerId', 'status', 'page', 'pageSize'])

const CHECK_IN_FIELDS = new Set([
  'appointmentId',
  'ownerId',
  'petId',
  'walkInPetName',
  'walkInOwnerName',
  'walkInOwnerPhone',
  'triage',
  'symptom',
  'weightKg',
])
const TRIAGE_FIELDS = new Set(['triage'])
const CALL_FIELDS = new Set(['vetEmployeeId'])
const FINISH_FIELDS = new Set(['diagnosis', 'note', 'weightKg'])
const ABANDON_FIELDS = new Set(['status'])
const LINK_FIELDS = new Set(['petId'])
const ADD_SERVICE_FIELDS = new Set(['serviceItemId', 'quantity', 'unitPrice', 'note'])
const ADD_DRUG_FIELDS = new Set(['drugId', 'quantity', 'unitPrice', 'dosage'])
const NEXT_APPOINTMENT_FIELDS = new Set(['bookedOn', 'slot'])

const toDate = (d: Date) => d.toISOString().slice(0, 10)
const num = (v: bigint | null) => (v === null ? null : Number(v))

/** น้ำหนักและเงินออกเป็น **ข้อความ** เสมอ — ดู `///` ที่ `drug.routes.ts` */
const toWire = (row: Visit) => ({
  id: Number(row.id),
  queueNumber: row.queueNumber,
  queueDate: toDate(row.queueDate),
  triage: row.triage,
  status: row.status,
  ownerId: num(row.ownerId),
  petId: num(row.petId),
  walkInPetName: row.walkInPetName,
  walkInOwnerName: row.walkInOwnerName,
  walkInOwnerPhone: row.walkInOwnerPhone,
  appointmentId: num(row.appointmentId),
  symptom: row.symptom,
  weightKg: row.weightKg === null ? null : row.weightKg.toString(),
  vetEmployeeId: num(row.vetEmployeeId),
  arrivedAt: row.arrivedAt.toISOString(),
  calledAt: row.calledAt === null ? null : row.calledAt.toISOString(),
  doneAt: row.doneAt === null ? null : row.doneAt.toISOString(),
  diagnosis: row.diagnosis,
  note: row.note,
})

/** รูปเดียวกับ `toWire` ใน `appointment.routes.ts` — คนละไฟล์ ไม่ import ข้าม route */
const appointmentToWire = (row: Appointment) => ({
  id: Number(row.id),
  bookedOn: toDate(row.bookedOn),
  slot: row.slot,
  ownerId: Number(row.ownerId),
  petId: row.petId === null ? null : Number(row.petId),
  petNameText: row.petNameText,
  source: row.source,
  status: row.status,
})

/**
 * แถวบนจอคิว — พก**ชื่อ**สัตว์และเจ้าของมาด้วย ไม่ใช่แค่ id
 *
 * จอคิวต้องอ่านออกโดยไม่ต้องยิงถามทีละแถว · คิว 30 แถวที่คืนแต่ id แปลว่าเบราว์เซอร์
 * ต้องยิงอีก 60 ครั้งเพื่อวาดหน้าจอเดียว
 */
const toQueueWire = (row: QueueRow) => ({
  ...toWire(row),
  pet: row.pet === null ? null : { id: Number(row.pet.id), code: row.pet.code, name: row.pet.name },
  owner:
    row.owner === null
      ? null
      : {
          id: Number(row.owner.id),
          code: row.owner.code,
          name: row.owner.name,
          phone: row.owner.phone,
        },
  /** ชื่อที่จะโชว์ — สัตว์ที่ผูกแล้วใช้ชื่อจริง ที่ยังไม่ผูกใช้ชื่อที่เขียนหน้างาน */
  displayName: row.pet?.name ?? row.walkInPetName ?? '—',
})

function parseCount(raw: string | undefined, field: string): number | undefined {
  if (raw === undefined) return undefined
  if (!/^\d+$/.test(raw)) throw invalid(`${field} ต้องเป็นตัวเลข`, { [field]: raw })

  return Number(raw)
}

const triageSchema = t.Union([
  t.Literal('EMERGENCY'),
  t.Literal('URGENT'),
  t.Literal('NORMAL'),
])

const optionalId = (v: number | null | undefined) =>
  v === null || v === undefined ? null : BigInt(v)

export const visitRoutes = new Elysia({ prefix: '/api/visits' })
  /**
   * **จอคิว** — เส้นที่เปิดค้างไว้ทั้งวัน
   *
   * ประกาศก่อน `/:id` ไม่งั้น `queue` จะถูกอ่านเป็น id
   */
  .get(
    '/queue',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, QUEUE_QUERY_KEYS)

      const rows = await listQueue({
        date: query.date,
        includeDone: query.includeDone === 'true',
      })

      return ok(rows.map(toQueueWire))
    },
    {
      beforeHandle: guardReceptionRead,
      query: t.Object({ date: t.Optional(t.String()), includeDone: t.Optional(t.String()) }),
      detail: { tags: ['คิว'], summary: 'คิวของวัน เรียงตามลำดับเรียก' },
    },
  )

  .get(
    '/',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, LIST_QUERY_KEYS)

      const result = await listVisits({
        petId: parseIdFilter(query.petId, 'petId'),
        ownerId: parseIdFilter(query.ownerId, 'ownerId'),
        status: query.status as VisitStatus | undefined,
        page: parseCount(query.page, 'page'),
        pageSize: parseCount(query.pageSize, 'pageSize'),
      })

      return paged(result.rows.map(toWire), {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      })
    },
    {
      beforeHandle: guardReceptionRead,
      query: t.Object({
        petId: t.Optional(t.String()),
        ownerId: t.Optional(t.String()),
        status: t.Optional(t.String()),
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
      }),
      detail: { tags: ['คิว'], summary: 'ประวัติการรักษา' },
    },
  )

  .get('/:id', async ({ params }) => ok(toWire(await findVisit(parseId(params.id)))), {
    beforeHandle: guardReceptionRead,
    detail: { tags: ['คิว'], summary: 'ดูคิวรายใบ' },
  })

  /** รายการยาและการรักษา พร้อมยอดรวม */
  .get(
    '/:id/bill',
    async ({ params }) => {
      const bill = await getVisitBill(parseId(params.id))

      return ok({
        services: bill.services.map((r) => ({
          id: Number(r.id),
          serviceItemId: Number(r.serviceItemId),
          name: r.nameSnapshot,
          quantity: r.quantity,
          unitPrice: r.unitPrice.toString(),
        })),
        drugs: bill.drugs.map((r) => ({
          id: Number(r.id),
          drugId: Number(r.drugId),
          name: r.nameSnapshot,
          unit: r.unitSnapshot,
          quantity: r.quantity.toString(),
          unitPrice: r.unitPrice.toString(),
          dosage: r.dosage,
        })),
        total: bill.total,
      })
    },
    { beforeHandle: guardReceptionRead, detail: { tags: ['คิว'], summary: 'รายการและยอดรวม' } },
  )

  /**
   * **ลงทะเบียนหน้างาน — จุดเดียวที่คิวเกิดขึ้น**
   *
   * ทั้งสามทาง (จองออนไลน์ · โทรจอง · เดินเข้ามา) จบที่เส้นนี้เหมือนกัน · ส่ง
   * `appointmentId` มาแล้วจะคัดลอกเจ้าของและสัตว์จากใบนั้นให้ และปิดใบเป็น `ARRIVED`
   * ในทรานแซกชันเดียวกัน
   *
   * **ไม่บังคับ `petId`** — เคสฉุกเฉินเปิดคิวก่อนแล้วผูกทีหลังด้วย `/:id/link`
   */
  .post(
    '/check-in',
    async ({ body, set, ...ctx }) => {
      const actor = await getActor(ctx)
      set.status = 201

      const row = await checkIn(
        {
          appointmentId: optionalId(body.appointmentId),
          ownerId: optionalId(body.ownerId),
          petId: optionalId(body.petId),
          walkInPetName: body.walkInPetName ?? null,
          walkInOwnerName: body.walkInOwnerName ?? null,
          walkInOwnerPhone: body.walkInOwnerPhone ?? null,
          triage: body.triage as TriageLevel | undefined,
          symptom: body.symptom ?? null,
          weightKg: body.weightKg ?? null,
        },
        actor.userId,
      )

      return ok(toWire(row))
    },
    {
      body: t.Object(
        {
          appointmentId: t.Optional(t.Union([t.Number(), t.Null()])),
          ownerId: t.Optional(t.Union([t.Number(), t.Null()])),
          petId: t.Optional(t.Union([t.Number(), t.Null()])),
          walkInPetName: t.Optional(t.Union([t.String(), t.Null()])),
          walkInOwnerName: t.Optional(t.Union([t.String(), t.Null()])),
          walkInOwnerPhone: t.Optional(t.Union([t.String(), t.Null()])),
          triage: t.Optional(triageSchema),
          symptom: t.Optional(t.Union([t.String(), t.Null()])),
          weightKg: t.Optional(t.Union([t.String(), t.Null()])),
        },
        { additionalProperties: false },
      ),
      transform: [guardReceptionWrite, refuseUnknownFields(CHECK_IN_FIELDS)],
      detail: { tags: ['คิว'], summary: 'ลงทะเบียนหน้างาน' },
    },
  )

  /** เปลี่ยนความเร่งด่วน — เคสที่ทรุดลงระหว่างรอ · เลขคิวไม่เปลี่ยน */
  .patch(
    '/:id/triage',
    async ({ params, body, ...ctx }) => {
      const actor = await getActor(ctx)

      return ok(toWire(await setTriage(parseId(params.id), body.triage, actor.userId)))
    },
    {
      body: t.Object({ triage: triageSchema }, { additionalProperties: false }),
      transform: [guardReceptionWrite, refuseUnknownFields(TRIAGE_FIELDS)],
      detail: { tags: ['คิว'], summary: 'เปลี่ยนระดับความเร่งด่วน' },
    },
  )

  .patch(
    '/:id/call',
    async ({ params, body, ...ctx }) => {
      const actor = await getActor(ctx)

      return ok(
        toWire(await callVisit(parseId(params.id), optionalId(body.vetEmployeeId), actor.userId)),
      )
    },
    {
      body: t.Object(
        { vetEmployeeId: t.Optional(t.Union([t.Number(), t.Null()])) },
        { additionalProperties: false },
      ),
      transform: [guardReceptionWrite, refuseUnknownFields(CALL_FIELDS)],
      detail: { tags: ['คิว'], summary: 'เรียกเข้าตรวจ' },
    },
  )

  /** ตรวจเสร็จ → รอชำระเงิน · **หมอจบแค่ตรงนี้ ไม่ใช่ `DONE`** */
  .patch(
    '/:id/finish',
    async ({ params, body, ...ctx }) => {
      const actor = await getActor(ctx)

      return ok(
        toWire(
          await finishExam(
            parseId(params.id),
            {
              diagnosis: body.diagnosis ?? null,
              note: body.note ?? null,
              weightKg: body.weightKg ?? null,
            },
            actor.userId,
          ),
        ),
      )
    },
    {
      body: t.Object(
        {
          diagnosis: t.Optional(t.Union([t.String(), t.Null()])),
          note: t.Optional(t.Union([t.String(), t.Null()])),
          weightKg: t.Optional(t.Union([t.String(), t.Null()])),
        },
        { additionalProperties: false },
      ),
      transform: [guardMedicalWrite, refuseUnknownFields(FINISH_FIELDS)],
      detail: { tags: ['คิว'], summary: 'ปิดการตรวจ (หมอเท่านั้น)' },
    },
  )

  .patch(
    '/:id/close',
    async ({ params, ...ctx }) => {
      const actor = await getActor(ctx)

      return ok(toWire(await closeVisit(parseId(params.id), actor.userId)))
    },
    { transform: guardReceptionWrite, detail: { tags: ['คิว'], summary: 'ปิดคิว (ชำระเงินแล้ว)' } },
  )

  /** ลูกค้ากลับก่อน หรือยกเลิก — **ไม่ลบแถว** เวลาที่รอคือข้อมูลที่ต้องเห็น */
  .patch(
    '/:id/abandon',
    async ({ params, body, ...ctx }) => {
      const actor = await getActor(ctx)

      return ok(toWire(await abandonVisit(parseId(params.id), body.status, actor.userId)))
    },
    {
      body: t.Object(
        { status: t.Union([t.Literal('LEFT'), t.Literal('CANCELLED')]) },
        { additionalProperties: false },
      ),
      transform: [guardReceptionWrite, refuseUnknownFields(ABANDON_FIELDS)],
      detail: { tags: ['คิว'], summary: 'ลูกค้ากลับก่อนหรือยกเลิกคิว' },
    },
  )

  /**
   * **ผูกคิวเข้ากับสัตว์ที่รู้ทีหลัง** — เคสฉุกเฉิน
   *
   * (ผู้ใช้กำหนด 2026-09-01) · ประวัติที่บันทึกไปแล้วอยู่ที่แถวเดิม ไม่ต้องย้าย
   * เพราะรายการยาชี้ `visit.id` ไม่ใช่ `pet.id`
   */
  .patch(
    '/:id/link',
    async ({ params, body, ...ctx }) => {
      const actor = await getActor(ctx)

      return ok(
        toWire(await linkVisit(parseId(params.id), { petId: BigInt(body.petId) }, actor.userId)),
      )
    },
    {
      body: t.Object({ petId: t.Number() }, { additionalProperties: false }),
      transform: [guardReceptionWrite, refuseUnknownFields(LINK_FIELDS)],
      detail: { tags: ['คิว'], summary: 'ผูกคิวกับสัตว์ที่รู้ทีหลัง' },
    },
  )

  /**
   * หมอนัดครั้งถัดไป — **`medical:write` ไม่ใช่ `reception:write`**
   *
   * เป็นส่วนหนึ่งของแผนการรักษา ไม่ใช่การจัดคิวทั่วไป (ผู้ใช้ตัดสิน 2026-09-08) ·
   * owner/pet มาจากคิวเองเสมอ ไม่รับจาก body — ดู `///` บน `bookNextVisitAppointment`
   */
  .post(
    '/:id/next-appointment',
    async ({ params, body, set, ...ctx }) => {
      const actor = await getActor(ctx)
      set.status = 201

      const created = await bookNextVisitAppointment(
        { visitId: parseId(params.id), bookedOn: body.bookedOn, slot: body.slot },
        actor.userId,
      )

      return ok(appointmentToWire(created))
    },
    {
      body: t.Object(
        { bookedOn: t.String(), slot: t.Union(APPOINTMENT_SLOTS.map((s) => t.Literal(s))) },
        { additionalProperties: false },
      ),
      transform: [guardMedicalWrite, refuseUnknownFields(NEXT_APPOINTMENT_FIELDS)],
      detail: { tags: ['คิว'], summary: 'นัดครั้งถัดไป (หมอเท่านั้น)' },
    },
  )

  // ---- รายการในคิว ----

  .post(
    '/:id/services',
    async ({ params, body, set, ...ctx }) => {
      const actor = await getActor(ctx)
      set.status = 201

      const row = await addVisitService(
        {
          visitId: parseId(params.id),
          serviceItemId: BigInt(body.serviceItemId),
          quantity: body.quantity,
          unitPrice: body.unitPrice ?? null,
          note: body.note ?? null,
        },
        actor.userId,
      )

      return ok({
        id: Number(row.id),
        serviceItemId: Number(row.serviceItemId),
        name: row.nameSnapshot,
        quantity: row.quantity,
        unitPrice: row.unitPrice.toString(),
      })
    },
    {
      body: t.Object(
        {
          serviceItemId: t.Number(),
          quantity: t.Optional(t.Number()),
          unitPrice: t.Optional(t.Union([t.String(), t.Null()])),
          note: t.Optional(t.Union([t.String(), t.Null()])),
        },
        { additionalProperties: false },
      ),
      transform: [guardMedicalWrite, refuseUnknownFields(ADD_SERVICE_FIELDS)],
      detail: { tags: ['คิว'], summary: 'เพิ่มรายการรักษา (หมอเท่านั้น)' },
    },
  )

  .delete(
    '/services/:itemId',
    async ({ params, ...ctx }) => {
      const actor = await getActor(ctx)
      await removeVisitService(parseId(params.itemId), actor.userId)

      return ok(null)
    },
    { transform: guardMedicalWrite, detail: { tags: ['คิว'], summary: 'เอารายการรักษาออก' } },
  )

  .post(
    '/:id/drugs',
    async ({ params, body, set, ...ctx }) => {
      const actor = await getActor(ctx)
      set.status = 201

      const row = await addVisitDrug(
        {
          visitId: parseId(params.id),
          drugId: BigInt(body.drugId),
          quantity: body.quantity,
          unitPrice: body.unitPrice ?? null,
          dosage: body.dosage ?? null,
        },
        actor.userId,
      )

      return ok({
        id: Number(row.id),
        drugId: Number(row.drugId),
        name: row.nameSnapshot,
        unit: row.unitSnapshot,
        quantity: row.quantity.toString(),
        unitPrice: row.unitPrice.toString(),
        dosage: row.dosage,
      })
    },
    {
      body: t.Object(
        {
          drugId: t.Number(),
          /** จำนวนเป็น **ข้อความ** — ยาน้ำจ่ายเป็น 2.5 มล. ได้ */
          quantity: t.String(),
          unitPrice: t.Optional(t.Union([t.String(), t.Null()])),
          dosage: t.Optional(t.Union([t.String(), t.Null()])),
        },
        { additionalProperties: false },
      ),
      transform: [guardMedicalWrite, refuseUnknownFields(ADD_DRUG_FIELDS)],
      detail: { tags: ['คิว'], summary: 'เพิ่มยา (หมอเท่านั้น)' },
    },
  )

  .delete(
    '/drugs/:itemId',
    async ({ params, ...ctx }) => {
      const actor = await getActor(ctx)
      await removeVisitDrug(parseId(params.itemId), actor.userId)

      return ok(null)
    },
    { transform: guardMedicalWrite, detail: { tags: ['คิว'], summary: 'เอายาออก' } },
  )

export { VISIT_PAGE_SIZE }
