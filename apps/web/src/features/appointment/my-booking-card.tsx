'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { APPOINTMENT_STATUS_LABEL, APPOINTMENT_STATUS_STYLE, SLOT_LABEL, type AppointmentRow } from './api'
import { useMySlots } from './hooks'

/**
 * แสดงเฉพาะคิวของ**ช่วงที่จองไว้**ตัวเอง — ไม่ใช่ทุกช่วงของวันนั้น (ผู้ใช้ตัดสิน)
 * ช่วยกะเวลาว่าจะออกจากบ้านตอนไหน เลยต้องเห็นเฉพาะใบที่ยืนยันแล้ว (`BOOKED`)
 * ใบที่ยังรอเจ้าหน้าที่ยืนยัน (`PENDING`) ยังไม่ใช่คิวจริงให้เทียบ
 */
function ArrivalProgress({ bookedOn, slot }: { bookedOn: string; slot: AppointmentRow['slot'] }) {
  const slots = useMySlots(bookedOn)
  const occ = slots.data?.occupancy.find((o) => o.slot === slot)
  if (!occ) return null

  return (
    <p className="text-xs text-muted-foreground">
      คิวตอนนี้ — มาถึงแล้ว {occ.arrived}/{occ.capacity}
    </p>
  )
}

/**
 * ใบจองหนึ่งใบบนจอลูกค้า
 *
 * แยกออกมาจากหน้าแรกตอนซอยหน้า (2026-09-01) เพราะทั้งหน้าแรกและหน้ารายการจอง
 * ต้องวาดใบจองเหมือนกัน · ก๊อปไปสองที่แปลว่าแก้ทีต้องแก้สองรอบ
 *
 * **`PENDING` ไม่จาง** — ใบที่รอเจ้าหน้าที่โทรยืนยันคือใบที่ลูกค้าต้องจำได้ว่ามีอยู่
 */
export function MyBookingCard({
  row,
  onCancel,
  pending,
}: {
  row: AppointmentRow
  onCancel?: () => void
  pending?: boolean
}) {
  const done = row.status === 'ARRIVED' || row.status === 'CANCELLED' || row.status === 'NO_SHOW'

  return (
    <div className={cn('flex items-center gap-3 rounded-2xl border bg-card p-3.5', done && 'opacity-70')}>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {row.bookedOn}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {SLOT_LABEL[row.slot]}
          </span>
        </p>
        {/*
          **`displayName` มาจาก BE** — เดิมเขียน "สัตว์ในระบบ" เพราะ FE ประกาศชนิด
          เป็น `Appointment` ที่ไม่มีชื่อสัตว์ ทั้งที่ BE ส่งมาให้อยู่แล้ว (แก้ 2026-09-01)
        */}
        <p className="truncate text-sm text-muted-foreground">
          {row.displayName}
          {row.reason ? ` · ${row.reason}` : ''}
        </p>
        {row.status === 'BOOKED' ? <ArrivalProgress bookedOn={row.bookedOn} slot={row.slot} /> : null}
      </div>

      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
          APPOINTMENT_STATUS_STYLE[row.status],
        )}
      >
        {APPOINTMENT_STATUS_LABEL[row.status]}
      </span>

      {onCancel && !done ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={pending}
          className="shrink-0 text-muted-foreground"
        >
          ยกเลิก
        </Button>
      ) : null}
    </div>
  )
}
