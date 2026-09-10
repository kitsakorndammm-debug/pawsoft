import type { ReactNode } from 'react'

import { AppHeader } from '@/components/layout/app-header'
import { AppNavbar } from '@/components/layout/app-navbar'
import { AppSider } from '@/components/layout/app-sider'
import { SessionGuard } from '@/components/session-guard'

/**
 * โครงของหน้าที่อยู่หลังล็อกอิน — header → navbar → (sider + เนื้อหา)
 *
 * `h-screen` คู่กับ `overflow-hidden` ทำให้ header กับ navbar อยู่กับที่ แล้วเลื่อน
 * เฉพาะเนื้อหา — ไม่ใช่ทั้งหน้าเลื่อนจน header หายไป
 *
 * **`AppSider` คืน `null` เองเมื่อหน้านั้นไม่มีเมนูข้าง** — layout ไม่ต้องรู้ว่าเมนูไหน
 * คู่กับ path ไหน · เพิ่มเมนูใหม่แล้วไม่ต้องแก้ไฟล์นี้
 *
 * **อยู่ที่กลุ่ม `(shell)` ไม่ใช่ที่ราก `(staff)`** เพราะหน้าล็อกอินกับหน้าเปลี่ยนรหัส
 * อยู่ในกลุ่มเดียวกัน และทั้งคู่ต้องเปิดได้โดยยังไม่มีเซสชันที่สมบูรณ์ — ครอบทั้งกลุ่ม
 * เมื่อไหร่ หน้าล็อกอินจะมี header ที่พยายามอ่านชื่อคนที่ยังไม่ได้ล็อกอิน
 *
 * **เดิมไฟล์นี้อยู่ที่ `settings/` ซึ่งเป็นบั๊ก** (แก้ 2026-09-01) — หน้าคิว ตารางจอง
 * เจ้าของสัตว์ และสัตว์เลี้ยง อยู่นอก `settings/` จึงไม่มี header กับ navbar เลย ·
 * ย้ายขึ้นมาที่กลุ่มที่ครอบทุกหน้าหลังล็อกอิน แทนที่จะก๊อป layout ไปวางทีละโฟลเดอร์
 */
export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGuard>
      <div className="flex h-screen flex-col">
        <AppHeader />
        <AppNavbar />
        <div className="flex flex-1 overflow-hidden">
          <AppSider />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </SessionGuard>
  )
}
