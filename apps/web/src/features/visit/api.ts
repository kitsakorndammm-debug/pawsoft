import { api } from '@/lib/api-client'
import type { AppointmentSlot } from '@/features/appointment/api'

/**
 * ระดับความเร่งด่วน — **เรียงจากด่วนที่สุด และลำดับนี้คือลำดับเรียกคิว**
 */
export type TriageLevel = 'EMERGENCY' | 'URGENT' | 'NORMAL'

export const TRIAGE_LABEL: Record<TriageLevel, string> = {
  EMERGENCY: 'ฉุกเฉิน',
  URGENT: 'ด่วน',
  NORMAL: 'ปกติ',
}

/** สีของแต่ละระดับ — แดง เหลือง เขียว ตามที่คนในคลินิกเรียกกันจริง */
export const TRIAGE_STYLE: Record<TriageLevel, string> = {
  EMERGENCY: 'bg-red-100 text-red-800 ring-1 ring-red-300',
  URGENT: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  NORMAL: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
}

export type VisitStatus =
  | 'WAITING'
  | 'IN_PROGRESS'
  | 'AWAITING_PAYMENT'
  | 'DONE'
  | 'LEFT'
  | 'CANCELLED'

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  WAITING: 'รอเรียก',
  IN_PROGRESS: 'กำลังตรวจ',
  AWAITING_PAYMENT: 'รอชำระเงิน',
  DONE: 'เสร็จแล้ว',
  LEFT: 'กลับก่อน',
  CANCELLED: 'ยกเลิก',
}

/**
 * คิวหนึ่งใบ
 *
 * **`queueNumber` ไม่ใช่ลำดับที่จะได้เจอหมอ** — มันคือเลขบนบัตรที่ลูกค้าถือ และไม่
 * เปลี่ยนอีกเลย · ลำดับเรียกคำนวณจาก `triage` แล้วค่อย `arrivedAt` ซึ่ง BE เรียงมาให้
 * แล้วใน `/queue`
 *
 * **`petId` เป็น `null` ได้** — เคสฉุกเฉินเปิดคิวก่อนแล้วผูกทีหลัง
 */
export type Visit = {
  id: number
  queueNumber: number
  queueDate: string
  triage: TriageLevel
  status: VisitStatus
  ownerId: number | null
  petId: number | null
  walkInPetName: string | null
  walkInOwnerName: string | null
  walkInOwnerPhone: string | null
  appointmentId: number | null
  symptom: string | null
  weightKg: string | null
  vetEmployeeId: number | null
  arrivedAt: string
  calledAt: string | null
  doneAt: string | null
  diagnosis: string | null
  note: string | null
}

/** แถวบนจอคิว — พกชื่อมาด้วย ไม่ต้องยิงถามทีละแถว */
export type QueueRow = Visit & {
  pet: { id: number; code: string; name: string } | null
  owner: { id: number; code: string; name: string; phone: string | null } | null
  /** ชื่อที่จะโชว์ — สัตว์ที่ผูกแล้วใช้ชื่อจริง ที่ยังไม่ผูกใช้ชื่อที่เขียนหน้างาน */
  displayName: string
}

export type CheckInInput = {
  appointmentId: number | null
  ownerId: number | null
  petId: number | null
  walkInPetName: string | null
  walkInOwnerName: string | null
  walkInOwnerPhone: string | null
  triage: TriageLevel
  symptom: string | null
  weightKg: string | null
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
  /** ยอดรวม — **ข้อความ** เพราะเงินไม่เดินทางเป็น `number` */
  total: string
}

export const visitApi = {
  /** **จอคิว** — เรียงตามลำดับเรียกมาแล้วจาก BE ห้ามเรียงใหม่ในเบราว์เซอร์ */
  queue: (date: string | null) =>
    api.get<QueueRow[]>(`/api/visits/queue${date === null ? '' : `?date=${date}`}`),

  list: (input: { petId: number | null; ownerId: number | null; page: number; pageSize: number }) => {
    const search = new URLSearchParams({
      page: String(input.page),
      pageSize: String(input.pageSize),
    })
    if (input.petId !== null) search.set('petId', String(input.petId))
    if (input.ownerId !== null) search.set('ownerId', String(input.ownerId))

    return api.getPaged<Visit>(`/api/visits?${search.toString()}`)
  },

  get: (id: number) => api.get<Visit>(`/api/visits/${id}`),

  bill: (id: number) => api.get<VisitBill>(`/api/visits/${id}/bill`),

  checkIn: (body: CheckInInput) => api.post<Visit>('/api/visits/check-in', body),

  setTriage: (id: number, triage: TriageLevel) =>
    api.patch<Visit>(`/api/visits/${id}/triage`, { triage }),

  call: (id: number, vetEmployeeId: number | null) =>
    api.patch<Visit>(`/api/visits/${id}/call`, { vetEmployeeId }),

  finish: (id: number, body: { diagnosis: string | null; note: string | null; weightKg: string | null }) =>
    api.patch<Visit>(`/api/visits/${id}/finish`, body),

  close: (id: number) => api.patch<Visit>(`/api/visits/${id}/close`, {}),

  abandon: (id: number, status: 'LEFT' | 'CANCELLED') =>
    api.patch<Visit>(`/api/visits/${id}/abandon`, { status }),

  /** ผูกคิวกับสัตว์ที่รู้ทีหลัง — เคสฉุกเฉิน */
  link: (id: number, petId: number) => api.patch<Visit>(`/api/visits/${id}/link`, { petId }),

  /**
   * หมอนัดครั้งถัดไป — **owner/pet มาจากคิวเองฝั่ง BE** ไม่ส่งจากที่นี่
   *
   * คืนใบจองที่สร้างขึ้น รูปเดียวกับ `appointmentApi` แต่พิมพ์ชนิดแยกเพราะไฟล์นี้
   * ไม่รู้จักโดเมนของ appointment ทั้งก้อน — เอาแค่ `AppointmentSlot` มาใช้เป็นชนิด
   */
  bookNextAppointment: (visitId: number, body: { bookedOn: string; slot: AppointmentSlot }) =>
    api.post<{ id: number; bookedOn: string; slot: AppointmentSlot; status: string }>(
      `/api/visits/${visitId}/next-appointment`,
      body,
    ),

  addService: (
    visitId: number,
    body: { serviceItemId: number; quantity: number; unitPrice: string | null; note: string | null },
  ) => api.post<VisitBill['services'][number]>(`/api/visits/${visitId}/services`, body),

  removeService: (itemId: number) => api.delete<null>(`/api/visits/services/${itemId}`),

  addDrug: (
    visitId: number,
    body: { drugId: number; quantity: string; unitPrice: string | null; dosage: string | null },
  ) => api.post<VisitBill['drugs'][number]>(`/api/visits/${visitId}/drugs`, body),

  removeDrug: (itemId: number) => api.delete<null>(`/api/visits/drugs/${itemId}`),
}
