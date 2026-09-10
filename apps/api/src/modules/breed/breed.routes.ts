import { ok } from '../../kit/response.ts'
import { Elysia, t } from 'elysia'

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
  createBreed,
  deleteBreed,
  listBreeds,
  lookupBreeds,
  updateBreed,
} from './breed.service.ts'
import type { Breed } from '../../../prisma/generated/client.ts'

/**
 * `/api/breeds` — สายพันธุ์
 *
 * **ไม่มี `/:id/move`** ต่างจากทะเบียนอื่น · พันธุ์หมามีเป็นร้อย ไม่มีใครลากเรียง
 * เรียงตามชื่อพอ — ดู `///` บนหัว `breed.service.ts`
 */

const LIST_QUERY_KEYS = new Set(['q', 'speciesId'])
const LOOKUP_QUERY_KEYS = new Set(['speciesId'])
const WRITE_FIELDS = new Set(['speciesId', 'name'])

const toWire = (row: Breed) => ({
  id: Number(row.id),
  speciesId: Number(row.speciesId),
  name: row.name,
})

const writeSchema = t.Object(
  { speciesId: t.Number(), name: t.String() },
  { additionalProperties: false },
)

export const breedRoutes = new Elysia({ prefix: '/api/breeds' })
  .get(
    '/',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, LIST_QUERY_KEYS)

      const rows = await listBreeds({
        q: query.q,
        speciesId: parseIdFilter(query.speciesId, 'speciesId'),
      })

      return ok(rows.map(toWire))
    },
    {
      beforeHandle: guardReceptionRead,
      query: t.Object({ q: t.Optional(t.String()), speciesId: t.Optional(t.String()) }),
      detail: { tags: ['สายพันธุ์'], summary: 'ดูรายการสายพันธุ์' },
    },
  )

  /**
   * สายพันธุ์สำหรับ combobox — กรองตามชนิดได้
   *
   * **คืน `speciesId` มาด้วยเสมอ** · หน้าจอต้องกรองพันธุ์ตามชนิดที่เลือกไว้ในช่องก่อนหน้า
   * ไม่งั้นฟอร์มจะโชว์พันธุ์หมาให้คนที่เลือกแมว แล้วฐานปฏิเสธตอนกดบันทึก ซึ่งสายเกินไป
   */
  .get(
    '/lookup',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, LOOKUP_QUERY_KEYS)

      const rows = await lookupBreeds(parseIdFilter(query.speciesId, 'speciesId'))

      return ok(
        rows.map((r) => ({ id: Number(r.id), speciesId: Number(r.speciesId), name: r.name })),
      )
    },
    {
      beforeHandle: guardSignedIn,
      query: t.Object({ speciesId: t.Optional(t.String()) }),
      detail: { tags: ['สายพันธุ์'], summary: 'สายพันธุ์สำหรับ combobox' },
    },
  )

  .post(
    '/',
    async ({ body, set, ...ctx }) => {
      const { userId } = await getActor(ctx)
      set.status = 201

      return ok(toWire(await createBreed({ speciesId: BigInt(body.speciesId), name: body.name }, userId)))
    },
    {
      body: writeSchema,
      transform: [guardReceptionWrite, refuseUnknownFields(WRITE_FIELDS)],
      detail: { tags: ['สายพันธุ์'], summary: 'เพิ่มสายพันธุ์' },
    },
  )

  .patch(
    '/:id',
    async ({ params, body, ...ctx }) => {
      const { userId } = await getActor(ctx)

      return ok(
        toWire(
          await updateBreed(
            parseId(params.id),
            { speciesId: BigInt(body.speciesId), name: body.name },
            userId,
          ),
        ),
      )
    },
    {
      body: writeSchema,
      transform: [guardReceptionWrite, refuseUnknownFields(WRITE_FIELDS)],
      detail: { tags: ['สายพันธุ์'], summary: 'แก้ไขสายพันธุ์' },
    },
  )

  .delete(
    '/:id',
    async ({ params, ...ctx }) => {
      const { userId } = await getActor(ctx)
      await deleteBreed(parseId(params.id), userId)

      return ok(null)
    },
    { transform: guardReceptionWrite, detail: { tags: ['สายพันธุ์'], summary: 'ลบสายพันธุ์' } },
  )
