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
  refuseUnknownFields,
  refuseUnknownQuery,
} from '../../kit/route-guard.ts'
import {
  createOwner,
  deleteOwner,
  findOwner,
  linkOwnerAccount,
  listOwners,
  lookupOwners,
  lookupUnlinkedAccounts,
  OWNER_PAGE_SIZE,
  updateOwner,
  type OwnerInput,
} from './owner.service.ts'
import type { Owner } from '../../../prisma/generated/client.ts'

/**
 * เจ้าของสัตว์
 *
 * **ใช้สิทธิ์ `clinic` ไม่ใช่ `master`** — คนที่นั่งเคาน์เตอร์ต้องเพิ่มลูกค้าใหม่ได้
 * ทั้งวัน แต่ไม่ควรแก้ราคายาได้ · ดู `///` บน `RECEPTION_PERMISSION`
 */

const LIST_QUERY_KEYS = new Set(['q', 'page', 'pageSize', 'linked'])
const LOOKUP_QUERY_KEYS = new Set(['q'])

const WRITE_FIELDS = new Set(['name', 'phone', 'phoneAlt', 'email', 'address', 'note'])
const LINK_FIELDS = new Set(['petOwnerAccountId'])

const toWire = (row: Owner) => ({
  id: Number(row.id),
  code: row.code,
  name: row.name,
  phone: row.phone,
  phoneAlt: row.phoneAlt,
  email: row.email,
  address: row.address,
  petOwnerAccountId: row.petOwnerAccountId === null ? null : Number(row.petOwnerAccountId),
  note: row.note,
})

function parseCount(raw: string | undefined, field: string): number | undefined {
  if (raw === undefined) return undefined
  if (!/^\d+$/.test(raw)) throw invalid(`${field} ต้องเป็นตัวเลข`, { [field]: raw })

  return Number(raw)
}

/** `true`/`false` เท่านั้น — ไม่รับ `1`/`0` หรือรูปแบบอื่น กันคนเรียกเดาผิดแบบเงียบ ๆ */
function parseLinked(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined
  if (raw === 'true') return true
  if (raw === 'false') return false

  throw invalid('linked ต้องเป็น true หรือ false', { linked: raw })
}

const nullableText = t.Optional(t.Union([t.String(), t.Null()]))

const writeSchema = t.Object(
  {
    name: t.String(),
    phone: nullableText,
    phoneAlt: nullableText,
    email: nullableText,
    address: nullableText,
    note: nullableText,
  },
  { additionalProperties: false },
)

const toInput = (body: Record<string, unknown>): OwnerInput => ({
  name: body['name'] as string,
  phone: (body['phone'] as string | null | undefined) ?? null,
  phoneAlt: (body['phoneAlt'] as string | null | undefined) ?? null,
  email: (body['email'] as string | null | undefined) ?? null,
  address: (body['address'] as string | null | undefined) ?? null,
  note: (body['note'] as string | null | undefined) ?? null,
})

