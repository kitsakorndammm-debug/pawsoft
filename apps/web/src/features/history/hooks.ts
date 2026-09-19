'use client'

import { useQuery } from '@tanstack/react-query'
import type { InvoiceStatus } from '@/features/payment/api'
import { historyApi } from './api'

const HISTORY_ROOT = ['history'] as const

export const HISTORY_PAGE_SIZE = 50

export function useDrugHistory(page: number) {
  return useQuery({
    queryKey: [...HISTORY_ROOT, 'drugs', page],
    queryFn: () => historyApi.drugs({ page, pageSize: HISTORY_PAGE_SIZE }),
    placeholderData: (previous) => previous,
  })
}

export function usePaymentHistory(input: { status: InvoiceStatus | null; date: string | null; page: number }) {
  return useQuery({
    queryKey: [...HISTORY_ROOT, 'payments', input.status, input.date, input.page],
    queryFn: () => historyApi.payments({ ...input, pageSize: HISTORY_PAGE_SIZE }),
    placeholderData: (previous) => previous,
  })
}

export function usePaymentHistoryDetail(id: number | null) {
  return useQuery({
    queryKey: [...HISTORY_ROOT, 'payments', 'detail', id],
    queryFn: () => historyApi.payment(id!),
    enabled: id !== null,
  })
}

export function useVisitHistory(petId: number | null, page: number) {
  return useQuery({
    queryKey: [...HISTORY_ROOT, 'visits', petId, page],
    queryFn: () => historyApi.visits({ petId, page, pageSize: HISTORY_PAGE_SIZE }),
    enabled: petId !== null,
    placeholderData: (previous) => previous,
  })
}

export function useVisitBillHistory(visitId: number | null) {
  return useQuery({
    queryKey: [...HISTORY_ROOT, 'visits', 'bill', visitId],
    queryFn: () => historyApi.visitBill(visitId!),
    enabled: visitId !== null,
  })
}
