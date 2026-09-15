import { afterEach, beforeAll, describe, expect, test } from 'bun:test'

import { app } from '../../src/app.ts'
import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import { readJson } from '../support/api-response.ts'
import { loginAsAdmin } from '../support/login.ts'

/**
 * `POST /api/warehouse-stock` · บันทึกซื้อเข้า/ปรับยอดคลังยา
 *
 * **รับได้แค่ `type: RECEIVE | ADJUST`** — `WITHDRAW` เป็นของที่ `POST /withdraw`
 * สร้างเองเท่านั้น
 */

const NAME_PREFIX = 'TEST-WAREHOUSE-API-CREATE-'

let cookie: string

beforeAll(async () => {
  cookie = await loginAsAdmin()
})

async function makeDrug(suffix: string) {
  return db.drug.create({
    data: {
      name: `${NAME_PREFIX}${suffix}`,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  })
}

afterEach(async () => {
  const drugs = await db.drug.findMany({
    where: { name: { startsWith: NAME_PREFIX } },
    select: { id: true },
  })
  const ids = drugs.map((d) => d.id)
  if (ids.length > 0) {
    await db.warehouseStockMovement.deleteMany({ where: { drugId: { in: ids } } })
  }
  await db.drug.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
})

function post(body: unknown, withCookie = true) {
  return app.handle(
    new Request('http://localhost/api/warehouse-stock', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(withCookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  )
}

describe('POST /api/warehouse-stock', () => {
  test('ซื้อเข้าคลัง → 201 ชนิดบนสายถูกต้อง', async () => {
    const drug = await makeDrug('RECEIVE')

    const res = await post({ drugId: Number(drug.id), type: 'RECEIVE', quantity: '99' })
    const body = await readJson(res)

    expect(res.status).toBe(201)
    expect(body.ok).toBe(true)
    expect(typeof body.data.id).toBe('number')
    expect(body.data.drugId).toBe(Number(drug.id))
    expect(body.data.type).toBe('RECEIVE')
    expect(body.data.quantity).toBe('99')
    expect(typeof body.data.createdAt).toBe('string')
  })

  test('ปรับยอดพร้อมเหตุผล → 201', async () => {
    const drug = await makeDrug('ADJUST')
    await post({ drugId: Number(drug.id), type: 'RECEIVE', quantity: '10' })

    const res = await post({
      drugId: Number(drug.id),
      type: 'ADJUST',
      quantity: '-2',
      reason: 'นับคลังจริงไม่ตรง',
    })
    const body = await readJson(res)

    expect(res.status).toBe(201)
    expect(body.data.reason).toBe('นับคลังจริงไม่ตรง')
  })

  test('ปรับยอดไม่กรอกเหตุผล → 400 INVALID', async () => {
    const drug = await makeDrug('NO-REASON')

    const res = await post({ drugId: Number(drug.id), type: 'ADJUST', quantity: '-1' })
    const body = await readJson(res)

    expect(res.status).toBe(400)
    expect(body.error?.code).toBe('INVALID')
  })

  test('ส่ง type เป็น WITHDRAW ตรงๆ → schema ปฏิเสธก่อนถึง service', async () => {
    const drug = await makeDrug('WITHDRAW-BLOCK')

    const res = await post({ drugId: Number(drug.id), type: 'WITHDRAW', quantity: '-1' })

    expect(res.status).toBe(400)
  })

  test('ส่งฟิลด์ที่ไม่รู้จัก → 400', async () => {
    const drug = await makeDrug('UNKNOWN-FIELD')

    const res = await post({
      drugId: Number(drug.id),
      type: 'RECEIVE',
      quantity: '5',
      lotNumber: 'X1',
    })

    expect(res.status).toBe(400)
  })

  test('ไม่มียาตัวนี้ → 404', async () => {
    const res = await post({ drugId: 999_999_999, type: 'RECEIVE', quantity: '5' })
    const body = await readJson(res)

    expect(res.status).toBe(404)
    expect(body.error?.code).toBe('NOT_FOUND')
  })

  test('ไม่ได้ล็อกอิน → 401', async () => {
    const drug = await makeDrug('NO-LOGIN')

    const res = await post({ drugId: Number(drug.id), type: 'RECEIVE', quantity: '5' }, false)

    expect(res.status).toBe(401)
  })
})
