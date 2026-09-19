import { describe, expect, test } from 'bun:test'

import { app } from '../../src/app.ts'
import { readJson } from '../support/api-response.ts'
import { loginAsAdmin } from '../support/login.ts'

/** `/api/history/*` · รูปของ response และการปฏิเสธพารามิเตอร์แปลกปลอม */

let cookie: string

async function get(path: string) {
  return app.handle(new Request(`http://localhost${path}`, { headers: { cookie } }))
}

describe('GET /api/history/drugs', () => {
  test('ล็อกอินแล้ว → 200 รูป paged', async () => {
    cookie = await loginAsAdmin()

    const res = await get('/api/history/drugs')
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
  })

  test('พารามิเตอร์ไม่รู้จัก → 400', async () => {
    const res = await get('/api/history/drugs?sort=name')
    expect(res.status).toBe(400)
  })
})

describe('GET /api/history/payments', () => {
  test('ล็อกอินแล้ว → 200', async () => {
    const res = await get('/api/history/payments')
    expect(res.status).toBe(200)
  })

  test('พารามิเตอร์ไม่รู้จัก → 400', async () => {
    const res = await get('/api/history/payments?foo=bar')
    expect(res.status).toBe(400)
  })

  test('ใบเสร็จที่ไม่มีอยู่จริง → 404', async () => {
    const res = await get('/api/history/payments/999999999')
    expect(res.status).toBe(404)
  })
})

describe('GET /api/history/visits', () => {
  test('ล็อกอินแล้ว → 200', async () => {
    const res = await get('/api/history/visits')
    expect(res.status).toBe(200)
  })

  test('พารามิเตอร์ไม่รู้จัก → 400', async () => {
    const res = await get('/api/history/visits?foo=bar')
    expect(res.status).toBe(400)
  })

  test('คิวที่ไม่มีอยู่จริง /:id/bill → 404', async () => {
    const res = await get('/api/history/visits/999999999/bill')
    expect(res.status).toBe(404)
  })
})
