import { api } from '@/lib/api-client'

/** ข้อมูลของพนักงานที่ล็อกอินอยู่ */
export type SessionUser = {
  id: number
  username: string
  mustChangePassword: boolean
  /** อีเมลรับ OTP ตอนล็อกอิน — `null` = ยังไม่ตั้ง (ล็อกอินด้วยรหัสผ่านอย่างเดียวได้ต่อไป) */
  email: string | null
  role: { id: number; name: string }
  permissions: string[]
  /** `null` = บัญชีที่ไม่ได้ผูกกับพนักงานคนไหน เช่นบัญชี `system` */
  employee: { id: number; firstName: string; lastName: string; nickname: string | null } | null
}

/**
 * ผลของ `POST /api/auth/login` — **สองแบบ แยกด้วย `otpRequired`**
 *
 * `true` ยังไม่ได้เข้าระบบจริง มีแค่ `pendingToken` ไปกรอก OTP ต่อ · `false` คือเข้าระบบ
 * จริงแล้ว (บัญชีนี้ไม่ได้ตั้งอีเมลรับ OTP ไว้)
 */
export type LoginOutcome =
  | { otpRequired: true; pendingToken: string }
  | ({ otpRequired: false } & SessionUser)

/**
 * ชื่อที่เอาไปแสดงบนหน้าจอ
 *
 * ชื่อจริงถ้าผูกกับพนักงานแล้ว · ไม่งั้นใช้ชื่อผู้ใช้ — **ไม่ปล่อยว่าง** เพราะช่องว่าง
 * ตรงหัวมุมจอ อ่านเหมือนหน้าจอโหลดไม่เสร็จ
 */
export function displayNameOf(user: SessionUser): string {
  if (!user.employee) return user.username

  return `${user.employee.firstName} ${user.employee.lastName}`.trim() || user.username
}

export const authApi = {
  login: (username: string, password: string) =>
    api.post<LoginOutcome>('/api/auth/login', { username, password }),

  verifyLoginOtp: (pendingToken: string, code: string) =>
    api.post<SessionUser>('/api/auth/login/verify-otp', { pendingToken, code }),

  logout: () => api.post<null>('/api/auth/logout'),

  me: () => api.get<SessionUser>('/api/auth/me'),

  changePassword: (newPassword: string) =>
    api.post<null>('/api/auth/change-password', { newPassword }),

  /** อีเมลรับ OTP ของตัวเอง — `null` ล้างค่า กลับไปล็อกอินด้วยรหัสผ่านอย่างเดียว */
  updateOtpEmail: (email: string | null) =>
    api.patch<SessionUser>('/api/auth/email', { email }),
}
