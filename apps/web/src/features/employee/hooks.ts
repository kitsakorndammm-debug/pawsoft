'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { type Employee, type EmployeeInput, type WorkStatus, employeeApi } from './api'

/**
 * query กับ mutation ของพนักงาน
 *
 * รากของ key คือ `['employee','list']` — mutation ล้างทั้งราก ไม่ใช่เฉพาะหน้าที่เปิดอยู่
 * แถวที่เพิ่งเพิ่มอาจไปโผล่หน้าอื่น และการลบทำให้ทุกหน้าหลังจากนั้นเลื่อน
 */

/**
 * รากของ key ลิสต์พนักงาน
 *
 * export ออกไปเพราะ `features/user` ต้องล้างมันด้วย — ตารางพนักงานมีคอลัมน์
 * สถานะบัญชี ซึ่งเปลี่ยนตอนเปิดหรือระงับบัญชี ทั้งที่ไม่ได้แตะแถวพนักงานเลย
 */
export const EMPLOYEE_LIST_ROOT = ['employee', 'list'] as const
const LIST_ROOT = EMPLOYEE_LIST_ROOT

/** จำนวนต่อหน้า — ตรงกับ `EMPLOYEE_PAGE_SIZE` ที่ BE ใช้เป็นค่าตั้งต้น */
export const EMPLOYEE_PAGE_SIZE = 50

export function useEmployees(q: string, page: number) {
  return useQuery({
    queryKey: [...LIST_ROOT, q, page],
    queryFn: () => employeeApi.list({ q, page, pageSize: EMPLOYEE_PAGE_SIZE }),
    /**
     * เก็บผลเก่าไว้ระหว่างพิมพ์ค้นหาและเปลี่ยนหน้า — ไม่งั้นตารางกระพริบเป็นจอเปล่า
     * ทุกครั้ง แล้วผู้ใช้อ่านสิ่งที่กำลังหาไม่ทัน
     */
    placeholderData: (previous) => previous,
  })
}

function useInvalidateList() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: LIST_ROOT })
}

export function useCreateEmployee() {
  const invalidate = useInvalidateList()
  return useMutation<Employee, Error, EmployeeInput>({
    mutationFn: (input) => employeeApi.create(input),
    onSuccess: invalidate,
  })
}

export function useUpdateEmployee() {
  const invalidate = useInvalidateList()
  return useMutation<Employee, Error, { id: number } & EmployeeInput>({
    mutationFn: ({ id, ...input }) => employeeApi.update(id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteEmployee() {
  const invalidate = useInvalidateList()
  return useMutation<null, Error, number>({
    mutationFn: (id) => employeeApi.remove(id),
    onSuccess: invalidate,
  })
}

/**
 * เปลี่ยนสภาพการทำงาน — แยกจาก `useUpdateEmployee` เพราะ BE แยก endpoint
 *
 * ปุ่มที่เปลี่ยนค่าเดียวไม่ควรต้องส่งชื่อ นามสกุล และ FK ทั้งสี่มาครบเพื่อกดหนึ่งครั้ง
 */
export function useSetEmployeeWorkStatus() {
  const invalidate = useInvalidateList()
  return useMutation<Employee, Error, { id: number; workStatus: WorkStatus }>({
    mutationFn: ({ id, workStatus }) => employeeApi.setWorkStatus(id, workStatus),
    onSuccess: invalidate,
  })
}
