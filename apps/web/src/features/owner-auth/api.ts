import { api } from '@/lib/api-client'

/** บัญชีเจ้าของสัตว์ที่ล็อกอินอยู่ — **ไม่มี permissions** ดู docs/standards/auth.md */
export type OwnerSession = {
  id: number
  email: string
  displayName: string
  pictureUrl: string | null
}

export const ownerAuthApi = {
  me: () => api.get<OwnerSession>('/api/owner-auth/me'),
  logout: () => api.post<null>('/api/owner-auth/logout'),
  googleStatus: () => api.get<{ configured: boolean }>('/api/owner-auth/google/status'),
}

/**
 * ที่อยู่ที่พาไป Google
 *
 * **เป็นการเดินทางของเบราว์เซอร์ ไม่ใช่ `fetch`** — จึงเป็นสตริงให้เอาไปใส่ `href`
 * ไม่ใช่ฟังก์ชันที่ยิง request · ยิงด้วย fetch จะติด CORS ของ Google และไม่มีทางสำเร็จ
 */
export const googleLoginUrl = () =>
  `${process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3201'}/api/owner-auth/google`

/**
 * ตัวตนของฉันในระบบคลินิก
 *
 * **`owner` เป็น `null` ได้ และนั่นคือสถานะปกติ** ไม่ใช่ error — ลูกค้าที่เพิ่งล็อกอิน
 * Google ครั้งแรกยังไม่มีใครจับคู่ให้ · หน้าเว็บต้องบอกให้ถูกว่าต้องทำอะไรต่อ
 * ("ติดต่อคลินิก") แทนที่จะบอกว่าเข้าระบบไม่สำเร็จ
 */
export type MyProfile = {
  accountId: number
  email: string
  displayName: string
  owner: { id: number; code: string; name: string } | null
}

export type MyPet = {
  id: number
  code: string
  name: string
  ownerId: number
  speciesId: number
}

/**
 * ที่อยู่รูปสัตว์ — **เปิดตรง ๆ ได้เพราะ cookie ไปด้วย**
 *
 * `?v=` บังคับให้เบราว์เซอร์โหลดใหม่หลังเปลี่ยนรูป · URL เดิมเป๊ะ ๆ จะได้รูปเก่า
 * จาก cache ทั้งที่อัปรูปใหม่ไปแล้ว
 */
export const petPhotoUrl = (petId: number, version?: string | number) =>
  `${process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3201'}/api/my/pets/${petId}/photo` +
  (version === undefined ? '' : `?v=${version}`)

export type SpeciesOption = { id: number; name: string }
export type BreedOption = { id: number; name: string; speciesId: number }

/** ประวัติการรักษาหนึ่งครั้ง — **เฉพาะครั้งที่ตรวจจบแล้ว** BE กรองให้ */
export type MyVisit = {
  id: number
  /** `YYYY-MM-DD` */
  queueDate: string
  status: string
  petId: number | null
  petName: string | null
  symptom: string | null
  diagnosis: string | null
  vetName: string | null
}

export type MyVisitService = {
  id: number
  name: string
  quantity: number
  unitPrice: string
}

export type MyVisitDrug = {
  id: number
  name: string
  unit: string | null
  quantity: string
  unitPrice: string
  dosage: string | null
}

/** ครั้งเดียวแบบเต็ม — เหมือน `MyVisit` บวกรายการรักษาและยาที่หมอบันทึกไว้ */
export type MyVisitDetail = MyVisit & {
  services: MyVisitService[]
  drugs: MyVisitDrug[]
  /** ยอดรวม — ข้อความ เพราะเงินไม่เดินทางเป็น `number` */
  total: string
}

export const myApi = {
  profile: () => api.get<MyProfile>('/api/my/profile'),
  /** สัตว์ของฉัน — กรองด้วยเซสชันที่ BE ไม่มีพารามิเตอร์ให้ส่ง */
  pets: () => api.get<MyPet[]>('/api/my/pets'),

  /**
   * ลูกค้าสมัครเอง — สร้างแถวลูกค้าให้บัญชีที่ยังไม่มีตัวตนในระบบ
   *
   * (ผู้ใช้ทักท้วง 2026-09-01: "ไม่ใช่ลูกค้าทุกคนที่จะเคยมาคลินิกนะ")
   */
  register: (body: { name: string; phone: string | null }) =>
    api.post<{ id: number; code: string; name: string; phone: string | null }>(
      '/api/my/profile',
      body,
    ),

  /** ชนิดสัตว์ — เส้นของลูกค้า ไม่ใช่ `/api/species` ซึ่งการ์ดด้วย cookie ของพนักงาน */
  species: () => api.get<SpeciesOption[]>('/api/my/species'),

  breeds: (speciesId: number | null) =>
    api.get<BreedOption[]>(
      speciesId === null ? '/api/my/breeds' : `/api/my/breeds?speciesId=${speciesId}`,
    ),

  createPet: (body: {
    name: string
    speciesId: string
    breedId: string | null
    sex?: 'MALE' | 'FEMALE' | 'UNKNOWN'
    bornOn: string | null
    note: string | null
  }) => api.post<{ id: number; code: string; name: string }>('/api/my/pets', body),

  visits: (page: number, pageSize: number) =>
    api.getPaged<MyVisit>(`/api/my/visits?page=${page}&pageSize=${pageSize}`),

  visit: (id: number) => api.get<MyVisitDetail>(`/api/my/visits/${id}`),

  /** แก้สัตว์ของตัวเอง — เพศกับน้ำหนักไม่อยู่ในนี้ เพราะหมอเป็นคนบันทึก */
  updatePet: (
    id: number,
    body: {
      name: string
      speciesId: string
      breedId: string | null
      bornOn: string | null
      note: string | null
    },
  ) => api.patch<{ id: number; code: string; name: string }>(`/api/my/pets/${id}`, body),

  deletePet: (id: number) => api.delete<null>(`/api/my/pets/${id}`),

  /** อัปรูป — `FormData` ไม่ใช่ JSON · api-client ไม่ตั้ง content-type ให้เอง */
  uploadPetPhoto: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)

    return api.post<{ id: number; hasPhoto: boolean }>(`/api/my/pets/${id}/photo`, form)
  },

  removePetPhoto: (id: number) => api.delete<null>(`/api/my/pets/${id}/photo`),
}
