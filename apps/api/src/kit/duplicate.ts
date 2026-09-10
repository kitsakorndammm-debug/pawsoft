import { duplicate } from './app-error.ts'
import { Prisma } from '../../prisma/generated/client.ts'

/**
 * แปลการชน unique index ให้เป็นการปฏิเสธที่บอกว่าฟิลด์ไหนชน
 *
 * **ให้ index เป็นคนตัดสิน ไม่ใช่ query ที่รันก่อน** — เช็คก่อนเขียนเหลือช่องไว้เสมอ:
 * สองคำขอต่างอ่านเจอว่าชื่อว่าง แล้วต่างเขียนลงไป · เช็คก่อนจึงไม่ได้กันซ้ำจริง
 * มันแค่ทำให้ต้องเขียนโค้ดสองที่ที่ทำงานเดียวกัน แล้ววันหนึ่งสองที่นั้นจะเถียงกัน
 *
 * P2002 ที่ไม่มีใครจับ เดินทางออกไปเป็น 500 "ระบบขัดข้อง" — คนกรอกฟอร์มไม่รู้ว่า
 * ต้องแก้อะไร ทั้งที่สิ่งที่เกิดขึ้นคือรหัสซ้ำ ซึ่งเขาแก้เองได้
 *
 * ```ts
 * try {
 *   return await inTx(outerTx, async (tx) => { ... })
 * } catch (e) {
 *   asDuplicate(e, { message: `มี${label}ชื่อนี้อยู่แล้ว`, field: 'name', value: name })
 * }
 * ```
 */
export function asDuplicate(
  e: unknown,
  options: { message: string; field: string; value: string },
): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    throw duplicate(options.message, { field: options.field, [options.field]: options.value })
  }

  throw e
}

/**
 * ชื่อ index ที่ชน — สำหรับตารางที่มี unique มากกว่าหนึ่งตัว
 *
 * ตารางที่มี unique ตัวเดียวใช้ `asDuplicate` ตรง ๆ ได้ · ตารางที่มีสองตัวขึ้นไป
 * (เช่น `component_item` ที่ห้ามซ้ำทั้งชื่อและรหัส) ต้องรู้ว่าชนตัวไหนถึงจะบอกคนกรอกได้ว่า
 * ต้องแก้ช่องไหน · ข้อความที่บอกว่า "ซ้ำ" เฉย ๆ ทำให้ต้องเดาเอง
 *
 * **อ่านจาก driver ไม่ใช่จาก `meta.target`** — วัดแล้ว 2026-08-27: adapter ของ Postgres
 * ส่งชื่อ index มาใน `meta.driverAdapterError.cause.constraint.index` ส่วน `meta.target`
 * ที่ Prisma เคยใช้ ว่างอยู่
 *
 * คืน `null` เมื่อไม่ใช่ P2002 หรืออ่านชื่อไม่ได้ — คนเรียกตกกลับไปใช้ข้อความกลาง ๆ
 */
export function duplicateIndexOf(e: unknown): string | null {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') {
    return null
  }

  const meta = e.meta as
    | { driverAdapterError?: { cause?: { constraint?: { index?: unknown } } } }
    | undefined
  const index = meta?.driverAdapterError?.cause?.constraint?.index

  return typeof index === 'string' ? index : null
}
