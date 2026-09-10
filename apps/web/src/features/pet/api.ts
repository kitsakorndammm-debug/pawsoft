import { api } from '@/lib/api-client'

export type PetSex = 'MALE' | 'FEMALE' | 'UNKNOWN'

/**
 * สัตว์เลี้ยง
 *
 * **`weightKg` เป็น `string`** ด้วยเหตุผลเดียวกับราคายา — ขนาดยาคิดจากน้ำหนัก
 * และ `Decimal` ที่เดินทางเป็น `number` เสียความแม่น
 *
 * **`deceasedOn` ไม่ใช่การลบ** — ประวัติยังอยู่ แค่ไม่โผล่ในช่องเลือกสัตว์
 */
export type Pet = {
  id: number
  code: string
  ownerId: number
  name: string
  speciesId: number
  breedId: number | null
  sex: PetSex
  /** `null` = ยังไม่ได้ถาม · ต่างจาก `false` ที่แปลว่าถามแล้วและยังไม่ทำ */
  isNeutered: boolean | null
  bornOn: string | null
  weightKg: string | null
  color: string | null
  microchip: string | null
  allergyNote: string | null
  note: string | null
  deceasedOn: string | null
}

export type PetInput = {
  ownerId: number
  name: string
  speciesId: number
  breedId: number | null
  sex: PetSex
  isNeutered: boolean | null
  bornOn: string | null
  weightKg: string | null
  color: string | null
  microchip: string | null
  allergyNote: string | null
  note: string | null
}

export type PetOption = {
  id: number
  code: string
  name: string
  ownerId: number
  speciesId: number
}

export const petApi = {
  list: (input: {
    q: string
    ownerId: number | null
    speciesId: number | null
    includeDeceased: boolean
    page: number
    pageSize: number
  }) => {
    const search = new URLSearchParams({
      page: String(input.page),
      pageSize: String(input.pageSize),
    })
    if (input.q) search.set('q', input.q)
    if (input.ownerId !== null) search.set('ownerId', String(input.ownerId))
    if (input.speciesId !== null) search.set('speciesId', String(input.speciesId))
    if (input.includeDeceased) search.set('includeDeceased', 'true')

    return api.getPaged<Pet>(`/api/pets?${search.toString()}`)
  },

  /** **สัตว์ของเจ้าของคนเดียว** — `ownerId` บังคับ ดู `///` ฝั่ง BE */
  lookup: (ownerId: number) => api.get<PetOption[]>(`/api/pets/lookup?ownerId=${ownerId}`),

  get: (id: number) => api.get<Pet>(`/api/pets/${id}`),

  create: (body: PetInput) => api.post<Pet>('/api/pets', body),

  update: (id: number, body: PetInput) => api.patch<Pet>(`/api/pets/${id}`, body),

  setDeceased: (id: number, deceasedOn: string | null) =>
    api.patch<Pet>(`/api/pets/${id}/deceased`, { deceasedOn }),

  remove: (id: number) => api.delete<null>(`/api/pets/${id}`),
}

// ---- ชนิดและสายพันธุ์ ----

export type Species = { id: number; name: string; sortOrder: number | null }
export type SpeciesOption = { id: number; name: string }

export const speciesApi = {
  list: (q?: string) => api.get<Species[]>(`/api/species${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  lookup: () => api.get<SpeciesOption[]>('/api/species/lookup'),
  create: (name: string) => api.post<Species>('/api/species', { name }),
  update: (id: number, name: string) => api.patch<Species>(`/api/species/${id}`, { name }),
  remove: (id: number) => api.delete<null>(`/api/species/${id}`),
}

export type Breed = { id: number; speciesId: number; name: string }

export const breedApi = {
  list: (speciesId: number | null) =>
    api.get<Breed[]>(`/api/breeds${speciesId === null ? '' : `?speciesId=${speciesId}`}`),

  /**
   * **คืน `speciesId` มาด้วยเสมอ** — หน้าจอกรองพันธุ์ตามชนิดที่เลือกไว้ในช่องก่อนหน้า
   * ไม่งั้นฟอร์มโชว์พันธุ์หมาให้คนที่เลือกแมว แล้วฐานปฏิเสธตอนกดบันทึก ซึ่งสายเกินไป
   */
  lookup: (speciesId: number | null) =>
    api.get<Breed[]>(`/api/breeds/lookup${speciesId === null ? '' : `?speciesId=${speciesId}`}`),

  create: (speciesId: number, name: string) => api.post<Breed>('/api/breeds', { speciesId, name }),
  update: (id: number, speciesId: number, name: string) =>
    api.patch<Breed>(`/api/breeds/${id}`, { speciesId, name }),
  remove: (id: number) => api.delete<null>(`/api/breeds/${id}`),
}
