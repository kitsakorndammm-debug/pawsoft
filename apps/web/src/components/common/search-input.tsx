'use client'

import { Search, X } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * ช่องค้นหาที่มีแว่นขยายอยู่ข้างใน และปุ่มล้างที่โผล่เมื่อมีอะไรให้ล้าง
 *
 * **ต่างจาก `ListToolbar`** ซึ่งเป็นแถบเต็มความกว้างที่มีปุ่มเพิ่มอยู่ด้วย · ตัวนี้เป็น
 * ช่องเดี่ยว ๆ ที่วางที่ไหนก็ได้ — กลางหน้าหลัก หรือบนหัวกล่อง
 *
 * `type="search"` ไม่ใช่ `text` เพราะมันให้ role `searchbox` ซึ่งบอกว่า "ช่องนี้กรอง
 * สิ่งที่อยู่ข้างล่าง" ไม่ใช่ "ช่องนี้เป็นอีกช่องที่ต้องกรอก"
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  'aria-label': ariaLabel,
  clearLabel,
  autoFocus,
  disabled,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** ชื่อของช่องสำหรับคนที่ไม่ได้มองจอ — บังคับ ไม่ใช่ทางเลือก */
  'aria-label': string
  clearLabel: string
  autoFocus?: boolean
  disabled?: boolean
  className?: string
}) {
  const filled = value !== ''

  return (
    <div className={cn('group relative', className)}>
      <Search
        className={cn(
          'pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 transition-colors',
          // แว่นเดินตามช่อง — เทาตอนพัก เป็นสีหลักตอนช่องกำลังทำงาน
          filled ? 'text-primary' : 'text-muted-foreground group-focus-within:text-primary',
        )}
      />

      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        disabled={disabled}
        className={cn(
          'pl-9',
          filled && 'border-primary/40 pr-9',
          // เบราว์เซอร์วาดปุ่มล้างของตัวเองบน `type="search"` — ของเราคือตัวที่เข้ากับหน้า
          '[&::-webkit-search-cancel-button]:hidden',
        )}
      />

      {/* โผล่เมื่อมีอะไรให้ล้าง · ปุ่มที่อยู่ตลอดแต่ไม่ทำอะไรเกือบตลอด คือของอีกชิ้นที่ต้องอ่านข้าม */}
      {filled && (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={() => onChange('')}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
