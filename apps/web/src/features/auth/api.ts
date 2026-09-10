import { api } from '@/lib/api-client'

/** ข้อมูลของพนักงานที่ล็อกอินอยู่ */
export type SessionUser = {
  id: number
  username: string
  mustChangePassword: boolean
  role: { id: number; name: string }
  permissions: string[]
  /** `null` = บัญชีที่ไม่ได้ผูกกับพนักงานคนไหน เช่นบัญชี `system` */
  employee: { id: number; firstName: string; lastName: string; nickname: string | null } | null
}

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
    api.post<SessionUser>('/api/auth/login', { username, password }),

  logout: () => api.post<null>('/api/auth/logout'),

  me: () => api.get<SessionUser>('/api/auth/me'),

  changePassword: (newPassword: string) =>
    api.post<null>('/api/auth/change-password', { newPassword }),
}
