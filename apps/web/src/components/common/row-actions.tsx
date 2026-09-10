'use client'

import { Eye, Pencil, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * ปุ่มจัดการท้ายแถว — ดู · แก้ · ลบ
 *
 * **เห็นตลอด ไม่ต้องชี้ก่อน** (ผู้ใช้ตัดสิน 2026-08-26) · ซ่อนไว้จนกว่าจะ hover
 * แปลว่าคนที่ใช้จอสัมผัสหาปุ่มไม่เจอเลย และคนที่ใช้เมาส์ต้องกวาดหาว่ากดอะไรได้บ้าง
 *
 * เป็น `ghost` สีจาง ๆ จึงไม่แย่งสายตากับข้อมูลในแถว ซึ่งเป็นสิ่งที่ผู้ใช้มาหา
 */

/**
 * ปุ่มไอคอนพร้อมคำอธิบายตอนชี้
 *
 * ไอคอนอย่างเดียวคือการเดา — ดินสอกับตาพอเดาได้ แต่คนที่ไม่เคยใช้ระบบนี้
 * ไม่รู้ว่าถังขยะลบทันทีหรือถามก่อน · คำอธิบายบอกทั้งการกระทำและสิ่งที่จะโดน
 *
 * ข้อความเดียวกับ `aria-label` — คนที่ใช้โปรแกรมอ่านหน้าจอกับคนที่ชี้เมาส์
 * ควรได้ยินเรื่องเดียวกัน
 */
function IconAction({
  label,
  onClick,
  className,
  children,
}: {
  label: string
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            className={className}
            onClick={onClick}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function RowActions({
  label,
  canWrite,
  onView,
  onEdit,
  onDelete,
}: {
  /** ชื่อของแถว — เข้าไปอยู่ใน `aria-label` และคำอธิบายของทุกปุ่ม */
  label: string
  canWrite: boolean
  onView: () => void
  onEdit: () => void
  /** ไม่ส่ง = แถวนี้ลบไม่ได้ · ต่างจากไม่มีสิทธิ์ */
  onDelete?: () => void
}) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      {/* ดู กับ แก้ไข เป็นปุ่มเดียวสลับกันตามสิทธิ์ — ไม่ใช่สองปุ่มที่ปุ่มหนึ่งกดไม่ได้ */}
      {/*
        ไอคอนมีสีตั้งแต่ยังไม่ชี้เมาส์ (ผู้ใช้ตัดสิน 2026-09-01) — เทาล้วนอ่านเหมือน
        ปุ่มที่กดไม่ได้ · สีของแต่ละปุ่มบอกว่ามันทำอะไร: ฟ้า = แก้/ดู · แดง = ลบ
      */}
      {canWrite ? (
        <IconAction
          label={`แก้ไข ${label}`}
          onClick={onEdit}
          className="text-primary-strong hover:bg-primary/10"
        >
          <Pencil className="size-3.5" />
        </IconAction>
      ) : (
        <IconAction
          label={`ดู ${label}`}
          onClick={onView}
          className="text-primary-strong hover:bg-primary/10"
        >
          <Eye className="size-3.5" />
        </IconAction>
      )}

      {canWrite && onDelete && (
        <IconAction
          label={`ลบ ${label}`}
          onClick={onDelete}
          className="text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </IconAction>
      )}
    </div>
  )
}
