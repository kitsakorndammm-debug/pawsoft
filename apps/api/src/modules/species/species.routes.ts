import {
  Elysia,
  t } from 'elysia'
import { ok } from '../../kit/response.ts'
import {
  getActor,
  guardReceptionRead,
  guardSignedIn,
  guardReceptionWrite,
  parseId,
  refuseUnknownFields,
  refuseUnknownQuery,
} from '../../kit/route-guard.ts'
import {
  createSpecies,
  deleteSpecies,
  listSpeciesRows,
  moveSpecies,
  updateSpecies,
} from './species.service.ts'
import type { Species } from '../../../prisma/generated/client.ts'

/**
 * `/api/species` — ชนิดสัตว์ (หมา แมว กระต่าย)
 *
 * **สิทธิ์ `clinic` ไม่ใช่ `master`** — คนที่ลงทะเบียนสัตว์ใหม่หน้าเคาน์เตอร์คือคน
 * เดียวกับที่รู้ว่าต้องมีชนิดใหม่ · ดู `///` บน `RECEPTION_PERMISSION`
 *
 * กฎที่เป็นของชนิดสัตว์เอง (ลบไม่ได้ถ้ายังมีสัตว์หรือสายพันธุ์อยู่) อยู่ที่ชั้น service
 * และเดินทางออกมาเป็น `IN_USE` เอง ชั้นนี้ไม่ต้องรู้
 */


/**
 * รูปที่ส่งออกทางสาย — **เฉพาะที่หน้าจอใช้**
 *
 * `id` เป็น number เพราะ `BigInt` ส่งตรง ๆ ไม่ได้ `JSON.stringify` โยน error
 *
 * คอลัมน์ audit ไม่ส่งออก (ผู้ใช้ตัดสิน 2026-08-26) — `createdBy` กับ `updatedBy` เป็น
 * id เปล่า ๆ ที่ยังไม่มีชื่อคนติดมา และยังไม่มีหน้าไหนขอ · เพิ่มทีหลังได้ตอนมีหน้าจอที่
 * ต้องใช้จริง ตัดออกทีหลังทำไม่ได้ เพราะไม่มีใครรู้ว่าใครอ่านอยู่
 */
function toWire(row: Species) {
  return {
    id: Number(row.id),
    name: row.name,
    sortOrder: row.sortOrder,
  }
}

const LIST_QUERY_KEYS = new Set(['q'])
/** `/lookup` ไม่รับตัวกรองอะไรเลย — combobox ขอทั้งชุดที่เลือกได้ */
const LOOKUP_QUERY_KEYS = new Set<string>()
const NAME_ONLY = new Set(['name'])
const BEFORE_ID_ONLY = new Set(['beforeId'])

export const speciesRoutes = new Elysia({ prefix: '/api/species' })
  .get(
    '/',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, LIST_QUERY_KEYS)

      const rows = await listSpeciesRows({ q: query.q })
      return ok(rows.map(toWire))
    },
    {
      query: t.Object({ q: t.Optional(t.String()) }),
      beforeHandle: guardReceptionRead,
      detail: { summary: 'ดูรายการชนิดสัตว์', tags: ['ชนิดสัตว์'] },
    },
  )
  /**
   * `/lookup` — สำหรับ combobox ในหน้าอื่น
   *
   * คืนแค่ `id` กับ `name` · หน้าที่ต้องให้คนเลือกชนิดสัตว์ไม่ควรจ่ายค่าขนส่งของคอลัมน์ที่
   * มันไม่ได้ใช้ และวันที่ตารางนี้มีคอลัมน์เพิ่ม หน้าพวกนั้นจะไม่หนักขึ้นตาม ·
   * คืนเฉพาะแถวที่ยังใช้งานอยู่ เพราะ combobox คือที่ให้คนเลือกของที่ยังเลือกได้
   */
  .get(
    '/lookup',
    async ({ request }) => {
      refuseUnknownQuery(request.url, LOOKUP_QUERY_KEYS)

      const rows = await listSpeciesRows()
      return ok(rows.map((row) => ({ id: Number(row.id), name: row.name })))
    },
    {
      beforeHandle: guardSignedIn,
      detail: { summary: 'ชนิดสัตว์สำหรับ combobox', tags: ['ชนิดสัตว์'] },
    },
  )
  .post(
    '/',
    async (ctx) => {
      const { userId } = await getActor(ctx)
      const row = await createSpecies({ name: ctx.body.name }, userId)

      ctx.set.status = 201
      return ok(toWire(row))
    },
    {
      body: t.Object({ name: t.String() }),
      transform: [guardReceptionWrite, refuseUnknownFields(NAME_ONLY)],
      detail: { summary: 'เพิ่มชนิดสัตว์', tags: ['ชนิดสัตว์'] },
    },
  )
  .patch(
    '/:id',
    async (ctx) => {
      const { userId } = await getActor(ctx)
      const row = await updateSpecies(parseId(ctx.params.id), { name: ctx.body.name }, userId)

      return ok(toWire(row))
    },
    {
      body: t.Object({ name: t.String() }),
      transform: [guardReceptionWrite, refuseUnknownFields(NAME_ONLY)],
      detail: { summary: 'แก้ไขชนิดสัตว์', tags: ['ชนิดสัตว์'] },
    },
  )
  /**
   * ย้ายลำดับ — `beforeId` เป็น `null` แปลว่าไปล่างสุด
   *
   * **ไม่ส่ง `beforeId` มาเลย ไม่เท่ากับส่ง `null`** · null คือ "ไปล่างสุด" ส่วนการไม่ส่ง
   * คือคนเรียกไม่เคยบอกว่าจะย้ายไปไหน — อย่างหลังเป็นคำขอที่ผิดรูป
   */
  .patch(
    '/:id/move',
    async (ctx) => {
      const { userId } = await getActor(ctx)
      const beforeId = ctx.body.beforeId

      await moveSpecies(
        parseId(ctx.params.id),
        { beforeId: beforeId === null ? null : BigInt(beforeId) },
        userId,
      )

      return ok(null)
    },
    {
      body: t.Object({ beforeId: t.Union([t.Number(), t.Null()]) }),
      transform: [guardReceptionWrite, refuseUnknownFields(BEFORE_ID_ONLY)],
      detail: { summary: 'ย้ายลำดับชนิดสัตว์', tags: ['ชนิดสัตว์'] },
    },
  )
  .delete(
    '/:id',
    async (ctx) => {
      const { userId } = await getActor(ctx)
      await deleteSpecies(parseId(ctx.params.id), userId)

      return ok(null)
    },
    {
      transform: guardReceptionWrite,
      detail: { summary: 'ลบชนิดสัตว์', tags: ['ชนิดสัตว์'] },
    },
  )
