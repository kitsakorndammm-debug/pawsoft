import { Elysia, t } from 'elysia'
import { invalid } from '../../kit/app-error.ts'
import { getInvoiceDetail, listInvoices } from '../payment/payment.service.ts'
import { getVisitBill } from '../visit/visit-item.service.ts'
import { ok, paged } from '../../kit/response.ts'
import { guardSignedIn, parseId, parseIdFilter, refuseUnknownQuery } from '../../kit/route-guard.ts'
import { listDrugHistory, listVisitHistory, type DrugHistoryRow, type VisitHistoryRow } from './history.service.ts'
import type { InvoiceWithPayments } from '../payment/payment.service.ts'
import type { VisitStatus } from '../../../prisma/generated/client.ts'

/**
 * ประวัติ — **หน้าใหม่แยกจากหน้าทำงานเดิม เปิดให้พนักงานทุกคนดูได้** (ผู้ใช้ตัดสิน
 * 2026-09-18: "เข้าระบบได้ก็ดูได้เลย ไม่ต้องมีสิทธิ์พิเศษ")
 *
 * **ทุกเส้นที่นี่ใช้ `guardSignedIn` เท่านั้น ไม่ใช่ `guardDrugStockRead`/
 * `guardBillingRead`/`guardReceptionRead`** — หน้าทำงานเดิม (สต็อกยา/การเงิน/คิว) ยัง
 * ต้องมีสิทธิ์เฉพาะเหมือนเดิมทุกอย่าง ที่นี่แค่ "ดูย้อนหลังอย่างเดียว" ยืมข้อมูลจาก
 * service ของโมดูลนั้น ๆ มาแสดง ไม่ยุ่งกับ business logic ของมันเลย
 */

const money = (v: { toFixed: (n: number) => string }) => v.toFixed(2)

function parseCount(raw: string | undefined, field: string): number | undefined {
  if (raw === undefined) return undefined
  if (!/^\d+$/.test(raw)) throw invalid(`${field} ต้องเป็นตัวเลข`, { [field]: raw })

  return Number(raw)
}

const drugToWire = (r: DrugHistoryRow) => ({
  id: Number(r.id),
  createdAt: r.createdAt.toISOString(),
  type: r.type,
  drugName: r.drugName,
  drugUnit: r.drugUnit,
  quantity: r.quantity.toString(),
  reason: r.reason,
  createdByName: r.createdByName,
  patient:
    r.patient === null
      ? null
      : {
          visitId: r.patient.visitId,
          queueNumber: r.patient.queueNumber,
          queueDate: r.patient.queueDate.toISOString().slice(0, 10),
          petName: r.patient.petName,
          ownerName: r.patient.ownerName,
        },
})

const DRUG_LIST_QUERY_KEYS = new Set(['page', 'pageSize'])

const invoiceToWire = (row: InvoiceWithPayments) => ({
  id: Number(row.id),
  code: row.code,
  visitId: Number(row.visitId),
  status: row.status,
  subtotal: money(row.subtotal),
  discount: money(row.discount),
  total: money(row.total),
  paid: money(row.paid),
  outstanding: money(row.total.sub(row.paid)),
  note: row.note,
  createdAt: row.createdAt.toISOString(),
  submittedAt: row.submittedAt?.toISOString() ?? null,
  submittedBy: row.submittedBy === null ? null : Number(row.submittedBy),
  verifiedAt: row.verifiedAt?.toISOString() ?? null,
  verifiedBy: row.verifiedBy === null ? null : Number(row.verifiedBy),
  rejectReason: row.rejectReason,
  visit: {
    queueNumber: row.visit.queueNumber,
    queueDate: row.visit.queueDate.toISOString().slice(0, 10),
    ownerName: row.visit.ownerName,
    ownerPhone: row.visit.ownerPhone,
    petName: row.visit.petName,
  },
  lines: row.lines,
  payments: row.payments.map((p) => ({
    id: Number(p.id),
    method: p.method,
    amount: money(p.amount),
    receivedAt: p.receivedAt.toISOString(),
    reference: p.reference,
    promptpayRef: p.promptpayRef,
    hasSlip: p.slipPath !== null,
    note: p.note,
    byOwner: p.createdByOwnerAccountId !== null,
  })),
})

const PAYMENT_LIST_QUERY_KEYS = new Set(['status', 'date', 'page', 'pageSize'])

const toDate = (d: Date) => d.toISOString().slice(0, 10)
const num = (v: bigint | null) => (v === null ? null : Number(v))

