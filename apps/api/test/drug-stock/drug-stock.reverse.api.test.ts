import { afterEach, beforeAll, describe, expect, test } from 'bun:test'

import { app } from '../../src/app.ts'
import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import { readJson } from '../support/api-response.ts'
import { loginAsAdmin } from '../support/login.ts'

/**
 * `POST /api/drug-stock/movements/:id/reverse` · ย้อนรายการรับเข้า/ปรับยอดที่บันทึกผิด
 *
 * สร้างรายการปรับยอดตรงข้ามใหม่ ไม่แก้ของเดิม — ดู `///` บน `reverseDrugStockMovement`
 */

const NAME_PREFIX = 'TEST-STOCK-API-REVERSE-'

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

async function seedMovement(
  drugId: bigint,
  type: 'RECEIVE' | 'ADJUST' | 'DISPENSE',
  quantity: string,
  reason: string | null = null,
) {
  return db.drugStockMovement.create({
    data: { drugId, type, quantity, reason: reason ?? (type === 'ADJUST' ? 'ทดสอบ' : null), createdBy: SYSTEM_USER_ID },
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
    await db.auditLog.deleteMany({ where: { module: 'drug-stock', recordId: { in: ids } } })
  }
  await db.drug.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
})

function post(id: bigint | number, withCookie = true) {
  return app.handle(
    new Request(`http://localhost/api/drug-stock/movements/${id}/reverse`, {
      method: 'POST',
      headers: withCookie ? { cookie } : {},
    }),
  )
}

describe('POST /api/drug-stock/movements/:id/reverse', () => {
  test('ย้อนรายการรับเข้า → 201 ได้รายการปรับยอดตรงข้ามใหม่', async () => {
    const drug = await makeDrug('OK')
    const original = await seedMovement(drug.id, 'RECEIVE', '100')

    const res = await post(original.id)
    const body = await readJson(res)

    expect(res.status).toBe(201)
    expect(body.ok).toBe(true)
    expect(body.data.type).toBe('ADJUST')
    expect(body.data.quantity).toBe('-100')
    expect(typeof body.data.id).toBe('number')
    expect(body.data.id).not.toBe(Number(original.id))
  })

  test('ย้อนรายการจ่ายยา (DISPENSE) → 400 INVALID', async () => {
    const drug = await makeDrug('DISPENSE-BLOCK')
    const movement = await seedMovement(drug.id, 'DISPENSE', '-1')

    const res = await post(movement.id)
    const body = await readJson(res)

    expect(res.status).toBe(400)
    expect(body.error?.code).toBe('INVALID')
  })

  test('ย้อนแล้วยอดจะติดลบ → 400 INVALID', async () => {
    const drug = await makeDrug('NEGATIVE')
    const original = await seedMovement(drug.id, 'RECEIVE', '10')
    await seedMovement(drug.id, 'ADJUST', '-8')

    const res = await post(original.id)
    const body = await readJson(res)

    expect(res.status).toBe(400)
    expect(body.error?.code).toBe('INVALID')
  })

  test('ไม่มีรายการนี้ → 404', async () => {
    const res = await post(999_999_999)
    const body = await readJson(res)

    expect(res.status).toBe(404)
    expect(body.error?.code).toBe('NOT_FOUND')
  })

  test('ไม่ได้ล็อกอิน → 401', async () => {
    const drug = await makeDrug('NO-LOGIN')
    const movement = await seedMovement(drug.id, 'RECEIVE', '10')

    const res = await post(movement.id, false)

    expect(res.status).toBe(401)
  })
})
