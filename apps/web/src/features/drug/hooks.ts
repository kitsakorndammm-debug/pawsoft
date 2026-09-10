'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { drugApi, type DrugInput } from './api'

export const DRUG_LIST_ROOT = ['drug', 'list'] as const
export const DRUG_PAGE_SIZE = 50

export function useDrugs(q: string, categoryId: number | null, page: number) {
  return useQuery({
    queryKey: [...DRUG_LIST_ROOT, q, categoryId, page],
    queryFn: () => drugApi.list({ q, categoryId, page, pageSize: DRUG_PAGE_SIZE }),
    // ตารางไม่ว่างระหว่างพิมพ์คำค้น — ไม่งั้นกะพริบทุกตัวอักษร
    placeholderData: (previous) => previous,
  })
}

export const DRUG_LOOKUP_ROOT = ['drug', 'lookup'] as const

/** ตัวเลือกยาสำหรับ combobox — เปลี่ยนไม่บ่อย เก็บไว้ 5 นาที */
export function useDrugOptions() {
  return useQuery({
    queryKey: DRUG_LOOKUP_ROOT,
    queryFn: drugApi.lookup,
    staleTime: 5 * 60_000,
  })
}

function useInvalidate() {
  const qc = useQueryClient()

  return () => {
    void qc.invalidateQueries({ queryKey: DRUG_LIST_ROOT })
    // ล้าง lookup ด้วย — ไม่งั้น combobox ยังโชว์ยาที่เพิ่งเลิกใช้หรือเพิ่งลบไป
    void qc.invalidateQueries({ queryKey: DRUG_LOOKUP_ROOT })
  }
}

export function useCreateDrug() {
  const invalidate = useInvalidate()

  return useMutation({ mutationFn: (body: DrugInput) => drugApi.create(body), onSuccess: invalidate })
}

export function useUpdateDrug() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: ({ id, ...body }: DrugInput & { id: number }) => drugApi.update(id, body),
    onSuccess: invalidate,
  })
}

export function useSetDrugActive() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      drugApi.setActive(id, isActive),
    onSuccess: invalidate,
  })
}

export function useDeleteDrug() {
  const invalidate = useInvalidate()

  return useMutation({ mutationFn: (id: number) => drugApi.remove(id), onSuccess: invalidate })
}
