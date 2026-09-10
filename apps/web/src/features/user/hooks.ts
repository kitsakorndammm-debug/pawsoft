'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { EMPLOYEE_LIST_ROOT } from '@/features/employee/hooks'

import { type CreateUserInput, type UpdateUserInput, type UserAccount, userApi } from './api'

/**
 * query กับ mutation ของบัญชีผู้ใช้
 *
 * **`employeeId` อยู่ใน key** — บัญชีถูกถามถึงในนามของพนักงานคนหนึ่งเสมอ
 *
 * ทุก mutation ล้าง **ทั้งบัญชีของคนนั้นและรายการพนักงาน** — คอลัมน์สถานะบัญชี
 * อยู่ในตารางพนักงาน ล้างแค่ฝั่งบัญชีแล้วตารางยังโชว์ "ไม่มีบัญชี" ทั้งที่เพิ่งเปิดไป
 */

const ROOT = 'user'
const byEmployeeKey = (employeeId: number) => [ROOT, 'by-employee', employeeId] as const

export function useUserByEmployee(employeeId: number, enabled = true) {
  return useQuery<UserAccount | null>({
    queryKey: byEmployeeKey(employeeId),
    queryFn: () => userApi.byEmployee(employeeId),
    enabled,
  })
}

/**
 * ล้าง cache หลังบัญชีเปลี่ยน
 *
 * `employeeId` ต้องส่งเข้ามา เพราะ mutation บางตัวรู้แต่ `userId` — และ key ของ
 * query ผูกกับพนักงาน ไม่ใช่กับบัญชี
 */
function useInvalidate(employeeId: number) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: byEmployeeKey(employeeId) })
    // ตารางพนักงานมีคอลัมน์สถานะบัญชี — มันต้องเปลี่ยนตามด้วย
    void queryClient.invalidateQueries({ queryKey: EMPLOYEE_LIST_ROOT })
  }
}

export function useCreateUser(employeeId: number) {
  const invalidate = useInvalidate(employeeId)
  return useMutation({
    mutationFn: (input: CreateUserInput) => userApi.create(input),
    onSuccess: invalidate,
  })
}

export function useUpdateUser(employeeId: number) {
  const invalidate = useInvalidate(employeeId)
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateUserInput & { id: number }) =>
      userApi.update(id, input),
    onSuccess: invalidate,
  })
}

/**
 * รีเซ็ตรหัส — **ไม่ล้าง cache ของบัญชี**
 *
 * รหัสไม่ได้อยู่ใน `UserAccount` และการรีเซ็ตไม่เปลี่ยนอะไรที่หน้าจอแสดงอยู่ ·
 * ยกเว้น `mustChangePassword` ที่กลับเป็นจริง จึงล้างด้วยเหตุผลนั้นข้อเดียว
 */
export function useResetPassword(employeeId: number) {
  const invalidate = useInvalidate(employeeId)
  return useMutation({
    mutationFn: (id: number) => userApi.resetPassword(id),
    onSuccess: invalidate,
  })
}

export function useSuspendUser(employeeId: number) {
  const invalidate = useInvalidate(employeeId)
  return useMutation({
    mutationFn: (id: number) => userApi.suspend(id),
    onSuccess: invalidate,
  })
}

export function useUnsuspendUser(employeeId: number) {
  const invalidate = useInvalidate(employeeId)
  return useMutation({
    mutationFn: (id: number) => userApi.unsuspend(id),
    onSuccess: invalidate,
  })
}

export function useUnlockUser(employeeId: number) {
  const invalidate = useInvalidate(employeeId)
  return useMutation({
    mutationFn: (id: number) => userApi.unlock(id),
    onSuccess: invalidate,
  })
}
