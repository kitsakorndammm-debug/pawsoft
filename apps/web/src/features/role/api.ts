import { api } from '@/lib/api-client'

/**
 * สัญญากับ `/api/roles` และ `/api/permissions`
 *
 * ชนิดในนี้ตรงกับ `toWire` · `toDetailWire` ที่ route คืนจริง —
 * `apps/api/src/modules/role/role.routes.ts`
 *
 * **หน้าจอเป็นหน้าเดียว** ชื่อบทบาทกับสวิตช์สิทธิ์อยู่ฟอร์มเดียวกัน กดบันทึกทีเดียว ·
 * `create` กับ `update` จึงส่ง `permissionKeys` ไปทั้งชุด ไม่มีเส้น grant/revoke ทีละตัว
 *
 * **สารบัญสิทธิ์อยู่ไฟล์นี้ด้วย** เพราะมันคือฝั่งซ้ายของหน้าเดียวกัน ไม่ใช่ทะเบียนของตัวเอง ·
 * ตาราง `permission` ไม่มี CRUD เลย แถวมาจากโค้ดฝั่ง BE ผ่าน `syncPermissions()` ตอนบูต
 */

export type RoleOption = {
  id: number
  name: string
}

export type Role = {
  id: number
  name: string
  /**
   * บทบาทของระบบ — **แก้และลบไม่ได้เลย**
   *
   * มันถือทุกสิทธิ์โดยไม่ผ่านตาราง junction ซึ่งเป็นสิ่งที่ทำให้ระบบยังแก้ตัวเองได้วันที่
   * โมดูลใหม่ประกาศ key ใหม่ · หน้าจอใช้ค่านี้ปิดปุ่มแก้กับปุ่มลบตั้งแต่แถว
   * ไม่ใช่ปล่อยให้กดแล้วค่อยโดน BE ปฏิเสธ
   */
  isSystem: boolean
  /** จำนวนบัญชีที่ถือบทบาทนี้ — บอกว่าต้องย้ายคนออกกี่คนก่อนถึงจะลบได้ */
  userCount: number
}

/** บทบาทหนึ่งตัวพร้อมสิทธิ์ที่ถืออยู่ — รูปของหน้าฟอร์ม */
export type RoleDetail = {
  id: number
  name: string
  isSystem: boolean
  /** บทบาทระบบคืนทุก key ที่ประกาศไว้ ไม่ใช่ลิสต์ว่าง */
  permissionKeys: string[]
}

/** สิทธิ์หนึ่งตัวในสารบัญ — **ไม่มี `id`** ทั้งระบบอ้างด้วย `key` */
export type Permission = {
  key: string
  label: string
  /** รหัสกลุ่ม — ใช้จัดกอง ไม่ได้เอาไปโชว์ */
  groupCode: string
  /** ชื่อกลุ่มที่คนอ่าน เช่น "ตั้งค่า" */
  groupName: string
}

export type RoleInput = {
  name: string
  permissionKeys: string[]
}

export const roleApi = {
  /**
   * ลิสต์แบ่งหน้า — ต้องใช้ `getPaged` ไม่ใช่ `get`
   *
   * `get` แกะเอาแต่ `data` แล้วทิ้ง `page` ทิ้ง ตารางจะไม่รู้ว่ามีทั้งหมดกี่แถว
   * แล้วปุ่มหน้าถัดไปจะหายไปตั้งแต่หน้าแรก
   */
  list: (input: { q: string; page: number; pageSize: number }) => {
    const search = new URLSearchParams({
      page: String(input.page),
      pageSize: String(input.pageSize),
    })
    // ส่ง `q` เฉพาะตอนมีค่า — `q=` ว่าง ๆ คือคำค้นที่ว่างเปล่า
    if (input.q) search.set('q', input.q)
    return api.getPaged<Role>(`/api/roles?${search.toString()}`)
  },

  /**
   * บทบาทที่เลือกได้ — `/lookup` ขอแค่ล็อกอิน ไม่ขอสิทธิ์ของเมนูไหน
   * (`docs/standards/api-conventions.md`)
   */
  lookup: () => api.get<RoleOption[]>('/api/roles/lookup'),

  /** อ่านทีละตัว — พ่วง `permissionKeys` มาด้วยเสมอ · ลิสต์ไม่มีให้ */
  getById: (id: number) => api.get<RoleDetail>(`/api/roles/${id}`),

  create: (input: RoleInput) => api.post<Role>('/api/roles', input),

  /**
   * แก้บทบาท — **ไม่ส่ง `permissionKeys` แปลว่าไม่แตะสิทธิ์เดิม**
   *
   * ต่างจากส่งลิสต์ว่างซึ่งแปลว่าถอนทั้งหมด · หน้านี้ส่งทั้งคู่มาเสมอเพราะฟอร์มเดียวกัน
   * ถือทั้งชื่อและสวิตช์ แต่สัญญาเปิดทางไว้ให้ฟอร์มที่แก้แค่ชื่อในอนาคต
   */
  update: (id: number, input: Partial<RoleInput>) => api.patch<Role>(`/api/roles/${id}`, input),

  remove: (id: number) => api.delete<null>(`/api/roles/${id}`),

  /** สารบัญสิทธิ์ทั้งระบบ — อ่านอย่างเดียว ใช้วาดสวิตช์ในฟอร์มบทบาท */
  permissions: () => api.get<Permission[]>('/api/permissions'),
}
