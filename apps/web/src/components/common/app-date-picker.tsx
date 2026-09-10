'use client'

import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useDayPicker } from 'react-day-picker'
import { th } from 'react-day-picker/locale'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { THAI_MONTHS, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const NOW = new Date()
const MIN_YEAR = NOW.getFullYear() - 100
const MAX_YEAR = NOW.getFullYear() + 10

interface AppDatePickerProps {
  /** ISO date string `YYYY-MM-DD` */
  value: string | null | undefined
  onChange: (value: string) => void
  disabled?: boolean
  readOnly?: boolean
  placeholder?: string
  className?: string
  /** a11y/test hook — trigger ไม่มี text เมื่อยังว่าง (icon-only) จึงต้องมีชื่อกำกับ (rule 27) */
  'aria-label'?: string
}

/**
 * caption: เดือน dropdown + ปี number input (ค.ศ., debounce 500ms).
 * อ่าน month จาก DayPicker context (ไม่รับ prop) — component identity คงที่ จึงไม่ remount
 * ตอน month เปลี่ยน → input ปี ไม่หลุด focus ขณะพิมพ์.
 */
function MonthYearCaption() {
  const { months, goToMonth } = useDayPicker()
  const month = months[0]?.date ?? NOW
  const onMonthChange = goToMonth

  const [yearInput, setYearInput] = useState(() => String(month.getFullYear()))
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // sync input เมื่อปีเปลี่ยนจากภายนอก (เลือกวัน/เปลี่ยนเดือนข้ามปี)
  const monthYear = month.getFullYear()
  useEffect(() => {
    setYearInput(String(monthYear))
  }, [monthYear])

  const commitYear = (raw: string) => {
    const ce = Number(raw)
    if (!Number.isInteger(ce)) return
    if (ce < MIN_YEAR || ce > MAX_YEAR) return
    if (ce === month.getFullYear()) return
    onMonthChange(new Date(ce, month.getMonth()))
  }

  const shiftMonth = (delta: number) =>
    onMonthChange(new Date(month.getFullYear(), month.getMonth() + delta))

  return (
    <div className="flex w-full items-center justify-between gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="เดือนก่อนหน้า"
        className="size-7 shrink-0 hover:bg-transparent"
        onClick={() => shiftMonth(-1)}
      >
        <ChevronLeftIcon className="size-4" />
      </Button>
      <div className="flex items-center justify-center gap-1.5">
        <Select
          value={String(month.getMonth())}
          onValueChange={(v) => onMonthChange(new Date(month.getFullYear(), Number(v)))}
        >
          <SelectTrigger size="sm" aria-label="เลือกเดือน" className="h-7 w-24">
            <SelectValue>{(v) => THAI_MONTHS[Number(v)]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {THAI_MONTHS.map((name, i) => (
              <SelectItem key={name} value={String(i)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          inputMode="numeric"
          aria-label="ปี ค.ศ."
          className="h-7 w-16 text-center"
          value={yearInput}
          min={MIN_YEAR}
          max={MAX_YEAR}
          onChange={(e) => {
            const next = e.target.value
            setYearInput(next)
            clearTimeout(debounceRef.current)
            debounceRef.current = setTimeout(() => commitYear(next), 500)
          }}
          onBlur={() => {
            clearTimeout(debounceRef.current)
            commitYear(yearInput)
          }}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="เดือนถัดไป"
        className="size-7 shrink-0 hover:bg-transparent"
        onClick={() => shiftMonth(1)}
      >
        <ChevronRightIcon className="size-4" />
      </Button>
    </div>
  )
}

// reference คงที่ (นอก render) — กัน MonthCaption remount → input ปี ไม่หลุด focus
const CALENDAR_COMPONENTS = {
  // biome-ignore lint/style/useNamingConvention: react-day-picker component slot key
  MonthCaption: () => (
    <div className="flex h-(--cell-size) w-full items-center justify-center">
      <MonthYearCaption />
    </div>
  ),
}

export function AppDatePicker({
  value,
  onChange,
  disabled,
  readOnly,
  placeholder = 'เลือกวันที่',
  className,
  'aria-label': ariaLabel,
}: AppDatePickerProps) {
  const [open, setOpen] = useState(false)
  const dateValue = value ? new Date(`${value}T00:00:00`) : undefined
  const [month, setMonth] = useState(() => dateValue ?? NOW)
  const isBlocked = disabled || readOnly

  return (
    <Popover open={isBlocked ? false : open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={ariaLabel}
            className={cn(
              'h-8 w-full justify-start gap-2 font-normal',
              !value && 'text-muted-foreground',
              readOnly && 'pointer-events-none',
              /*
                ปิดอยู่แล้วยังต้องอ่านออก (ผู้ใช้สั่ง 2026-08-31)

                **ตามกฎเดียวกับ `Input`** ซึ่งตั้ง `disabled:text-foreground`
                `disabled:opacity-90` `disabled:bg-muted` ไว้แล้ว · ตัวนี้ยืมรูปปุ่มมาใช้
                จึงได้ `disabled:opacity-50` ของปุ่มติดมาด้วย ซึ่งถูกสำหรับปุ่มที่กดไม่ได้
                แต่ผิดสำหรับช่องที่แสดงค่า

                โหมดอ่านปิดทุกช่องพร้อมกัน แล้ววันที่กลายเป็นค่าเดียวบนใบที่จางกว่าเพื่อน
                ทั้งที่มันคือค่าที่คนเปิดใบมาดู

                จางไว้เฉพาะตอนไม่มีค่า — "เลือกวันที่" เป็น placeholder ไม่ใช่ข้อมูล
              */
              isBlocked && value && 'disabled:bg-muted disabled:text-foreground disabled:opacity-90',
              className,
            )}
          >
            <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
            <span className="truncate">{dateValue ? formatDate(dateValue) : placeholder}</span>
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto p-2">
        <Calendar
          mode="single"
          locale={th}
          month={month}
          onMonthChange={setMonth}
          className="gap-2 p-0 [--cell-size:--spacing(8)] [&_[data-selected-single=true]:hover]:bg-primary [&_[data-selected-single=true]:hover]:text-primary-foreground"
          classNames={{
            nav: 'hidden',
            month: 'flex w-full flex-col gap-2',
            week: 'mt-1 flex w-full',
            today: dateValue
              ? ''
              : 'rounded-(--cell-radius) border border-primary text-primary [&_button:hover]:bg-transparent [&_button:hover]:text-primary',
          }}
          components={CALENDAR_COMPONENTS}
          selected={dateValue}
          onSelect={(date) => {
            if (date) {
              const y = date.getFullYear()
              const m = String(date.getMonth() + 1).padStart(2, '0')
              const d = String(date.getDate()).padStart(2, '0')
              onChange(`${y}-${m}-${d}`)
            } else {
              onChange('')
            }
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
