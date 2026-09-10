import { api } from '@/lib/api-client'

/**
 * สัญญากับ `/api/users` — บัญชีเข้าระบบของพนักงาน
 *
 * **หนึ่งพนักงานมีได้หนึ่งบัญชี** · ทุกอย่างที่นี่จึงอ้างถึงพนักงานหนึ่งคน ไม่ใช่รายการบัญชี
 *
 * **รหัสผ่านออกจาก BE สองที่เท่านั้น และครั้งเดียวต่อครั้ง** — ตอนเปิดบัญชี กับตอนรีเซ็ต ·
 * ไม่มีเส้นไหนคืนรหัสซ้ำ และตารางเก็บแต่ hash · หน้าจอจึงต้องโชว์ให้ผู้ใช้จดตอนนั้นเลย
 * ปิดกล่องแล้วดูอีกไม่ได้
 */

/** สถานะของบัญชี — เรียงตามลำดับที่ผู้ใช้ต้องจัดการก่อนหลัง */
export type UserAccountStatus = 'none' | 'active' | 'locked' | 'suspended'

export type UserAccount = {
  id: number
  username: string
  roleId: number
  /** ชื่อบทบาท — BE ส่งมาให้ ไม่ต้องไปหาจากตัวเลือกเอง */
  roleName: string
  employeeId: number | null
  /** ถูกผู้ดูแลระงับเมื่อไหร่ · `null` = ไม่ได้ถูกระงับ */
  suspendedAt: string | null
  /** ถูกล็อกเพราะเดารหัสผิดซ้ำเมื่อไหร่ · `null` = ไม่ได้ถูกล็อก */
  lockedAt: string | null
  /** ถูกล็อกมาแล้วกี่ครั้ง — บอกว่าเป็นเรื่องซ้ำซากหรือครั้งเดียว */
  lockCount: number
  /** ต้องเปลี่ยนรหัสตอนเข้าครั้งถัดไปไหม — จริงหลังเปิดบัญชีและหลังรีเซ็ต */
  mustChangePassword: boolean
  /** เข้าระบบล่าสุดเมื่อไหร่ · `null` = ยังไม่เคยเข้าเลย */
  lastLoginAt: string | null
}

/**
 * คำตอบของ `PATCH` — **ไม่ใช่ `UserAccount` เต็ม**
 *
 * BE คืนแค่สามฟิลด์ที่เพิ่งเปลี่ยน · หน้าจอไม่ควรอ่านฟิลด์อื่นจากคำตอบนี้
 * เพราะมันไม่มีอยู่ · สถานะล่าสุดมาจากการ invalidate แล้วถามใหม่
 */
export type UpdatedUserAccount = {
  id: number
  username: string
  roleId: number
}

/**
 * คำตอบตอนเปิดบัญชี — **มี `password` อยู่ และนี่คือครั้งเดียวที่มันออกมา**
 *
 * ไม่เก็บลง cache ไม่ใส่ใน query — ส่งจาก mutation ตรงเข้ากล่องที่โชว์มัน
 * แล้วหายไปพร้อมกล่องนั้น
 */
export type CreatedUserAccount = UserAccount & { password: string }

export type CreateUserInput = {
  username: string
  roleId: number
  /** พนักงานที่บัญชีนี้เป็นของ · หน้าจอส่งเสมอ เพราะเปิดบัญชีจากแถวพนักงาน */
  employeeId: number
}

export type UpdateUserInput = {
  username: string
  roleId: number
}

export const userApi = {
  /**
   * บัญชีของพนักงานคนนี้ · `null` = ยังไม่ได้เปิดบัญชีให้
   *
   * `GET /api/users?employeeId=<id>` — `employeeId` บังคับ · ไม่ส่งมาคือคำขอที่
   * ไม่มีความหมาย ไม่ใช่การขอบัญชีทั้งหมด
   */
  byEmployee: (employeeId: number) =>
    api.get<UserAccount | null>(`/api/users?employeeId=${employeeId}`),

  /** เปิดบัญชี — คำตอบมีรหัสผ่าน · ผู้ดูแลตั้งรหัสเองไม่ได้ BE ปฏิเสธฟิลด์นั้น */
  create: (input: CreateUserInput) => api.post<CreatedUserAccount>('/api/users', input),

  /**
   * แก้ชื่อผู้ใช้หรือบทบาท
   *
   * **แก้อย่างใดอย่างหนึ่งแล้วเจ้าตัวหลุดจากระบบ** — BE ตัดเซสชันให้เอง
   * คนที่เปิดค้างอยู่จะไม่ถือสิทธิ์ชุดเก่าต่อ
   */
  update: (id: number, input: UpdateUserInput) =>
    api.patch<UpdatedUserAccount>(`/api/users/${id}`, input),

  /** รหัสใหม่ที่ระบบสุ่มให้ — ครั้งเดียวเหมือนตอนเปิดบัญชี · เซสชันเดิมถูกตัด */
  resetPassword: (id: number) =>
    api.post<{ password: string }>(`/api/users/${id}/reset-password`, {}),

  /** ตัดทางเข้าระบบ และตัดเซสชันที่เปิดอยู่ทันที */
  suspend: (id: number) => api.patch<null>(`/api/users/${id}/suspend`, {}),

  /** คืนทางเข้าระบบ — ระบบระงับให้เอง แต่ไม่ปลดให้เอง คนต้องกด */
  unsuspend: (id: number) => api.patch<null>(`/api/users/${id}/unsuspend`, {}),

  /**
   * ปลดล็อกที่เกิดจากเดารหัสผิดซ้ำ
   *
   * **คนละปุ่มกับปลดระงับ** — ล็อกคือผลของการเดารหัส ระงับคือการตัดสินใจของผู้ดูแล ·
   * บัญชีที่ติดทั้งสองอย่างต้องกดสองปุ่ม
   */
  unlock: (id: number) => api.patch<null>(`/api/users/${id}/unlock`, {}),
}

/**
 * สถานะที่หน้าจอแสดง — จากบัญชีที่ได้มา
 *
 * **ระงับมาก่อนล็อก** เมื่อติดทั้งคู่ · ระงับคือการตัดสินใจของคน ส่วนล็อกเป็นผลข้างเคียง
 * ที่หายเองไม่ได้ · บอกว่า "ล็อก" ทั้งที่ถูกระงับอยู่ จะทำให้คนกดปลดล็อกแล้วงงว่าทำไม
 * ยังเข้าไม่ได้
 */
export function accountStatus(account: UserAccount | null | undefined): UserAccountStatus {
  if (!account) return 'none'
  if (account.suspendedAt !== null) return 'suspended'
  if (account.lockedAt !== null) return 'locked'
  return 'active'
}
