'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { type CreateDrugStockMovementInput, drugStockApi } from './api'

const LIST_ROOT = ['drug-stock', 'list'] as const
const MOVEMENTS_ROOT = ['drug-stock', 'movements'] as const

export function useDrugStockBalances(
  q: string,
  /** `refetchInterval` — ใช้กับกระดิ่งแจ้งเตือนที่ต้องรู้ทันทีว่ายาใกล้หมด */
  options?: { refetchInterval?: number },
) {
  return useQuery({
    queryKey: [...LIST_ROOT, q],
    queryFn: () => drugStockApi.list(q),
    // เก็บผลเก่าไว้ระหว่างพิมพ์ค้นหา — ไม่งั้นตารางกระพริบเป็นจอเปล่าทุกตัวอักษร
    placeholderData: (previous) => previous,
    refetchInterval: options?.refetchInterval,
  })
}

/** ประวัติของยาตัวเดียว — `drugId` เป็น `null` เมื่อยังไม่ได้เปิดกล่อง */
export function useDrugStockMovements(drugId: number | null) {
  return useQuery({
    queryKey: [...MOVEMENTS_ROOT, drugId],
    queryFn: () => drugStockApi.movements(drugId!),
    enabled: drugId !== null,
  })
}

export function useCreateDrugStockMovement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateDrugStockMovementInput) => drugStockApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_ROOT })
      void queryClient.invalidateQueries({ queryKey: MOVEMENTS_ROOT })
    },
  })
}
