import { Elysia, t } from 'elysia'
import { stat } from 'node:fs/promises'

import { invalid, notFound } from '../../kit/app-error.ts'
import { ok, paged } from '../../kit/response.ts'
import {
  getActor,
  guardBillingCollect,
  guardBillingRead,
  guardBillingVerify,
  guardSignedIn,
  parseId,
  refuseUnknownFields,
  refuseUnknownQuery,
} from '../../kit/route-guard.ts'
import { getOwnerActor, requireOwnerRow } from '../../kit/owner-actor.ts'
import {
  addPayment,
  findInvoiceByVisit,
  getInvoiceDetail,
  getMyInvoiceDetail,
  INVOICE_PAGE_SIZE,
  issueInvoice,
  listInvoices,
  listMyInvoices,
  makeInvoiceQr,
  rejectInvoice,
  removePayment,
  requireOwnInvoice,
  submitInvoice,
  verifyInvoice,
  voidInvoice,
  type InvoiceWithPayments,
  type MyInvoiceRow,
} from './payment.service.ts'
import { getBankTransferSettings, isBankTransferConfigured } from './bank-transfer.config.ts'
import { isPromptPayConfigured } from './promptpay.config.ts'
import { resolveSlipPath, SLIP_ALLOWED_MIME, SLIP_MAX_SIZE } from './payment.storage.ts'
import type { InvoiceStatus, PaymentMethod } from '../../../prisma/generated/client.ts'

/**
 * `/api/invoices` — การชำระเงิน
 *
 * **สองการ์ดต่างกันบนเส้นเดียวกัน** (ผู้ใช้กำหนด 2026-09-01):
 *
 *   `billing:collect`  ออกใบ · รับเงิน · แนบสลิป · ส่งยอด        — เคาน์เตอร์
 *   `billing:verify`   ยืนยัน · ตีกลับ                            — บัญชี
 *
 * นี่คือสองเส้นแรกที่ใช้ key ที่ประกาศไว้ตั้งแต่ตอนแยก permission
 */

const LIST_QUERY_KEYS = new Set(['status', 'date', 'page', 'pageSize'])
const ISSUE_FIELDS = new Set(['visitId', 'discount', 'note'])
const PAYMENT_FIELDS = new Set(['method', 'amount', 'reference', 'promptpayRef', 'note'])
const REJECT_FIELDS = new Set(['reason'])
/** ฟอร์มของเส้นแนบสลิป — ตรวจเองใน handler ดู `readSlipForm` */
const SLIP_FORM_FIELDS = new Set(['file', 'method', 'amount', 'reference', 'promptpayRef', 'note'])

const money = (v: { toFixed: (n: number) => string }) => v.toFixed(2)

/**
 * เงินออกเป็น **ข้อความ** เสมอ · BigInt เป็น `number`
 *
 * `Decimal` ที่ส่งเป็น `number` เสียความแม่นตอน JSON parse — และนี่คือใบเสร็จ
 */
const toWire = (row: InvoiceWithPayments) => ({
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
  /**
   * คิวที่ใบนี้มาจาก — **บัญชีต้องรู้ว่า "ของใคร" ก่อนกดยืนยัน** (ผู้ใช้ขอ 2026-09-15)
   * ไม่ใช่แค่เลขที่ใบกับยอดเงิน · ชื่อจริงถ้าลงทะเบียนแล้ว ไม่งั้นใช้ชื่อหน้างาน
   */
  visit: {
    queueNumber: row.visit.queueNumber,
    queueDate: row.visit.queueDate.toISOString().slice(0, 10),
    ownerName: row.visit.ownerName,
    ownerPhone: row.visit.ownerPhone,
    petName: row.visit.petName,
  },
  /** รายการที่คิดเงิน — ว่างในหน้าลิสต์ (ดู `listInvoices`) */
  lines: row.lines,
  payments: row.payments.map((p) => ({
    id: Number(p.id),
    method: p.method,
    amount: money(p.amount),
    receivedAt: p.receivedAt.toISOString(),
    reference: p.reference,
    promptpayRef: p.promptpayRef,
    /** **ไม่ส่ง path ออกไป** — หน้าเว็บโหลดผ่าน `/:id/slip` ซึ่งมีการ์ด */
    hasSlip: p.slipPath !== null,
    note: p.note,
    /** ลูกค้าแนบเองหรือพนักงานบันทึก — บัญชีต้องแยกออก */
    byOwner: p.createdByOwnerAccountId !== null,
  })),
})

