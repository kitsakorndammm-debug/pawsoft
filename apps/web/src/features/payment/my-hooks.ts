'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { myInvoiceApi } from './my-api'

export const MY_INVOICE_ROOT = ['my', 'invoices'] as const
export const MY_INVOICE_PAGE_SIZE = 20

export function useMyInvoices(
  page: number,
  /** `refetchInterval` — ใช้กับกระดิ่งแจ้งเตือนที่ต้องรู้ทันทีว่ามีบิลค้างจ่ายใหม่ */
  options?: { refetchInterval?: number },
) {
  return useQuery({
    queryKey: [...MY_INVOICE_ROOT, 'list', page],
    queryFn: () => myInvoiceApi.list(page, MY_INVOICE_PAGE_SIZE),
    placeholderData: (previous) => previous,
    refetchInterval: options?.refetchInterval,
  })
}

export function useMyInvoice(id: number | null) {
  return useQuery({
    queryKey: [...MY_INVOICE_ROOT, 'one', id],
    queryFn: () => myInvoiceApi.get(id as number),
    enabled: id !== null,
  })
}

/**
 * QR ของใบนี้ — **ขอเฉพาะตอนยังมียอดค้าง**
 *
 * BE คิด QR จากยอดค้าง · ใบที่จ่ายครบแล้วยอดค้างเป็นศูนย์ และ QR ยอดศูนย์คือสิ่งที่
 * แอปธนาคารปฏิเสธ
 */
export function useMyInvoiceQr(id: number | null, enabled: boolean) {
  return useQuery({
    queryKey: [...MY_INVOICE_ROOT, 'qr', id],
    queryFn: () => myInvoiceApi.qr(id as number),
    enabled: id !== null && enabled,
    staleTime: 5 * 60_000,
  })
}

/** ตั้งค่าไว้นานๆ — เปลี่ยนได้แค่ตอน deploy ไม่ใช่สิ่งที่ต้องเช็คถี่ระหว่างจ่ายเงิน */
export function useMyBankTransfer() {
  return useQuery({
    queryKey: ['my', 'bank-transfer'],
    queryFn: myInvoiceApi.bankTransfer,
    staleTime: 10 * 60_000,
  })
}

export function useUploadMySlip(id: number) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (input: Parameters<typeof myInvoiceApi.uploadSlip>[1]) =>
      myInvoiceApi.uploadSlip(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: MY_INVOICE_ROOT }),
  })
}
