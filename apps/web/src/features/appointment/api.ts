import { api } from '@/lib/api-client'

/**
 * ช่วงเวลาที่จองได้ — **4 ช่วง** (ผู้ใช้กำหนด 2026-09-01: เช้า 2 · บ่าย 2)
 *
 * **เวลาจริงอยู่ที่นี่ ไม่ใช่ในฐาน** — เวลาเปิดคลินิกเปลี่ยนได้ โดยที่การจองเก่า
 * ไม่ควรเปลี่ยนความหมายตาม · ฐานรู้แค่ว่า "ช่วงที่หนึ่งของเช้า"
 */
export type AppointmentSlot = 'MORNING_1' | 'MORNING_2' | 'AFTERNOON_1' | 'AFTERNOON_2'

export const SLOT_LABEL: Record<AppointmentSlot, string> = {
  MORNING_1: 'เช้า 09:00–10:30',
  MORNING_2: 'เช้า 10:30–12:00',
  AFTERNOON_1: 'บ่าย 13:00–15:00',
  AFTERNOON_2: 'เย็น 15:00–17:00',
}

export type AppointmentStatus =
  /** ลูกค้าจองออนไลน์เอง — **ยังไม่ใช่คิวที่คลินิกรับปาก** รอพนักงานโทรยืนยัน */
  | 'PENDING'
  | 'BOOKED'
  | 'ARRIVED'
  | 'CANCELLED'
  | 'NO_SHOW'

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING: 'รอยืนยัน',
  BOOKED: 'ยืนยันแล้ว',
  ARRIVED: 'มาแล้ว',
  CANCELLED: 'ยกเลิก',
  NO_SHOW: 'ไม่มา',
}

/** สีของสถานะ — `PENDING` ต้องเด่นกว่าตัวอื่นเพราะเป็นใบที่รอคนทำงาน */
export const APPOINTMENT_STATUS_STYLE: Record<AppointmentStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  BOOKED: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300',
  ARRIVED: 'bg-sky-100 text-sky-800 ring-1 ring-sky-300',
  CANCELLED: 'bg-muted text-muted-foreground ring-1 ring-border',
  NO_SHOW: 'bg-red-100 text-red-800 ring-1 ring-red-300',
}

/** **การจองยังไม่ใช่คิว** — คิวเกิดตอน check-in ที่หน้าคิว */
export type Appointment = {
  id: number
  bookedOn: string
  slot: AppointmentSlot
  ownerId: number
  petId: number | null
  /** ชื่อสัตว์ที่ลูกค้าบอกมา — ใช้เมื่อยังไม่มีแถวใน `pet` */
  petNameText: string | null
  source: 'ONLINE' | 'PHONE'
  status: AppointmentStatus
  reason: string | null
  cancelReason: string | null
}

/**
 * ใบจองในตาราง — **มีชื่อ ไม่ใช่แค่ id**
 *
 * `displayName` BE คำนวณมาให้: สัตว์ที่ลงทะเบียนแล้วใช้ชื่อจริง · ที่ยังไม่มีใน
 * ทะเบียนใช้ชื่อที่ลูกค้าบอกมา
 */
export type AppointmentRow = Appointment & {
  pet: { id: number; name: string } | null
  owner: { id: number; code: string; name: string; phone: string | null }
  displayName: string
}

export type AppointmentInput = {
  bookedOn: string
  slot: AppointmentSlot
  ownerId: number
  petId: number | null
  petNameText: string | null
  reason: string | null
}

export const appointmentApi = {
  list: (input: {
    bookedOn: string | null
    status: AppointmentStatus | null
    page: number
    pageSize: number
  }) => {
    const search = new URLSearchParams({
      page: String(input.page),
      pageSize: String(input.pageSize),
    })
    if (input.bookedOn) search.set('bookedOn', input.bookedOn)
    if (input.status) search.set('status', input.status)

    return api.getPaged<AppointmentRow>(`/api/appointments?${search.toString()}`)
  },

  /** ช่วงเวลาและ "วันนี้" จาก BE — **ไม่คำนวณวันนี้เองในเบราว์เซอร์** */
  slots: () =>
    api.get<{ slots: AppointmentSlot[]; today: string }>('/api/appointments/slots'),

  /**
   * เหมือนกัน แต่เป็น**เส้นของลูกค้า**
   *
   * เส้นข้างบนการ์ดด้วย `reception:read` ซึ่งลูกค้าไม่มี · เรียกผิดเส้นจะได้ 401
   * เงียบ ๆ แล้ว `today` ว่าง ช่องวันที่ไม่ตั้งค่าเริ่มต้นให้ (แก้ 2026-09-01)
   */
  mySlots: () =>
    api.get<{ slots: AppointmentSlot[]; today: string }>('/api/my/slots'),

  create: (body: AppointmentInput) => api.post<Appointment>('/api/appointments', body),

  cancel: (id: number, reason: string) =>
    api.patch<Appointment>(`/api/appointments/${id}/cancel`, { reason }),

  noShow: (id: number) => api.patch<Appointment>(`/api/appointments/${id}/no-show`, {}),

  /** พนักงานยืนยันใบที่ลูกค้าจองออนไลน์ — `PENDING` → `BOOKED` */
  confirm: (id: number) => api.patch<Appointment>(`/api/appointments/${id}/confirm`, {}),

  remove: (id: number) => api.delete<null>(`/api/appointments/${id}`),
}

/**
 * ฝั่งลูกค้า — **ไม่ส่ง `ownerId`** มันมาจากเซสชัน
 *
 * ส่ง `ownerId` เมื่อไหร่ ลูกค้าคนหนึ่งจะจองแทนคนอื่นได้ด้วยการเดาเลข · BE ปฏิเสธ
 * ฟิลด์นี้อยู่แล้ว แต่ที่นี่ไม่มีให้ส่งตั้งแต่ต้น
 */
export type MyAppointmentInput = {
  bookedOn: string
  slot: AppointmentSlot
  petId: number | null
  petNameText: string | null
  reason: string | null
}

export const myAppointmentApi = {
  /**
   * **`AppointmentRow` ไม่ใช่ `Appointment`** — เส้นนี้ใช้ `toRowWire` ที่ BE
   * จึงมี `displayName` (ชื่อสัตว์) มาด้วย · ประกาศเป็น `Appointment` เฉย ๆ
   * ทำให้หน้าจอมองไม่เห็นชื่อ แล้วต้องเขียน "สัตว์ในระบบ" แทน (แก้ 2026-09-01)
   */
  list: (input: { page: number; pageSize: number }) =>
    api.getPaged<AppointmentRow>(
      `/api/my/appointments?page=${input.page}&pageSize=${input.pageSize}`,
    ),

  create: (body: MyAppointmentInput) => api.post<Appointment>('/api/my/appointments', body),

  cancel: (id: number, reason: string) =>
    api.patch<Appointment>(`/api/my/appointments/${id}/cancel`, { reason }),
}