function parseCount(raw: string | undefined, field: string): number | undefined {
  if (raw === undefined) return undefined
  if (!/^\d+$/.test(raw)) throw invalid(`${field} ต้องเป็นตัวเลข`, { [field]: raw })

  return Number(raw)
}

const methodSchema = t.Union([
  t.Literal('CASH'),
  t.Literal('PROMPTPAY'),
  t.Literal('TRANSFER'),
  t.Literal('CARD'),
])

/**
 * อ่านฟอร์มของเส้นแนบสลิป
 *
 * **`ctx.body` ของ multipart เป็น object ธรรมดา ไม่ใช่ `FormData`** — Elysia แปลงให้แล้ว
 * โดยค่าของช่องที่เป็นไฟล์เป็น `File` · `form.keys()` จึงใช้ไม่ได้
 *
 * **ตรวจคีย์แปลกปลอมเอง** — `refuseUnknownFields` มีไว้ให้ `transform` ของเส้นที่รับ
 * JSON · ที่นี่ตรวจใน handler ได้เพราะเส้นนี้ไม่ประกาศ schema ของ body
 */
function readSlipForm(body: unknown): {
  file: File
  method: PaymentMethod
  amount: string
  reference: string | null
  promptpayRef: string | null
  note: string | null
} {
  if (body === null || typeof body !== 'object') {
    throw invalid('ต้องส่งมาเป็นฟอร์ม', { field: 'body' })
  }

  const form = body as Record<string, unknown>
  for (const key of Object.keys(form)) {
    if (!SLIP_FORM_FIELDS.has(key)) throw invalid(`ไม่รู้จักฟิลด์ "${key}"`, { key })
  }

  const file = form['file']
  if (!(file instanceof File)) throw invalid('ต้องแนบไฟล์สลิปมาด้วย', { field: 'file' })

  const method = form['method']
  if (method !== 'PROMPTPAY' && method !== 'TRANSFER' && method !== 'CARD') {
    throw invalid('แนบสลิปได้เฉพาะการโอน พร้อมเพย์ หรือบัตร', { field: 'method' })
  }

  const amount = form['amount']
  if (typeof amount !== 'string') throw invalid('ระบุจำนวนเงิน', { field: 'amount' })

  const text = (key: string) => {
    const v = form[key]

    return typeof v === 'string' && v.trim().length > 0 ? v : null
  }

  return {
    file,
    method,
    amount,
    reference: text('reference'),
    promptpayRef: text('promptpayRef'),
    note: text('note'),
  }
}

