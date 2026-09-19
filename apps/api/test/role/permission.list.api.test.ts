import { describe, expect, test } from 'bun:test'

import { app } from '../../src/app.ts'
import { readJson } from '../support/api-response.ts'
import { loginAsAdmin } from '../support/login.ts'

/**
 * `GET /api/permissions` · สารบัญสิทธิ์
 *
 * **ประวัติการใช้งาน (audit log) ต้องไม่โผล่ในลิสต์นี้** (ผู้ใช้ตัดสิน 2026-09-18:
 * "ซ่อนออกหมด ติ๊กให้บทบาทอื่นไม่ได้เลย") — หน้าติ๊กสิทธิ์ของบทบาทอ่านลิสต์นี้มาวาด
 * checkbox ตรง ๆ ถ้า key นี้อยู่ในนี้ แอดมินจะติ๊กให้บทบาทอื่นได้ ซึ่งขัดกับที่ตัดสินไว้
 */

describe('GET /api/permissions', () => {
  test('ไม่มี main:audit-log:read อยู่ในลิสต์ที่คืนมา', async () => {
    const cookie = await loginAsAdmin()

    const res = await app.handle(
      new Request('http://localhost/api/permissions', { headers: { cookie } }),
    )
    const body = await readJson(res)

    expect(res.status).toBe(200)
    const keys = body.data.map((p: { key: string }) => p.key)
    expect(keys.includes('main:audit-log:read')).toBe(false)
  })
})
