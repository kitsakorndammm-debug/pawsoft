'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAppointmentDailyCounts } from '@/features/appointment/hooks'
import { THAI_MONTHS } from '@/lib/format'
import { cn } from '@/lib/utils'

import { addYears, monthOfDate, yearRangeOf } from './date-range'
import { fullnessBadgeClassName } from './fullness'

/**
 * มุมมองปี — สรุปยอดจองรวมต่อเดือน กดเดือนไหนเพื่อดูเป็นตารางเดือนที่ละเอียดขึ้น
 * (ผู้ใช้ตัดสิน 2026-09-15) ไม่ลงถึงระดับวันในมุมมองนี้ เพราะ 365 ช่องในหน้าเดียว
 * อ่านไม่ไหว
 */
export function AppointmentYearView({
  activeDate,
  onSelectMonth,
  onChangeYear,
}: {
  activeDate: string
  onSelectMonth: (date: string) => void
  onChangeYear: (date: string) => void
}) {
  const { from, to, year, months } = yearRangeOf(activeDate)
  const { data, isPending } = useAppointmentDailyCounts(from, to)
  const capacity = data?.capacityPerDay ?? 32

  // รวมยอดต่อเดือนจากรายวัน — ปีนี้ยังไม่มี endpoint แยกรายเดือน ไม่จำเป็นต้องมีเพราะ
  // จำนวนวันในหนึ่งปีเล็กพอจะรวมฝั่งหน้าเว็บได้โดยไม่หนัก
  const totalByMonth = new Map<number, number>()
  for (const d of data?.days ?? []) {
    const m = monthOfDate(d.bookedOn)
    totalByMonth.set(m, (totalByMonth.get(m) ?? 0) + d.count)
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="ปีก่อนหน้า"
          onClick={() => onChangeYear(addYears(activeDate, -1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-medium">{year}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="ปีถัดไป"
          onClick={() => onChangeYear(addYears(activeDate, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
        {months.map((m) => {
          const total = totalByMonth.get(m) ?? 0
          // เพดานของทั้งเดือน — ใช้จำนวนวันจริงของเดือนนั้น ไม่ใช่ 30 เฉลี่ย
          const daysInMonth = new Date(Date.UTC(year, m + 1, 0)).getUTCDate()
          const monthCapacity = capacity * daysInMonth

          return (
            <button
              key={m}
              type="button"
              onClick={() => onSelectMonth(`${year}-${String(m + 1).padStart(2, '0')}-01`)}
              className="flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
            >
              <span className="font-medium">{THAI_MONTHS[m]}</span>
              <span
                className={cn(
                  'rounded px-2 py-0.5 text-xs font-medium',
                  isPending ? 'bg-muted text-muted-foreground' : fullnessBadgeClassName(total, monthCapacity),
                )}
              >
                {isPending ? '…' : `${total} คิว`}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