export const invoiceRoutes = new Elysia({ prefix: '/api/invoices' })
  .get(
    '/',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, LIST_QUERY_KEYS)

      const result = await listInvoices({
        status: query.status as InvoiceStatus | undefined,
        date: query.date,
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
      beforeHandle: guardBillingRead,
      query: t.Object({
        status: t.Optional(t.String()),
        date: t.Optional(t.String()),
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
      }),
      detail: { tags: ['การเงิน'], summary: 'ดูรายการใบเสร็จ' },
    },
  )

  /** ใบเสร็จของคิวหนึ่ง — `null` เมื่อยังไม่ได้ออกใบ · ประกาศก่อน `/:id` */
  .get(
    '/by-visit/:visitId',
    async ({ params }) => {
      const row = await findInvoiceByVisit(parseId(params.visitId))

      return ok(row === null ? null : toWire(row))
    },
    {
      beforeHandle: guardBillingRead,
      detail: { tags: ['การเงิน'], summary: 'ใบเสร็จของคิวหนึ่ง' },
    },
  )

  .get('/:id', async ({ params }) => ok(toWire(await getInvoiceDetail(parseId(params.id)))), {
    beforeHandle: guardBillingRead,
    detail: { tags: ['การเงิน'], summary: 'ดูใบเสร็จรายใบ' },
  })

  /**
   * QR พร้อมเพย์ตามยอดค้าง — **เส้นของพนักงาน**
   *
   * เคยเป็น `guardSignedIn` เพราะยังไม่มีเส้นฝั่งลูกค้า · แต่ `guardSignedIn` แปลว่า
   * ลูกค้าคนไหนก็ขอ QR ของใบใครก็ได้ด้วยการเดาเลข ซึ่งบอกยอดหนี้ของคนอื่นออกไป ·
   * ตอนนี้ลูกค้าใช้ `/api/my/invoices/:id/qr` ซึ่งกรองความเป็นเจ้าของก่อน (2026-09-01)
   */
  .get(
    '/:id/qr',
    async ({ params }) => ok(await makeInvoiceQr(parseId(params.id))),
    {
      beforeHandle: guardBillingRead,
      detail: { tags: ['การเงิน'], summary: 'QR พร้อมเพย์ตามยอดค้าง' },
    },
  )

  /**
   * ไฟล์สลิป — **ส่งไฟล์ตรง ไม่ใช่ path**
   *
   * path ที่หลุดออกไปแปลว่ามีคนเดาชื่อไฟล์อื่นได้ · ที่นี่ตรวจสิทธิ์แล้วส่งไบต์ไปเลย
   */
  .get(
    '/payments/:paymentId/slip',
    async ({ params, set }) => {
      const { db } = await import('../../kit/db.ts')
      const row = await db.payment.findUnique({
        where: { id: parseId(params.paymentId) },
        select: { slipPath: true },
      })
      if (!row?.slipPath) throw notFound('ไม่มีสลิปของรายการนี้')

      const abs = resolveSlipPath(row.slipPath)
      if (abs === null) throw notFound('ไม่พบไฟล์')

      try {
        await stat(abs)
      } catch {
        throw notFound('ไฟล์หายไปจากที่เก็บ')
      }

      // เบราว์เซอร์อ่านชนิดจากนามสกุลไม่ได้ — บอกไปตรง ๆ
      const ext = abs.slice(abs.lastIndexOf('.'))
      const type =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.pdf'
              ? 'application/pdf'
              : 'image/jpeg'

      set.headers['content-type'] = type

      return Bun.file(abs)
    },
    {
      beforeHandle: guardBillingRead,
      detail: { tags: ['การเงิน'], summary: 'ดาวน์โหลดสลิป' },
    },
  )

  /** ออกใบเสร็จจากคิวที่ตรวจเสร็จแล้ว */
  .post(
    '/',
    async ({ body, set, ...ctx }) => {
      const actor = await getActor(ctx)
      set.status = 201

      const row = await issueInvoice(
        BigInt(body.visitId),
        { discount: body.discount ?? null, note: body.note ?? null },
        actor.userId,
      )

      // คืนใบเต็มพร้อมรายการ — หน้าจอต้องบอกลูกค้าได้ทันทีว่าคิดค่าอะไรบ้าง
      return ok(toWire(await getInvoiceDetail(row.id)))
    },
    {
      body: t.Object(
        {
          visitId: t.Number(),
          discount: t.Optional(t.Union([t.String(), t.Null()])),
          note: t.Optional(t.Union([t.String(), t.Null()])),
        },
        { additionalProperties: false },
      ),
      transform: [guardBillingCollect, refuseUnknownFields(ISSUE_FIELDS)],
      detail: { tags: ['การเงิน'], summary: 'ออกใบเสร็จ' },
    },
  )

  /** รับเงิน — **ไม่มีสลิป** · แนบสลิปใช้เส้น `/:id/payments/slip` */
  .post(
    '/:id/payments',
    async ({ params, body, set, ...ctx }) => {
      const actor = await getActor(ctx)
      set.status = 201

      await addPayment(
        {
          invoiceId: parseId(params.id),
          method: body.method,
          amount: body.amount,
          reference: body.reference ?? null,
          promptpayRef: body.promptpayRef ?? null,
          note: body.note ?? null,
        },
        { kind: 'staff', userId: actor.userId },
      )

      return ok(toWire(await getInvoiceDetail(parseId(params.id))))
    },
    {
      body: t.Object(
        {
          method: methodSchema,
          amount: t.String(),
          reference: t.Optional(t.Union([t.String(), t.Null()])),
          promptpayRef: t.Optional(t.Union([t.String(), t.Null()])),
          note: t.Optional(t.Union([t.String(), t.Null()])),
        },
        { additionalProperties: false },
      ),
      transform: [guardBillingCollect, refuseUnknownFields(PAYMENT_FIELDS)],
      detail: { tags: ['การเงิน'], summary: 'บันทึกการรับเงิน' },
    },
  )

  /**
   * รับเงินพร้อมแนบสลิป — **เส้นเดียวในโมดูลนี้ที่รับ `multipart/form-data`**
   *
   * **การ์ดอยู่ที่ `transform` ไม่ใช่ `beforeHandle`** · `transform` ทำงานก่อนขั้นตอน
   * ที่แปลง body ส่วน `beforeHandle` ทำหลังจากนั้น — วางผิดที่แปลว่าคำขอที่ไม่ได้
   * ล็อกอินจะได้ 201 กลับไปพร้อมไฟล์ที่เข้าที่เก็บเรียบร้อยแล้ว (PMK วัดไว้ 2026-08-29)
   *
   * **ไม่ประกาศ `body` schema โดยตั้งใจ** — ประกาศเมื่อไหร่ Elysia ตัดคีย์ที่ไม่ได้อยู่
   * ในนั้นทิ้งก่อนถึง handler แล้วฟอร์มที่แนบคีย์เกินจะได้ 201 แทนที่จะถูกปฏิเสธ
   */
  .post(
    '/:id/payments/slip',
    async (ctx) => {
      const actor = await getActor(ctx)
      const form = readSlipForm(ctx.body)

      if (form.file.size > SLIP_MAX_SIZE) {
        throw invalid(`สลิปใหญ่เกิน ${Math.floor(SLIP_MAX_SIZE / 1024 / 1024)} MB`, {
          field: 'file',
        })
      }

      const bytes = new Uint8Array(await form.file.arrayBuffer())
      const invoiceId = parseId(ctx.params.id)

      await addPayment(
        {
          invoiceId,
          method: form.method,
          amount: form.amount,
          reference: form.reference,
          promptpayRef: form.promptpayRef,
          note: form.note,
          slip: { mimeType: form.file.type, bytes },
        },
        { kind: 'staff', userId: actor.userId },
      )

      ctx.set.status = 201

      return ok(toWire(await getInvoiceDetail(invoiceId)))
    },
    {
      transform: guardBillingCollect,
      detail: { tags: ['การเงิน'], summary: 'รับเงินพร้อมแนบสลิป' },
    },
  )

  .delete(
    '/payments/:paymentId',
    async ({ params, ...ctx }) => {
      const actor = await getActor(ctx)
      await removePayment(parseId(params.paymentId), actor.userId)

      return ok(null)
    },
    {
      transform: guardBillingCollect,
      detail: { tags: ['การเงิน'], summary: 'เอารายการจ่ายออก' },
    },
  )

  /** เคาน์เตอร์ส่งยอดให้บัญชีตรวจ — **ล็อกไม่ให้แก้หลังจากนี้** */
  .patch(
    '/:id/submit',
    async ({ params, ...ctx }) => {
      const actor = await getActor(ctx)
      await submitInvoice(parseId(params.id), actor.userId)

      return ok(toWire(await getInvoiceDetail(parseId(params.id))))
    },
    {
      transform: guardBillingCollect,
      detail: { tags: ['การเงิน'], summary: 'ส่งยอดให้บัญชี' },
    },
  )

  /**
   * บัญชียืนยันยอด — **`billing:verify` ไม่ใช่ `collect`**
   *
   * นี่คือจุดที่ recheck เกิดขึ้นจริง · service ปฏิเสธอีกชั้นถ้าคนยืนยันคือคนที่ส่ง
   */
  .patch(
    '/:id/verify',
    async ({ params, ...ctx }) => {
      const actor = await getActor(ctx)
      await verifyInvoice(parseId(params.id), actor.userId)

      return ok(toWire(await getInvoiceDetail(parseId(params.id))))
    },
    {
      transform: guardBillingVerify,
      detail: { tags: ['การเงิน'], summary: 'บัญชียืนยันยอด' },
    },
  )

  .patch(
    '/:id/reject',
    async ({ params, body, ...ctx }) => {
      const actor = await getActor(ctx)
      await rejectInvoice(parseId(params.id), body.reason, actor.userId)

      return ok(toWire(await getInvoiceDetail(parseId(params.id))))
    },
    {
      body: t.Object({ reason: t.String() }, { additionalProperties: false }),
      transform: [guardBillingVerify, refuseUnknownFields(REJECT_FIELDS)],
      detail: { tags: ['การเงิน'], summary: 'บัญชีตีกลับ' },
    },
  )

  .patch(
    '/:id/void',
    async ({ params, ...ctx }) => {
      const actor = await getActor(ctx)
      await voidInvoice(parseId(params.id), actor.userId)

      return ok(toWire(await getInvoiceDetail(parseId(params.id))))
    },
    {
      transform: guardBillingCollect,
      detail: { tags: ['การเงิน'], summary: 'ยกเลิกใบเสร็จ' },
    },
  )

