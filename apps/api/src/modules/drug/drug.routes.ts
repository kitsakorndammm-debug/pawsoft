import {
  Elysia,
  t } from 'elysia'

import { invalid } from '../../kit/app-error.ts'
import { ok,
  paged } from '../../kit/response.ts'
import {
  getActor,
  guardRead,
  guardSignedIn,
  guardWrite,
  parseId,
  parseIdFilter,
  refuseUnknownFields,
  refuseUnknownQuery,
} from '../../kit/route-guard.ts'
import {
  createDrug,
  deleteDrug,
  DRUG_PAGE_SIZE,
  findDrug,
  listDrugs,
  lookupDrugs,
  setDrugActive,
  updateDrug,
  type DrugInput,
} from './drug.service.ts'
import type { Drug } from '../../../prisma/generated/client.ts'

/**
 * ยาและเวชภัณฑ์
 *
 * **ใช้สิทธิ์ของเมนูตั้งค่า (`master`) ไม่ใช่ `hr`** — ยาเป็นข้อมูลตั้งต้นของคลินิก
 * เหมือนแผนกกับตำแหน่ง ไม่ใช่ข้อมูลของคน
 */

const LIST_QUERY_KEYS = new Set(['q', 'categoryId', 'page', 'pageSize'])

const WRITE_FIELDS = new Set([
  'code',
  'name',
  'genericName',
  'unit',
  'packageSize',
  'price',
  'categoryId',
  'note',
])

const ACTIVE_FIELDS = new Set(['isActive'])

/**
 * BigInt ออกเป็น `number` · **ราคาออกเป็น `string`**
 *
 * `Decimal` ที่ส่งเป็น `number` จะเสียความแม่นตอน JSON parse ฝั่งเบราว์เซอร์ ·
 * หน้าจอรับเป็นข้อความแล้วแสดงตรง ๆ ไม่ต้องแปลงกลับ
 */
const toWire = (row: Drug) => ({
  id: Number(row.id),
  code: row.code,
  name: row.name,
  genericName: row.genericName,
  unit: row.unit,
  packageSize: row.packageSize,
  price: row.price === null ? null : row.price.toString(),
  categoryId: row.categoryId === null ? null : Number(row.categoryId),
  isActive: row.isActive,
  note: row.note,
})

/** `page` กับ `pageSize` มาเป็นข้อความจาก query — ต้องเป็นตัวเลขเท่านั้น */
function parseCount(raw: string | undefined, field: string): number | undefined {
  if (raw === undefined) return undefined
  if (!/^\d+$/.test(raw)) throw invalid(`${field} ต้องเป็นตัวเลข`, { [field]: raw })

  return Number(raw)
}

const nullableId = t.Union([t.Number(), t.Null()])
const nullableText = t.Optional(t.Union([t.String(), t.Null()]))

const writeSchema = t.Object(
  {
    code: nullableText,
    name: t.String(),
    genericName: nullableText,
    unit: nullableText,
    packageSize: nullableText,
    /** ราคาเป็นข้อความ ไม่ใช่ตัวเลข — ดู `toWire` */
    price: nullableText,
    /**
     * **ต้องส่งมาเสมอ แม้เป็น `null`** — `null` แปลว่าไม่สังกัดหมวด · ไม่ส่งเลยแปลว่า
     * ฟอร์มไม่ได้ถาม ซึ่งเป็นคนละเรื่อง
     */
    categoryId: nullableId,
    note: nullableText,
  },
  { additionalProperties: false },
)

/** แปลง body ที่ผ่าน schema แล้ว เป็น input ของ service */
const toInput = (body: Record<string, unknown>): DrugInput => ({
  code: (body['code'] as string | null | undefined) ?? null,
  name: body['name'] as string,
  genericName: (body['genericName'] as string | null | undefined) ?? null,
  unit: (body['unit'] as string | null | undefined) ?? null,
  packageSize: (body['packageSize'] as string | null | undefined) ?? null,
  price: (body['price'] as string | null | undefined) ?? null,
  categoryId: body['categoryId'] === null ? null : BigInt(body['categoryId'] as number),
  note: (body['note'] as string | null | undefined) ?? null,
})

