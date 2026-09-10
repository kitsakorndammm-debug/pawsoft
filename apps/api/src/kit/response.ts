import { AppError, ERROR_CODE, ERROR_STATUS, isAppError } from './app-error.ts'

/**
 * รูปเดียวของทุก response ในระบบ
 *
 *   { ok: true,  data: ... }
 *   { ok: false, error: { code, message, detail? } }
 *
 * `ok` ไม่ได้แทน HTTP status แต่มาคู่กันเสมอ — สำเร็จได้ 2xx ปฏิเสธได้ 4xx
 * มีไว้เพราะฝั่งหน้าเว็บเขียน `if (!res.ok)` ที่เดียว อ่านง่ายกว่าไล่ status ทีละช่วง
 */

export type OkResponse<T> = { ok: true; data: T }
export type FailResponse = {
  ok: false
  error: { code: string; message: string; detail?: Record<string, unknown> }
}

export const ok = <T>(data: T): OkResponse<T> => ({ ok: true, data })

/**
 * ลิสต์ที่แบ่งหน้า — `{ ok, data, page }`
 *
 * ทะเบียนที่ผู้ใช้ลากจัดลำดับใช้ `ok()` เฉย ๆ เพราะคืนทั้งหมดอยู่แล้ว · ตัวนี้มีไว้ให้
 * ตารางที่แถวเยอะเกินกว่าจะโหลดทีเดียว เช่นพนักงาน
 *
 * `total` คือจำนวนแถวทั้งหมดที่ตรงกับเงื่อนไข ไม่ใช่จำนวนที่คืนมาในหน้านี้ — หน้าจอ
 * ต้องรู้ว่ามีกี่หน้าถึงจะวาดปุ่มเลขหน้าได้
 */
export type PageMeta = {
  page: number
  pageSize: number
  total: number
}

export type PagedResponse<T> = { ok: true; data: T[]; page: PageMeta }

export const paged = <T>(data: T[], meta: PageMeta): PagedResponse<T> => ({
  ok: true,
  data,
  page: meta,
})

export const fail = (e: AppError): FailResponse => ({
  ok: false,
  error: {
    code: e.code,
    message: e.message,
    ...(e.detail ? { detail: e.detail } : {}),
  },
})

/**
 * แปลง error ที่หลุดออกมาจาก handler เป็น response
 *
 * `AppError` คือการปฏิเสธที่ตั้งใจ — ส่งรหัสกับข้อความออกไปตรง ๆ ได้
 * **อย่างอื่นคือบั๊ก** และไม่ส่งรายละเอียดออกไป: ข้อความของ error ที่ไม่ได้ตั้งใจ
 * มักมีชื่อตาราง ชื่อคอลัมน์ หรือ query ติดมาด้วย
 */
export function toErrorResponse(e: unknown): { status: number; body: FailResponse } {
  if (isAppError(e)) {
    return { status: ERROR_STATUS[e.code], body: fail(e) }
  }

  console.error('unhandled error', e)

  return {
    status: 500,
    body: {
      ok: false,
      error: { code: 'INTERNAL', message: 'ระบบขัดข้อง กรุณาลองใหม่' },
    },
  }
}

/**
 * ข้อผิดพลาดจาก schema ของ Elysia — ค่าที่ส่งมาผิดรูป
 *
 * รวมถึงพารามิเตอร์หรือฟิลด์ที่ไม่ได้ประกาศไว้ ซึ่ง Elysia จะตัดทิ้งเงียบ ๆ ถ้าไม่ปิดทาง
 * แล้วคนที่พิมพ์ชื่อผิดจะได้ 200 กลับไปพร้อมความเชื่อว่าทำสำเร็จ
 */
export const validationFailed = (message: string): FailResponse => ({
  ok: false,
  error: { code: ERROR_CODE.INVALID, message },
})