const visitToWire = (row: VisitHistoryRow) => ({
  id: Number(row.id),
  queueNumber: row.queueNumber,
  queueDate: toDate(row.queueDate),
  triage: row.triage,
  status: row.status,
  ownerId: num(row.ownerId),
  petId: num(row.petId),
  petName: row.petName,
  ownerName: row.ownerName,
  walkInPetName: row.walkInPetName,
  walkInOwnerName: row.walkInOwnerName,
  symptom: row.symptom,
  weightKg: row.weightKg === null ? null : row.weightKg.toString(),
  arrivedAt: row.arrivedAt.toISOString(),
  calledAt: row.calledAt === null ? null : row.calledAt.toISOString(),
  doneAt: row.doneAt === null ? null : row.doneAt.toISOString(),
  diagnosis: row.diagnosis,
  note: row.note,
})

const VISIT_LIST_QUERY_KEYS = new Set(['petId', 'ownerId', 'status', 'date', 'page', 'pageSize'])

export const historyRoutes = new Elysia({ prefix: '/api/history' })
  .get(
    '/drugs',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, DRUG_LIST_QUERY_KEYS)

      const result = await listDrugHistory({
        page: parseCount(query.page, 'page'),
        pageSize: parseCount(query.pageSize, 'pageSize'),
      })

      return paged(result.rows.map(drugToWire), {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      })
    },
    {
      beforeHandle: guardSignedIn,
      query: t.Object({ page: t.Optional(t.String()), pageSize: t.Optional(t.String()) }),
      detail: { tags: ['ประวัติ'], summary: 'ประวัติการเบิก/จ่าย/รับเข้ายา ทุกตัว' },
    },
  )

  .get(
    '/payments',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, PAYMENT_LIST_QUERY_KEYS)

      const result = await listInvoices({
        status: query.status as never,
        date: query.date,
        page: parseCount(query.page, 'page'),
        pageSize: parseCount(query.pageSize, 'pageSize'),
      })

      return paged(result.rows.map(invoiceToWire), {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      })
    },
    {
      beforeHandle: guardSignedIn,
      query: t.Object({
        status: t.Optional(t.String()),
        date: t.Optional(t.String()),
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
      }),
      detail: { tags: ['ประวัติ'], summary: 'ประวัติใบเสร็จ/การชำระเงินทั้งหมด' },
    },
  )

  .get(
    '/payments/:id',
    async ({ params }) => ok(invoiceToWire(await getInvoiceDetail(parseId(params.id)))),
    {
      beforeHandle: guardSignedIn,
      detail: { tags: ['ประวัติ'], summary: 'ดูใบเสร็จรายใบ' },
    },
  )

  .get(
    '/visits',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, VISIT_LIST_QUERY_KEYS)

      const result = await listVisitHistory({
        petId: parseIdFilter(query.petId, 'petId'),
        ownerId: parseIdFilter(query.ownerId, 'ownerId'),
        status: query.status as VisitStatus | undefined,
        date: query.date,
        page: parseCount(query.page, 'page'),
        pageSize: parseCount(query.pageSize, 'pageSize'),
      })

      return paged(result.rows.map(visitToWire), {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      })
    },
    {
      beforeHandle: guardSignedIn,
      query: t.Object({
        petId: t.Optional(t.String()),
        ownerId: t.Optional(t.String()),
        status: t.Optional(t.String()),
        date: t.Optional(t.String()),
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
      }),
      detail: { tags: ['ประวัติ'], summary: 'ประวัติการรักษา' },
    },
  )

  .get(
    '/visits/:id/bill',
    async ({ params }) => {
      const bill = await getVisitBill(parseId(params.id))

      return ok({
        services: bill.services.map((r) => ({
          id: Number(r.id),
          serviceItemId: Number(r.serviceItemId),
          name: r.nameSnapshot,
          quantity: r.quantity,
          unitPrice: r.unitPrice.toString(),
        })),
        drugs: bill.drugs.map((r) => ({
          id: Number(r.id),
          drugId: Number(r.drugId),
          name: r.nameSnapshot,
          unit: r.unitSnapshot,
          quantity: r.quantity.toString(),
          unitPrice: r.unitPrice.toString(),
          dosage: r.dosage,
        })),
        total: bill.total,
      })
    },
    {
      beforeHandle: guardSignedIn,
      detail: { tags: ['ประวัติ'], summary: 'รายการและยอดรวมของคิวหนึ่งใบ' },
    },
  )
