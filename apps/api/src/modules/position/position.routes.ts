import {
  Elysia,
  t } from 'elysia'
import { ok } from '../../kit/response.ts'
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
  createPosition,
  deletePosition,
  listPositions,
  movePosition,
  updatePosition,
} from './position.service.ts'
import type { Position } from '../../../prisma/generated/client.ts'

/**
 * `/api/positions` — ตำแหน่ง
 *
 * `?departmentId=` กรองตำแหน่งในแผนกนั้น · `POST`/`PATCH` บังคับให้ส่ง `departmentId`
 * มาเสมอ แม้เป็น `null`
 */


/**
 * รูปที่ส่งออกทางสาย — **เฉพาะที่หน้าจอใช้**
 *
 * `id` เป็น number เพราะ `BigInt` ส่งตรง ๆ ไม่ได้ `JSON.stringify` โยน error ·
 * `departmentId` ที่ว่างออกไปเป็น `null` ไม่ใช่ `0` — `Number(null)` คือ 0 ซึ่งเป็น id
 * ที่ใช้ได้ หน้าจอจะเห็นตำแหน่งสังกัดแผนกหมายเลขศูนย์แทนที่จะเห็นว่าไม่สังกัดแผนกไหน
 */
function toWire(row: Position) {
  return {
    id: Number(row.id),
    name: row.name,
    sortOrder: row.sortOrder,
    departmentId: row.departmentId === null ? null : Number(row.departmentId),
  }
}

const LIST_QUERY_KEYS = new Set(['q', 'departmentId'])
/** `/lookup` รับตัวกรองแม่ได้ แต่ไม่รับคำค้น — combobox ค้นเองในฝั่งหน้าจอ */
const LOOKUP_QUERY_KEYS = new Set(['departmentId'])
const WRITE_FIELDS = new Set(['name', 'departmentId'])
const BEFORE_ID_ONLY = new Set(['beforeId'])

export const positionRoutes = new Elysia({ prefix: '/api/positions' })
  .get(
    '/',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, LIST_QUERY_KEYS)

      const rows = await listPositions({
        q: query.q,
        departmentId: parseIdFilter(query.departmentId, 'departmentId'),
      })
      return ok(rows.map(toWire))
    },
    {
      query: t.Object({
        q: t.Optional(t.String()),
        departmentId: t.Optional(t.String()),
      }),
      beforeHandle: guardRead,
      detail: { summary: 'ดูรายการตำแหน่ง', tags: ['ตำแหน่ง'] },
    },
  )
  /**
   * `/lookup` — สำหรับ combobox ในหน้าอื่น
   *
   * คืนแค่ฟิลด์ที่ combobox ต้องใช้ · หน้าที่ต้องให้คนเลือกตำแหน่งไม่ควรจ่ายค่าขนส่งของ
   * คอลัมน์ที่มันไม่ได้ใช้ และวันที่ตารางนี้มีคอลัมน์เพิ่ม หน้าพวกนั้นจะไม่หนักขึ้นตาม ·
   * คืนเฉพาะแถวที่ยังใช้งานอยู่ เพราะ combobox คือที่ให้คนเลือกของที่ยังเลือกได้
   *
   * **`departmentId` คืนไปด้วย ต่างจากทะเบียนอื่น** — ฟอร์มพนักงานกรองตำแหน่งตาม
   * แผนกที่เลือก รวมถึงตอนที่ยังไม่เลือกแผนก ซึ่งขอผ่าน `?departmentId=` ไม่ได้
   * เพราะมันรับแต่ตัวเลข · ฟอร์มจึงขอทั้งชุดครั้งเดียวแล้วกรองเอง แทนที่จะยิงใหม่
   * ทุกครั้งที่เปลี่ยนแผนก
   */
  .get(
    '/lookup',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, LOOKUP_QUERY_KEYS)

      const rows = await listPositions({
        departmentId: parseIdFilter(query.departmentId, 'departmentId'),
      })
      return ok(
        rows.map((row) => ({
          id: Number(row.id),
          name: row.name,
          // `null` ไม่ใช่ `0` — `Number(null)` คือ 0 ซึ่งเป็น id ที่ใช้ได้
          departmentId: row.departmentId === null ? null : Number(row.departmentId),
        })),
      )
    },
    {
      query: t.Object({ departmentId: t.Optional(t.String()) }),
      beforeHandle: guardSignedIn,
      detail: { summary: 'ตำแหน่งสำหรับ combobox', tags: ['ตำแหน่ง'] },
    },
  )
  .post(
    '/',
    async (ctx) => {
      const { userId } = await getActor(ctx)
      const row = await createPosition(
        {
          name: ctx.body.name,
          departmentId: ctx.body.departmentId === null ? null : BigInt(ctx.body.departmentId),
        },
        userId,
      )

      ctx.set.status = 201
      return ok(toWire(row))
    },
    {
      /**
       * `departmentId` **ต้องส่งมาเสมอ แม้เป็น `null`**
       *
       * `null` แปลว่าไม่สังกัดแผนกไหน · ไม่ส่งเลยแปลว่าฟอร์มไม่ได้ถาม — สองอย่างนี้
       * คนละเรื่อง กฎเดียวกับ `beforeId` ของการย้ายลำดับ
       */
      body: t.Object({
        name: t.String(),
        departmentId: t.Union([t.Number(), t.Null()]),
      }),
      transform: [guardWrite, refuseUnknownFields(WRITE_FIELDS)],
      detail: { summary: 'เพิ่มตำแหน่ง', tags: ['ตำแหน่ง'] },
    },
  )
  .patch(
    '/:id',
    async (ctx) => {
      const { userId } = await getActor(ctx)
      const row = await updatePosition(
        parseId(ctx.params.id),
        {
          name: ctx.body.name,
          departmentId: ctx.body.departmentId === null ? null : BigInt(ctx.body.departmentId),
        },
        userId,
      )

      return ok(toWire(row))
    },
    {
      body: t.Object({
        name: t.String(),
        departmentId: t.Union([t.Number(), t.Null()]),
      }),
      transform: [guardWrite, refuseUnknownFields(WRITE_FIELDS)],
      detail: { summary: 'แก้ไขตำแหน่ง', tags: ['ตำแหน่ง'] },
    },
  )
  /**
   * ย้ายลำดับ — `beforeId` เป็น `null` แปลว่าไปล่างสุด
   *
   * ลำดับเป็นของทั้งตาราง ไม่ใช่ต่อแผนก · แผนกเป็นตัวกรองของลิสต์เท่านั้น
   */
  .patch(
    '/:id/move',
    async (ctx) => {
      const { userId } = await getActor(ctx)
      const beforeId = ctx.body.beforeId

      await movePosition(
        parseId(ctx.params.id),
        { beforeId: beforeId === null ? null : BigInt(beforeId) },
        userId,
      )

      return ok(null)
    },
    {
      body: t.Object({ beforeId: t.Union([t.Number(), t.Null()]) }),
      transform: [guardWrite, refuseUnknownFields(BEFORE_ID_ONLY)],
      detail: { summary: 'ย้ายลำดับตำแหน่ง', tags: ['ตำแหน่ง'] },
    },
  )
  .delete(
    '/:id',
    async (ctx) => {
      const { userId } = await getActor(ctx)
      await deletePosition(parseId(ctx.params.id), userId)

      return ok(null)
    },
    {
      transform: guardWrite,
      detail: { summary: 'ลบตำแหน่ง', tags: ['ตำแหน่ง'] },
    },
  )
