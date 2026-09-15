import { afterEach, beforeAll, describe, expect, test } from 'bun:test'

import { app } from '../../src/app.ts'
import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import { readJson } from '../support/api-response.ts'
import { loginAsAdmin } from '../support/login.ts'

/**
 * `POST /api/drug-stock` · บันทึกปรับยอดสต็อกยา
 *
 * **รับได้แค่ `type: ADJUST`** (ผู้ใช้ตัดสิน 2026-09-15 — เดิมรับ `RECEIVE` ด้วย) —
 * เติมสต็อกฝั่งนี้ต้อง "เบิกจากคลัง" ผ่าน `POST /api/warehouse-stock/withdraw` เท่านั้น
 * ดู `///` บน `drug-stock.routes.ts`
 */

const NAME_PREFIX = 'TEST-STOCK-API-CREATE-'

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

/** ตั้งยอดคงเหลือให้พร้อมทดสอบปรับยอด — เขียนตรงเข้าฐาน ไม่ผ่าน HTTP เพราะเส้นนี้รับ RECEIVE ไม่ได้อีกแล้ว */
async function seedBalance(drugId: bigint, quantity: string) {
  await db.drugStockMovement.create({
    data: { drugId, type: 'RECEIVE', quantity, createdBy: SYSTEM_USER_ID },
  })
}

afterEach(async () => {
  const drugs = await db.drug.findMany({
    where: { name: { startsWith: NAME_PREFIX } },
    select: { id: true },
  })
  const ids = drugs.map((d) => d.id)
  if (ids.length > 0) {
    await db.drugStockMovement.deleteMany({ where: { drugId: { in: ids } } })
  }
  await db.drug.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
})

function post(body: unknown, withCookie = true) {
  return app.handle(
    new Request('http://localhost/api/drug-stock', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(withCookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  )
}

describe('POST /api/drug-stock', () => {
  test('ปรับยอดพร้อมเหตุผล → 201', async () => {
    const drug = await makeDrug('ADJUST')
    await seedBalance(drug.id, '10')

    const res = await post({
      drugId: Number(drug.id),
      type: 'ADJUST',
      quantity: '-2',
      reason: 'นับสต็อกจริงไม่ตรง',
    })
    const body = await readJson(res)

    expect(res.status).toBe(201)
    expect(body.ok).toBe(true)
    expect(typeof body.data.id).toBe('number')
    expect(body.data.drugId).toBe(Number(drug.id))
    expect(body.data.type).toBe('ADJUST')
    expect(body.data.quantity).toBe('-2')
    expect(body.data.reason).toBe('นับสต็อกจริงไม่ตรง')
    expect(typeof body.data.createdAt).toBe('string')
  })

  test('ปรับยอดไม่กรอกเหตุผล → 400 INVALID', async () => {
    const drug = await makeDrug('NO-REASON')

    const res = await post({ drugId: Number(drug.id), type: 'ADJUST', quantity: '-1' })
    const body = await readJson(res)

    expect(res.status).toBe(400)
    expect(body.error?.code).toBe('INVALID')
  })

  test('ส่ง type เป็น RECEIVE ตรงๆ → schema ปฏิเสธก่อนถึง service (ต้องเบิกจากคลังแทน)', async () => {
    const drug = await makeDrug('RECEIVE-BLOCK')

    const res = await post({ drugId: Number(drug.id), type: 'RECEIVE', quantity: '15' })

    expect(res.status).toBe(400)
  })

  test('ส่ง type เป็น DISPENSE ตรงๆ → schema ปฏิเสธก่อนถึง service', async () => {
    const drug = await makeDrug('DISPENSE-BLOCK')

    const res = await post({ drugId: Number(drug.id), type: 'DISPENSE', quantity: '-1' })

    expect(res.status).toBe(400)
  })

  test('ส่งฟิลด์ที่ไม่รู้จัก → 400', async () => {
    const drug = await makeDrug('UNKNOWN-FIELD')
    await seedBalance(drug.id, '10')

    const res = await post({
      drugId: Number(drug.id),
      type: 'ADJUST',
      quantity: '-1',
      reason: 'ทดสอบ',
      lotNumber: 'X1',
    })

    expect(res.status).toBe(400)
  })

  test('ไม่มียาตัวนี้ → 404', async () => {
    const res = await post({
      drugId: 999_999_999,
      type: 'ADJUST',
      quantity: '-1',
      reason: 'ทดสอบ',
    })
    const body = await readJson(res)

    expect(res.status).toBe(404)
    expect(body.error?.code).toBe('NOT_FOUND')
  })

  test('ไม่ได้ล็อกอิน → 401', async () => {
    const drug = await makeDrug('NO-LOGIN')

    const res = await post(
      { drugId: Number(drug.id), type: 'ADJUST', quantity: '-1', reason: 'ทดสอบ' },
      false,
    )

    expect(res.status).toBe(401)
  })
})
