'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { visitApi, type CheckInInput, type TriageLevel } from './api'
import type { AppointmentSlot } from '@/features/appointment/api'

export const QUEUE_ROOT = ['visit', 'queue'] as const
export const VISIT_LIST_ROOT = ['visit', 'list'] as const
export const BILL_ROOT = ['visit', 'bill'] as const
export const VISIT_PAGE_SIZE = 50

/**
 * จอคิว — **รีเฟรชเองทุก 15 วินาที**
 *
 * จอนี้เปิดค้างไว้ทั้งวันและมีหลายเครื่องดูพร้อมกัน · คนที่หน้าเคาน์เตอร์กด check-in
 * แล้วหมอที่ห้องตรวจต้องเห็นภายในไม่กี่วินาที โดยไม่ต้องกด refresh
 *
 * 15 วินาทีเป็นการแลก: ถี่กว่านี้คือ request ที่ไม่มีอะไรเปลี่ยนเป็นส่วนใหญ่ ·
 * ห่างกว่านี้คือเคสฉุกเฉินที่เพิ่งเข้ามาแล้วยังไม่ขึ้นจอ
 */
export function useQueue(date: string | null) {
  return useQuery({
    queryKey: [...QUEUE_ROOT, date],
    queryFn: () => visitApi.queue(date),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  })
}

export function useVisits(input: { petId: number | null; ownerId: number | null; page: number }) {
  return useQuery({
    queryKey: [...VISIT_LIST_ROOT, input.petId, input.ownerId, input.page],
    queryFn: () => visitApi.list({ ...input, pageSize: VISIT_PAGE_SIZE }),
    placeholderData: (previous) => previous,
  })
}

export function useVisit(id: number | null) {
  return useQuery({
    queryKey: ['visit', 'one', id],
    queryFn: () => visitApi.get(id!),
    enabled: id !== null,
  })
}

export function useVisitBill(id: number | null) {
  return useQuery({
    queryKey: [...BILL_ROOT, id],
    queryFn: () => visitApi.bill(id!),
    enabled: id !== null,
  })
}

/**
 * ล้างทั้งจอคิวและรายการ — **ทุก mutation ของคิวต้องล้างทั้งคู่**
 *
 * เปลี่ยนสถานะคิวหนึ่งใบกระทบทั้งจอคิว (มันหายไปจากลิสต์) และประวัติ (มันโผล่ที่นั่น)
 */
function useInvalidate() {
  const qc = useQueryClient()

  return () => {
    void qc.invalidateQueries({ queryKey: QUEUE_ROOT })
    void qc.invalidateQueries({ queryKey: VISIT_LIST_ROOT })
    void qc.invalidateQueries({ queryKey: ['visit', 'one'] })
    // ใบจองเปลี่ยนสถานะเป็น ARRIVED ตอน check-in
    void qc.invalidateQueries({ queryKey: ['appointment'] })
  }
}

function useBillInvalidate() {
  const qc = useQueryClient()

  return () => void qc.invalidateQueries({ queryKey: BILL_ROOT })
}

export function useCheckIn() {
  const invalidate = useInvalidate()

  return useMutation({ mutationFn: (body: CheckInInput) => visitApi.checkIn(body), onSuccess: invalidate })
}

export function useSetTriage() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: ({ id, triage }: { id: number; triage: TriageLevel }) =>
      visitApi.setTriage(id, triage),
    onSuccess: invalidate,
  })
}

export function useCallVisit() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: ({ id, vetEmployeeId }: { id: number; vetEmployeeId: number | null }) =>
      visitApi.call(id, vetEmployeeId),
    onSuccess: invalidate,
  })
}

export function useFinishExam() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number
      diagnosis: string | null
      note: string | null
      weightKg: string | null
    }) => visitApi.finish(id, body),
    onSuccess: invalidate,
  })
}

export function useCloseVisit() {
  const invalidate = useInvalidate()

  return useMutation({ mutationFn: (id: number) => visitApi.close(id), onSuccess: invalidate })
}

export function useAbandonVisit() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'LEFT' | 'CANCELLED' }) =>
      visitApi.abandon(id, status),
    onSuccess: invalidate,
  })
}

export function useLinkVisit() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: ({ id, petId }: { id: number; petId: number }) => visitApi.link(id, petId),
    onSuccess: invalidate,
  })
}

/** หมอนัดครั้งถัดไป — `useInvalidate` ล้างคีย์ `'appointment'` ให้อยู่แล้ว */
export function useBookNextVisitAppointment() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: ({
      visitId,
      ...body
    }: {
      visitId: number
      bookedOn: string
      slot: AppointmentSlot
    }) => visitApi.bookNextAppointment(visitId, body),
    onSuccess: invalidate,
  })
}

// ---- รายการในคิว ----

export function useAddVisitService() {
  const invalidate = useBillInvalidate()

  return useMutation({
    mutationFn: ({
      visitId,
      ...body
    }: {
      visitId: number
      serviceItemId: number
      quantity: number
      unitPrice: string | null
      note: string | null
    }) => visitApi.addService(visitId, body),
    onSuccess: invalidate,
  })
}

export function useRemoveVisitService() {
  const invalidate = useBillInvalidate()

  return useMutation({ mutationFn: (itemId: number) => visitApi.removeService(itemId), onSuccess: invalidate })
}

export function useAddVisitDrug() {
  const invalidate = useBillInvalidate()

  return useMutation({
    mutationFn: ({
      visitId,
      ...body
    }: {
      visitId: number
      drugId: number
      quantity: string
      unitPrice: string | null
      dosage: string | null
    }) => visitApi.addDrug(visitId, body),
    onSuccess: invalidate,
  })
}

export function useRemoveVisitDrug() {
  const invalidate = useBillInvalidate()

  return useMutation({ mutationFn: (itemId: number) => visitApi.removeDrug(itemId), onSuccess: invalidate })
}
