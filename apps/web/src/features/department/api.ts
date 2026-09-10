import { api } from '@/lib/api-client'

/**
 * สัญญากับ `/api/departments`
 *
 * ชนิดในนี้ตรงกับที่ route คืนจริง ไม่ใช่รูปของแถวในฐาน
 */

export type Department = {
  id: number
  name: string
  /** ลำดับในลิสต์ · แถวที่ยังอยู่มีค่าเสมอ */
  sortOrder: number | null
}

/**
 * รูปที่ combobox ในหน้าอื่นใช้ — `/lookup` คืนแค่นี้
 *
 * ไม่ใช่ `Department` ตัวเต็ม · หน้าที่แค่ต้องให้คนเลือกแผนกไม่ควรจ่ายค่าขนส่งของคอลัมน์
 * ที่มันไม่ได้ใช้ และวันที่ทะเบียนนี้มีคอลัมน์เพิ่ม หน้าพวกนั้นจะไม่หนักขึ้นตาม
 */
export type DepartmentOption = {
  id: number
  name: string
}

export const departmentApi = {
  /**
   * ตัวเลือกสำหรับ combobox ในหน้าอื่น
   *
   * **ไม่ใช่ `list`** — `/lookup` ขอแค่ล็อกอิน ไม่ขอสิทธิ์ของเมนูตั้งค่า · คนที่ต้อง
   * เลือกแผนกจึงไม่ต้องได้สิทธิ์เข้าหน้าจัดการแผนกไปด้วย
   * (`docs/standards/api-conventions.md`)
   */
  lookup: () => api.get<DepartmentOption[]>('/api/departments/lookup'),
  /**
   * ไม่แบ่งหน้า — BE คืนทั้งหมด เพดาน 500 แถว
   * เพราะหน้านี้ลากจัดลำดับได้ และลากข้ามหน้าไม่ได้
   */
  list: (q: string) => {
    // ส่ง `q` เฉพาะตอนมีค่า — `q=` ว่าง ๆ คือคำค้นที่ว่างเปล่า
    // ซึ่งไม่ใช่สิ่งที่ผู้ใช้ตั้งใจตอนล้างช่องค้น
    const query = q ? `?q=${encodeURIComponent(q)}` : ''
    return api.get<Department[]>(`/api/departments${query}`)
  },

  create: (name: string) => api.post<Department>('/api/departments', { name }),

  update: (id: number, name: string) => api.patch<Department>(`/api/departments/${id}`, { name }),

  remove: (id: number) => api.delete<null>(`/api/departments/${id}`),

  /**
   * ย้ายไปอยู่ **ก่อน** แถว `beforeId` · `null` = ล่างสุด
   *
   * ต้องส่งเสมอแม้เป็น `null` — "ไปล่างสุด" กับ "ไม่ได้บอกว่าจะวางตรงไหน"
   * คนละเรื่องกัน
   */
  move: (id: number, beforeId: number | null) =>
    api.patch<null>(`/api/departments/${id}/move`, { beforeId }),
}
