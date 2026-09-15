import { api } from '@/lib/api-client'

/**
 * สถานะของใบเสร็จ — **เดินทางเดียว ไม่ย้อน**
 *
 *   DRAFT → AWAITING_VERIFY → VERIFIED
 *                 ↓
 *             REJECTED (กลับไปแก้ได้)
 */
export type InvoiceStatus = 'DRAFT' | 'AWAITING_VERIFY' | 'VERIFIED' | 'REJECTED' | 'VOID'

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: 'กำลังเก็บเงิน',
  AWAITING_VERIFY: 'รอบัญชีตรวจ',
  VERIFIED: 'ยืนยันแล้ว',
  REJECTED: 'ถูกตีกลับ',
  VOID: 'ยกเลิก',
}

export const INVOICE_STATUS_STYLE: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  AWAITING_VERIFY: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  VERIFIED: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300',
  REJECTED: 'bg-red-100 text-red-800 ring-1 ring-red-300',
  VOID: 'bg-muted text-muted-foreground ring-1 ring-border',
}

export type PaymentMethod = 'CASH' | 'PROMPTPAY' | 'TRANSFER' | 'CARD'

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'เงินสด',
  PROMPTPAY: 'พร้อมเพย์',
  TRANSFER: 'โอน',
  CARD: 'บัตร',
}

/**
 * การจ่ายหนึ่งครั้ง
 *
 * **`hasSlip` ไม่ใช่ `slipPath`** — BE ไม่ส่ง path ออกมา · โหลดไฟล์ผ่าน
 * `/api/invoices/payments/:id/slip` ซึ่งมีการ์ด
 */
export type PaymentRow = {
  id: number
  method: PaymentMethod
  /** **ข้อความ ไม่ใช่ number** — เงินที่ผ่าน `number` เสียความแม่น */
  amount: string
  receivedAt: string
  reference: string | null
  promptpayRef: string | null
  hasSlip: boolean
  note: string | null
  /** ลูกค้าแนบเองหรือพนักงานบันทึก — บัญชีต้องแยกออก */
  byOwner: boolean
}

/**
 * บรรทัดบนใบเสร็จ — **สิ่งที่พนักงานอ่านให้ลูกค้าฟัง**
 *
 * (ผู้ใช้ทักท้วง 2026-09-01: "ไม่มีบอกรายละเอียดอะไรเลย จะไปแจ้งลูกค้ายังไง")
 *
 * ว่างในหน้าลิสต์ · มีเฉพาะตอนเปิดใบรายตัว
 */
export type InvoiceLine = {
  kind: 'service' | 'drug'
  name: string
  quantity: string
  unit: string | null
  unitPrice: string
  amount: string
  dosage: string | null
}

/**
 * คิวที่ใบนี้มาจาก — **บัญชีต้องรู้ว่า "ของใคร" ก่อนกดยืนยัน** (ผู้ใช้ขอ 2026-09-15)
 * ชื่อจริงถ้าลงทะเบียนแล้ว ไม่งั้นใช้ชื่อที่กรอกหน้างาน (`ownerPhone` เป็น `null`
 * เมื่อเป็นลูกค้า walk-in ที่ไม่มีทะเบียน)
 */
export type InvoiceVisitSummary = {
  queueNumber: number
  queueDate: string
  ownerName: string | null
  ownerPhone: string | null
  petName: string | null
}

export type Invoice = {
  id: number
  code: string
  visitId: number
  visit: InvoiceVisitSummary
  status: InvoiceStatus
  subtotal: string
  discount: string
  total: string
  paid: string
  /** ยอดที่ยังค้าง — BE คำนวณมาให้ ไม่ต้องลบเอง */
  outstanding: string
  note: string | null
  createdAt: string
  submittedAt: string | null
  submittedBy: number | null
  verifiedAt: string | null
  verifiedBy: number | null
  rejectReason: string | null
  lines: InvoiceLine[]
  payments: PaymentRow[]
}

export type PromptPayQr = {
  /** ข้อความที่เอาไปวาด QR — ฝั่งนี้วาดเอง ไม่ได้รับรูปมา */
  payload: string
  ref: string
  amount: string
}

export const invoiceApi = {
  list: (input: { status: InvoiceStatus | null; date: string | null; page: number; pageSize: number }) => {
    const search = new URLSearchParams({
      page: String(input.page),
      pageSize: String(input.pageSize),
    })
    if (input.status) search.set('status', input.status)
    if (input.date) search.set('date', input.date)

    return api.getPaged<Invoice>(`/api/invoices?${search.toString()}`)
  },

  get: (id: number) => api.get<Invoice>(`/api/invoices/${id}`),

  /** ใบของคิวหนึ่ง — `null` เมื่อยังไม่ได้ออกใบ */
  byVisit: (visitId: number) => api.get<Invoice | null>(`/api/invoices/by-visit/${visitId}`),

  qr: (id: number) => api.get<PromptPayQr>(`/api/invoices/${id}/qr`),

  issue: (body: { visitId: number; discount: string | null; note: string | null }) =>
    api.post<Invoice>('/api/invoices', body),

  addPayment: (
    id: number,
    body: {
      method: PaymentMethod
      amount: string
      reference: string | null
      promptpayRef: string | null
      note: string | null
    },
  ) => api.post<Invoice>(`/api/invoices/${id}/payments`, body),

  /**
   * รับเงินพร้อมแนบสลิป — **`FormData` ไม่ใช่ JSON**
   *
   * `api-client` ไม่ตั้ง `content-type` ให้เมื่อ body เป็น `FormData` เพราะเบราว์เซอร์
   * ต้องเติม boundary เอง
   */
  addPaymentWithSlip: (
    id: number,
    input: {
      file: File
      method: PaymentMethod
      amount: string
      reference: string | null
      promptpayRef: string | null
      note: string | null
    },
  ) => {
    const form = new FormData()
    form.append('file', input.file)
    form.append('method', input.method)
    form.append('amount', input.amount)
    if (input.reference) form.append('reference', input.reference)
    if (input.promptpayRef) form.append('promptpayRef', input.promptpayRef)
    if (input.note) form.append('note', input.note)

    return api.post<Invoice>(`/api/invoices/${id}/payments/slip`, form)
  },

  removePayment: (paymentId: number) => api.delete<null>(`/api/invoices/payments/${paymentId}`),

  submit: (id: number) => api.patch<Invoice>(`/api/invoices/${id}/submit`, {}),
  verify: (id: number) => api.patch<Invoice>(`/api/invoices/${id}/verify`, {}),
  reject: (id: number, reason: string) => api.patch<Invoice>(`/api/invoices/${id}/reject`, { reason }),
  void: (id: number) => api.patch<Invoice>(`/api/invoices/${id}/void`, {}),
}

/** ที่อยู่ของไฟล์สลิป — เปิดตรง ๆ ได้เพราะ cookie ไปด้วย */
export const slipUrl = (paymentId: number) =>
  `${process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3201'}/api/invoices/payments/${paymentId}/slip`

export const promptPayApi = {
  /** ตั้งค่าใน `.env` แล้วหรือยัง — หน้าเว็บถามก่อนวาดปุ่มจ่ายด้วย QR */
  status: () => api.get<{ configured: boolean }>('/api/promptpay/status'),
}
