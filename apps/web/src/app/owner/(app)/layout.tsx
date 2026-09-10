import type { ReactNode } from 'react'

import { OwnerShell } from '@/components/layout/owner-shell'

/**
 * โครงของหน้าฝั่งลูกค้าทุกหน้า **ยกเว้นหน้าล็อกอิน**
 *
 * (ผู้ใช้ทักท้วง 2026-09-01: "ทำไมรวมทุกอย่างในหน้าเดียวแบบนี้อ่ะ")
 *
 * **อยู่ที่กลุ่ม `(app)` ไม่ใช่ที่ `owner/` ตรง ๆ** ด้วยเหตุผลเดียวกับฝั่งพนักงาน —
 * `owner/login` ต้องเปิดได้โดยยังไม่มีเซสชัน · ครอบทั้งโฟลเดอร์เมื่อไหร่ หน้าล็อกอิน
 * จะมีแถบเมนูที่กดแล้วเด้งกลับมาที่เดิม และ header ที่พยายามอ่านชื่อคนที่ยังไม่ได้ล็อกอิน
 *
 * ชื่อกลุ่มมีวงเล็บแปลว่าไม่กลายเป็นส่วนหนึ่งของ URL — `/owner/pets` ยังเป็น
 * `/owner/pets` เหมือนเดิม
 */
export default function OwnerAppLayout({ children }: { children: ReactNode }) {
  return <OwnerShell>{children}</OwnerShell>
}
