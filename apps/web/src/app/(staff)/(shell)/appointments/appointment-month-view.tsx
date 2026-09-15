'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAppointmentDailyCounts } from '@/features/appointment/hooks'
import { THAI_MONTHS } from '@/lib/format'
import { cn } from '@/lib/utils'

import { addMonths, dayOfMonth, isSameMonth, monthGridOf } from './date-range'
import { fullnessBadgeClassName } from './fullness'

const WEEKDAY_LABEL = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']

/**
 * มุมมองเดือน — ตารางปฏิทินทั้งเดือน โชว์แค่จำนวน/ความเต็มต่อวัน กดวันไหนเพื่อดู
 * รายละเอียดแบบเดิมที่มุมมองวัน (ผู้ใช้ตัดสิน 2026-09-15)
 */
export function AppointmentMonthView({
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
  const { from, to, year, month, weeks } = monthGridOf(activeDate)
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

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAY_LABEL.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {weeks.map((week) => (
          <div key={week[0]} className="grid grid-cols-7 gap-1">
            {week.map((day) => {
              const count = countByDay.get(day) ?? 0
              const inMonth = isSameMonth(day, year, month)
              const isToday = today !== null && day === today

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => onSelectDay(day)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-md border p-1.5 transition-colors hover:border-primary hover:bg-primary/5',
                    !inMonth && 'opacity-40',
                    isToday && 'border-primary ring-1 ring-primary/40',
                  )}
                >
                  <span className="text-xs">{dayOfMonth(day)}</span>
                  {count > 0 ? (
                    <span
                      className={cn(
                        'w-full rounded px-1 py-0.5 text-[11px] font-medium',
                        isPending ? 'bg-muted text-muted-foreground' : fullnessBadgeClassName(count, capacity),
                      )}
                    >
                      {isPending ? '…' : count}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
