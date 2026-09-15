/**
 * สีบอกความเต็มของวัน — ใช้ร่วมกันทั้งมุมมองสัปดาห์/เดือน/ปี
 *
 * เกณฑ์เป็นสัดส่วนของเพดานจริง (`capacityPerDay` จาก BE) ไม่ใช่ตัวเลขคงที่ — เพดาน
 * เปลี่ยนวันไหน สียังสื่อความหมายเดิมอยู่ (ว่าง/เริ่มเต็ม/เต็ม) โดยไม่ต้องแก้ที่นี่
 */
export function fullnessBadgeClassName(count: number, capacity: number): string {
  if (count === 0) return 'bg-muted text-muted-foreground'

  const ratio = count / capacity
  if (ratio >= 1) return 'bg-red-100 text-red-800 ring-1 ring-red-300'
  if (ratio >= 0.5) return 'bg-amber-100 text-amber-800 ring-1 ring-amber-300'

  return 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300'
}
