import { api } from '@/lib/api-client'

import type { Invoice, PaymentMethod, PromptPayQr } from './api'

/**
 * ใบเสร็จฝั่งลูกค้า — **รูปเดียวกับฝั่งพนักงาน บวกคิว**
 *
 * ลูกค้าจำวันที่มาคลินิกกับชื่อสัตว์ ไม่ได้จำเลขใบ · ลิสต์ที่มีแต่ `INV-20260901-0003`
 * ทำให้เขาไม่รู้ว่าใบไหนคือครั้งที่พาแมวมา
 */
export type MyInvoice = Invoice & {
  visit: {
    queueNumber: number
    /** `YYYY-MM-DD` */
    queueDate: string
    petName: string | null
  }
}

/**
 * `/api/my/invoices` — **ทุกเส้นกรองด้วย `ownerId` จากเซสชันที่ BE**
 *
 * ไม่มีพารามิเตอร์ `ownerId` ให้ส่งตั้งแต่ต้น · ที่นี่ส่งได้แค่เลขใบ และ BE ตรวจว่า
 * ใบนั้นเป็นของคนที่ล็อกอินอยู่จริงไหมก่อนตอบ
 */
/** บัญชีธนาคารสำหรับโอน — `configured: false` เมื่อคลินิกยังไม่ได้ตั้งค่า */
export type MyBankTransfer =
  | { configured: false }
  | { configured: true; bankName: string; accountNumber: string; accountName: string }

export const myInvoiceApi = {
  list: (page: number, pageSize: number) =>
    api.getPaged<MyInvoice>(`/api/my/invoices?page=${page}&pageSize=${pageSize}`),

  get: (id: number) => api.get<MyInvoice>(`/api/my/invoices/${id}`),

  qr: (id: number) => api.get<PromptPayQr>(`/api/my/invoices/${id}/qr`),

  bankTransfer: () => api.get<MyBankTransfer>('/api/my/invoices/bank-transfer'),

  /**
   * แจ้งโอนพร้อมสลิป — **ต้องแนบไฟล์เสมอ**
   *
   * ฝั่งลูกค้าไม่มีทางรับเงินสด · สลิปคือหลักฐานชิ้นเดียวที่บัญชีจะตรวจได้
   */
  uploadSlip: (
    id: number,
    input: {
      file: File
      method: Extract<PaymentMethod, 'PROMPTPAY' | 'TRANSFER'>
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

    return api.post<MyInvoice>(`/api/my/invoices/${id}/payments/slip`, form)
  },
}
