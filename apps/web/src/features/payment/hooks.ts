'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { invoiceApi, promptPayApi, type InvoiceStatus, type PaymentMethod } from './api'

export const INVOICE_ROOT = ['invoice'] as const
export const INVOICE_PAGE_SIZE = 50

export function useInvoices(
  input: {
    status: InvoiceStatus | null
    date: string | null
    page: number
  },
  /** `refetchInterval` — ใช้กับจอที่ต้องรู้ทันทีว่ามีบิลรอตรวจใหม่เข้ามา (กระดิ่งแจ้งเตือน) */
  options?: { refetchInterval?: number },
) {
  return useQuery({
    queryKey: [...INVOICE_ROOT, 'list', input.status, input.date, input.page],
    queryFn: () => invoiceApi.list({ ...input, pageSize: INVOICE_PAGE_SIZE }),
    placeholderData: (previous) => previous,
    refetchInterval: options?.refetchInterval,
  })
}

export function useInvoice(id: number | null) {
  return useQuery({
    queryKey: [...INVOICE_ROOT, 'one', id],
    queryFn: () => invoiceApi.get(id!),
    enabled: id !== null,
  })
}

/**
 * ใบเสร็จของคิวหนึ่ง — **`null` แปลว่ายังไม่ได้ออกใบ ไม่ใช่ error**
 *
 * หน้าคิวใช้ตัวนี้ตัดสินว่าจะโชว์ปุ่ม "ออกใบเสร็จ" หรือ "เก็บเงิน"
 */
export function useInvoiceByVisit(visitId: number | null) {
  return useQuery({
    queryKey: [...INVOICE_ROOT, 'by-visit', visitId],
    queryFn: () => invoiceApi.byVisit(visitId!),
    enabled: visitId !== null,
  })
}

/**
 * QR พร้อมเพย์ — **ไม่ cache**
 *
 * ยอดค้างเปลี่ยนทุกครั้งที่รับเงินเพิ่ม · QR ที่ค้างอยู่ใน cache คือ QR ที่ยอดผิด
 * แล้วลูกค้าจ่ายเกินหรือขาด
 */
export function useInvoiceQr(id: number | null, enabled: boolean) {
  return useQuery({
    queryKey: [...INVOICE_ROOT, 'qr', id],
    queryFn: () => invoiceApi.qr(id!),
    enabled: id !== null && enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
}

/** ตั้งค่าพร้อมเพย์ใน `.env` แล้วหรือยัง — เปลี่ยนได้เฉพาะตอน deploy จึงเก็บไว้นาน */
export function usePromptPayStatus() {
  return useQuery({
    queryKey: ['promptpay', 'status'],
    queryFn: promptPayApi.status,
    staleTime: 10 * 60_000,
    retry: false,
  })
}

/**
 * ล้าง cache ของทั้งใบเสร็จ**และคิว**
 *
 * ยืนยันใบแล้วคิวปิดตามไปด้วย (BE ทำในทรานแซกชันเดียว) · ไม่ล้างคิวด้วย จอคิวจะยัง
 * โชว์รายที่จ่ายเงินเสร็จไปแล้ว
 */
function useInvalidate() {
  const qc = useQueryClient()

  return () => {
    void qc.invalidateQueries({ queryKey: INVOICE_ROOT })
    void qc.invalidateQueries({ queryKey: ['visit'] })
  }
}

export function useIssueInvoice() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: (body: { visitId: number; discount: string | null; note: string | null }) =>
      invoiceApi.issue(body),
    onSuccess: invalidate,
  })
}

export function useAddPayment() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number
      method: PaymentMethod
      amount: string
      reference: string | null
      promptpayRef: string | null
      note: string | null
    }) => invoiceApi.addPayment(id, body),
    onSuccess: invalidate,
  })
}

export function useAddPaymentWithSlip() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: number
      file: File
      method: PaymentMethod
      amount: string
      reference: string | null
      promptpayRef: string | null
      note: string | null
    }) => invoiceApi.addPaymentWithSlip(id, input),
    onSuccess: invalidate,
  })
}

export function useRemovePayment() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: (paymentId: number) => invoiceApi.removePayment(paymentId),
    onSuccess: invalidate,
  })
}

export function useSubmitInvoice() {
  const invalidate = useInvalidate()

  return useMutation({ mutationFn: (id: number) => invoiceApi.submit(id), onSuccess: invalidate })
}

export function useVerifyInvoice() {
  const invalidate = useInvalidate()

  return useMutation({ mutationFn: (id: number) => invoiceApi.verify(id), onSuccess: invalidate })
}

export function useRejectInvoice() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => invoiceApi.reject(id, reason),
    onSuccess: invalidate,
  })
}

export function useVoidInvoice() {
  const invalidate = useInvalidate()

  return useMutation({ mutationFn: (id: number) => invoiceApi.void(id), onSuccess: invalidate })
}