/**
 * สถานะการตั้งค่าพร้อมเพย์ — **อ่านอย่างเดียว ไม่มีเส้นแก้**
 *
 * (ผู้ใช้กำหนด 2026-09-01: "ตั้งค่าเบอร์ที่ใช้รับที่ env")
 *
 * ค่าอยู่ใน `.env` ของเครื่องที่รัน · เปลี่ยนบัญชีปลายทางคือการ deploy ไม่ใช่การกดปุ่ม
 * — ดู `///` บน `promptpay.config.ts`
 *
 * **ไม่ส่งเบอร์ออกไป** ส่งแค่ว่าตั้งแล้วหรือยัง · หน้าเว็บใช้ตัดสินว่าจะวาดปุ่ม
 * "จ่ายด้วย QR" ไหม — ปุ่มที่กดแล้วเจอ error คือปุ่มที่ไม่ควรมีให้กด
 */
export const promptPayRoutes = new Elysia({ prefix: '/api/promptpay' }).get(
  '/status',
  () => ok({ configured: isPromptPayConfigured() }),
  {
    beforeHandle: guardSignedIn,
    detail: { tags: ['การเงิน'], summary: 'ตั้งค่าพร้อมเพย์แล้วหรือยัง' },
  },
)

export { INVOICE_PAGE_SIZE, SLIP_ALLOWED_MIME, SLIP_MAX_SIZE }

