import { api } from '@/lib/api-client'

/**
 * ยาและเวชภัณฑ์
 *
 * **`price` เป็น `string` ไม่ใช่ `number`** — `0.1 + 0.2 !== 0.3` และเงินที่คลาดไป
 * เศษสตางค์คือใบเสร็จที่บวกไม่ลง · ห้ามเขียน `Number(price)` ที่ไหนทั้งสิ้น
 *
 * `null` = ยังไม่ตั้งราคา · `'0'` = แจกฟรี · **สองอย่างนี้ต่างกัน** และหน้าจอต้องแยกให้ออก
 */
export type Drug = {
  id: number
  code: string | null
  name: string
  genericName: string | null
  unit: string | null
  packageSize: string | null
  price: string | null
  categoryId: number | null
  isActive: boolean
  note: string | null
}

/** สิ่งที่ฟอร์มส่งขึ้นไป — รูปเดียวกับ body ของ BE */
export type DrugInput = {
  code: string | null
  name: string
  genericName: string | null
  unit: string | null
  packageSize: string | null
  price: string | null
  categoryId: number | null
  note: string | null
}

/** เท่าที่ combobox ต้องรู้ — พร้อมราคาและหน่วย เพราะใบสั่งยาคิดเงินจากตรงนี้ */
export type DrugOption = { id: number; name: string; unit: string | null; price: string | null }

export const drugApi = {
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

    return api.getPaged<Drug>(`/api/drugs?${search.toString()}`)
  },

  /**
   * ยาสำหรับ combobox — **เฉพาะตัวที่ยังใช้งานอยู่**
   *
   * เส้นนี้ขอแค่ล็อกอิน ไม่ต้องมีสิทธิ์จัดการยา · คนที่บันทึกการรักษาต้องเลือกยาได้
   */
  lookup: () => api.get<DrugOption[]>('/api/drugs/lookup'),

  create: (body: DrugInput) => api.post<Drug>('/api/drugs', body),

  update: (id: number, body: DrugInput) => api.patch<Drug>(`/api/drugs/${id}`, body),

  setActive: (id: number, isActive: boolean) =>
    api.patch<Drug>(`/api/drugs/${id}/active`, { isActive }),

  remove: (id: number) => api.delete<null>(`/api/drugs/${id}`),
}
