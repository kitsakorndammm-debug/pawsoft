import { api } from '@/lib/api-client'
import type { Invoice, InvoiceStatus } from '@/features/payment/api'

/**
 * `/api/history/*` — ดูย้อนหลังอย่างเดียว เปิดให้พนักงานทุกคนที่ล็อกอินได้ดู
 * (ผู้ใช้ตัดสิน 2026-09-18: "เข้าระบบได้ก็ดูได้เลย ไม่ต้องมีสิทธิ์พิเศษ")
 *
 * **ยืมรูปข้อมูลจากโมดูลต้นทาง ไม่สร้างซ้ำ** — ใบเสร็จใช้ `Invoice` ตัวเดียวกับหน้า
 * "การเงิน" ของเคาน์เตอร์ (`features/payment/api.ts`) เพราะ BE คืนรูปเดียวกันเป๊ะ
 */

// ---- ประวัติยา ----

export type DrugHistoryPatient = {
  visitId: number
  queueNumber: number
  queueDate: string
  petName: string | null
  ownerName: string | null
}

export type DrugMovementType = 'RECEIVE' | 'DISPENSE' | 'DISPENSE_REVERSED' | 'ADJUST'

export const DRUG_MOVEMENT_TYPE_LABEL: Record<DrugMovementType, string> = {
  RECEIVE: 'รับเข้า',
  DISPENSE: 'จ่ายออก',
  DISPENSE_REVERSED: 'คืนสต็อก',
  ADJUST: 'ปรับยอด',
}

export type DrugHistoryRow = {
  id: number
  createdAt: string
  type: DrugMovementType
  drugName: string
  drugUnit: string | null
  /** มีเครื่องหมาย — string เพราะเป็นเลขทศนิยม ห้ามแปลงเป็น number */
  quantity: string
  reason: string | null
  createdByName: string
  patient: DrugHistoryPatient | null
}

// ---- ประวัติการรักษา ----

export type VisitHistoryRow = {
  id: number
  queueNumber: number
  queueDate: string
  triage: 'EMERGENCY' | 'URGENT' | 'NORMAL'
  status: 'WAITING' | 'IN_PROGRESS' | 'AWAITING_PAYMENT' | 'DONE' | 'LEFT' | 'CANCELLED'
  ownerId: number | null
  petId: number | null
  /** ชื่อจริงถ้าเป็นสัตว์/เจ้าของที่ลงทะเบียนในระบบ ไม่งั้น fallback ไปชื่อ walk-in */
  petName: string | null
  ownerName: string | null
  walkInPetName: string | null
  walkInOwnerName: string | null
  symptom: string | null
  weightKg: string | null
  arrivedAt: string
  calledAt: string | null
  doneAt: string | null
  diagnosis: string | null
  note: string | null
}

export type VisitBill = {
  services: {
    id: number
    serviceItemId: number
    name: string
    quantity: number
    unitPrice: string
  }[]
  drugs: {
    id: number
    drugId: number
    name: string
    unit: string | null
    quantity: string
    unitPrice: string
    dosage: string | null
  }[]
  total: string
}

export const historyApi = {
  drugs: (input: { page: number; pageSize: number }) => {
    const search = new URLSearchParams({
      page: String(input.page),
      pageSize: String(input.pageSize),
    })
    return api.getPaged<DrugHistoryRow>(`/api/history/drugs?${search.toString()}`)
  },

  payments: (input: { status: InvoiceStatus | null; date: string | null; page: number; pageSize: number }) => {
    const search = new URLSearchParams({
      page: String(input.page),
      pageSize: String(input.pageSize),
    })
    if (input.status) search.set('status', input.status)
    if (input.date) search.set('date', input.date)
    return api.getPaged<Invoice>(`/api/history/payments?${search.toString()}`)
  },

  payment: (id: number) => api.get<Invoice>(`/api/history/payments/${id}`),

  visits: (input: { petId: number | null; date: string | null; page: number; pageSize: number }) => {
    const search = new URLSearchParams({
      page: String(input.page),
      pageSize: String(input.pageSize),
    })
    if (input.petId !== null) search.set('petId', String(input.petId))
    if (input.date !== null) search.set('date', input.date)
    return api.getPaged<VisitHistoryRow>(`/api/history/visits?${search.toString()}`)
  },

  visitBill: (visitId: number) => api.get<VisitBill>(`/api/history/visits/${visitId}/bill`),
}
