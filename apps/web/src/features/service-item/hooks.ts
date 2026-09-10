'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { serviceItemApi, type ServiceItemInput } from './api'

export const SERVICE_ITEM_LIST_ROOT = ['service-item', 'list'] as const
export const SERVICE_ITEM_PAGE_SIZE = 50

export function useServiceItems(q: string, categoryId: number | null, page: number) {
  return useQuery({
    queryKey: [...SERVICE_ITEM_LIST_ROOT, q, categoryId, page],
    queryFn: () => serviceItemApi.list({ q, categoryId, page, pageSize: SERVICE_ITEM_PAGE_SIZE }),
    // ตารางไม่ว่างระหว่างพิมพ์คำค้น — ไม่งั้นกะพริบทุกตัวอักษร
    placeholderData: (previous) => previous,
  })
}

export const SERVICE_ITEM_LOOKUP_ROOT = ['service-item', 'lookup'] as const

/** ตัวเลือกรายการรักษาสำหรับ combobox */
export function useServiceItemOptions() {
  return useQuery({
    queryKey: SERVICE_ITEM_LOOKUP_ROOT,
    queryFn: serviceItemApi.lookup,
    staleTime: 5 * 60_000,
  })
}

function useInvalidate() {
  const qc = useQueryClient()

  return () => {
    void qc.invalidateQueries({ queryKey: SERVICE_ITEM_LIST_ROOT })
    void qc.invalidateQueries({ queryKey: SERVICE_ITEM_LOOKUP_ROOT })
  }
}

export function useCreateServiceItem() {
  const invalidate = useInvalidate()

  return useMutation({ mutationFn: (body: ServiceItemInput) => serviceItemApi.create(body), onSuccess: invalidate })
}

export function useUpdateServiceItem() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: ({ id, ...body }: ServiceItemInput & { id: number }) => serviceItemApi.update(id, body),
    onSuccess: invalidate,
  })
}

export function useSetServiceItemActive() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      serviceItemApi.setActive(id, isActive),
    onSuccess: invalidate,
  })
}

export function useDeleteServiceItem() {
  const invalidate = useInvalidate()

  return useMutation({ mutationFn: (id: number) => serviceItemApi.remove(id), onSuccess: invalidate })
}
