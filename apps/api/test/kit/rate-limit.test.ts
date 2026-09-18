import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { isAppError } from '../../src/kit/app-error.ts'
import { checkRateLimit, resetRateLimitsForTest } from '../../src/kit/rate-limit.ts'

/**
 * `checkRateLimit` โดยตรง ไม่ผ่าน HTTP — เร็วและไม่แตะฐาน
 *
 * **สลับ `APP_ENV` เป็น `production` ชั่วคราวเฉพาะไฟล์นี้** แล้วคืนค่าเดิมที่ `afterEach`
 * เสมอ — `test/setup.ts` บังคับ `APP_ENV=local` ให้ทุกไฟล์เทส ซึ่งเป็นสวิตช์ปิดตัวจำกัดนี้
 * โดยตั้งใจ (ดูคอมเมนต์บนหัว `rate-limit.ts`) ไฟล์นี้ต้องปิดสวิตช์นั้นชั่วคราวเพื่อพิสูจน์
 * ว่าตัวจำกัดบังคับได้จริงตอนไม่ใช่ local
 */
const ORIGINAL_APP_ENV = process.env['APP_ENV']

beforeEach(() => {
  process.env['APP_ENV'] = 'production'
  resetRateLimitsForTest()
})

afterEach(() => {
  process.env['APP_ENV'] = ORIGINAL_APP_ENV
  resetRateLimitsForTest()
})

describe('rate-limit · checkRateLimit', () => {
  test('เรียกไม่เกินเพดาน → ไม่โยน error', () => {
    for (let i = 0; i < 3; i++) {
      expect(() => checkRateLimit('k-under', { limit: 3, windowMs: 1000 })).not.toThrow()
    }
  })

  test('เรียกเกินเพดานในหน้าต่างเดียวกัน → โยน TOO_MANY_REQUESTS', () => {
    for (let i = 0; i < 3; i++) checkRateLimit('k-over', { limit: 3, windowMs: 1000 })

    let caught: unknown
    try {
      checkRateLimit('k-over', { limit: 3, windowMs: 1000 })
    } catch (e) {
      caught = e
    }

    expect(isAppError(caught) && caught.code).toBe('TOO_MANY_REQUESTS')
  })

  test('บอก retryAfterSeconds มาด้วยตอนโดนบล็อก', () => {
    for (let i = 0; i < 2; i++) checkRateLimit('k-retry', { limit: 2, windowMs: 10_000 })

    try {
      checkRateLimit('k-retry', { limit: 2, windowMs: 10_000 })
      throw new Error('ควรโยน error')
    } catch (e) {
      if (!isAppError(e)) throw e
      expect(typeof e.detail?.['retryAfterSeconds']).toBe('number')
    }
  })

  test('คนละคีย์ ไม่ปนกัน', () => {
    for (let i = 0; i < 3; i++) checkRateLimit('k-a', { limit: 3, windowMs: 1000 })

    expect(() => checkRateLimit('k-b', { limit: 3, windowMs: 1000 })).not.toThrow()
  })

  test('พ้นหน้าต่างเวลาแล้ว → นับใหม่ ไม่โดนบล็อกต่อ', async () => {
    for (let i = 0; i < 3; i++) checkRateLimit('k-window', { limit: 3, windowMs: 50 })

    await new Promise((resolve) => setTimeout(resolve, 80))

    expect(() => checkRateLimit('k-window', { limit: 3, windowMs: 50 })).not.toThrow()
  })

  test('APP_ENV=local → ปิดตัวจำกัดเสมอ', () => {
    process.env['APP_ENV'] = 'local'

    for (let i = 0; i < 50; i++) {
      expect(() => checkRateLimit('k-local', { limit: 3, windowMs: 1000 })).not.toThrow()
    }
  })
})