export const drugRoutes = new Elysia({ prefix: '/api/drugs' })
  .get(
    '/',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, LIST_QUERY_KEYS)

      const result = await listDrugs({
        q: query.q,
        categoryId: parseIdFilter(query.categoryId, 'categoryId'),
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
      beforeHandle: guardRead,
      query: t.Object({
        q: t.Optional(t.String()),
        categoryId: t.Optional(t.String()),
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
      }),
      detail: { tags: ['ยา'], summary: 'ดูรายการยา' },
    },
  )

  /**
   * ยาสำหรับ combobox
   *
   * **`guardSignedIn` ไม่ใช่ `guardRead`** — คนที่บันทึกการรักษาต้องเลือกยาได้ ทั้งที่
   * เขาไม่มีสิทธิ์เปิดหน้าจัดการยา · ใช้ `guardRead` เมื่อไหร่ ช่องเลือกยาจะว่างเปล่า
   * สำหรับคนส่วนใหญ่ และเทสจับไม่ได้ถ้ามันล็อกเอาต์อยู่
   *
   * **ประกาศก่อน `/:id`** — ไม่งั้น `lookup` จะถูกอ่านเป็น id แล้วได้ 400
   */
  .get(
    '/lookup',
    async ({ request }) => {
      refuseUnknownQuery(request.url, new Set<string>())

      const rows = await lookupDrugs()

      return ok(rows.map((r) => ({ id: Number(r.id), name: r.name, unit: r.unit, price: r.price })))
    },
    {
      beforeHandle: guardSignedIn,
      detail: { tags: ['ยา'], summary: 'ยาสำหรับ combobox' },
    },
  )

  .get('/:id', async ({ params }) => ok(toWire(await findDrug(parseId(params.id)))), {
    beforeHandle: guardRead,
    detail: { tags: ['ยา'], summary: 'ดูยารายตัว' },
  })

  .post(
    '/',
    async ({ body, set, ...ctx }) => {
      const actor = await getActor(ctx)
      set.status = 201

      return ok(toWire(await createDrug(toInput(body as Record<string, unknown>), actor.userId)))
    },
    {
      body: writeSchema,
      transform: [guardWrite, refuseUnknownFields(WRITE_FIELDS)],
      detail: { tags: ['ยา'], summary: 'เพิ่มยา' },
    },
  )

  .patch(
    '/:id',
    async ({ params, body, ...ctx }) => {
      const actor = await getActor(ctx)

      return ok(
        toWire(
          await updateDrug(parseId(params.id), toInput(body as Record<string, unknown>), actor.userId),
        ),
      )
    },
    {
      body: writeSchema,
      transform: [guardWrite, refuseUnknownFields(WRITE_FIELDS)],
      detail: { tags: ['ยา'], summary: 'แก้ไขยา' },
    },
  )

  .patch(
    '/:id/active',
    async ({ params, body, ...ctx }) => {
      const actor = await getActor(ctx)

      return ok(toWire(await setDrugActive(parseId(params.id), body.isActive, actor.userId)))
    },
    {
      body: t.Object({ isActive: t.Boolean() }, { additionalProperties: false }),
      transform: [guardWrite, refuseUnknownFields(ACTIVE_FIELDS)],
      detail: { tags: ['ยา'], summary: 'เลิกใช้หรือกลับมาใช้ยา' },
    },
  )

  .delete(
    '/:id',
    async ({ params, ...ctx }) => {
      const actor = await getActor(ctx)
      await deleteDrug(parseId(params.id), actor.userId)

      return ok(null)
    },
    { transform: guardWrite, detail: { tags: ['ยา'], summary: 'ลบยา' } },
  )

export { DRUG_PAGE_SIZE }
