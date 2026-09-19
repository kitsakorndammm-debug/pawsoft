import { afterEach, beforeAll, describe, expect, test } from 'bun:test'

import { app } from '../../src/app.ts'
import { db } from '../../src/kit/db.ts'
import { readJson } from '../support/api-response.ts'
import { loginAsAdmin } from '../support/login.ts'

/** `GET /api/audit-logs` · ดูประวัติการใช้งาน */

const MODULE_PREFIX = 'TEST-AUDIT-LOG-API-'

let cookie: string

beforeAll(async () => {
  cookie = await loginAsAdmin()
})

async function makeLog(module: string, userId = 1n) {
  return db.auditLog.create({
    data: { module, action: `${module}.create`, userId, after: { x: 1 } },
  })
}

afterEach(async () => {
  await db.auditLog.deleteMany({ where: { module: { startsWith: MODULE_PREFIX } } })
})

function get(query: string, withCookie = true) {
  return app.handle(
    new Request(`http://localhost/api/audit-logs${query}`, {
      headers: withCookie ? { cookie } : {},
    }),
  )
}

describe('GET /api/audit-logs', () => {
  test('มีบันทึกอยู่ → 200 คืนแถวพร้อมชื่อผู้ใช้ · id/recordId/userId เป็น number', async () => {
    const module = `${MODULE_PREFIX}OK`
    await makeLog(module)

    const res = await get(`?module=${module}`)
    const body = await readJson(res)
    const row = body.data[0]

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.length).toBe(1)
    expect(typeof row.id).toBe('number')
    expect(typeof row.userId).toBe('number')
    expect(row.module).toBe(module)
    expect(typeof row.userName).toBe('string')
    // module ที่ไม่มีตัวแปล subject → null ไม่ใช่ undefined ที่หายไปจาก wire
    expect(row.subject).toBeNull()
    expect(typeof row.risk).toBe('boolean')
  })

  test('action อยู่ใน allowlist ความเสี่ยง → risk เป็น true บน wire', async () => {
    const marker = 555_555_555
    await db.auditLog.create({
      data: { module: 'employee', action: 'employee.delete', userId: 1n, recordId: marker, after: {} },
    })

    const res = await get('?module=employee&pageSize=200')
    const body = await readJson(res)
    const row = body.data.find((r: { recordId: number }) => r.recordId === marker)

    expect(row?.risk).toBe(true)

    await db.auditLog.deleteMany({ where: { module: 'employee', recordId: marker } })
  })

  test('กรองด้วย module → เห็นเฉพาะของ module นั้น', async () => {
    const moduleA = `${MODULE_PREFIX}FILTER-A`
    const moduleB = `${MODULE_PREFIX}FILTER-B`
    await makeLog(moduleA)
    await makeLog(moduleB)

    const res = await get(`?module=${moduleA}`)
    const body = await readJson(res)

    expect(body.data.every((r: { module: string }) => r.module === moduleA)).toBe(true)
  })

  test('ส่งพารามิเตอร์ที่ไม่รู้จัก → 400', async () => {
    const res = await get('?sort=createdAt')

    expect(res.status).toBe(400)
  })

  test('วันที่ผิดรูป → 400', async () => {
    const res = await get('?date=not-a-date')

    expect(res.status).toBe(400)
    const body = await readJson(res)
    expect(body.error?.code).toBe('INVALID')
  })

  test('ไม่ได้ล็อกอิน → 401', async () => {
    const res = await get('', false)

    expect(res.status).toBe(401)
  })
})

describe('GET /api/audit-logs/modules', () => {
  test('มีบันทึกอยู่ → 200 คืนชื่อ module ไม่ซ้ำ', async () => {
    const module = `${MODULE_PREFIX}MODLIST`
    await makeLog(module)
    await makeLog(module)

    const res = await app.handle(
      new Request('http://localhost/api/audit-logs/modules', { headers: { cookie } }),
    )
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.data.filter((m: string) => m === module).length).toBe(1)
  })

  test('ไม่ได้ล็อกอิน → 401', async () => {
    const res = await app.handle(new Request('http://localhost/api/audit-logs/modules'))

    expect(res.status).toBe(401)
  })
})

describe('GET /api/audit-logs/actors', () => {
  test('มีบันทึกอยู่ → 200 คืน id/name ของคนที่เคยทำ', async () => {
    const module = `${MODULE_PREFIX}ACTORLIST`
    await makeLog(module, 1n)

    const res = await app.handle(
      new Request('http://localhost/api/audit-logs/actors', { headers: { cookie } }),
    )
    const body = await readJson(res)

    expect(res.status).toBe(200)
    const row = body.data.find((a: { id: number }) => a.id === 1)
    expect(typeof row?.name).toBe('string')
  })

  test('ไม่ได้ล็อกอิน → 401', async () => {
    const res = await app.handle(new Request('http://localhost/api/audit-logs/actors'))

    expect(res.status).toBe(401)
  })
})