/* ------------------------------------------------------------------ *
 * ฝั่งลูกค้า
 * ------------------------------------------------------------------ */

const MY_LIST_QUERY_KEYS = new Set(['page', 'pageSize'])

/** เหมือน `toWire` แต่พ่วงคิวมาด้วย — ลูกค้าจำวันกับชื่อสัตว์ ไม่ได้จำเลขใบ */
const toMyWire = (row: MyInvoiceRow) => ({
  ...toWire(row),
  visit: {
    queueNumber: row.visit.queueNumber,
    queueDate: row.visit.queueDate.toISOString().slice(0, 10),
    petName: row.visit.petName,
  },
})

/**
 * `/api/my/invoices` — **ลูกค้าดูและจ่ายใบของตัวเอง**
 *
 * (ผู้ใช้กำหนด 2026-09-01: "ลูกค้ากดที่หน้าจอตัวเองด้วย แล้วสแกน QR อัปโหลด
 * หลักฐานเองได้ โหลดรูป QR ได้เพื่อเอาไปจ่ายในแอปธนาคาร")
 *
 * **ทุกเส้นเรียก `requireOwnInvoice` ก่อนแตะข้อมูล** · การ์ดฝั่งนี้ไม่ใช่ permission key
 * แต่เป็นการกรองด้วย `ownerId` จากเซสชัน — ดู `owner-actor.ts`
 *
 * **ลูกค้าแนบสลิปได้ แต่ส่งยอดให้บัญชีไม่ได้** · การส่งยอดคือการที่เคาน์เตอร์รับรอง
 * ว่าเก็บครบแล้ว ซึ่งเป็นครึ่งแรกของ maker-checker · ให้ลูกค้ากดเองแปลว่าไม่มี
 * พนักงานคนไหนรับรอง แล้วบัญชีจะยืนยันสิ่งที่ไม่มีใครตรวจมาก่อน
 */
