'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  appointmentApi,
  myAppointmentApi,
  type AppointmentInput,
  type AppointmentStatus,
  type MyAppointmentInput,
} from './api'

export const APPOINTMENT_ROOT = ['appointment'] as const
export const APPOINTMENT_PAGE_SIZE = 50

export function useAppointments(
  input: {
    bookedOn: string | null
    status: AppointmentStatus | null
    page: number
  },
  /** `refetchInterval` — ใช้กับจอที่ต้องรู้ทันทีว่ามีจองใหม่เข้ามา (เช่นกระดิ่งแจ้งเตือน) */
  options?: { refetchInterval?: number },
) {
  return useQuery({
    queryKey: [...APPOINTMENT_ROOT, 'list', input.bookedOn, input.status, input.page],
    queryFn: () => appointmentApi.list({ ...input, pageSize: APPOINTMENT_PAGE_SIZE }),
    placeholderData: (previous) => previous,
    refetchInterval: options?.refetchInterval,
  })
}

/**
 * ช่วงเวลาและ "วันนี้" — **ถาม BE ไม่คำนวณเอง**
 *
 * `new Date()` ในเบราว์เซอร์ใช้ timezone ของเครื่อง · เครื่องที่ตั้งเวลาผิด หรือคนที่
 * เปิดจากต่างประเทศ จะเห็นคิวของคนละวันกับที่คลินิกกำลังทำงานอยู่
 */
export function useSlots() {
  return useQuery({
    queryKey: [...APPOINTMENT_ROOT, 'slots'],
    queryFn: appointmentApi.slots,
    staleTime: 60_000,
  })
}

/** นับต่อวันในช่วง — ใช้วาดมุมมองสัปดาห์/เดือน/ปี (ผู้ใช้ขอ 2026-09-15) */
export function useAppointmentDailyCounts(from: string | null, to: string | null) {
  return useQuery({
    queryKey: [...APPOINTMENT_ROOT, 'daily-counts', from, to],
    queryFn: () => appointmentApi.dailyCounts(from!, to!),
    enabled: from !== null && to !== null,
  })
}

function useInvalidate() {
  const qc = useQueryClient()

  return () => void qc.invalidateQueries({ queryKey: APPOINTMENT_ROOT })
}

export function useCreateAppointment() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: (body: AppointmentInput) => appointmentApi.create(body),
    onSuccess: invalidate,
  })
}

export function useCancelAppointment() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      appointmentApi.cancel(id, reason),
    onSuccess: invalidate,
  })
}

export function useMarkNoShow() {
  const invalidate = useInvalidate()

  return useMutation({ mutationFn: (id: number) => appointmentApi.noShow(id), onSuccess: invalidate })
}

/** พนักงานยืนยันใบที่ลูกค้าจองออนไลน์ */
export function useConfirmAppointment() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: (id: number) => appointmentApi.confirm(id),
    onSuccess: invalidate,
  })
}

export function useDeleteAppointment() {
  const invalidate = useInvalidate()

  return useMutation({ mutationFn: (id: number) => appointmentApi.remove(id), onSuccess: invalidate })
}

// ---- ฝั่งลูกค้า ----

export const MY_APPOINTMENT_ROOT = ['my', 'appointment'] as const

export function useMyAppointments(
  page: number,
  /** `refetchInterval` — ใช้กับกระดิ่งแจ้งเตือนที่ต้องรู้ทันทีว่านัดถูกยืนยันแล้ว */
  options?: { refetchInterval?: number },
) {
  return useQuery({
    queryKey: [...MY_APPOINTMENT_ROOT, page],
    queryFn: () => myAppointmentApi.list({ page, pageSize: APPOINTMENT_PAGE_SIZE }),
    placeholderData: (previous) => previous,
    /**
     * **ไม่ retry เมื่อ 401** — บัญชีที่ยังไม่ถูกจับคู่กับข้อมูลลูกค้าจะได้ 401 เสมอ
     * และการลองซ้ำสามรอบคือการรอสามเท่าเพื่อได้คำตอบเดิม
     */
    retry: false,
    refetchInterval: options?.refetchInterval,
  })
}

function useMyInvalidate() {
  const qc = useQueryClient()

  return () => void qc.invalidateQueries({ queryKey: MY_APPOINTMENT_ROOT })
}

export function useCreateMyAppointment() {
  const invalidate = useMyInvalidate()

  return useMutation({
    mutationFn: (body: MyAppointmentInput) => myAppointmentApi.create(body),
    onSuccess: invalidate,
  })
}

export function useCancelMyAppointment() {
  const invalidate = useMyInvalidate()

  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      myAppointmentApi.cancel(id, reason),
    onSuccess: invalidate,
  })
}

/**
 * ช่วงเวลา + วันนี้ สำหรับ**หน้าจองของลูกค้า**
 *
 * แยกจาก `useSlots` เพราะคนละเส้นและคนละสิทธิ์ — ดู `appointmentApi.mySlots`
 */
export function useMySlots() {
  return useQuery({
    queryKey: ['my', 'slots'],
    queryFn: appointmentApi.mySlots,
    staleTime: 60_000,
  })
}
