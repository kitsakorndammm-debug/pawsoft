import type { ReactNode } from 'react'

/**
 * โครงของฝั่งหลังบ้าน
 *
 * **ไม่ใส่ `SessionGuard` ที่นี่** เพราะหน้าล็อกอินกับหน้าเปลี่ยนรหัสอยู่ในกลุ่มนี้ด้วย
 * และทั้งคู่ต้องเปิดได้โดยยังไม่มีเซสชันที่สมบูรณ์ · หน้าที่ต้องการด่านใส่เอง
 */
export default function StaffLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
