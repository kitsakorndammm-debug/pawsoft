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
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-center gap-2">
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

      <div className="grid shrink-0 grid-cols-7 gap-1.5 text-center text-xs text-muted-foreground">
        {WEEKDAY_LABEL.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="grid flex-1 auto-rows-fr gap-1.5">
        {weeks.map((week) => (
          <div key={week[0]} className="grid grid-cols-7 gap-1.5">
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
                    'flex h-full flex-col items-stretch gap-1 rounded-lg border p-2 text-left transition-colors hover:border-primary hover:bg-primary/5',
                    !inMonth && 'opacity-40',
                    isToday && 'border-primary ring-1 ring-primary/40',
                  )}
                >
                  <span
                    className={cn(
                      'self-start text-sm font-semibold',
                      isToday && 'text-primary-strong',
                    )}
                  >
                    {dayOfMonth(day)}
                  </span>

                  <div className="flex flex-1 items-center justify-center">
                    {isPending ? (
                      <span className="text-xs text-muted-foreground">…</span>
                    ) : count > 0 ? (
                      <span
                        className={cn(
                          'flex flex-col items-center rounded px-2 py-1 text-sm font-semibold leading-tight',
                          fullnessBadgeClassName(count, capacity),
                        )}
                      >
                        <span>{count} คิว</span>
                        <span className="text-xs font-normal opacity-80">
                          {count}/{capacity}
                        </span>
                      </span>
                    ) : inMonth ? (
                      <span className="text-xs text-muted-foreground/70">ว่าง</span>
                    ) : null}
                  </div>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
