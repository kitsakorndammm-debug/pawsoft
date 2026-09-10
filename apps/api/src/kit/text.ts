import { invalid } from './app-error.ts'

/**
 * ข้อความที่มาจากคนกรอกฟอร์ม
 *
 * สองฟังก์ชันที่ทุกโมดูลยืมไปใช้ — ไม่มีตัวไหนรู้จักตาราง ไม่มีตัวไหนตัดสินใจแทนโมดูล
 * ผู้เรียกเป็นคนบอกว่าฟิลด์ชื่ออะไร คำไทยเรียกว่าอะไร และยาวได้เท่าไหร่
 */

/**
 * ตัดช่องว่างหน้า-หลัง แล้วตรวจว่าใช้ได้จริง
 *
 * ตัดก่อนเสมอ เพื่อให้ทุกอย่างที่อยู่ถัดไป — unique index รวมอยู่ด้วย — เทียบกับค่าที่จะ
 * ถูกเก็บจริง ไม่งั้นชื่อหนึ่งกับชื่อเดียวกันที่มีช่องว่างต่อท้ายจะลงได้ทั้งคู่ แล้วลิสต์
 * จะแสดงสิ่งที่อ่านแล้วเป็นแถวเดียวกันสองครั้ง
 */
export function cleanRequired(
  raw: string,
  options: { field: string; label: string; max: number },
): string {
  const value = raw.trim()

  if (value.length === 0) throw invalid(`ต้องกรอก${options.label}`, { field: options.field })
  if (value.length > options.max) {
    throw invalid(`${options.label}ยาวเกิน ${options.max} ตัวอักษร`, {
      field: options.field,
      max: options.max,
      length: value.length,
    })
  }

  return value
}

/**
 * ช่องที่จะไม่กรอกก็ได้ — ช่องว่างล้วนถือว่าไม่ได้กรอก
 *
 * `null` กับ `''` แยกกันไม่ออกในสายตาคนอ่านรายงาน มีค่าเดียวพอ
 */
export function cleanOptional(
  raw: string | null | undefined,
  options: { field: string; label: string; max: number },
): string | null {
  if (raw === null || raw === undefined) return null

  const value = raw.trim()
  if (value.length === 0) return null

  if (value.length > options.max) {
    throw invalid(`${options.label}ยาวเกิน ${options.max} ตัวอักษร`, {
      field: options.field,
      max: options.max,
      length: value.length,
    })
  }

  return value
}

/**
 * ทำให้คำค้นหมายถึงตัวมันเอง
 *
 * `contains` ของ Prisma กลายเป็น LIKE และ Prisma ส่งคำค้นผ่านไปตรง ๆ — วัดแล้วเมื่อ
 * 2026-08-26: ค้นด้วย `%` คืนทุกแถวในตาราง
 *
 * `\` ต้องมาก่อนใน regex ไม่งั้นมันจะไปหนี escape ที่ตัวเองเพิ่งใส่ให้ตัวอื่น
 */
export function literal(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

/**
 * เบอร์โทรให้เหลือ**ตัวเลขล้วน** — `081-234-5678` · `081 234 5678` → `0812345678`
 *
 * (ผู้ใช้กำหนด 2026-09-01: "ถึงผู้ใช้จะกรอกอะไรมาขอเป็นตัวเลขล้วน")
 *
 * **นี่ไม่ใช่แค่ความสวยงาม — มันคือสิ่งที่ทำให้ `owner_phone_live_key` ทำงานถูก**
 * เก็บตามที่พิมพ์มา `081-234-5678` กับ `0812345678` จะเป็นคนละค่าในสายตา unique index
 * แล้วลูกค้าคนเดียวกันจะมีสองแถว ซึ่งทำให้การเชื่อมบัญชีอัตโนมัติเดาผิดตัว
 *
 * **ตัดทุกอย่างที่ไม่ใช่เลข รวมทั้ง `+`** · `+66812345678` จะเหลือ `66812345678`
 * ซึ่งไม่เท่ากับ `0812345678` · แปลงรหัสประเทศให้ก่อนจึงจะเทียบกันได้จริง
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')

  // `+66 81 234 5678` และ `0066...` คือเบอร์ไทยที่เขียนแบบสากล — คืนรูป `0` นำหน้า
  if (digits.startsWith('66') && digits.length >= 11) return `0${digits.slice(2)}`
  if (digits.startsWith('0066')) return `0${digits.slice(4)}`

  return digits
}
