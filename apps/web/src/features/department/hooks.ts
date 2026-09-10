'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { type Department, type DepartmentOption, departmentApi } from './api'

/**
 * query กับ mutation ของแผนก
 *
 * รากของ key คือ `['department','list']` — mutation ล้างทั้งราก ไม่ใช่เฉพาะคำค้น
 * ที่เปิดอยู่ตอนนั้น · แถวที่เพิ่งเพิ่มหรือแก้ อาจตรงกับคำค้นอื่นที่ cache ไว้
 */

const LIST_ROOT = ['department', 'list'] as const
const LOOKUP_ROOT = ['department', 'lookup'] as const

export function useDepartments(q: string) {
  return useQuery<Department[]>({
    queryKey: [...LIST_ROOT, q],
    queryFn: () => departmentApi.list(q),
    /**
     * เก็บผลเก่าไว้ระหว่างพิมพ์ค้นหา — ไม่งั้นตารางกระพริบเป็นจอเปล่าทุกตัวอักษร
     * แล้วผู้ใช้อ่านสิ่งที่กำลังหาไม่ทัน
     */
    placeholderData: (previous) => previous,
  })
}

/**
 * ตัวเลือกสำหรับ combobox ในหน้าอื่น
 *
 * **key แยกจากลิสต์เต็ม** — คนละ endpoint คนละรูปข้อมูล · ใช้ key เดียวกันแล้ว
 * หน้าหนึ่งจะได้ข้อมูลผิดรูปจาก cache ของอีกหน้า
 *
 * ทะเบียนนี้เปลี่ยนไม่บ่อย และผู้ใช้ที่กำลังกรอกฟอร์มไม่ได้มาแก้ทะเบียน · ขอครั้งเดียว
 * แล้วใช้ต่อ ดีกว่ายิงใหม่ทุกครั้งที่เปิดกล่อง
 */
export function useDepartmentOptions() {
  return useQuery<DepartmentOption[]>({
    queryKey: LOOKUP_ROOT,
    queryFn: () => departmentApi.lookup(),
    staleTime: 5 * 60 * 1000,
  })
}

function useInvalidateList() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: LIST_ROOT })
}

export function useCreateDepartment() {
  const invalidate = useInvalidateList()
  return useMutation({
    mutationFn: (name: string) => departmentApi.create(name),
    onSuccess: invalidate,
  })
}

export function useUpdateDepartment() {
  const invalidate = useInvalidateList()
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => departmentApi.update(id, name),
    onSuccess: invalidate,
  })
}

export function useDeleteDepartment() {
  const invalidate = useInvalidateList()
  return useMutation({
    mutationFn: (id: number) => departmentApi.remove(id),
    onSuccess: invalidate,
  })
}

export function useMoveDepartment() {
  const invalidate = useInvalidateList()
  return useMutation({
    mutationFn: ({ id, beforeId }: { id: number; beforeId: number | null }) =>
      departmentApi.move(id, beforeId),
    /**
     * ล้างทั้งตอนสำเร็จและตอนพัง — ระหว่างลาก หน้าจอเรียงใหม่ให้เห็นทันที
     * BE ปฏิเสธแล้วไม่ดึงของจริงกลับมา ตารางจะค้างในลำดับที่ไม่มีอยู่จริง
     */
    onSettled: invalidate,
  })
}
