import { tooManyRequests } from './app-error.ts'

/**
 * ตัวจำกัดจำนวนครั้งต่อคีย์ — fixed window เก็บในหน่วยความจำของโปรเซสเดียว
 *
 * **ไม่ใช้ Redis** — ระบบรันเป็นอินสแตนซ์เดียว (Railway) ตอนนี้ ไม่มีหลายเครื่องที่ต้อง
 * แชร์ตัวนับกัน รีสตาร์ตแล้วตัวนับรีเซ็ตเอง ซึ่งยอมรับได้เพราะเป้าหมายคือกันยิงถี่/บรูทฟอร์ซ
 * ไม่ใช่ตัวกันโจมตีระดับที่ต้องทนอยู่ข้ามเครื่อง
 *
 * **ปิดเสมอตอน `APP_ENV=local`** (ตรวจตอนเรียกจริง ไม่ใช่ตอนโหลดไฟล์ — เทสสลับค่านี้
 * ระหว่างรันได้) — `test/support/login.ts` ยิง `/api/auth/login` จริงจากหลายไฟล์เทส
 * ผ่าน `beforeAll` ถ้าไม่ปิด ไฟล์ท้าย ๆ จะโดน 429 ทั้งที่ไม่เกี่ยวกับสิ่งที่กำลังทดสอบ
 * เทสของตัวเองสลับ `APP_ENV` เป็นค่าอื่นชั่วคราวเพื่อพิสูจน์ว่ามันบังคับได้จริง
 */

type Bucket = { count: number; windowStart: number }

const buckets = new Map<string, Bucket>()

export type RateLimitOptions = {
  /** เรียกได้กี่ครั้งในหนึ่งหน้าต่างเวลา */
  limit: number
  windowMs: number
}

function isEnabled(): boolean {
  return process.env['APP_ENV'] !== 'local'
}

/** ล้างตัวนับทั้งหมด — ใช้เฉพาะเทสของตัวเอง ห้ามเรียกจากโค้ดจริง */
export function resetRateLimitsForTest(): void {
  buckets.clear()
}

/**
 * เรียกก่อนทำงานจริงของ request นั้น — โยน `tooManyRequests` ถ้าคีย์นี้เกินเพดาน
 * ในหน้าต่างเวลาปัจจุบัน ไม่โยนถ้ายังไม่เกิน (และนับครั้งนี้ให้ในตัวเดียวกัน)
 */
export function checkRateLimit(key: string, options: RateLimitOptions): void {
  if (!isEnabled()) return

  const now = Date.now()
  const existing = buckets.get(key)

  if (!existing || now - existing.windowStart >= options.windowMs) {
    buckets.set(key, { count: 1, windowStart: now })
    return
  }

  if (existing.count >= options.limit) {
    const retryAfterSeconds = Math.ceil((existing.windowStart + options.windowMs - now) / 1000)
    throw tooManyRequests('ทำรายการถี่เกินไป กรุณาลองใหม่อีกครั้ง', { retryAfterSeconds })
  }

  existing.count += 1
}

/** ที่อยู่ผู้ยิง ใช้เป็นคีย์ของตัวจำกัด — ปลอมได้ จึงไม่ใช่ของที่พึ่งได้ 100% แต่กันการยิงถี่ทั่วไปพอ */
export const clientIpOf = (request: Request): string =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
