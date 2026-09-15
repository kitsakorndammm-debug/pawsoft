import { Elysia, t } from 'elysia'

import { ok } from '../../kit/response.ts'
import {
  getActor,
  guardDrugWarehouseRead,
  guardDrugWarehouseWrite,
  parseId,
  refuseUnknownFields,
  refuseUnknownQuery,
} from '../../kit/route-guard.ts'
import {
  createWarehouseStockMovement,
  listWarehouseStockBalances,
  listWarehouseStockMovements,
  withdrawFromWarehouse,
  type WarehouseStockBalance,
  type WarehouseStockMovementRow,
} from './warehouse-stock.service.ts'
import type { WarehouseStockMovement } from '../../../prisma/generated/client.ts'

/**
 * คลังยา
 *
 * **ใช้สิทธิ์ของตัวเอง (`drug-warehouse`) แยกจาก `drug-stock`** (ผู้ใช้ตัดสิน 2026-09-15) —
 * ดู `///` บน `DRUG_WAREHOUSE_PERMISSION`
 *
 * **เส้น `POST /` รับได้แค่ `RECEIVE`/`ADJUST`** — `WITHDRAW` เป็นของที่
 * `POST /withdraw` สร้างเองเท่านั้น
 */

const LIST_QUERY_KEYS = new Set(['q'])
const WRITE_FIELDS = new Set(['drugId', 'type', 'quantity', 'reason'])
const WITHDRAW_FIELDS = new Set(['drugId', 'quantity', 'reason', 'expiresOn'])

/** BigInt ออกเป็น `number` · จำนวนออกเป็น `string` — เหตุผลเดียวกับ `drug-stock.routes.ts` */
const toWire = (row: WarehouseStockBalance) => ({
  id: Number(row.drugId),
  name: row.name,
  code: row.code,
  unit: row.unit,
  isActive: row.isActive,
  quantity: row.quantity.toString(),
})

const movementToWire = (row: WarehouseStockMovement) => ({
  id: Number(row.id),
  drugId: Number(row.drugId),
  type: row.type,
  quantity: row.quantity.toString(),
  reason: row.reason,
  createdAt: row.createdAt.toISOString(),
})

const movementRowToWire = (row: WarehouseStockMovementRow) => ({
  id: Number(row.id),
  type: row.type,
  quantity: row.quantity.toString(),
  reason: row.reason,
  createdAt: row.createdAt.toISOString(),
  createdByName: row.createdByName,
})

const createSchema = t.Object(
  {
    drugId: t.Number(),
    type: t.Union([t.Literal('RECEIVE'), t.Literal('ADJUST')]),
    quantity: t.String(),
    reason: t.Optional(t.Union([t.String(), t.Null()])),
  },
  { additionalProperties: false },
)

const withdrawSchema = t.Object(
  {
    drugId: t.Number(),
    quantity: t.String(),
    reason: t.Optional(t.Union([t.String(), t.Null()])),
    expiresOn: t.Optional(t.Union([t.String(), t.Null()])),
  },
  { additionalProperties: false },
)

export const warehouseStockRoutes = new Elysia({ prefix: '/api/warehouse-stock' })
  .get(
    '/',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, LIST_QUERY_KEYS)

      const rows = await listWarehouseStockBalances({ q: query.q })

      return ok(rows.map(toWire))
    },
    {
      beforeHandle: guardDrugWarehouseRead,
      query: t.Object({ q: t.Optional(t.String()) }),
      detail: { tags: ['คลังยา'], summary: 'ดูยอดคงเหลือคลังยา' },
    },
  )

  /** ประกาศก่อน `/` เปล่า ๆ ไม่ต้อง — path มี `:drugId` แยกจาก root อยู่แล้ว ไม่ชนกัน */
  .get(
    '/:drugId/movements',
    async ({ params }) => {
      const rows = await listWarehouseStockMovements({ drugId: parseId(params.drugId) })

      return ok(rows.map(movementRowToWire))
    },
    {
      beforeHandle: guardDrugWarehouseRead,
      detail: { tags: ['คลังยา'], summary: 'ดูประวัติการเคลื่อนไหวของยาตัวเดียวในคลัง' },
    },
  )

  .post(
    '/',
    async ({ body, set, ...ctx }) => {
      const actor = await getActor(ctx)
      set.status = 201

      const created = await createWarehouseStockMovement(
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
      transform: [guardDrugWarehouseWrite, refuseUnknownFields(WRITE_FIELDS)],
      detail: { tags: ['คลังยา'], summary: 'บันทึกซื้อเข้า/ปรับยอดคลังยา' },
    },
  )

  .post(
    '/withdraw',
    async ({ body, set, ...ctx }) => {
      const actor = await getActor(ctx)
      set.status = 201

      const created = await withdrawFromWarehouse(
        {
          drugId: BigInt(body.drugId),
          quantity: body.quantity,
          reason: body.reason ?? null,
          expiresOn: body.expiresOn ?? null,
        },
        actor.userId,
      )

      return ok(movementToWire(created))
    },
    {
      body: withdrawSchema,
      transform: [guardDrugWarehouseWrite, refuseUnknownFields(WITHDRAW_FIELDS)],
      detail: {
        tags: ['คลังยา'],
        summary: 'เบิกจากคลังยา → เติมสต็อกที่หมอใช้จ่ายคนไข้',
      },
    },
  )
