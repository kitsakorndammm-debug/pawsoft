import { api } from '@/lib/api-client'

/**
 * รายการรักษาและบริการ
 *
 * **`price` เป็น `string` ไม่ใช่ `number`** — `0.1 + 0.2 !== 0.3` และเงินที่คลาดไป
 * เศษสตางค์คือใบเสร็จที่บวกไม่ลง · ห้ามเขียน `Number(price)` ที่ไหนทั้งสิ้น
 *
 * `null` = ยังไม่ตั้งราคา · `'0'` = แจกฟรี · **สองอย่างนี้ต่างกัน** และหน้าจอต้องแยกให้ออก
 */
export type ServiceItem = {
  id: number
  code: string | null
  name: string
  description: string | null
  price: string | null
  categoryId: number | null
  isActive: boolean
}

/** สิ่งที่ฟอร์มส่งขึ้นไป — รูปเดียวกับ body ของ BE */
export type ServiceItemInput = {
  code: string | null
  name: string
  description: string | null
  price: string | null
  categoryId: number | null
}

/** เท่าที่ combobox ต้องรู้ — พร้อมราคา เพราะใบเสร็จคิดเงินจากตรงนี้ */
export type ServiceItemOption = { id: number; name: string; price: string | null }

export const serviceItemApi = {
  /**
   * **`getPaged` ไม่ใช่ `get`** — เส้นนี้แบ่งหน้า และ `get` จะทิ้ง `page` ไปเงียบ ๆ
   * แล้วตารางวาดปุ่มเลขหน้าไม่ได้
   */
  list: (input: { q: string; categoryId: number | null; page: number; pageSize: number }) => {
    const search = new URLSearchParams({
      page: String(input.page),
      pageSize: String(input.pageSize),
    })

    // ส่งเฉพาะตอนมีค่า — `q=` ว่าง ๆ คือคำค้นที่ว่างเปล่า ไม่ใช่ "ไม่ค้น"
    if (input.q) search.set('q', input.q)
    if (input.categoryId !== null) search.set('categoryId', String(input.categoryId))

    return api.getPaged<ServiceItem>(`/api/service-items?${search.toString()}`)
  },

  /**
   * รายการรักษาสำหรับ combobox — **เฉพาะตัวที่ยังใช้งานอยู่**
   *
   * เส้นนี้ขอแค่ล็อกอิน ไม่ต้องมีสิทธิ์จัดการรายการ
   */
  lookup: () => api.get<ServiceItemOption[]>('/api/service-items/lookup'),

  create: (body: ServiceItemInput) => api.post<ServiceItem>('/api/service-items', body),

  update: (id: number, body: ServiceItemInput) => api.patch<ServiceItem>(`/api/service-items/${id}`, body),

  setActive: (id: number, isActive: boolean) =>
    api.patch<ServiceItem>(`/api/service-items/${id}/active`, { isActive }),

  remove: (id: number) => api.delete<null>(`/api/service-items/${id}`),
}
