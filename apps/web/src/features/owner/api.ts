import { api } from '@/lib/api-client'

/** เจ้าของสัตว์ — **ตัวคน ไม่ใช่บัญชีล็อกอิน** ดู `///` บน `Owner` ในสคีมา */
export type Owner = {
  id: number
  code: string
  name: string
  phone: string | null
  phoneAlt: string | null
  email: string | null
  address: string | null
  /** บัญชี Google ที่จับคู่ไว้ — **`null` คือปกติ ไม่ใช่ข้อมูลไม่ครบ** */
  petOwnerAccountId: number | null
  note: string | null
}

export type OwnerInput = {
  name: string
  phone: string | null
  phoneAlt: string | null
  email: string | null
  address: string | null
  note: string | null
}

/** เท่าที่ combobox ต้องรู้ — พก `phone` มาเพราะชื่อซ้ำกันได้และเบอร์คือตัวแยก */
export type OwnerOption = { id: number; code: string; name: string; phone: string | null }

/** บัญชี Google ที่ยังไม่ถูกจับคู่กับใคร */
export type UnlinkedAccount = { id: number; email: string; displayName: string }

export const ownerApi = {
  list: (input: { q: string; page: number; pageSize: number; linked?: boolean }) => {
    const search = new URLSearchParams({
      page: String(input.page),
      pageSize: String(input.pageSize),
    })
    if (input.q) search.set('q', input.q)
    if (input.linked !== undefined) search.set('linked', String(input.linked))

    return api.getPaged<Owner>(`/api/owners?${search.toString()}`)
  },

  /**
   * ค้นเจ้าของ — **ต้องมีคำค้นเสมอ ไม่คืนทั้งตาราง**
   *
   * ลูกค้าคลินิกมีหลักหมื่นและโตทุกวัน · โหลดทั้งชุดคือหน้าที่ค้างตอนเปิด
   */
  lookup: (q: string) =>
    api.get<OwnerOption[]>(`/api/owners/lookup?q=${encodeURIComponent(q)}`),

  /**
   * บัญชี Google ที่ยังว่าง — **คืนเฉพาะที่ยังไม่ผูกกับใคร**
   *
   * บัญชีที่ผูกไปแล้วโผล่มาให้เลือก คือทางที่พนักงานจะกดผิดแล้วได้ `DUPLICATE`
   */
  lookupAccounts: (q: string) =>
    api.get<UnlinkedAccount[]>(`/api/owners/accounts/lookup?q=${encodeURIComponent(q)}`),

  get: (id: number) => api.get<Owner>(`/api/owners/${id}`),

  create: (body: OwnerInput) => api.post<Owner>('/api/owners', body),

  update: (id: number, body: OwnerInput) => api.patch<Owner>(`/api/owners/${id}`, body),

  /** จับคู่บัญชี Google · ส่ง `null` เพื่อถอน */
  linkAccount: (id: number, petOwnerAccountId: number | null) =>
    api.patch<Owner>(`/api/owners/${id}/account`, { petOwnerAccountId }),

  remove: (id: number) => api.delete<null>(`/api/owners/${id}`),
}
