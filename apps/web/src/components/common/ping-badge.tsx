import { cn } from '@/lib/utils'

/**
 * ตัวเลขสีแดงที่กระพริบ — ของที่ค้างรอคนคนนี้อยู่
 *
 * **กระพริบตลอดเวลาที่ยังมีของค้าง** (ผู้ใช้ตัดสิน 2026-08-28) ไม่ใช่กระพริบตอนเลข
 * เพิ่มแล้วหยุด · มันคือคิวงานที่ยังไม่ถูกเคลียร์ ไม่ใช่ข่าวที่เพิ่งมาถึง — วงที่ยัง
 * เต้นอยู่บอกว่ายังมีคนรออยู่ ต่างจากป้ายนิ่งที่กลืนไปกับเมนูภายในสองวัน
 *
 * `animate-ping` เป็นวงที่ขยายแล้วจางอยู่ **หลัง** ตัวเลข ไม่ใช่ตัวเลขที่กะพริบเอง —
 * ตัวเลขที่ขยับเองอ่านยากตอนที่มันเป็นเลขสองหลัก
 *
 * ศูนย์ไม่วาดอะไรเลย · คนเรียกจึงส่งค่ามาตรง ๆ ได้โดยไม่ต้องเช็คก่อน
 */

/** เกินเลขนี้แสดงเป็น `99+` — เลขที่กว้างกว่านี้ดันวงกลมจนเสียรูป */
const CAP = 99

export function PingBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null

  return (
    <span className={cn('relative inline-flex h-4 min-w-4 items-center justify-center', className)}>
      {/*
        วงที่เต้น — `aria-hidden` เพราะมันไม่ได้บอกอะไรที่ตัวเลขไม่ได้บอกอยู่แล้ว
        และผู้ใช้ที่ตั้งเครื่องว่าลดการเคลื่อนไหว ไม่ควรถูกบังคับให้ดู
      */}
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75 motion-reduce:hidden"
        aria-hidden
      />
      <span className="relative flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold tabular-nums text-white">
        {count > CAP ? `${CAP}+` : count}
      </span>
    </span>
  )
}
