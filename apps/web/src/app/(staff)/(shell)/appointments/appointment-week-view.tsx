'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAppointmentDailyCounts } from '@/features/appointment/hooks'
import { THAI_MONTHS } from '@/lib/format'
import { cn } from '@/lib/utils'

import { addMonths, daysInMonthOf, dayOfMonth, weekdayIndexOf } from './date-range'
import { fullnessBadgeClassName } from './fullness'

const WEEKDAY_LABEL = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์']

/**
 * มุมมองรายการ — วันทั้งเดือนเรียงลงมาเป็นแถว โชว์แค่จำนวน/ความเต็มต่อวัน
 * เลื่อนทีละเดือน กดวันไหนเพื่อดูรายละเอียดแบบเดิมที่มุมมองวัน (ผู้ใช้ขอ 2026-09-15
 * — เดิมเรียงเป็นการ์ดแนวนอนทีละสัปดาห์ เปลี่ยนเป็นรายการแนวตั้งทีละเดือนแทน)
 */
export function AppointmentWeekView({
  activeDate,
  today,
  onSelectDay,
  onChangeMonth,
}: {
  activeDate: string
  today: string | null
  onSelectDay: (date: string) => void
  onChangeMonth: (date: string) => void
}) {
  const { from, to, year, month, days } = daysInMonthOf(activeDate)
  const { data, isPending } = useAppointmentDailyCounts(from, to)

  const countByDay = new Map((data?.days ?? []).map((d) => [d.bookedOn, d.count]))
  const capacity = data?.capacityPerDay ?? 32

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="เดือนก่อนหน้า"
          onClick={() => onChangeMonth(addMonths(activeDate, -1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-medium">
          {THAI_MONTHS[month]} {year}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="เดือนถัดไป"
          onClick={() => onChangeMonth(addMonths(activeDate, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
        {days.map((day) => {
          const count = countByDay.get(day) ?? 0
          const isToday = today !== null && day === today

          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(day)}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors hover:border-primary hover:bg-primary/5',
                isToday && 'border-primary ring-1 ring-primary/40',
              )}
            >
              <span className="w-8 shrink-0 text-lg font-semibold">{dayOfMonth(day)}</span>
              <span className="flex-1 text-sm text-muted-foreground">{WEEKDAY_LABEL[weekdayIndexOf(day)]}</span>
              <span
                className={cn(
                  'shrink-0 rounded px-2 py-0.5 text-xs font-medium',
                  isPending ? 'bg-muted text-muted-foreground' : fullnessBadgeClassName(count, capacity),
                )}
              >
                {isPending ? '…' : `${count}/${capacity}`}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
