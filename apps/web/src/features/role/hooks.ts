'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { type Permission, type Role, type RoleDetail, type RoleInput, roleApi } from './api'

/**
 * query กับ mutation ของบทบาท
 *
 * รากของ key คือ `['role','list']` — mutation ล้างทั้งราก ไม่ใช่เฉพาะหน้าที่เปิดอยู่ ·
 * บทบาทที่เพิ่งเพิ่มไปโผล่หน้าไหนก็ได้เพราะลิสต์เรียงตามชื่อ ไม่ใช่ตามเวลาที่สร้าง
 */

const LIST_ROOT = ['role', 'list'] as const
const DETAIL_ROOT = ['role', 'detail'] as const

/** ตัวเลือกบทบาทสำหรับ combobox — ทะเบียนนี้เปลี่ยนไม่บ่อย ขอครั้งเดียวแล้วใช้ต่อ */
const LOOKUP_ROOT = ['role', 'lookup'] as const

/** สารบัญสิทธิ์ — มาจากโค้ดฝั่ง BE ไม่เปลี่ยนระหว่างที่หน้าเปิดอยู่ */
const PERMISSION_ROOT = ['permission', 'catalog'] as const

/** จำนวนต่อหน้า — ตรงกับ `ROLE_PAGE_SIZE` ที่ BE ใช้เป็นค่าตั้งต้น */
export const ROLE_PAGE_SIZE = 50

export function useRoles(q: string, page: number) {
  return useQuery({
    queryKey: [...LIST_ROOT, q, page],
    queryFn: () => roleApi.list({ q, page, pageSize: ROLE_PAGE_SIZE }),
    /**
     * เก็บผลเก่าไว้ระหว่างพิมพ์ค้นหาและเปลี่ยนหน้า — ไม่งั้นตารางกระพริบเป็นจอเปล่า
     * ทุกครั้ง แล้วผู้ใช้อ่านสิ่งที่กำลังหาไม่ทัน
     */
    placeholderData: (previous) => previous,
  })
}

export function useRoleOptions() {
  return useQuery({
    queryKey: LOOKUP_ROOT,
    queryFn: () => roleApi.lookup(),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * สิทธิ์ที่บทบาทหนึ่งถืออยู่ — **ลิสต์ไม่มีให้ ต้องขอทีละตัว**
 *
 * โหลดตอนเปิดฟอร์มเท่านั้น (`enabled`) · ดึงมาพร้อมลิสต์แปลว่ายิงเพิ่มเท่าจำนวนแถว
 * ในหน้าเพื่อข้อมูลที่ผู้ใช้จะเปิดดูอย่างมากหนึ่งตัว
 */
export function useRoleDetail(id: number | null) {
  return useQuery<RoleDetail>({
    queryKey: [...DETAIL_ROOT, id],
    queryFn: () => roleApi.getById(id as number),
    enabled: id !== null,
  })
}

/**
 * สารบัญสิทธิ์ทั้งระบบ
 *
 * `staleTime: Infinity` — แถวมาจาก `syncPermissions()` ตอน BE บูต จะเปลี่ยนได้ก็ต่อเมื่อ
 * deploy ใหม่ ซึ่งเป็นจังหวะที่หน้าเว็บถูกโหลดใหม่อยู่แล้ว
 */
export function usePermissionCatalog() {
  return useQuery<Permission[]>({
    queryKey: PERMISSION_ROOT,
    queryFn: () => roleApi.permissions(),
    staleTime: Infinity,
  })
}

/**
 * ล้างทุกอย่างที่บทบาทเปลี่ยนแล้วกระทบ
 *
 * **ไม่ใช่แค่ลิสต์** — `lookup` ป้อน combobox ในหน้าเปิดบัญชีผู้ใช้กับหน้าขั้นวงเงิน ·
 * ปล่อยให้มันค้างแปลว่าบทบาทที่เพิ่งเพิ่มไม่โผล่ให้เลือก และบทบาทที่เพิ่งลบยังเลือกได้อยู่
 * · `detail` ล้างด้วยเพราะสิทธิ์ที่ติ๊กไว้คือสิ่งที่เพิ่งถูกแก้
 */
function useInvalidateRole() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: LIST_ROOT })
    void queryClient.invalidateQueries({ queryKey: LOOKUP_ROOT })
    void queryClient.invalidateQueries({ queryKey: DETAIL_ROOT })
  }
}

export function useCreateRole() {
  const invalidate = useInvalidateRole()
  return useMutation<Role, Error, RoleInput>({
    mutationFn: (input) => roleApi.create(input),
    onSuccess: invalidate,
  })
}

export function useUpdateRole() {
  const invalidate = useInvalidateRole()
  return useMutation<Role, Error, { id: number; input: Partial<RoleInput> }>({
    mutationFn: ({ id, input }) => roleApi.update(id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteRole() {
  const invalidate = useInvalidateRole()
  return useMutation<null, Error, number>({
    mutationFn: (id) => roleApi.remove(id),
    onSuccess: invalidate,
  })
}
