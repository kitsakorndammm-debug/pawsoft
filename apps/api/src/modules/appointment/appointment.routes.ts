import {
  Elysia,
  t } from 'elysia'

import { invalid, notFound } from '../../kit/app-error.ts'
import { ok,
  paged } from '../../kit/response.ts'
import {
  getOwnerActor,
  ownerRowOf,
  requireOwnAppointment,
  requireOwnerRow,
  requireOwnPet,
} from '../../kit/owner-actor.ts'
import {
  getActor,
  guardReceptionRead,
  guardReceptionWrite,
  parseId,
  parseIdFilter,
  refuseUnknownFields,
  refuseUnknownQuery,
} from '../../kit/route-guard.ts'
import {
  APPOINTMENT_PAGE_SIZE,
  APPOINTMENT_SLOTS,
  MAX_BOOKED_PER_SLOT,
  cancelAppointment,
  confirmAppointment,
  createAppointment,
  deleteAppointment,
  findAppointment,
  listAppointmentDailyCounts,
  listAppointments,
  markNoShow,
  todayDate,
} from './appointment.service.ts'
import {
  clearPetPhoto,
  createPet,
  deletePet,
  findPet,
  lookupPets,
  setPetPhoto,
  updatePet,
} from '../pet/pet.service.ts'
import { resolvePhotoPath } from '../pet/pet.storage.ts'
import { selfRegisterOwner } from '../owner/owner.service.ts'
import { listSpeciesRows } from '../species/species.service.ts'
import { lookupBreeds } from '../breed/breed.service.ts'
import { findMyVisit, listMyVisits } from '../visit/visit.service.ts'
import { getVisitBill } from '../visit/visit-item.service.ts'
import { SYSTEM_USER_ID } from '../../kit/actor.ts'
import type { AppointmentRow } from './appointment.service.ts'
import type {
  Appointment,
  AppointmentSlot,
  AppointmentStatus,
} from '../../../prisma/generated/client.ts'

/**
 * การจอง — **มีสองฝั่งที่เขียนได้ และนี่คือ endpoint เดียวในระบบที่เป็นแบบนั้น**
 *
 *   `/api/appointments`      พนักงาน — รับโทรศัพท์แล้วจองให้ (ทาง 2)
 *   `/api/my/appointments`   ลูกค้า — ล็อกอิน Google แล้วจองเอง (ทาง 1)
 *
 * สองฝั่งเรียก service ตัวเดียวกัน ต่างกันแค่ `Booker` ที่ส่งเข้าไป · กฎว่าใครจองอะไร
 * ได้บ้างอยู่ที่ service ไม่ใช่ที่นี่
 *
 * **ฝั่งลูกค้าไม่มี permission key** — เขาเห็นเฉพาะของตัวเอง ซึ่งบังคับด้วยการกรอง
 * ด้วย `ownerId` จากเซสชัน ไม่ใช่ด้วย key · ดู `kit/owner-actor.ts`
 */

const LIST_QUERY_KEYS = new Set(['bookedOn', 'slot', 'status', 'ownerId', 'page', 'pageSize'])
const DAILY_COUNTS_QUERY_KEYS = new Set(['from', 'to'])
const MY_LIST_QUERY_KEYS = new Set(['status', 'page', 'pageSize'])

const CREATE_FIELDS = new Set(['bookedOn', 'slot', 'ownerId', 'petId', 'petNameText', 'reason'])
const MY_CREATE_FIELDS = new Set(['bookedOn', 'slot', 'petId', 'petNameText', 'reason'])
const SELF_REGISTER_FIELDS = new Set(['name', 'phone'])
const MY_PET_FIELDS = new Set(['name', 'speciesId', 'breedId', 'sex', 'bornOn', 'note'])
/** แก้ไขไม่มี `sex` — เพศเปลี่ยนไม่ได้หลังลงทะเบียน และหมอเป็นคนยืนยันตอนตรวจ */
const MY_PET_EDIT_FIELDS = new Set(['name', 'speciesId', 'breedId', 'bornOn', 'note'])
/** ประวัติการรักษาไม่มีตัวกรองสถานะ — บริการกรองให้แล้วว่าเอาเฉพาะที่ตรวจจบ */
const MY_PAGE_QUERY_KEYS = new Set(['page', 'pageSize'])
const CANCEL_FIELDS = new Set(['reason'])

const toDate = (d: Date) => d.toISOString().slice(0, 10)

const toWire = (row: Appointment) => ({
  id: Number(row.id),
  bookedOn: toDate(row.bookedOn),
  slot: row.slot,
  ownerId: Number(row.ownerId),
  petId: row.petId === null ? null : Number(row.petId),
  petNameText: row.petNameText,
  source: row.source,
  status: row.status,
  reason: row.reason,
  cancelReason: row.cancelReason,
})

