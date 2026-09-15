/**
 * เลขคณิตวันที่ล้วน — สำหรับมุมมองสัปดาห์/เดือน/ปีของตารางจอง
 *
 * **คำนวณด้วย UTC เที่ยงคืนเสมอ ไม่ผ่าน `new Date(string)` ตรง ๆ** — เหตุผลเดียวกับ
 * `formatDate` ใน `lib/format.ts`: `new Date("2026-08-28")` ตีความเป็น UTC เที่ยงคืน
 * แล้วเครื่องที่อยู่ตะวันตกของกรีนิชจะเห็นวันที่ 27 ถ้าใช้ `getDate()`/`getMonth()`
 * (เวลาท้องถิ่น) ต่อจากนั้น — ที่นี่ใช้ `getUTCDate()` ตลอดสายเพื่อกันปัญหานี้
 */

const pad = (n: number) => String(n).padStart(2, '0')

function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
}

function formatISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function addDays(dateStr: string, days: number): string {
  const d = parseISODate(dateStr)
  d.setUTCDate(d.getUTCDate() + days)
  return formatISODate(d)
}

export function addMonths(dateStr: string, months: number): string {
  const d = parseISODate(dateStr)
  d.setUTCMonth(d.getUTCMonth() + months)
  return formatISODate(d)
}

export function addYears(dateStr: string, years: number): string {
  const d = parseISODate(dateStr)
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return formatISODate(d)
}

export type WeekRange = { from: string; to: string; days: string[] }

/** จันทร์ถึงอาทิตย์ — สัปดาห์ปฏิทินที่คนไทยคุ้นเคย ไม่ใช่อาทิตย์ถึงเสาร์แบบสหรัฐฯ */
export function weekRangeOf(dateStr: string): WeekRange {
  const dow = parseISODate(dateStr).getUTCDay() // 0=อา..6=ส
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  const from = addDays(dateStr, mondayOffset)
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))

  return { from, to: days[6] as string, days }
}

export type MonthGrid = {
  from: string
  to: string
  year: number
  /** 0-based เหมือน `Date.getUTCMonth()` */
  month: number
  /** ตารางสัปดาห์ละแถว — วันของเดือนอื่นที่โผล่มาเติมให้ครบสัปดาห์ก็รวมอยู่ในนี้ */
  weeks: string[][]
}

export function monthGridOf(dateStr: string): MonthGrid {
  const d = parseISODate(dateStr)
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth()

  const firstOfMonth = formatISODate(new Date(Date.UTC(year, month, 1)))
  const lastOfMonth = formatISODate(new Date(Date.UTC(year, month + 1, 0)))

  // ขยายไปถึงจันทร์ของสัปดาห์แรก และอาทิตย์ของสัปดาห์สุดท้าย ให้ตารางเต็มทุกแถว
  const gridStart = weekRangeOf(firstOfMonth).from
  const gridEnd = weekRangeOf(lastOfMonth).to

  const weeks: string[][] = []
  let cursor = gridStart
  while (cursor <= gridEnd) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)))
    cursor = addDays(cursor, 7)
  }

  return { from: gridStart, to: gridEnd, year, month, weeks }
}

export type YearRange = { from: string; to: string; year: number; months: number[] }

export function yearRangeOf(dateStr: string): YearRange {
  const year = parseISODate(dateStr).getUTCFullYear()

  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
    year,
    months: Array.from({ length: 12 }, (_, i) => i),
  }
}

/** เดือน (0-based) ของวันที่ — ใช้กลุ่มผลรวมรายวันเป็นรายเดือนสำหรับมุมมองปี */
export function monthOfDate(dateStr: string): number {
  return parseISODate(dateStr).getUTCMonth()
}

export function isSameMonth(dateStr: string, year: number, month: number): boolean {
  const d = parseISODate(dateStr)
  return d.getUTCFullYear() === year && d.getUTCMonth() === month
}

export function dayOfMonth(dateStr: string): number {
  return parseISODate(dateStr).getUTCDate()
}
