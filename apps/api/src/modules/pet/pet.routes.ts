import { ok, paged } from '../../kit/response.ts'
import {
  Elysia,
  t } from 'elysia'

import { invalid } from '../../kit/app-error.ts'
import {
  getActor,
  guardReceptionRead,
  guardReceptionWrite,
  guardSignedIn,
  parseId,
  parseIdFilter,
  refuseUnknownFields,
  refuseUnknownQuery,
} from '../../kit/route-guard.ts'
import {
  createPet,
  deletePet,
  findPet,
  listPets,
  lookupPets,
  PET_PAGE_SIZE,
  setPetDeceased,
  updatePet,
  type PetInput,
} from './pet.service.ts'
import type { Pet, PetSex } from '../../../prisma/generated/client.ts'

/** สัตว์เลี้ยง — สิทธิ์ `clinic` เหมือนเจ้าของ ดู `owner.routes.ts` */

const LIST_QUERY_KEYS = new Set([
  'q',
  'ownerId',
  'speciesId',
  'includeDeceased',
  'page',
  'pageSize',
])
const LOOKUP_QUERY_KEYS = new Set(['ownerId'])

const WRITE_FIELDS = new Set([
  'ownerId',
  'name',
  'speciesId',
  'breedId',
  'sex',
  'isNeutered',
  'bornOn',
  'weightKg',
  'color',
  'microchip',
  'allergyNote',
  'note',
])

const DECEASED_FIELDS = new Set(['deceasedOn'])

/** วันที่ออกเป็น `YYYY-MM-DD` · น้ำหนักออกเป็น **ข้อความ** — ดู `drug.routes.ts` */
const toDate = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10))

const toWire = (row: Pet) => ({
  id: Number(row.id),
  code: row.code,
  ownerId: Number(row.ownerId),
  name: row.name,
  speciesId: Number(row.speciesId),
  breedId: row.breedId === null ? null : Number(row.breedId),
  sex: row.sex,
  isNeutered: row.isNeutered,
  bornOn: toDate(row.bornOn),
  weightKg: row.weightKg === null ? null : row.weightKg.toString(),
  color: row.color,
  microchip: row.microchip,
  allergyNote: row.allergyNote,
  note: row.note,
  deceasedOn: toDate(row.deceasedOn),
})

function parseCount(raw: string | undefined, field: string): number | undefined {
  if (raw === undefined) return undefined
  if (!/^\d+$/.test(raw)) throw invalid(`${field} ต้องเป็นตัวเลข`, { [field]: raw })

  return Number(raw)
}

const nullableText = t.Optional(t.Union([t.String(), t.Null()]))
const nullableId = t.Optional(t.Union([t.Number(), t.Null()]))

const writeSchema = t.Object(
  {
    ownerId: t.Number(),
    name: t.String(),
    speciesId: t.Number(),
    breedId: nullableId,
    sex: t.Optional(t.Union([t.Literal('MALE'), t.Literal('FEMALE'), t.Literal('UNKNOWN')])),
    /** `null` = ยังไม่ได้ถาม ต่างจาก `false` ที่ถามแล้ว — ดู `///` ในสคีมา */
    isNeutered: t.Optional(t.Union([t.Boolean(), t.Null()])),
    bornOn: nullableText,
    weightKg: nullableText,
    color: nullableText,
    microchip: nullableText,
    allergyNote: nullableText,
    note: nullableText,
  },
  { additionalProperties: false },
)

const toInput = (body: Record<string, unknown>): PetInput => ({
  ownerId: BigInt(body['ownerId'] as number),
  name: body['name'] as string,
  speciesId: BigInt(body['speciesId'] as number),
  breedId:
    body['breedId'] === null || body['breedId'] === undefined
      ? null
      : BigInt(body['breedId'] as number),
  sex: body['sex'] as PetSex | undefined,
  isNeutered: (body['isNeutered'] as boolean | null | undefined) ?? null,
  bornOn: (body['bornOn'] as string | null | undefined) ?? null,
  weightKg: (body['weightKg'] as string | null | undefined) ?? null,
  color: (body['color'] as string | null | undefined) ?? null,
  microchip: (body['microchip'] as string | null | undefined) ?? null,
  allergyNote: (body['allergyNote'] as string | null | undefined) ?? null,
  note: (body['note'] as string | null | undefined) ?? null,
})

