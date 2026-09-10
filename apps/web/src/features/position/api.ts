import { api } from '@/lib/api-client'

/**
 * สัญญากับ `/api/positions`
 *
 * ทะเบียนนี้สังกัดแผนก — `departmentId` ต้องส่งทุกครั้งที่เขียน
 * ชื่อฟิลด์ตรงกับที่ BE ประกาศไว้ (`parent.field` ใน `position.service.ts`)
 * ไม่ตรงแปลว่าค่าที่ส่งไปถูกปฏิเสธว่าเป็นฟิลด์ที่ไม่รู้จัก
 */

export type Position = {
  id: number
  name: string
  /** ลำดับในลิสต์ · แถวที่ยังอยู่มีค่าเสมอ */
  sortOrder: number | null
  /** แผนก ที่สังกัด · `null` = ยังไม่ได้ผูก */
  departmentId: number | null
}

export type PositionInput = {
  name: string
  departmentId: number | null
}

/**
 * รูปที่ combobox ในหน้าอื่นใช้ — `/lookup` คืนแค่นี้
 *
 * ไม่ใช่ `Position` ตัวเต็ม · หน้าที่แค่ต้องให้คนเลือกตำแหน่งไม่ควรจ่ายค่าขนส่งของคอลัมน์
 * ที่มันไม่ได้ใช้ และวันที่ทะเบียนนี้มีคอลัมน์เพิ่ม หน้าพวกนั้นจะไม่หนักขึ้นตาม
 *
 * `departmentId` มีเฉพาะทะเบียนนี้ — ฟอร์มพนักงานกรองตำแหน่งตามแผนกที่เลือก
 * รวมถึงตอนที่ยังไม่เลือกแผนก ซึ่งขอผ่าน `?departmentId=` ไม่ได้
 */
export type PositionOption = {
  id: number
  name: string
  /** แผนกที่สังกัด · `null` = ไม่สังกัดแผนกไหน */
  departmentId: number | null
}

export const positionApi = {
  /**
   * ตัวเลือกสำหรับ combobox ในหน้าอื่น
   *
   * **ไม่ใช่ `list`** — `/lookup` ขอแค่ล็อกอิน ไม่ขอสิทธิ์ของเมนูตั้งค่า · คนที่ต้อง
   * เลือกตำแหน่งจึงไม่ต้องได้สิทธิ์เข้าหน้าจัดการตำแหน่งไปด้วย
   * (`docs/standards/api-conventions.md`)
   */
  lookup: () => api.get<PositionOption[]>('/api/positions/lookup'),
  /**
   * ไม่แบ่งหน้า — BE คืนทั้งหมด เพดาน 500 แถว
   * เพราะหน้านี้ลากจัดลำดับได้ และลากข้ามหน้าไม่ได้
   */
  list: (q: string) => {
    const query = q ? `?q=${encodeURIComponent(q)}` : ''
    return api.get<Position[]>(`/api/positions${query}`)
  },

  create: (input: PositionInput) => api.post<Position>('/api/positions', input),

  update: (id: number, input: PositionInput) => api.patch<Position>(`/api/positions/${id}`, input),

  remove: (id: number) => api.delete<null>(`/api/positions/${id}`),

  /**
   * ย้ายไปอยู่ **ก่อน** แถว `beforeId` · `null` = ล่างสุด
   *
   * ต้องส่งเสมอแม้เป็น `null` — "ไปล่างสุด" กับ "ไม่ได้บอกว่าจะวางตรงไหน"
   * คนละเรื่องกัน
   */
  move: (id: number, beforeId: number | null) =>
    api.patch<null>(`/api/positions/${id}/move`, { beforeId }),
}
