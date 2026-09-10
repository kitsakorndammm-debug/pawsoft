import { afterEach, beforeAll, describe, expect, test } from 'bun:test'

import { app } from '../../src/app.ts'
import { db } from '../../src/kit/db.ts'
import { readJson } from '../support/api-response.ts'
import { loginAsAdmin } from '../support/login.ts'

/**
 * `PATCH /api/employees/:id` · แก้ไขพนักงาน
 *
 * เหตุผลเดียวกับ `employee.create.api.test.ts` — ยืนยันว่า `phone` `email` `hiredAt`
 * แก้ผ่าน HTTP ได้จริง ไม่ใช่แค่เรียก service ตรง ๆ
 */

const CODE_PREFIX = 'TEST-EMP-API-UPDATE-'

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

function patch(id: number, body: unknown) {
  return app.handle(
    new Request(`http://localhost/api/employees/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    }),
  )
}

async function createBaseline(code: string) {
  const res = await post({
    code,
    firstName: 'ตั้งต้น',
    lastName: 'ก่อนแก้',
    nickname: null,
    note: null,
    phone: null,
    email: null,
    hiredAt: null,
    departmentId: null,
    positionId: null,
  })
  const body = await readJson(res)
  return body.data as { id: number; code: string; firstName: string; lastName: string }
}

describe('PATCH /api/employees/:id', () => {
  test('แก้เบอร์โทร อีเมล วันที่เริ่มงาน → 200 และค่าที่ได้กลับมาตรงกับที่แก้', async () => {
    const baseline = await createBaseline(`${CODE_PREFIX}1`)

    const res = await patch(baseline.id, {
      code: baseline.code,
      firstName: baseline.firstName,
      lastName: baseline.lastName,
      nickname: null,
      note: null,
      phone: '0898765432',
      email: 'new@example.com',
      hiredAt: '2026-03-01',
      departmentId: null,
      positionId: null,
    })
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.phone).toBe('0898765432')
    expect(body.data.email).toBe('new@example.com')
    expect(body.data.hiredAt).toBe('2026-03-01')
  })

  test('วันที่เริ่มงานผิดรูป → 400 ไม่ใช่ 500', async () => {
    const baseline = await createBaseline(`${CODE_PREFIX}2`)

    const res = await patch(baseline.id, {
      code: baseline.code,
      firstName: baseline.firstName,
      lastName: baseline.lastName,
      nickname: null,
      note: null,
      phone: null,
      email: null,
      hiredAt: '01/03/2026',
      departmentId: null,
      positionId: null,
    })
    const body = await readJson(res)

    expect(res.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error?.code).toBe('INVALID')
  })
})
