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
  createServiceItem,
  deleteServiceItem,
  SERVICE_ITEM_PAGE_SIZE,
  findServiceItem,
  listServiceItems,
  lookupServiceItems,
  setServiceItemActive,
  updateServiceItem,
  type ServiceItemInput,
} from './service-item.service.ts'
import type { ServiceItem } from '../../../prisma/generated/client.ts'

/**
 * รายการรักษาและบริการ
 *
 * **ใช้สิทธิ์ของเมนูตั้งค่า (`master`) ไม่ใช่ `hr`** — ยาเป็นข้อมูลตั้งต้นของคลินิก
 * เหมือนแผนกกับตำแหน่ง ไม่ใช่ข้อมูลของคน
 */

const LIST_QUERY_KEYS = new Set(['q', 'categoryId', 'page', 'pageSize'])

const WRITE_FIELDS = new Set([
  'code',
  'name',
  'description',
  'price',
  'categoryId',
])

const ACTIVE_FIELDS = new Set(['isActive'])

/**
 * BigInt ออกเป็น `number` · **ราคาออกเป็น `string`**
 *
 * `Decimal` ที่ส่งเป็น `number` จะเสียความแม่นตอน JSON parse ฝั่งเบราว์เซอร์ ·
 * หน้าจอรับเป็นข้อความแล้วแสดงตรง ๆ ไม่ต้องแปลงกลับ
 */
const toWire = (row: ServiceItem) => ({
  id: Number(row.id),
  code: row.code,
  name: row.name,
  description: row.description,
  price: row.price === null ? null : row.price.toString(),
  categoryId: row.categoryId === null ? null : Number(row.categoryId),
  isActive: row.isActive,
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
    description: nullableText,
    /** ราคาเป็นข้อความ ไม่ใช่ตัวเลข — ดู `toWire` */
    price: nullableText,
    /**
     * **ต้องส่งมาเสมอ แม้เป็น `null`** — `null` แปลว่าไม่สังกัดหมวด · ไม่ส่งเลยแปลว่า
     * ฟอร์มไม่ได้ถาม ซึ่งเป็นคนละเรื่อง
     */
    categoryId: nullableId,
  },
  { additionalProperties: false },
)

/** แปลง body ที่ผ่าน schema แล้ว เป็น input ของ service */
const toInput = (body: Record<string, unknown>): ServiceItemInput => ({
  code: (body['code'] as string | null | undefined) ?? null,
  name: body['name'] as string,
  description: (body['description'] as string | null | undefined) ?? null,
  price: (body['price'] as string | null | undefined) ?? null,
  categoryId: body['categoryId'] === null ? null : BigInt(body['categoryId'] as number),
})

export const serviceItemRoutes = new Elysia({ prefix: '/api/service-items' })
  .get(
    '/',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, LIST_QUERY_KEYS)

      const result = await listServiceItems({
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
      detail: { tags: ['รายการรักษา'], summary: 'ดูรายการรายการรักษา' },
    },
  )

  /**
   * รายการรักษาสำหรับ combobox
   *
   * **`guardSignedIn` ไม่ใช่ `guardRead`** · **ประกาศก่อน `/:id`** — เหตุผลเดียวกับ
   * ที่ `drug.routes`
   */
  .get(
    '/lookup',
    async ({ request }) => {
      refuseUnknownQuery(request.url, new Set<string>())

      const rows = await lookupServiceItems()

      return ok(rows.map((r) => ({ id: Number(r.id), name: r.name, price: r.price })))
    },
    {
      beforeHandle: guardSignedIn,
      detail: { tags: ['รายการรักษา'], summary: 'รายการรักษาสำหรับ combobox' },
    },
  )

  .get('/:id', async ({ params }) => ok(toWire(await findServiceItem(parseId(params.id)))), {
    beforeHandle: guardRead,
    detail: { tags: ['รายการรักษา'], summary: 'ดูรายการรักษารายตัว' },
  })

  .post(
    '/',
    async ({ body, set, ...ctx }) => {
      const actor = await getActor(ctx)
      set.status = 201

      return ok(toWire(await createServiceItem(toInput(body as Record<string, unknown>), actor.userId)))
    },
    {
      body: writeSchema,
      transform: [guardWrite, refuseUnknownFields(WRITE_FIELDS)],
      detail: { tags: ['รายการรักษา'], summary: 'เพิ่มรายการรักษา' },
    },
  )

  .patch(
    '/:id',
    async ({ params, body, ...ctx }) => {
      const actor = await getActor(ctx)

      return ok(
        toWire(
          await updateServiceItem(parseId(params.id), toInput(body as Record<string, unknown>), actor.userId),
        ),
      )
    },
    {
      body: writeSchema,
      transform: [guardWrite, refuseUnknownFields(WRITE_FIELDS)],
      detail: { tags: ['รายการรักษา'], summary: 'แก้ไขรายการรักษา' },
    },
  )

  .patch(
    '/:id/active',
    async ({ params, body, ...ctx }) => {
      const actor = await getActor(ctx)

      return ok(toWire(await setServiceItemActive(parseId(params.id), body.isActive, actor.userId)))
    },
    {
      body: t.Object({ isActive: t.Boolean() }, { additionalProperties: false }),
      transform: [guardWrite, refuseUnknownFields(ACTIVE_FIELDS)],
      detail: { tags: ['รายการรักษา'], summary: 'เลิกใช้หรือกลับมาใช้รายการรักษา' },
    },
  )

  .delete(
    '/:id',
    async ({ params, ...ctx }) => {
      const actor = await getActor(ctx)
      await deleteServiceItem(parseId(params.id), actor.userId)

      return ok(null)
    },
    { transform: guardWrite, detail: { tags: ['รายการรักษา'], summary: 'ลบรายการรักษา' } },
  )

export { SERVICE_ITEM_PAGE_SIZE }
