'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { type Position, type PositionInput, type PositionOption, positionApi } from './api'

/**
 * query กับ mutation ของposition
 *
 * รากของ key คือ `['position','list']` — mutation ล้างทั้งราก ไม่ใช่เฉพาะคำค้น
 * ที่เปิดอยู่ตอนนั้น · แถวที่เพิ่งเพิ่มหรือแก้ อาจตรงกับคำค้นอื่นที่ cache ไว้
 */

const LIST_ROOT = ['position', 'list'] as const
const LOOKUP_ROOT = ['position', 'lookup'] as const

export function usePositions(q: string) {
  return useQuery<Position[]>({
    queryKey: [...LIST_ROOT, q],
    queryFn: () => positionApi.list(q),
    /** เก็บผลเก่าไว้ระหว่างพิมพ์ค้นหา — ไม่งั้นตารางกระพริบเป็นจอเปล่าทุกตัวอักษร */
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
export function usePositionOptions() {
  return useQuery<PositionOption[]>({
    queryKey: LOOKUP_ROOT,
    queryFn: () => positionApi.lookup(),
    staleTime: 5 * 60 * 1000,
  })
}

function useInvalidateList() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: LIST_ROOT })
}

export function useCreatePosition() {
  const invalidate = useInvalidateList()
  return useMutation({
    mutationFn: (input: PositionInput) => positionApi.create(input),
    onSuccess: invalidate,
  })
}

export function useUpdatePosition() {
  const invalidate = useInvalidateList()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: number } & PositionInput) => positionApi.update(id, input),
    onSuccess: invalidate,
  })
}

export function useDeletePosition() {
  const invalidate = useInvalidateList()
  return useMutation({
    mutationFn: (id: number) => positionApi.remove(id),
    onSuccess: invalidate,
  })
}

export function useMovePosition() {
  const invalidate = useInvalidateList()
  return useMutation({
    mutationFn: ({ id, beforeId }: { id: number; beforeId: number | null }) =>
      positionApi.move(id, beforeId),
    /**
     * ล้างทั้งตอนสำเร็จและตอนพัง — ระหว่างลาก หน้าจอเรียงใหม่ให้เห็นทันที
     * BE ปฏิเสธแล้วไม่ดึงของจริงกลับมา ตารางจะค้างในลำดับที่ไม่มีอยู่จริง
     */
    onSettled: invalidate,
  })
}
