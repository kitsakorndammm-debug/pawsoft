'use client'

import { Search } from 'lucide-react'
import type { ReactNode } from 'react'

import { Input } from '@/components/ui/input'

/**
 * แถบบนของหน้ารายการ — ช่องค้นซ้าย ปุ่มขวา
 *
 * ตาเริ่มอ่านจากซ้าย และการค้นคือสิ่งที่ผู้ใช้ทำบ่อยที่สุดในหน้ารายการ ·
 * ปุ่มที่สร้างของใหม่ไปสุดขวา เพื่อแยกของที่กดเพื่อ**หา** ออกจากของที่กดแล้ว
 * **เกิดแถวใหม่** (`docs/standards/ui-design.md`)
 *
 * ไม่มีหัวข้อหน้า — sider ที่ active บอกอยู่แล้วว่านี่คือหน้าไหน
 */
export function ListToolbar({
  searchLabel,
  search,
  onSearchChange,
  actions,
}: {
  /** `ค้นหาประเภทสินค้า` — เป็นทั้ง placeholder และ aria-label */
  searchLabel: string
  search: string
  onSearchChange: (value: string) => void
  /** ปุ่มฝั่งขวา — ไม่ส่ง = ไม่มีปุ่ม (เช่นไม่มีสิทธิ์เขียน) */
  actions?: ReactNode
}) {
  return (
    /**
     * **จอแคบ: ช่องค้นเต็มแถว ปุ่มตกลงแถวถัดไป** (แก้ 2026-09-15) — เดิมช่องค้น
     * กว้างคงที่ 224px บวกปุ่มที่มีข้อความยาว (เช่น "บันทึกการเคลื่อนไหว") เกิน 390px
     * ของจอมือถือ ทำให้ปุ่มถูกตัดขอบขวาหายไปเลย ไม่ใช่แค่ล้นแบบที่เลื่อนดูได้
     */
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-56">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchLabel}
          aria-label={searchLabel}
          className="pl-7"
        />
      </div>

      <div className="hidden flex-1 sm:block" />

      {actions}
    </div>
  )
}
