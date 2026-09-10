'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api-client'
import { authApi, type SessionUser } from './api'

export const ME_QUERY_KEY = ['auth', 'me'] as const

/**
 * ใครล็อกอินอยู่ — `null` แปลว่าไม่มีใคร
 *
 * **401 กลายเป็น `null` ไม่ใช่ error ที่โยนออกไป** · การไม่ได้ล็อกอินเป็นสถานะปกติ
 * ของหน้าเว็บ ไม่ใช่ความผิดพลาด · โยนออกไปเมื่อไหร่ ทุกหน้าจะต้องมี error boundary
 * เพื่อรับมือกับเรื่องที่คาดไว้อยู่แล้ว
 */
export function useMe() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async (): Promise<SessionUser | null> => {
      try {
        return await authApi.me()
      } catch (e) {
        if (e instanceof ApiError && e.httpStatus === 401) return null
        throw e
      }
    },
    staleTime: 60_000,
    retry: false,
  })
}

export function useLogin() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      authApi.login(username, password),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  })
}

export function useLogout() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  })
}

export function useChangePassword() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (newPassword: string) => authApi.changePassword(newPassword),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  })
}

/** ถือ key นี้ไหม — **หน้าเว็บซ่อน BE ปฏิเสธ** ตัวนี้ทำหน้าที่แรกเท่านั้น */
export function useCan(key: string): boolean {
  const { data } = useMe()

  return data?.permissions.includes(key) ?? false
}

/**
 * ถือ key **ตัวใดตัวหนึ่ง** ในลิสต์ไหม
 *
 * ใช้กับหัวข้อกลุ่มในเมนูและแท็บบน navbar — ของที่ครอบรายการหลายตัว ควรโผล่เมื่อ
 * มีอย่างน้อยหนึ่งตัวที่กดเข้าไปได้ · ลิสต์ว่างคืน `false` (ไม่มีอะไรให้เห็น)
 */
export function useCanAny(keys: readonly string[]): boolean {
  const { data } = useMe()
  if (!data) return false

  return keys.some((key) => data.permissions.includes(key))
}
