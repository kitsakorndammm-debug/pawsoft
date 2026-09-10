'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ownerApi, type OwnerInput } from './api'

export const OWNER_LIST_ROOT = ['owner', 'list'] as const
export const OWNER_LOOKUP_ROOT = ['owner', 'lookup'] as const
export const OWNER_PAGE_SIZE = 50

export function useOwners(q: string, page: number, linked?: boolean) {
  return useQuery({
    queryKey: [...OWNER_LIST_ROOT, q, page, linked],
    queryFn: () => ownerApi.list({ q, page, pageSize: OWNER_PAGE_SIZE, linked }),
    placeholderData: (previous) => previous,
  })
}

export function useOwner(id: number | null) {
  return useQuery({
    queryKey: ['owner', 'one', id],
    queryFn: () => ownerApi.get(id!),
    enabled: id !== null,
  })
}

/**
 * ค้นเจ้าของสำหรับ combobox
 *
 * **`enabled` ต่อเมื่อมีคำค้น** — เส้นนี้คืน `[]` เมื่อไม่มี `q` อยู่แล้ว แต่การไม่ยิง
 * เลยดีกว่า: ทุกครั้งที่ dialog เปิดจะได้ไม่มี request ที่รู้คำตอบอยู่แล้ว
 *
 * ไม่ `staleTime` ยาว เพราะลูกค้าใหม่ถูกเพิ่มทั้งวัน และคนที่เพิ่งเพิ่มคือคนที่กำลัง
 * จะถูกค้นหาในอีกสิบวินาที
 */
export function useOwnerSearch(q: string) {
  const term = q.trim()

  return useQuery({
    queryKey: [...OWNER_LOOKUP_ROOT, term],
    queryFn: () => ownerApi.lookup(term),
    enabled: term.length > 0,
    placeholderData: (previous) => previous,
  })
}

/** บัญชี Google ที่ยังว่าง — ยิงต่อเมื่อมีคำค้น เหมือน `useOwnerSearch` */
export function useUnlinkedAccounts(q: string) {
  const term = q.trim()

  return useQuery({
    queryKey: ['owner', 'accounts', term],
    queryFn: () => ownerApi.lookupAccounts(term),
    enabled: term.length > 0,
  })
}

function useInvalidate() {
  const qc = useQueryClient()

  return () => {
    void qc.invalidateQueries({ queryKey: OWNER_LIST_ROOT })
    void qc.invalidateQueries({ queryKey: OWNER_LOOKUP_ROOT })
    void qc.invalidateQueries({ queryKey: ['owner', 'one'] })
    void qc.invalidateQueries({ queryKey: ['owner', 'accounts'] })
  }
}

export function useCreateOwner() {
  const invalidate = useInvalidate()

  return useMutation({ mutationFn: (body: OwnerInput) => ownerApi.create(body), onSuccess: invalidate })
}

export function useUpdateOwner() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: ({ id, ...body }: OwnerInput & { id: number }) => ownerApi.update(id, body),
    onSuccess: invalidate,
  })
}

export function useLinkOwnerAccount() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: ({ id, petOwnerAccountId }: { id: number; petOwnerAccountId: number | null }) =>
      ownerApi.linkAccount(id, petOwnerAccountId),
    onSuccess: invalidate,
  })
}

export function useDeleteOwner() {
  const invalidate = useInvalidate()

  return useMutation({ mutationFn: (id: number) => ownerApi.remove(id), onSuccess: invalidate })
}