/**
 * รูปที่ตารางจองใช้ — มี**ชื่อ** ไม่ใช่แค่ id
 *
 * `displayName` คำนวณที่นี่ที่เดียว: สัตว์ที่ลงทะเบียนแล้วใช้ชื่อจริง · ที่ยังไม่มี
 * ในทะเบียนใช้ชื่อที่ลูกค้าบอกมา · ให้หน้าจอเลือกเองแปลว่าทุกหน้าจะเลือกไม่เหมือนกัน
 */
const toRowWire = (row: AppointmentRow) => ({
  ...toWire(row),
  pet: row.pet === null ? null : { id: Number(row.pet.id), name: row.pet.name },
  owner: {
    id: Number(row.owner.id),
    code: row.owner.code,
    name: row.owner.name,
    phone: row.owner.phone,
  },
  displayName: row.pet?.name ?? row.petNameText ?? '—',
})

function parseCount(raw: string | undefined, field: string): number | undefined {
  if (raw === undefined) return undefined
  if (!/^\d+$/.test(raw)) throw invalid(`${field} ต้องเป็นตัวเลข`, { [field]: raw })

  return Number(raw)
}

const slotSchema = t.Union(APPOINTMENT_SLOTS.map((s) => t.Literal(s)))

const createSchema = t.Object(
  {
    bookedOn: t.String(),
    slot: slotSchema,
    ownerId: t.Number(),
    petId: t.Optional(t.Union([t.Number(), t.Null()])),
    petNameText: t.Optional(t.Union([t.String(), t.Null()])),
    reason: t.Optional(t.Union([t.String(), t.Null()])),
  },
  { additionalProperties: false },
)

/** ฝั่งลูกค้าไม่ส่ง `ownerId` — มันมาจากเซสชัน ไม่ใช่จาก body */
const myCreateSchema = t.Object(
  {
    bookedOn: t.String(),
    slot: slotSchema,
    petId: t.Optional(t.Union([t.Number(), t.Null()])),
    petNameText: t.Optional(t.Union([t.String(), t.Null()])),
    reason: t.Optional(t.Union([t.String(), t.Null()])),
  },
  { additionalProperties: false },
)

const optionalId = (v: number | null | undefined) =>
  v === null || v === undefined ? null : BigInt(v)