export const myInvoiceRoutes = new Elysia({ prefix: '/api/my/invoices' })
  .get(
    '/',
    async (ctx) => {
      const { query, request } = ctx
      refuseUnknownQuery(request.url, MY_LIST_QUERY_KEYS)

      const actor = await getOwnerActor(ctx)
      const owner = await requireOwnerRow(actor.accountId)

      const result = await listMyInvoices(owner.id, {
        page: parseCount(query.page, 'page'),
        pageSize: parseCount(query.pageSize, 'pageSize'),
      })

      return paged(result.rows.map(toMyWire), {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      })
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
      }),
      detail: { tags: ['ลูกค้า'], summary: 'ใบเสร็จของฉัน' },
    },
  )

  /**
   * บัญชีธนาคารสำหรับโอน — **ประกาศก่อน `/:id` เสมอ** ไม่งั้น `bank-transfer`
   * ถูกอ่านเป็นเลขใบ แล้ว `parseId` ปฏิเสธด้วย 400 ก่อนจะถึงเส้นนี้เลย
   */
  .get(
    '/bank-transfer',
    async (ctx) => {
      await getOwnerActor(ctx)

      if (!isBankTransferConfigured()) return ok({ configured: false as const })

      return ok({ configured: true as const, ...getBankTransferSettings() })
    },
    { detail: { tags: ['ลูกค้า'], summary: 'บัญชีธนาคารสำหรับโอนเงิน' } },
  )

  .get(
    '/:id',
    async ({ params, ...ctx }) => {
      const actor = await getOwnerActor(ctx)
      const owner = await requireOwnerRow(actor.accountId)

      return ok(toMyWire(await getMyInvoiceDetail(owner.id, parseId(params.id))))
    },
    { detail: { tags: ['ลูกค้า'], summary: 'ใบเสร็จของฉันรายใบ' } },
  )

  /** QR ของใบตัวเอง — **กรองความเป็นเจ้าของก่อน** ต่างจากเส้นฝั่งพนักงาน */
  .get(
    '/:id/qr',
    async ({ params, ...ctx }) => {
      const actor = await getOwnerActor(ctx)
      const owner = await requireOwnerRow(actor.accountId)
      const id = parseId(params.id)

      await requireOwnInvoice(owner.id, id)

      return ok(await makeInvoiceQr(id))
    },
    { detail: { tags: ['ลูกค้า'], summary: 'QR ของใบฉัน' } },
  )

  /**
   * ลูกค้าแจ้งโอนพร้อมสลิป — **ต้องแนบไฟล์เสมอ**
   *
   * ฝั่งพนักงานรับเงินโดยไม่แนบสลิปได้ เพราะเงินสดอยู่ในลิ้นชักแล้วและมีคนรับผิดชอบ ·
   * ที่นี่ไม่มีใครเห็นเงิน · สลิปคือหลักฐานชิ้นเดียวที่บัญชีจะตรวจได้ ไม่มีสลิปก็ไม่มี
   * อะไรให้ตรวจ
   */
  .post(
    '/:id/payments/slip',
    async (ctx) => {
      const actor = await getOwnerActor(ctx)
      const owner = await requireOwnerRow(actor.accountId)
      const invoiceId = parseId(ctx.params.id)

      await requireOwnInvoice(owner.id, invoiceId)

      const form = readSlipForm(ctx.body)

      if (form.file.size > SLIP_MAX_SIZE) {
        throw invalid(`สลิปใหญ่เกิน ${Math.floor(SLIP_MAX_SIZE / 1024 / 1024)} MB`, {
          field: 'file',
        })
      }

      const bytes = new Uint8Array(await form.file.arrayBuffer())

      await addPayment(
        {
          invoiceId,
          method: form.method,
          amount: form.amount,
          reference: form.reference,
          promptpayRef: form.promptpayRef,
          note: form.note,
          slip: { mimeType: form.file.type, bytes },
        },
        { kind: 'owner', accountId: actor.accountId },
      )

      ctx.set.status = 201

      return ok(toMyWire(await getMyInvoiceDetail(owner.id, invoiceId)))
    },
    {
      /**
       * **การ์ดอยู่ใน `transform` ไม่ใช่ `beforeHandle`**
       *
       * `beforeHandle` ทำงาน**หลัง**ตัว parse body — คำขอที่ไม่ได้ล็อกอินจะเขียนไฟล์
       * ลงดิสก์เสร็จแล้วถึงจะโดนปฏิเสธ (PMK วัดไว้ 2026-08-29)
       */
      transform: async (ctx) => {
        await getOwnerActor(ctx as never)
      },
      detail: { tags: ['ลูกค้า'], summary: 'ลูกค้าแจ้งโอนพร้อมสลิป' },
    },
  )
