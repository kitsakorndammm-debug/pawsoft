'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  LIST_ROOT as DRUG_STOCK_LIST_ROOT,
  MOVEMENTS_ROOT as DRUG_STOCK_MOVEMENTS_ROOT,
} from '@/features/drug-stock/hooks'

import {
  type CreateWarehouseStockMovementInput,
  type WithdrawFromWarehouseInput,
  warehouseStockApi,
} from './api'

const LIST_ROOT = ['warehouse-stock', 'list'] as const
const MOVEMENTS_ROOT = ['warehouse-stock', 'movements'] as const

export function useWarehouseStockBalances(
  q: string,
  /** `refetchInterval` — เผื่อเอาไปใช้กับกระดิ่งแจ้งเตือนในอนาคต เหมือน `drug-stock` */
  options?: { refetchInterval?: number },
) {
  return useQuery({
    queryKey: [...LIST_ROOT, q],
    queryFn: () => warehouseStockApi.list(q),
    // เก็บผลเก่าไว้ระหว่างพิมพ์ค้นหา — ไม่งั้นตารางกระพริบเป็นจอเปล่าทุกตัวอักษร
    placeholderData: (previous) => previous,
    refetchInterval: options?.refetchInterval,
  })
}

/** ประวัติของยาตัวเดียวในคลัง — `drugId` เป็น `null` เมื่อยังไม่ได้เปิดกล่อง */
export function useWarehouseStockMovements(drugId: number | null) {
  return useQuery({
    queryKey: [...MOVEMENTS_ROOT, drugId],
    queryFn: () => warehouseStockApi.movements(drugId!),
    enabled: drugId !== null,
  })
}

export function useCreateWarehouseStockMovement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateWarehouseStockMovementInput) => warehouseStockApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_ROOT })
      void queryClient.invalidateQueries({ queryKey: MOVEMENTS_ROOT })
    },
  })
}

/**
 * เบิกจากคลัง → เติมสต็อกที่หมอใช้จ่ายคนไข้
 *
 * **invalidate ทั้งสองฝั่ง** — คลังลดและสต็อกที่หมอใช้เพิ่มพร้อมกันในทรานแซกชันเดียว
 * ที่ฝั่ง BE · หน้าไหนเปิดค้างอยู่ตอนนั้นต้องเห็นเลขใหม่ทั้งคู่ ไม่ใช่แค่หน้าที่กดปุ่ม
 */
export function useWithdrawFromWarehouse() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: WithdrawFromWarehouseInput) => warehouseStockApi.withdraw(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_ROOT })
      void queryClient.invalidateQueries({ queryKey: MOVEMENTS_ROOT })
      void queryClient.invalidateQueries({ queryKey: DRUG_STOCK_LIST_ROOT })
      void queryClient.invalidateQueries({ queryKey: DRUG_STOCK_MOVEMENTS_ROOT })
    },
  })
}
