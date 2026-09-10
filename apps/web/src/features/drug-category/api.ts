import { api } from '@/lib/api-client'

/**
 * สัญญากับ `/api/drug-categorys` — หมวดยา
 *
 * **`kind` ไม่ใช่ธงเปล่า** — มันเปลี่ยนสิ่งที่หน้าจอลูกค้าทำจริง · `JURISTIC` เปิดตาราง
 * สาขาและเปลี่ยนป้ายช่องเลขภาษี ส่วน `INDIVIDUAL` ไม่มีสาขา · ทะเบียนนี้จึงมีสองคอลัมน์
 * ต่างจากเฉดสีหรือเงื่อนไขการชำระเงินที่มีแต่ชื่อ
 */

/** สองชนิดที่ BE รับ — `KIND` ใน `drug-category.routes.ts` */

export type DrugCategory = {
  id: number
  name: string
  /** ลำดับในลิสต์ · แถวที่ยังอยู่มีค่าเสมอ */
  sortOrder: number | null
}

/**
 * รูปที่ combobox ในหน้าอื่นใช้ — `/lookup` คืนแค่นี้
 *
 * **มี `kind` ติดมาด้วย ต่างจาก lookup ตัวอื่น** · หน้าฟอร์มลูกค้าต้องรู้ชนิดตั้งแต่
 * ตอนเลือก เพราะมันตัดสินว่าจะเปิดตารางสาขาไหมและป้ายเลขภาษีเขียนว่าอะไร ·
 * ยิงถามซ้ำอีกรอบหลังเลือกแปลว่าหน้าจอกระพริบระหว่างรอ
 */
export type DrugCategoryOption = {
  id: number
  name: string
}

export const drugCategoryApi = {
  /**
   * ตัวเลือกสำหรับ combobox ในหน้าอื่น
   *
   * **ไม่ใช่ `list`** — `/lookup` ขอแค่ล็อกอิน ไม่ขอสิทธิ์ของเมนูตั้งค่า · คนที่ต้อง
   * เลือกหมวดยาตอนเปิดใบจึงไม่ต้องได้สิทธิ์เข้าหน้าจัดการทะเบียนไปด้วย
   * (`docs/standards/api-conventions.md`)
   */
  lookup: () => api.get<DrugCategoryOption[]>('/api/drug-categorys/lookup'),

  /**
   * ไม่แบ่งหน้า — BE คืนทั้งหมด เพดาน 500 แถว
   * เพราะหน้านี้ลากจัดลำดับได้ และลากข้ามหน้าไม่ได้
   */
  list: (q: string) => {
    // ส่ง `q` เฉพาะตอนมีค่า — `q=` ว่าง ๆ คือคำค้นที่ว่างเปล่า
    // ซึ่งไม่ใช่สิ่งที่ผู้ใช้ตั้งใจตอนล้างช่องค้น
    const query = q ? `?q=${encodeURIComponent(q)}` : ''
    return api.get<DrugCategory[]>(`/api/drug-categorys${query}`)
  },

  create: (name: string) =>
    api.post<DrugCategory>('/api/drug-categorys', { name }),

  /**
   * แก้ชื่อและชนิด — ส่งทั้งคู่เสมอ
   *
   * BE รับแบบไม่บังคับทั้งสองตัว (ส่งตัวไหนมาก็แก้ตัวนั้น) แต่กล่องของหน้านี้กรอกครบ
   * ทั้งสองช่องอยู่แล้ว · ส่งครบตรงกับสิ่งที่คนเห็นบนจอตอนกดบันทึก
   */
  update: (id: number, name: string) =>
    api.patch<DrugCategory>(`/api/drug-categorys/${id}`, { name }),

  remove: (id: number) => api.delete<null>(`/api/drug-categorys/${id}`),

  /**
   * ย้ายไปอยู่ **ก่อน** แถว `beforeId` · `null` = ล่างสุด
   *
   * ต้องส่งเสมอแม้เป็น `null` — "ไปล่างสุด" กับ "ไม่ได้บอกว่าจะวางตรงไหน"
   * คนละเรื่องกัน
   */
  move: (id: number, beforeId: number | null) =>
    api.patch<null>(`/api/drug-categorys/${id}/move`, { beforeId }),
}