export const ownerRoutes = new Elysia({ prefix: '/api/owners' })
  .get(
    '/',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, LIST_QUERY_KEYS)

      const result = await listOwners({
        q: query.q,
        page: parseCount(query.page, 'page'),
        pageSize: parseCount(query.pageSize, 'pageSize'),
        linked: parseLinked(query.linked),
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
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
        linked: t.Optional(t.String()),
      }),
      detail: { tags: ['เจ้าของสัตว์'], summary: 'ดูรายการเจ้าของสัตว์' },
    },
  )

  /**
   * เจ้าของสำหรับ combobox — **ต้องมีคำค้นเสมอ**
   *
   * ไม่คืนทั้งตาราง ต่างจาก `/lookup` ของทะเบียนเล็ก ๆ · ลูกค้าคลินิกมีหลักหมื่นและ
   * โตทุกวัน — โหลดทั้งชุดคือหน้าที่ค้างตอนเปิด
   *
   * **ประกาศก่อน `/:id`** ไม่งั้น `lookup` จะถูกอ่านเป็น id
   */
  .get(
    '/lookup',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, LOOKUP_QUERY_KEYS)

      const rows = await lookupOwners(query.q ?? '')

      return ok(
        rows.map((r) => ({ id: Number(r.id), code: r.code, name: r.name, phone: r.phone })),
      )
    },
    {
      beforeHandle: guardSignedIn,
      query: t.Object({ q: t.Optional(t.String()) }),
      detail: { tags: ['เจ้าของสัตว์'], summary: 'ค้นเจ้าของสำหรับ combobox' },
    },
  )

  /**
   * บัญชี Google ที่ยังไม่ถูกจับคู่ — **สำหรับหน้าเชื่อมบัญชีของพนักงาน**
   *
   * **คืนเฉพาะบัญชีที่ยังว่าง** · บัญชีที่ผูกกับคนอื่นแล้วโผล่มาให้เลือก คือทางที่
   * พนักงานจะกดผิดแล้วได้ `DUPLICATE` กลับมา ทั้งที่กันไม่ให้เห็นตั้งแต่แรกได้
   *
   * **ต้องมีคำค้น** — รายชื่ออีเมลของลูกค้าทุกคนไม่ใช่ของที่ควรโหลดมาทั้งชุด
   *
   * ประกาศก่อน `/:id` เหมือน `/lookup`
   */
  .get(
    '/accounts/lookup',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, LOOKUP_QUERY_KEYS)

      const rows = await lookupUnlinkedAccounts(query.q ?? '')

      return ok(
        rows.map((r) => ({
          id: Number(r.id),
          email: r.email,
          displayName: r.displayName,
        })),
      )
    },
    {
      beforeHandle: guardReceptionRead,
      query: t.Object({ q: t.Optional(t.String()) }),
      detail: { tags: ['เจ้าของสัตว์'], summary: 'บัญชี Google ที่ยังไม่ถูกจับคู่' },
    },
  )

  .get('/:id', async ({ params }) => ok(toWire(await findOwner(parseId(params.id)))), {
    beforeHandle: guardReceptionRead,
    detail: { tags: ['เจ้าของสัตว์'], summary: 'ดูเจ้าของรายตัว' },
  })

  .post(
    '/',
    async ({ body, set, ...ctx }) => {
      const actor = await getActor(ctx)
      set.status = 201

      return ok(toWire(await createOwner(toInput(body as Record<string, unknown>), actor.userId)))
    },
    {
      body: writeSchema,
      transform: [guardReceptionWrite, refuseUnknownFields(WRITE_FIELDS)],
      detail: { tags: ['เจ้าของสัตว์'], summary: 'เพิ่มเจ้าของสัตว์' },
    },
  )

  .patch(
    '/:id',
    async ({ params, body, ...ctx }) => {
      const actor = await getActor(ctx)

      return ok(
        toWire(
          await updateOwner(
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
      detail: { tags: ['เจ้าของสัตว์'], summary: 'แก้ไขเจ้าของสัตว์' },
    },
  )

  /**
   * จับคู่บัญชี Google — **งานของพนักงาน**
   *
   * (ผู้ใช้กำหนด 2026-09-01) · ลูกค้ามาหน้างานก่อน แล้วไปสมัคร Google ทีหลัง เป็นลำดับ
   * ที่เกิดบ่อยกว่าทางกลับ · ส่ง `null` เพื่อถอนการจับคู่
   */
  .patch(
    '/:id/account',
    async ({ params, body, ...ctx }) => {
      const actor = await getActor(ctx)
      const raw = body.petOwnerAccountId

      return ok(
        toWire(
          await linkOwnerAccount(
            parseId(params.id),
            raw === null ? null : BigInt(raw),
            actor.userId,
          ),
        ),
      )
    },
    {
      body: t.Object(
        { petOwnerAccountId: t.Union([t.Number(), t.Null()]) },
        { additionalProperties: false },
      ),
      transform: [guardReceptionWrite, refuseUnknownFields(LINK_FIELDS)],
      detail: { tags: ['เจ้าของสัตว์'], summary: 'จับคู่หรือถอนบัญชี Google' },
    },
  )

  .delete(
    '/:id',
    async ({ params, ...ctx }) => {
      const actor = await getActor(ctx)
      await deleteOwner(parseId(params.id), actor.userId)

      return ok(null)
    },
    {
      transform: guardReceptionWrite,
      detail: { tags: ['เจ้าของสัตว์'], summary: 'ลบเจ้าของสัตว์' },
    },
  )

export { OWNER_PAGE_SIZE }