export const petRoutes = new Elysia({ prefix: '/api/pets' })
  .get(
    '/',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, LIST_QUERY_KEYS)

      const result = await listPets({
        q: query.q,
        ownerId: parseIdFilter(query.ownerId, 'ownerId'),
        speciesId: parseIdFilter(query.speciesId, 'speciesId'),
        includeDeceased: query.includeDeceased === 'true',
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
        q: t.Optional(t.String()),
        ownerId: t.Optional(t.String()),
        speciesId: t.Optional(t.String()),
        includeDeceased: t.Optional(t.String()),
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
      }),
      detail: { tags: ['สัตว์เลี้ยง'], summary: 'ดูรายการสัตว์เลี้ยง' },
    },
  )

  /**
   * สัตว์สำหรับ combobox — **ของเจ้าของคนเดียว `ownerId` บังคับ**
   *
   * ช่องเลือกสัตว์เปิดหลังเลือกเจ้าของเสมอ · คืนสัตว์ทั้งคลินิกมาให้เลือกคือทางที่
   * พนักงานจะกดผิดตัว แล้วประวัติการรักษาไปอยู่กับสัตว์ของคนอื่น
   */
  .get(
    '/lookup',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, LOOKUP_QUERY_KEYS)

      const ownerId = parseIdFilter(query.ownerId, 'ownerId')
      if (ownerId === undefined) throw invalid('ต้องระบุ ownerId', { field: 'ownerId' })

      const rows = await lookupPets(ownerId)

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
    {
      beforeHandle: guardSignedIn,
      query: t.Object({ ownerId: t.Optional(t.String()) }),
      detail: { tags: ['สัตว์เลี้ยง'], summary: 'สัตว์ของเจ้าของคนหนึ่งสำหรับ combobox' },
    },
  )

  .get('/:id', async ({ params }) => ok(toWire(await findPet(parseId(params.id)))), {
    beforeHandle: guardReceptionRead,
    detail: { tags: ['สัตว์เลี้ยง'], summary: 'ดูสัตว์รายตัว' },
  })

  .post(
    '/',
    async ({ body, set, ...ctx }) => {
      const actor = await getActor(ctx)
      set.status = 201

      return ok(toWire(await createPet(toInput(body as Record<string, unknown>), actor.userId)))
    },
    {
      body: writeSchema,
      transform: [guardReceptionWrite, refuseUnknownFields(WRITE_FIELDS)],
      detail: { tags: ['สัตว์เลี้ยง'], summary: 'เพิ่มสัตว์เลี้ยง' },
    },
  )

  .patch(
    '/:id',
    async ({ params, body, ...ctx }) => {
      const actor = await getActor(ctx)

      return ok(
        toWire(
          await updatePet(
            parseId(params.id),
            toInput(body as Record<string, unknown>),
            actor.userId,
          ),
        ),
      )
    },
    {
      body: writeSchema,
      transform: [guardReceptionWrite, refuseUnknownFields(WRITE_FIELDS)],
      detail: { tags: ['สัตว์เลี้ยง'], summary: 'แก้ไขสัตว์เลี้ยง' },
    },
  )

  /** เสียชีวิต — **ไม่ใช่การลบ** ประวัติยังอยู่ · ส่ง `null` เพื่อยกเลิก */
  .patch(
    '/:id/deceased',
    async ({ params, body, ...ctx }) => {
      const actor = await getActor(ctx)

      return ok(toWire(await setPetDeceased(parseId(params.id), body.deceasedOn, actor.userId)))
    },
    {
      body: t.Object(
        { deceasedOn: t.Union([t.String(), t.Null()]) },
        { additionalProperties: false },
      ),
      transform: [guardReceptionWrite, refuseUnknownFields(DECEASED_FIELDS)],
      detail: { tags: ['สัตว์เลี้ยง'], summary: 'บันทึกว่าเสียชีวิต' },
    },
  )

  .delete(
    '/:id',
    async ({ params, ...ctx }) => {
      const actor = await getActor(ctx)
      await deletePet(parseId(params.id), actor.userId)

      return ok(null)
    },
    { transform: guardReceptionWrite, detail: { tags: ['สัตว์เลี้ยง'], summary: 'ลบสัตว์เลี้ยง' } },
  )

export { PET_PAGE_SIZE }
