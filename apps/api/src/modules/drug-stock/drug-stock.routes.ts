import { Elysia, t } from 'elysia'

import { ok } from '../../kit/response.ts'
import {
  getActor,
  guardDrugStockRead,
  guardDrugStockWrite,
  parseId,
  refuseUnknownFields,
  refuseUnknownQuery,
} from '../../kit/route-guard.ts'
import {
  createDrugStockMovement,
  listDrugStockBalances,
  listDrugStockMovements,
  type DrugStockBalance,
  type DrugStockMovementRow,
} from './drug-stock.service.ts'
import type { DrugStockMovement } from '../../../prisma/generated/client.ts'

/**
 * สต็อกยา
 *
 * **ใช้สิทธิ์ของตัวเอง (`drug-stock`) แยกจาก `master`** (ผู้ใช้ตัดสิน 2026-09-08 —
 * แก้จากที่เคยใช้ร่วมกับหน้ายา) เพราะคนที่ต้องเห็นสต็อก (หมอ ดูอย่างเดียว · เคาน์เตอร์
 * ดูและบันทึก) ไม่ใช่คนกลุ่มเดียวกับที่ควรแก้ทะเบียนยา/แผนก/ตำแหน่งได้
 *
 * **เส้นนี้รับได้แค่ `ADJUST`** (ผู้ใช้ตัดสิน 2026-09-15 — เดิมรับ `RECEIVE` ด้วย) —
 * เติมสต็อกฝั่งนี้ตรง ๆ ไม่ได้อีกแล้ว ต้อง "เบิกจากคลัง" ผ่าน
 * `POST /api/warehouse-stock/withdraw` เท่านั้น (ซึ่งสร้างแถว `RECEIVE` ให้เองข้างใน)
 * เหตุผลเดียวกับที่ `DISPENSE`/`DISPENSE_REVERSED` ไม่เคยเปิดให้เส้นนี้ตั้งค่าตรง —
 * ของที่ระบบต้องเป็นคนสร้างเอง ไม่ใช่ของที่ผู้ใช้กรอกจำนวนเท่าไหร่ก็ได้
 */

const LIST_QUERY_KEYS = new Set(['q'])
const WRITE_FIELDS = new Set(['drugId', 'type', 'quantity', 'reason'])

/** วันที่-only ออกเป็น `YYYY-MM-DD` ไม่ใช่ ISO timestamp เต็ม — ไม่มีเวลาให้สื่อสาร */
const dateOnlyWire = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10))

/** BigInt ออกเป็น `number` · จำนวนออกเป็น `string` — เหตุผลเดียวกับ `drug.routes.ts` */
const toWire = (row: DrugStockBalance) => ({
  id: Number(row.drugId),
  name: row.name,
  code: row.code,
  unit: row.unit,
  isActive: row.isActive,
  quantity: row.quantity.toString(),
  nearestExpiry: dateOnlyWire(row.nearestExpiry),
})

const movementToWire = (row: DrugStockMovement) => ({
  id: Number(row.id),
  drugId: Number(row.drugId),
  type: row.type,
  quantity: row.quantity.toString(),
  reason: row.reason,
  expiresOn: dateOnlyWire(row.expiresOn),
  createdAt: row.createdAt.toISOString(),
})

const movementRowToWire = (row: DrugStockMovementRow) => ({
  id: Number(row.id),
  type: row.type,
  quantity: row.quantity.toString(),
  reason: row.reason,
  visitDrugId: row.visitDrugId === null ? null : Number(row.visitDrugId),
  expiresOn: dateOnlyWire(row.expiresOn),
  createdAt: row.createdAt.toISOString(),
  createdByName: row.createdByName,
})

const createSchema = t.Object(
  {
    drugId: t.Number(),
    type: t.Literal('ADJUST'),
    quantity: t.String(),
    reason: t.Optional(t.Union([t.String(), t.Null()])),
  },
  { additionalProperties: false },
)

export const drugStockRoutes = new Elysia({ prefix: '/api/drug-stock' })
  .get(
    '/',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, LIST_QUERY_KEYS)

      const rows = await listDrugStockBalances({ q: query.q })

      return ok(rows.map(toWire))
    },
    {
      beforeHandle: guardDrugStockRead,
      query: t.Object({ q: t.Optional(t.String()) }),
      detail: { tags: ['สต็อกยา'], summary: 'ดูยอดคงเหลือสต็อกยา' },
    },
  )

  /** ประกาศก่อน `/` เปล่า ๆ ไม่ต้อง — path มี `:drugId` แยกจาก root อยู่แล้ว ไม่ชนกัน */
  .get(
    '/:drugId/movements',
    async ({ params }) => {
      const rows = await listDrugStockMovements({ drugId: parseId(params.drugId) })

      return ok(rows.map(movementRowToWire))
    },
    {
      beforeHandle: guardDrugStockRead,
      detail: { tags: ['สต็อกยา'], summary: 'ดูประวัติการเคลื่อนไหวของยาตัวเดียว' },
    },
  )

  .post(
    '/',
    async ({ body, set, ...ctx }) => {
      const actor = await getActor(ctx)
      set.status = 201

      const created = await createDrugStockMovement(
        {
          drugId: BigInt(body.drugId),
          type: body.type,
          quantity: body.quantity,
          reason: body.reason ?? null,
        },
        actor.userId,
      )

      return ok(movementToWire(created))
    },
    {
      body: createSchema,
      transform: [guardDrugStockWrite, refuseUnknownFields(WRITE_FIELDS)],
      detail: { tags: ['สต็อกยา'], summary: 'บันทึกปรับยอดสต็อกยา' },
    },
  )
