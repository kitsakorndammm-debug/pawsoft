import { api } from '@/lib/api-client'

/**
 * สัญญากับ `/api/employees`
 *
 * ชนิดในนี้ตรงกับ `toWire` ที่ route คืนจริง —
 * `apps/api/src/modules/employee/employee.routes.ts`
 *
 * **ต่างจากทะเบียนอื่นสามเรื่อง**: ลิสต์แบ่งหน้า · ไม่มี `sortOrder` (ลากเรียงไม่ได้) ·
 * สภาพการทำงานมี endpoint ของตัวเอง
 */

/** ทำงานอยู่ · พ้นสภาพ — ตรงกับ enum `WorkStatus` ของ BE */
export type WorkStatus = 'ACTIVE' | 'TERMINATED'

export type Employee = {
  id: number
  code: string
  firstName: string
  lastName: string
  nickname: string | null
  /** บันทึกอิสระ · `null` = ยังไม่เคยเขียน */
  note: string | null
  workStatus: WorkStatus
  /** สาขาที่สังกัด — **บังคับ** ทุกคนทำงานอยู่ที่ใดที่หนึ่ง */
  phone: string | null
  email: string | null
  hiredAt: string | null
  departmentId: number | null
  positionId: number | null
}

/**
 * ฟิลด์ที่ `POST` กับ `PATCH` รับ — **ไม่มี `workStatus`**
 *
 * สภาพการทำงานมีประตูของตัวเอง · ส่งมาพร้อมฟอร์มเมื่อไหร่ คนกดบันทึกข้อมูลทั่วไป
 * จะระงับบัญชีใครไปโดยไม่รู้ตัว
 *
 * FK สามตัวท้ายเป็น `null` ได้ตามที่ BE ประกาศ (`t.Union([t.Number(), t.Null()])`) —
 * **ต้องส่งมาเสมอแม้เป็น `null`** เพราะ "ไม่สังกัด" กับ "ฟอร์มไม่ได้ถาม" คนละเรื่อง
 */
export type EmployeeInput = {
  code: string
  firstName: string
  lastName: string
  nickname: string | null
  note: string | null
  phone: string | null
  email: string | null
  hiredAt: string | null
  departmentId: number | null
  positionId: number | null
}

export const employeeApi = {
  /**
   * ลิสต์แบ่งหน้า — ต้องใช้ `getPaged` ไม่ใช่ `get`
   *
   * `get` แกะเอาแต่ `data` แล้วทิ้ง `page` ทิ้ง ตารางจะไม่รู้ว่ามีทั้งหมดกี่แถว
   */
  list: (input: { q: string; page: number; pageSize: number }) => {
    const search = new URLSearchParams({
      page: String(input.page),
      pageSize: String(input.pageSize),
    })
    // ส่ง `q` เฉพาะตอนมีค่า — `q=` ว่าง ๆ คือคำค้นที่ว่างเปล่า
    if (input.q) search.set('q', input.q)
    return api.getPaged<Employee>(`/api/employees?${search.toString()}`)
  },

  create: (input: EmployeeInput) => api.post<Employee>('/api/employees', input),

  update: (id: number, input: EmployeeInput) =>
    api.patch<Employee>(`/api/employees/${id}`, input),

  remove: (id: number) => api.delete<null>(`/api/employees/${id}`),

  /** เปลี่ยนสภาพการทำงาน — เส้นแยก ส่งค่าที่ต้องการมาตรง ๆ ไม่ใช่ปุ่มสลับ */
  setWorkStatus: (id: number, workStatus: WorkStatus) =>
    api.patch<Employee>(`/api/employees/${id}/work-status`, { workStatus }),
}