export const appointmentRoutes = new Elysia({ prefix: '/api/appointments' })
  .get(
    '/',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, LIST_QUERY_KEYS)

      const result = await listAppointments({
        bookedOn: query.bookedOn,
        slot: query.slot as AppointmentSlot | undefined,
        status: query.status as AppointmentStatus | undefined,
        ownerId: parseIdFilter(query.ownerId, 'ownerId'),
        page: parseCount(query.page, 'page'),
        pageSize: parseCount(query.pageSize, 'pageSize'),
      })

      return paged(result.rows.map(toRowWire), {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      })
    },
    {
      beforeHandle: guardReceptionRead,
      query: t.Object({
        bookedOn: t.Optional(t.String()),
        slot: t.Optional(t.String()),
        status: t.Optional(t.String()),
        ownerId: t.Optional(t.String()),
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
      }),
      detail: { tags: ['การจอง'], summary: 'ดูรายการจอง' },
    },
  )

  /** ช่วงเวลาที่จองได้ — หน้าจอวาดปุ่มจากลิสต์นี้ ไม่ใช่จากค่าที่ hardcode ไว้เอง */
  .get('/slots', () => ok({ slots: APPOINTMENT_SLOTS, today: toDate(todayDate()) }), {
    beforeHandle: guardReceptionRead,
    detail: { tags: ['การจอง'], summary: 'ช่วงเวลาที่จองได้' },
  })

  /**
   * จำนวนใบจองต่อวันในช่วง — ให้มุมมองสัปดาห์/เดือน/ปีของตารางจอง
   *
   * **ประกาศก่อน `/:id`** — ไม่งั้น `/daily-counts` จะโดนจับเป็นค่า `:id` แทน
   *
   * `capacityPerDay` มาจาก BE ตัวเดียว ไม่ hardcode ซ้ำที่หน้าเว็บ — วันหนึ่งถ้าเพดาน
   * เปลี่ยนจะได้เปลี่ยนที่เดียว หน้าจอไม่ต้องรู้ว่าคำนวณมาจาก 8 คิว/ช่วง คูณ 4 ช่วง
   */
  .get(
    '/daily-counts',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, DAILY_COUNTS_QUERY_KEYS)

      const rows = await listAppointmentDailyCounts({ from: query.from, to: query.to })

      return ok({
        capacityPerDay: MAX_BOOKED_PER_SLOT * APPOINTMENT_SLOTS.length,
        days: rows.map((r) => ({ bookedOn: toDate(r.bookedOn), count: r.count })),
      })
    },
    {
      beforeHandle: guardReceptionRead,
      query: t.Object({ from: t.String(), to: t.String() }),
      detail: { tags: ['การจอง'], summary: 'จำนวนใบจองต่อวันในช่วง — สำหรับมุมมองสัปดาห์/เดือน/ปี' },
    },
  )

  .get('/:id', async ({ params }) => ok(toWire(await findAppointment(parseId(params.id)))), {
    beforeHandle: guardReceptionRead,
    detail: { tags: ['การจอง'], summary: 'ดูใบจองรายใบ' },
  })

  .post(
    '/',
    async ({ body, set, ...ctx }) => {
      const actor = await getActor(ctx)
      set.status = 201

      const row = await createAppointment(
        {
          bookedOn: body.bookedOn,
          slot: body.slot,
          ownerId: BigInt(body.ownerId),
          petId: optionalId(body.petId),
          petNameText: body.petNameText ?? null,
          reason: body.reason ?? null,
        },
        { kind: 'staff', userId: actor.userId },
      )

      return ok(toWire(row))
    },
    {
      body: createSchema,
      transform: [guardReceptionWrite, refuseUnknownFields(CREATE_FIELDS)],
      detail: { tags: ['การจอง'], summary: 'พนักงานจองให้ลูกค้า' },
    },
  )

  .patch(
    '/:id/cancel',
    async ({ params, body, ...ctx }) => {
      const actor = await getActor(ctx)

      return ok(toWire(await cancelAppointment(parseId(params.id), body.reason, actor.userId)))
    },
    {
      body: t.Object({ reason: t.String() }, { additionalProperties: false }),
      transform: [guardReceptionWrite, refuseUnknownFields(CANCEL_FIELDS)],
      detail: { tags: ['การจอง'], summary: 'ยกเลิกใบจอง' },
    },
  )

  /**
   * **พนักงานยืนยันใบที่ลูกค้าจองออนไลน์** — `PENDING` → `BOOKED`
   *
   * (ผู้ใช้กำหนด 2026-09-01: "พนักงานจะเป็นคนคอนเฟิร์มคิวเอง")
   *
   * `reception:write` เหมือนการจองอื่น ๆ — คนที่รับสายได้ก็ยืนยันได้
   */
  .patch(
    '/:id/confirm',
    async ({ params, ...ctx }) => {
      const actor = await getActor(ctx)

      return ok(toWire(await confirmAppointment(parseId(params.id), actor.userId)))
    },
    {
      transform: guardReceptionWrite,
      detail: { tags: ['การจอง'], summary: 'ยืนยันใบจองที่ลูกค้าจองออนไลน์' },
    },
  )

  /** ถึงเวลาแล้วไม่มา — **พนักงานกดเอง ไม่มีงานเบื้องหลังตั้งให้** ดู `///` ที่ service */
  .patch(
    '/:id/no-show',
    async ({ params, ...ctx }) => {
      const actor = await getActor(ctx)

      return ok(toWire(await markNoShow(parseId(params.id), actor.userId)))
    },
    { transform: guardReceptionWrite, detail: { tags: ['การจอง'], summary: 'บันทึกว่าไม่มาตามนัด' } },
  )

  .delete(
    '/:id',
    async ({ params, ...ctx }) => {
      const actor = await getActor(ctx)
      await deleteAppointment(parseId(params.id), actor.userId)

      return ok(null)
    },
    { transform: guardReceptionWrite, detail: { tags: ['การจอง'], summary: 'ลบใบจอง' } },
  )

/**
 * ฝั่งลูกค้า — **ทุกเส้นกรองด้วย `ownerId` จากเซสชัน ไม่ใช่จากที่ส่งมา**
 *
 * นี่คือกฎที่กันข้อมูลรั่วข้ามบัญชีทั้งก้อน · รับ `ownerId` จาก body เมื่อไหร่ ลูกค้า
 * คนหนึ่งจะอ่านและจองแทนคนอื่นได้ทันทีด้วยการเดาเลข
 */
