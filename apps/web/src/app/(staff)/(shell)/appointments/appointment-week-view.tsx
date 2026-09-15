'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAppointmentDailyCounts } from '@/features/appointment/hooks'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import { addDays, weekRangeOf } from './date-range'
import { fullnessBadgeClassName } from './fullness'

const WEEKDAY_LABEL = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์']

/**
 * มุมมองสัปดาห์ — จันทร์ถึงอาทิตย์ โชว์แค่จำนวน/ความเต็มต่อวัน (ผู้ใช้ตัดสิน
 * 2026-09-15) กดวันไหนเพื่อดูรายละเอียดแบบเดิม (4 ช่วงเวลา) ที่มุมมองวัน
 */
export function AppointmentWeekView({
  activeDate,
  today,
  onSelectDay,
  onChangeWeek,
}: {
  activeDate: string
  today: string | null
  onSelectDay: (date: string) => void
  onChangeWeek: (date: string) => void
}) {
  const { from, to, days } = weekRangeOf(activeDate)
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
          aria-label="สัปดาห์ก่อนหน้า"
          onClick={() => onChangeWeek(addDays(activeDate, -7))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-medium">
          {formatDate(from)} — {formatDate(to)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="สัปดาห์ถัดไป"
          onClick={() => onChangeWeek(addDays(activeDate, 7))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
        {days.map((day, i) => {
          const count = countByDay.get(day) ?? 0
          const isToday = today !== null && day === today

          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(day)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-lg border p-3 text-left transition-colors hover:border-primary hover:bg-primary/5',
                isToday && 'border-primary ring-1 ring-primary/40',
              )}
            >
              <span className="text-xs text-muted-foreground">{WEEKDAY_LABEL[i]}</span>
              <span className="text-lg font-semibold">{day.slice(8, 10)}</span>
              <span
                className={cn(
                  'rounded px-2 py-0.5 text-xs font-medium',
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
