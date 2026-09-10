import type { Db, Tx } from './db.ts'

/**
 * บันทึกการเปลี่ยนแปลงข้อมูล — ใครแก้อะไร จากค่าอะไรเป็นอะไร
 *
 * **เขียนในทรานแซกชันเดียวกับการเปลี่ยนแปลงเสมอ** ซึ่งเป็นเหตุผลที่ทุกฟังก์ชันรับ `tx`
 * เข้ามาแทนที่จะเรียก `db` เอง · บันทึกที่เขียนนอกทรานแซกชันจะรอดจากการ rollback
 * แล้วยืนยันว่ามีการเปลี่ยนแปลงที่ไม่เคยเกิดขึ้น
 */

/**
 * ฟิลด์ที่ห้ามลงบันทึก ต่อให้ผู้เรียกส่งมา
 *
 * `audit_log` เป็นตารางที่คนเปิดอ่าน — hash ของรหัสผ่านหรือ token ที่หลุดมาอยู่ตรงนี้
 * คือความลับที่ย้ายจากที่ที่ถูกป้องกันไปอยู่ในที่ที่ถูกอ่าน
 */
const REDACTED = new Set(['passwordHash', 'password', 'tokenHash', 'token', 'secret'])

/**
 * แปลงค่าให้เก็บเป็น JSON ได้ และไม่พาความลับติดไปด้วย
 *
 * BigInt โยน error ถ้าส่งเข้า `JSON.stringify` ตรง ๆ และ `Date` กลายเป็น `{}` —
 * ทั้งคู่เป็นชนิดคอลัมน์ปกติของตารางในระบบนี้
 */
function toJsonValue(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(toJsonValue)

  if (typeof value === 'object') {
    // Prisma Decimal และอะไรก็ตามที่รู้วิธีเขียนตัวเองออกมาเป็นข้อความ
    const maybeDecimal = value as { toFixed?: unknown; toString(): string }
    if (typeof maybeDecimal.toFixed === 'function') return maybeDecimal.toString()

    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTED.has(key)) continue
      out[key] = toJsonValue(v)
    }
    return out
  }

  return value
}

/** เทียบสองค่าว่าเหมือนกันไหม หลังแปลงเป็นรูปที่เก็บลงบันทึกแล้ว */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(toJsonValue(a)) === JSON.stringify(toJsonValue(b))
}

export type FieldDiff = {
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

/**
 * หาว่าอะไรเปลี่ยนไปบ้าง — คืนเฉพาะฟิลด์ที่ค่าต่างกันจริง
 *
 * ฟอร์มแก้ไขส่งทุกฟิลด์กลับมาตอนกดบันทึก ฉะนั้น "สิ่งที่ request พูดถึง" คือทั้งฟอร์ม
 * ไม่ว่าจะมีใครพิมพ์อะไรหรือเปล่า · เก็บทั้งก้อนแปลว่าบันทึกทุกแถวหน้าตาเหมือนกันหมด
 * แล้วคนอ่านต้องมานั่งไล่เทียบเองว่าอะไรต่าง
 *
 * เทียบผ่าน `toJsonValue` เพื่อให้ BigInt กับตัวเลขที่ค่าเท่ากัน · Decimal กับข้อความ
 * ที่มันแปลงออกมา · และ `Date` สองตัวที่ชี้เวลาเดียวกัน อ่านเป็น "ไม่เปลี่ยน" ทั้งหมด
 * ซึ่ง `!==` เปล่า ๆ จะนับเป็นการแก้ทั้งสามอย่าง
 *
 * ไม่มีอะไรเปลี่ยน → คืน `null` ทั้งคู่ ผู้เรียกใช้ค่านี้ตัดสินใจว่าจะไม่เขียนบันทึกเลย
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FieldDiff {
  const changedBefore: Record<string, unknown> = {}
  const changedAfter: Record<string, unknown> = {}
  let any = false

  for (const [key, value] of Object.entries(after)) {
    if (same(value, before[key])) continue
    changedBefore[key] = toJsonValue(before[key])
    changedAfter[key] = toJsonValue(value)
    any = true
  }

  return any ? { before: changedBefore, after: changedAfter } : { before: null, after: null }
}

export type WriteAuditInput = {
  /** `product-type.create` — รูปเดียวกับ permission key: `<โมดูล>.<การกระทำ>` */
  action: string
  module: string
  recordId?: bigint | null
  before?: unknown
  after?: unknown
  userId: bigint
  /** `WEB` `API` `SYSTEM` `JOB` — ยังไม่มีชั้นที่รู้จริง จึงเป็น `WEB` ไปก่อน */
  source?: string
}

/**
 * เขียนบันทึกหนึ่งแถว
 *
 * รับ `tx` เป็นตัวแรก **ไม่ใช่ตัวเลือก** — ผู้เรียกที่ไม่ได้อยู่ในทรานแซกชันส่ง `db`
 * เข้ามาได้ แต่ต้องเป็นการตัดสินใจที่มองเห็น ไม่ใช่ค่าที่ละไว้แล้วเผลอเขียนนอกทรานแซกชัน
 */
export async function writeAudit(tx: Tx | Db, input: WriteAuditInput): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: input.action,
      module: input.module,
      recordId: input.recordId ?? null,
      before: (toJsonValue(input.before) ?? null) as never,
      after: (toJsonValue(input.after) ?? null) as never,
      userId: input.userId,
      source: input.source ?? 'WEB',
    },
  })
}