export const myAppointmentRoutes = new Elysia({ prefix: '/api/my/appointments' })
  .get(
    '/',
    async (ctx) => {
      const { query, request } = ctx
      refuseUnknownQuery(request.url, MY_LIST_QUERY_KEYS)

      const actor = await getOwnerActor(ctx)
      const owner = await requireOwnerRow(actor.accountId)

      const result = await listAppointments({
        ownerId: owner.id,
        status: query.status as AppointmentStatus | undefined,
        page: parseCount(query.page, 'page'),
        pageSize: parseCount(query.pageSize, 'pageSize'),
      })

      return paged(result.rows.map(toRowWire), {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      })
    },
    {
      query: t.Object({
        status: t.Optional(t.String()),
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
      }),
      detail: { tags: ['ลูกค้า'], summary: 'ใบจองของฉัน' },
    },
  )

  .post(
    '/',
    async ({ body, set, ...ctx }) => {
      const actor = await getOwnerActor(ctx)
      const owner = await requireOwnerRow(actor.accountId)

      const petId = optionalId(body.petId)
      // สัตว์ที่ส่งมาต้องเป็นของเขาจริง — ไม่งั้นจองแทนสัตว์ของคนอื่นได้
      if (petId !== null) await requireOwnPet(owner.id, petId)

      set.status = 201

      const row = await createAppointment(
        {
          bookedOn: body.bookedOn,
          slot: body.slot,
          ownerId: owner.id,
          petId,
          petNameText: body.petNameText ?? null,
          reason: body.reason ?? null,
          /**
           * **`PENDING` ไม่ใช่ `BOOKED`** (ผู้ใช้กำหนด 2026-09-01)
           *
           * ใบที่ลูกค้ากดเองยังไม่ใช่คำสัญญาของคลินิก · พนักงานต้องโทรคุยรายละเอียด
           * แล้วกดยืนยันเอง · ปล่อยเป็น `BOOKED` แปลว่าคิวถูกจัดโดยคนที่ไม่รู้ว่า
           * วันนั้นคลินิกรับไหวแค่ไหน
           */
          status: 'PENDING',
        },
        { kind: 'owner', accountId: actor.accountId },
      )

      return ok(toWire(row))
    },
    {
      body: myCreateSchema,
      transform: refuseUnknownFields(MY_CREATE_FIELDS),
      detail: { tags: ['ลูกค้า'], summary: 'ลูกค้าจองเอง' },
    },
  )

  /** ลูกค้ายกเลิกใบของตัวเอง — `actorId` เป็น `null` เพราะไม่ใช่พนักงานที่ทำ */
  .patch(
    '/:id/cancel',
    async ({ params, body, ...ctx }) => {
      const actor = await getOwnerActor(ctx)
      const owner = await requireOwnerRow(actor.accountId)
      const id = parseId(params.id)

      await requireOwnAppointment(owner.id, id)

      return ok(toWire(await cancelAppointment(id, body.reason, null)))
    },
    {
      body: t.Object({ reason: t.String() }, { additionalProperties: false }),
      transform: refuseUnknownFields(CANCEL_FIELDS),
      detail: { tags: ['ลูกค้า'], summary: 'ลูกค้ายกเลิกใบจองของตัวเอง' },
    },
  )

export { APPOINTMENT_PAGE_SIZE }

/**
 * ข้อมูลของฉัน — **ฝั่งลูกค้าอ่านของตัวเองเท่านั้น**
 *
 * แยก prefix จาก `/api/my/appointments` เพราะเป็นคนละเรื่อง: อันนั้นคือการจอง
 * อันนี้คือตัวตนกับสัตว์ · รวมไว้ prefix เดียวจะได้ path อย่าง
 * `/api/my/appointments/pets` ซึ่งอ่านแล้วเข้าใจผิด
 */
