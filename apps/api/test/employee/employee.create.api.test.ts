import { afterEach, beforeAll, describe, expect, test } from 'bun:test'

import { app } from '../../src/app.ts'
import { db } from '../../src/kit/db.ts'
import { readJson } from '../support/api-response.ts'
import { loginAsAdmin } from '../support/login.ts'

/**
 * `POST /api/employees` · เพิ่มพนักงาน
 *
 * ยืนยันว่า `phone` `email` `hiredAt` เดินทางผ่าน HTTP ได้จริง — จุดที่เคยพังคือฟอร์ม
 * หน้าเว็บส่งค่ามาแล้วโดน `refuseUnknownFields` ปฏิเสธว่า "ไม่รู้จักฟิลด์ phone"
 * เพราะ route ยังไม่เคยประกาศฟิลด์เหล่านี้ไว้ใน `writeFields`/`CREATE_FIELDS`
 */

const CODE_PREFIX = 'TEST-EMP-API-CREATE-'

let cookie: string

beforeAll(async () => {
  cookie = await loginAsAdmin()
})

afterEach(async () => {
  await db.employee.deleteMany({ where: { code: { startsWith: CODE_PREFIX } } })
})

function post(body: unknown) {
  return app.handle(
    new Request('http://localhost/api/employees', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    }),
  )
}

describe('POST /api/employees', () => {
  test('กรอกเบอร์โทร อีเมล วันที่เริ่มงานครบ → 201 และค่าที่ได้กลับมาตรงกับที่ส่งไป', async () => {
    const res = await post({
      code: `${CODE_PREFIX}1`,
      firstName: 'สมชาย',
      lastName: 'ใจดี',
      nickname: null,
      note: null,
      phone: '0812345678',
      email: 'somchai@example.com',
      hiredAt: '2026-01-15',
      departmentId: null,
      positionId: null,
    })
    const body = await readJson(res)

    expect(res.status).toBe(201)
    expect(body.ok).toBe(true)
    expect(body.data.phone).toBe('0812345678')
    expect(body.data.email).toBe('somchai@example.com')
    // วันที่ออกทางสายเป็น `YYYY-MM-DD` ไม่ใช่ ISO timestamp เต็ม — ดู `toDate` ใน route
    expect(body.data.hiredAt).toBe('2026-01-15')
  })

  test('ฟิลด์ที่ไม่รู้จัก (ไม่ใช่สามฟิลด์ที่เพิ่งเปิด) ยังถูกปฏิเสธด้วย 400 เหมือนเดิม', async () => {
    const res = await post({
      code: `${CODE_PREFIX}2`,
      firstName: 'สมชาย',
      lastName: 'ใจดี',
      nickname: null,
      note: null,
      phone: null,
      email: null,
      hiredAt: null,
      departmentId: null,
      positionId: null,
      salary: 30000,
    })
    const body = await readJson(res)

    expect(res.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error?.code).toBe('INVALID')
  })

  test('อีเมลไม่มีรูปเป็นอีเมล → 400 ไม่ใช่ 500', async () => {
    const res = await post({
      code: `${CODE_PREFIX}3`,
      firstName: 'สมชาย',
      lastName: 'ใจดี',
      nickname: null,
      note: null,
      phone: null,
      email: 'not-an-email',
      hiredAt: null,
      departmentId: null,
      positionId: null,
    })
    const body = await readJson(res)

    expect(res.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error?.code).toBe('INVALID')
  })
})
