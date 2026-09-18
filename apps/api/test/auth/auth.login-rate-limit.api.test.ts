import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { app } from '../../src/app.ts'
import { db } from '../../src/kit/db.ts'
import { resetRateLimitsForTest } from '../../src/kit/rate-limit.ts'
import { seed } from '../../src/kit/seed.ts'
import { readJson } from '../support/api-response.ts'

/**
 * `POST /api/auth/login` · จำกัดจำนวนครั้งต่อ IP
 *
 * **สลับ `APP_ENV` เป็น `production` ชั่วคราวเฉพาะไฟล์นี้** แล้วคืนกลับที่ `afterAll` —
 * ตัวจำกัดปิดอยู่เสมอตอน `APP_ENV=local` (ค่าที่ `test/setup.ts` บังคับให้ทุกไฟล์เทส)
 * เพราะไฟล์อื่นเรียก `loginAsAdmin()` จริงจากหลาย `beforeAll` (ดู `test/support/login.ts`)
 * ถ้าไม่ปิดจะชนกันเองจนไฟล์ท้าย ๆ พังด้วยเหตุผลที่ไม่เกี่ยวกับสิ่งที่กำลังทดสอบ — ไฟล์นี้
 * ต้องเปิดสวิตช์กลับมาชั่วคราวเพื่อพิสูจน์ว่ามันบังคับได้จริงตอนไม่ใช่ local
 */

const IP = '203.0.113.9' // TEST-NET-3 (RFC 5737) — ใช้เฉพาะเทส ไม่ใช่ IP จริง
const IDENTIFIER = 'TEST-RATE-LIMIT-NO-SUCH-USER'
const ORIGINAL_APP_ENV = process.env['APP_ENV']

beforeAll(async () => {
  await seed()
  process.env['APP_ENV'] = 'production'
  resetRateLimitsForTest()
})

afterAll(async () => {
  process.env['APP_ENV'] = ORIGINAL_APP_ENV
  resetRateLimitsForTest()
  await db.loginLog.deleteMany({ where: { identifier: IDENTIFIER } })
})

async function attemptLogin() {
  return app.handle(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': IP },
      body: JSON.stringify({ username: IDENTIFIER, password: 'wrong-password' }),
    }),
  )
}

describe('POST /api/auth/login · จำกัดจำนวนครั้งต่อ IP', () => {
  test('ยิงเกินเพดานจาก IP เดียวกัน → ครั้งที่เกินได้ 429 พร้อม error.code TOO_MANY_REQUESTS', async () => {
    let lastRes: Response | undefined

    // เพดานคือ 10 ครั้งต่อ 5 นาที — ยิง 11 ครั้งเพื่อให้ครั้งสุดท้ายเกิน
    for (let i = 0; i < 11; i++) {
      lastRes = await attemptLogin()
    }

    expect(lastRes?.status).toBe(429)
    const body = await readJson(lastRes as Response)
    expect(body.ok).toBe(false)
    expect(body.error?.code).toBe('TOO_MANY_REQUESTS')
    expect(typeof body.error?.detail?.['retryAfterSeconds']).toBe('number')
  })

  test('ครั้งก่อนถึงเพดาน ยังตอบ 401 ตามปกติ (ไม่ใช่ 429)', async () => {
    resetRateLimitsForTest()

    const res = await attemptLogin()

    expect(res.status).toBe(401)
    const body = await readJson(res)
    expect(body.error?.code).toBe('UNAUTHORIZED')
  })
})