export const myProfileRoutes = new Elysia({ prefix: '/api/my' })
  /**
   * ตัวตนของฉันในระบบคลินิก — **`null` เมื่อยังไม่ถูกจับคู่**
   *
   * ไม่ใช่ 401 เพราะเขาล็อกอินสำเร็จแล้วจริง ๆ · สิ่งที่ยังไม่มีคือแถวใน `owner`
   * ที่พนักงานต้องเป็นคนเชื่อมให้ · หน้าเว็บต้องแยกสองอย่างนี้ออกเพื่อบอกให้ถูกว่า
   * ต้องทำอะไรต่อ — "ล็อกอินใหม่" กับ "ติดต่อคลินิก" เป็นคนละคำแนะนำ
   */
  .get(
    '/profile',
    async (ctx) => {
      const actor = await getOwnerActor(ctx)
      const owner = await ownerRowOf(actor.accountId)

      return ok({
        accountId: Number(actor.accountId),
        email: actor.email,
        displayName: actor.displayName,
        owner:
          owner === null
            ? null
            : { id: Number(owner.id), code: owner.code, name: owner.name },
      })
    },
    { detail: { tags: ['ลูกค้า'], summary: 'ตัวตนของฉัน' } },
  )

  /**
   * สัตว์ของฉัน — **กรองด้วย `ownerId` จากเซสชัน ไม่ใช่จาก query**
   *
   * รับ `ownerId` จากภายนอกเมื่อไหร่ ลูกค้าคนหนึ่งจะอ่านสัตว์ของคนอื่นได้ด้วยการ
   * เดาเลข · ที่นี่ไม่มีพารามิเตอร์ให้ส่งตั้งแต่ต้น
   */
  .get(
    '/pets',
    async (ctx) => {
      const actor = await getOwnerActor(ctx)
      const owner = await requireOwnerRow(actor.accountId)
      const rows = await lookupPets(owner.id)

      return ok(
        rows.map((r) => ({
          id: Number(r.id),
          code: r.code,
          name: r.name,
          ownerId: Number(r.ownerId),
          speciesId: Number(r.speciesId),
        })),
      )
    },
    { detail: { tags: ['ลูกค้า'], summary: 'สัตว์ของฉัน' } },
  )

  /**
   * ช่วงเวลาที่จองได้ + วันนี้ — **เส้นของลูกค้า**
   *
   * `/api/appointments/slots` การ์ดด้วย `reception:read` ซึ่งเป็นสิทธิ์ของ**พนักงาน** ·
   * หน้าจองของลูกค้าเรียกเส้นนั้นแล้วได้ 401 เงียบ ๆ · ผลคือ `today` ว่างตลอด
   * ช่องวันที่จึงไม่เคยตั้งค่าเริ่มต้น และปุ่มจองกดไม่ได้จนกว่าจะเลือกวันเอง
   * (เจอตอนวัดจากจอจริง 2026-09-01 — typecheck กับ build ไม่เห็นเลย)
   *
   * **`today` ต้องมาจาก BE ไม่ใช่ `new Date()` ในเบราว์เซอร์** · เครื่องที่ตั้งเวลาผิด
   * หรือคนที่เปิดจากต่างประเทศจะเห็นคนละวันกับที่คลินิกกำลังทำงานอยู่
   */
  .get(
    '/slots',
    async (ctx) => {
      await getOwnerActor(ctx)

      return ok({ slots: APPOINTMENT_SLOTS, today: toDate(todayDate()) })
    },
    { detail: { tags: ['ลูกค้า'], summary: 'ช่วงเวลาที่จองได้' } },
  )

  /**
   * **สมัครเอง — สร้างแถว `owner` ให้บัญชีที่ยังไม่มีตัวตนในระบบ**
   *
   * (ผู้ใช้ทักท้วง 2026-09-01: "ไม่ใช่ลูกค้าทุกคนที่จะเคยมาคลินิกนะ ให้เป็น optional")
   *
   * ก่อนหน้านี้ทางเดียวที่จะมีตัวตนคือพนักงานสร้างให้ · แปลว่าคนที่ยังไม่เคยมาคลินิก
   * ล็อกอินเข้ามาแล้วทำอะไรไม่ได้เลย ซึ่งปิดประตูใส่ลูกค้าใหม่ทั้งหมด
   *
   * **เรียกซ้ำได้ ไม่พัง** — คืนแถวเดิมถ้ามีอยู่แล้ว · หน้าเว็บที่ผู้ใช้กดสองครั้ง
   * เพราะเน็ตช้าไม่ควรได้ error
   *
   * **เบอร์ตรงกับลูกค้าเดิม = เชื่อมประวัติให้เลย** (ผู้ใช้กำหนด 2026-09-01) ·
   * ไม่ได้สร้างแถวใหม่ · ดู `selfRegisterOwner`
   */
  .post(
    '/profile',
    async ({ body, set, ...ctx }) => {
      const actor = await getOwnerActor(ctx)

      const owner = await selfRegisterOwner(
        { name: body.name, phone: body.phone },
        actor.accountId,
      )

      set.status = 201

      return ok({
        id: Number(owner.id),
        code: owner.code,
        name: owner.name,
        phone: owner.phone,
      })
    },
    {
      body: t.Object(
        {
          name: t.String(),
          /** **บังคับ** — เบอร์คือตัวระบุตัวตนของลูกค้า และเป็นทางเดียวที่คลินิกโทรยืนยันคิวได้ */
          phone: t.String(),
        },
        { additionalProperties: false },
      ),
      transform: refuseUnknownFields(SELF_REGISTER_FIELDS),
      detail: { tags: ['ลูกค้า'], summary: 'ลูกค้าสมัครเอง' },
    },
  )

  /**
   * ชนิดสัตว์ — **`guardSignedIn` ใช้ไม่ได้ที่นี่**
   *
   * เส้น `/api/species/lookup` การ์ดด้วย `guardSignedIn` ซึ่งอ่าน cookie ของ**พนักงาน**
   * ลูกค้าที่ล็อกอิน Google ถือคนละ cookie จึงโดนปฏิเสธ · ต้องมีเส้นของตัวเอง
   *
   * ข้อมูลชุดนี้ไม่ใช่ความลับ (หมา · แมว · กระต่าย) — ที่กันไว้คือกันคนนอกยิงถามเฉย ๆ
   */
  .get(
    '/species',
    async (ctx) => {
      await getOwnerActor(ctx)
      const rows = await listSpeciesRows()

      return ok(rows.map((r) => ({ id: Number(r.id), name: r.name })))
    },
    { detail: { tags: ['ลูกค้า'], summary: 'ชนิดสัตว์' } },
  )

  /** พันธุ์ของชนิดที่เลือก — เหตุผลเดียวกับ `/species` */
  .get(
    '/breeds',
    async (ctx) => {
      await getOwnerActor(ctx)
      const speciesId = ctx.query.speciesId
      const rows = await lookupBreeds(
        speciesId !== undefined && speciesId !== '' ? parseId(speciesId) : undefined,
      )

      return ok(
        rows.map((r) => ({ id: Number(r.id), name: r.name, speciesId: Number(r.speciesId) })),
      )
    },
    {
      query: t.Object({ speciesId: t.Optional(t.String()) }),
      detail: { tags: ['ลูกค้า'], summary: 'พันธุ์สัตว์' },
    },
  )

  /**
   * **ลูกค้าสร้างสัตว์ของตัวเอง**
   *
   * (ผู้ใช้กำหนด 2026-09-01: "1. สร้างสัตว์")
   *
   * **`ownerId` มาจากเซสชัน ไม่ใช่จาก body** · รับจาก body เมื่อไหร่ ลูกค้าจะสร้างสัตว์
   * ใส่บัญชีคนอื่นได้ · `createdBy` เป็น `SYSTEM_USER_ID` เพราะไม่มีพนักงานอยู่ในเหตุการณ์
   *
   * ให้กรอกน้อยที่สุดที่ฐานยอมรับ — ชื่อกับชนิด · ที่เหลือหมอกรอกตอนตรวจได้
   */
  .post(
    '/pets',
    async ({ body, set, ...ctx }) => {
      const actor = await getOwnerActor(ctx)
      const owner = await requireOwnerRow(actor.accountId)

      const created = await createPet(
        {
          ownerId: owner.id,
          name: body.name,
          speciesId: parseId(body.speciesId),
          breedId: body.breedId ? parseId(body.breedId) : null,
          sex: body.sex,
          bornOn: body.bornOn ?? null,
          note: body.note ?? null,
        },
        SYSTEM_USER_ID,
      )

      set.status = 201

      return ok({ id: Number(created.id), code: created.code, name: created.name })
    },
    {
      body: t.Object(
        {
          name: t.String(),
          speciesId: t.String(),
          breedId: t.Optional(t.Union([t.String(), t.Null()])),
          sex: t.Optional(
            t.Union([t.Literal('MALE'), t.Literal('FEMALE'), t.Literal('UNKNOWN')]),
          ),
          bornOn: t.Optional(t.Union([t.String(), t.Null()])),
          note: t.Optional(t.Union([t.String(), t.Null()])),
        },
        { additionalProperties: false },
      ),
      transform: refuseUnknownFields(MY_PET_FIELDS),
      detail: { tags: ['ลูกค้า'], summary: 'ลูกค้าเพิ่มสัตว์ของตัวเอง' },
    },
  )

  /**
   * **แก้ข้อมูลสัตว์ของตัวเอง**
   *
   * (ผู้ใช้ทักท้วง 2026-09-01: "หน้าสัตว์เลี้ยงของ owner ทำไมไม่มีปุ่มลบหรือแก้ไขหล่ะ")
   *
   * `requireOwnPet` ก่อนแตะข้อมูลเสมอ — ไม่ตรวจ ลูกค้าจะแก้สัตว์ของคนอื่นได้ด้วย
   * การเดาเลข
   *
   * **แก้ได้เท่าที่ตัวเองกรอกมา** — น้ำหนัก · ไมโครชิป · หมายเหตุแพ้ยา ไม่อยู่ในนี้
   * เพราะเป็นข้อมูลที่หมอบันทึกจากการตรวจ · ให้เจ้าของแก้เองแปลว่าบันทึกทางการแพทย์
   * ถูกทับด้วยความจำของคนที่ไม่ได้ตรวจ
   */
  .patch(
    '/pets/:id',
    async ({ params, body, ...ctx }) => {
      const actor = await getOwnerActor(ctx)
      const owner = await requireOwnerRow(actor.accountId)
      const id = parseId(params.id)

      await requireOwnPet(owner.id, id)

      const current = await findPet(id)

      const updated = await updatePet(
        id,
        {
          ownerId: owner.id,
          name: body.name,
          speciesId: parseId(body.speciesId),
          breedId: body.breedId ? parseId(body.breedId) : null,
          // ค่าที่หมอเป็นคนกรอก — ส่งของเดิมกลับไป ไม่ให้ลูกค้าเขียนทับ
          sex: current.sex,
          isNeutered: current.isNeutered,
          bornOn: body.bornOn ?? null,
          weightKg: current.weightKg === null ? null : current.weightKg.toFixed(2),
          color: current.color,
          microchip: current.microchip,
          allergyNote: current.allergyNote,
          note: body.note ?? null,
        },
        SYSTEM_USER_ID,
      )

      return ok({ id: Number(updated.id), code: updated.code, name: updated.name })
    },
    {
      body: t.Object(
        {
          name: t.String(),
          speciesId: t.String(),
          breedId: t.Optional(t.Union([t.String(), t.Null()])),
          bornOn: t.Optional(t.Union([t.String(), t.Null()])),
          note: t.Optional(t.Union([t.String(), t.Null()])),
        },
        { additionalProperties: false },
      ),
      transform: refuseUnknownFields(MY_PET_EDIT_FIELDS),
      detail: { tags: ['ลูกค้า'], summary: 'ลูกค้าแก้สัตว์ของตัวเอง' },
    },
  )

  /**
   * **ลบสัตว์ของตัวเอง** — soft delete
   *
   * `deletePet` ปฏิเสธเองถ้าสัตว์ตัวนั้นมีประวัติการรักษาแล้ว · นั่นถูกแล้ว: ลบสัตว์
   * ที่เคยรักษาแปลว่าประวัติกับใบเสร็จชี้ไปแถวที่หายไป · ข้อความบอกให้ใช้
   * "เสียชีวิต" แทน ซึ่งเป็นสิ่งที่เจ้าของตั้งใจจะทำจริง ๆ ในกรณีนั้น
   */
  .delete(
    '/pets/:id',
    async ({ params, ...ctx }) => {
      const actor = await getOwnerActor(ctx)
      const owner = await requireOwnerRow(actor.accountId)
      const id = parseId(params.id)

      await requireOwnPet(owner.id, id)
      await deletePet(id, SYSTEM_USER_ID)

      return ok(null)
    },
    { detail: { tags: ['ลูกค้า'], summary: 'ลูกค้าลบสัตว์ของตัวเอง' } },
  )

  /**
   * **อัปโหลดรูปสัตว์** (ผู้ใช้กำหนด 2026-09-01: "อยากให้มีการอัพโหลดรูปด้วย")
   *
   * **การ์ดอยู่ใน `transform` ไม่ใช่ `beforeHandle`** — `beforeHandle` ทำงาน**หลัง**
   * ตัว parse body · คำขอที่ไม่ได้ล็อกอินจะเขียนไฟล์ลงดิสก์เสร็จแล้วถึงจะโดนปฏิเสธ
   * (PMK วัดไว้ 2026-08-29 · เหตุผลเดียวกับเส้นแนบสลิป)
   */
  .post(
    '/pets/:id/photo',
    async (ctx) => {
      const actor = await getOwnerActor(ctx)
      const owner = await requireOwnerRow(actor.accountId)
      const id = parseId(ctx.params.id)

      await requireOwnPet(owner.id, id)

      const body = ctx.body as Record<string, unknown> | null
      const file = body?.['file']
      if (!(file instanceof File)) throw invalid('ต้องแนบไฟล์รูปมาด้วย', { field: 'file' })

      const bytes = new Uint8Array(await file.arrayBuffer())
      const updated = await setPetPhoto(id, { mimeType: file.type, bytes }, SYSTEM_USER_ID)

      return ok({ id: Number(updated.id), hasPhoto: updated.photoPath !== null })
    },
    {
      transform: async (ctx) => {
        await getOwnerActor(ctx as never)
      },
      detail: { tags: ['ลูกค้า'], summary: 'ลูกค้าอัปโหลดรูปสัตว์' },
    },
  )

  /** เอารูปออก */
  .delete(
    '/pets/:id/photo',
    async ({ params, ...ctx }) => {
      const actor = await getOwnerActor(ctx)
      const owner = await requireOwnerRow(actor.accountId)
      const id = parseId(params.id)

      await requireOwnPet(owner.id, id)
      await clearPetPhoto(id, SYSTEM_USER_ID)

      return ok(null)
    },
    { detail: { tags: ['ลูกค้า'], summary: 'ลูกค้าเอารูปสัตว์ออก' } },
  )

  /**
   * ไฟล์รูป — **ส่งไบต์ ไม่ใช่ path**
   *
   * path ที่หลุดออกไปแปลว่ามีคนเดาชื่อไฟล์อื่นได้ · เหตุผลเดียวกับเส้นดาวน์โหลดสลิป
   */
  .get(
    '/pets/:id/photo',
    async ({ params, set, ...ctx }) => {
      const actor = await getOwnerActor(ctx)
      const owner = await requireOwnerRow(actor.accountId)
      const id = parseId(params.id)

      await requireOwnPet(owner.id, id)

      const row = await findPet(id)
      if (row.photoPath === null) throw notFound('สัตว์ตัวนี้ยังไม่มีรูป')

      const abs = resolvePhotoPath(row.photoPath)
      if (abs === null) throw notFound('ไม่พบไฟล์')

      const ext = abs.slice(abs.lastIndexOf('.'))
      set.headers['content-type'] =
        ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'

      return Bun.file(abs)
    },
    { detail: { tags: ['ลูกค้า'], summary: 'รูปสัตว์ของฉัน' } },
  )

  /**
   * ประวัติการรักษาของฉัน
   *
   * (ผู้ใช้กำหนด 2026-09-01: "3. ดูประวัติรักษา")
   *
   * **เฉพาะครั้งที่ตรวจจบแล้ว** — ดู `listMyVisits` ว่าทำไมคิวที่ยังเดินอยู่ไม่โผล่
   */
  .get(
    '/visits',
    async (ctx) => {
      const { query, request } = ctx
      refuseUnknownQuery(request.url, MY_PAGE_QUERY_KEYS)

      const actor = await getOwnerActor(ctx)
      const owner = await requireOwnerRow(actor.accountId)

      const result = await listMyVisits(owner.id, {
        page: parseCount(query.page, 'page'),
        pageSize: parseCount(query.pageSize, 'pageSize'),
      })

      return paged(
        result.rows.map((r) => ({
          id: Number(r.id),
          queueDate: r.queueDate.toISOString().slice(0, 10),
          status: r.status,
          petId: r.petId === null ? null : Number(r.petId),
          petName: r.petName,
          symptom: r.symptom,
          diagnosis: r.diagnosis,
          vetName: r.vetName,
        })),
        { page: result.page, pageSize: result.pageSize, total: result.total },
      )
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
      }),
      detail: { tags: ['ลูกค้า'], summary: 'ประวัติการรักษาของฉัน' },
    },
  )

  /**
   * ประวัติการรักษาครั้งเดียว — พร้อมรายการรักษาและยาที่หมอบันทึกไว้
   *
   * (ผู้ใช้ขอ 2026-09-08: "กดเข้าไปดูได้ว่าวันที่เท่าไหร่ รักษาอะไรไปบ้าง")
   *
   * `findMyVisit` กรองความเป็นเจ้าของ + สถานะไปแล้ว (เหมือน `listMyVisits`) ·
   * `getVisitBill` ใช้ตัวเดียวกับที่เคาน์เตอร์เห็นตอนออกใบเสร็จ ไม่ใช่คำนวณเองอีกชุด
   */
  .get(
    '/visits/:id',
    async ({ params, ...ctx }) => {
      const actor = await getOwnerActor(ctx)
      const owner = await requireOwnerRow(actor.accountId)
      const id = parseId(params.id)

      const visit = await findMyVisit(owner.id, id)
      const bill = await getVisitBill(id)

      return ok({
        id: Number(visit.id),
        queueDate: visit.queueDate.toISOString().slice(0, 10),
        status: visit.status,
        petId: visit.petId === null ? null : Number(visit.petId),
        petName: visit.petName,
        symptom: visit.symptom,
        diagnosis: visit.diagnosis,
        vetName: visit.vetName,
        services: bill.services.map((r) => ({
          id: Number(r.id),
          name: r.nameSnapshot,
          quantity: r.quantity,
          unitPrice: r.unitPrice.toString(),
        })),
        drugs: bill.drugs.map((r) => ({
          id: Number(r.id),
          name: r.nameSnapshot,
          unit: r.unitSnapshot,
          quantity: r.quantity.toString(),
          unitPrice: r.unitPrice.toString(),
          dosage: r.dosage,
        })),
        total: bill.total,
      })
    },
    { detail: { tags: ['ลูกค้า'], summary: 'ประวัติการรักษาของฉันรายครั้ง' } },
  )
