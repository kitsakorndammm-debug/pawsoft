'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  type DrugCategory,
  type DrugCategoryOption,
  drugCategoryApi,
} from './api'

/**
 * query กับ mutation ของหมวดยา
 *
 * รากของ key คือ `['drug-category','list']` — mutation ล้างทั้งราก ไม่ใช่เฉพาะคำค้น
 * ที่เปิดอยู่ตอนนั้น · แถวที่เพิ่งเพิ่มหรือแก้ อาจตรงกับคำค้นอื่นที่ cache ไว้
 */

const LIST_ROOT = ['drug-category', 'list'] as const
const LOOKUP_ROOT = ['drug-category', 'lookup'] as const

export function useDrugCategorys(q: string) {
  return useQuery<DrugCategory[]>({
    queryKey: [...LIST_ROOT, q],
    queryFn: () => drugCategoryApi.list(q),
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
export function useDrugCategoryOptions() {
  return useQuery<DrugCategoryOption[]>({
    queryKey: LOOKUP_ROOT,
    queryFn: () => drugCategoryApi.lookup(),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * ล้างทั้งลิสต์และ lookup
 *
 * **ต่างจากเฉดสีที่ล้างแค่ลิสต์** — `kind` เดินทางไปกับ `/lookup` ด้วย · แก้ชนิดของ
 * หมวดยาแล้วไม่ล้าง lookup แปลว่าฟอร์มลูกค้าที่เปิดค้างไว้ยังเชื่อชนิดเดิม
 * แล้วเปิดหรือปิดตารางสาขาผิดข้าง
 */
function useInvalidate() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: LIST_ROOT })
    void queryClient.invalidateQueries({ queryKey: LOOKUP_ROOT })
  }
}

export function useCreateDrugCategory() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ name }: { name: string }) =>
      drugCategoryApi.create(name),
    onSuccess: invalidate,
  })
}

export function useUpdateDrugCategory() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      drugCategoryApi.update(id, name),
    onSuccess: invalidate,
  })
}

export function useDeleteDrugCategory() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => drugCategoryApi.remove(id),
    onSuccess: invalidate,
  })
}

export function useMoveDrugCategory() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, beforeId }: { id: number; beforeId: number | null }) =>
      drugCategoryApi.move(id, beforeId),
    /**
     * ล้างทั้งตอนสำเร็จและตอนพัง — ระหว่างลาก หน้าจอเรียงใหม่ให้เห็นทันที
     * BE ปฏิเสธแล้วไม่ดึงของจริงกลับมา ตารางจะค้างในลำดับที่ไม่มีอยู่จริง
     */
    onSettled: invalidate,
  })
}
