import { afterEach, beforeAll, describe, expect, test } from 'bun:test'

import { app } from '../../src/app.ts'
import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import { createWarehouseStockMovement } from '../../src/modules/warehouse-stock/warehouse-stock.service.ts'
import { readJson } from '../support/api-response.ts'
import { loginAsAdmin } from '../support/login.ts'

/**
 * `POST /api/warehouse-stock/withdraw` · เบิกจากคลังยา → เติมสต็อกที่หมอใช้จ่ายคนไข้
 */

const NAME_PREFIX = 'TEST-WAREHOUSE-API-WITHDRAW-'

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
    await db.drugStockMovement.deleteMany({ where: { drugId: { in: ids } } })
  }
  await db.drug.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
})

function post(body: unknown, withCookie = true) {
  return app.handle(
    new Request('http://localhost/api/warehouse-stock/withdraw', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(withCookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  )
}

function getDrugStock(query: string) {
  return app.handle(
    new Request(`http://localhost/api/drug-stock${query}`, { headers: { cookie } }),
  )
}

describe('POST /api/warehouse-stock/withdraw', () => {
  test('เบิกสำเร็จ → 201 คืนแถว WITHDRAW และสต็อกที่หมอใช้เพิ่มขึ้นจริง', async () => {
    const drug = await makeDrug('OK')
    await createWarehouseStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '99' },
      SYSTEM_USER_ID,
    )

    const res = await post({ drugId: Number(drug.id), quantity: '20' })
    const body = await readJson(res)

    expect(res.status).toBe(201)
    expect(body.data.type).toBe('WITHDRAW')
    expect(body.data.quantity).toBe('-20')

    const stockRes = await getDrugStock(`?q=${encodeURIComponent(`${NAME_PREFIX}OK`)}`)
    const stockBody = await readJson(stockRes)
    const row = stockBody.data.find((r: { id: number }) => r.id === Number(drug.id))

    expect(row.quantity).toBe('20')
  })

  test('เบิกพร้อมวันหมดอายุ → สต็อกที่หมอใช้มี nearestExpiry ตรงกัน', async () => {
    const drug = await makeDrug('EXPIRES')
    await createWarehouseStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '30' },
      SYSTEM_USER_ID,
    )

    await post({ drugId: Number(drug.id), quantity: '10', expiresOn: '2027-06-30' })

    const stockRes = await getDrugStock(`?q=${encodeURIComponent(`${NAME_PREFIX}EXPIRES`)}`)
    const stockBody = await readJson(stockRes)
    const row = stockBody.data.find((r: { id: number }) => r.id === Number(drug.id))

    expect(row.nearestExpiry).toBe('2027-06-30')
  })

  test('เบิกโดยเลือกล็อต → วันหมดอายุมาจากล็อต', async () => {
    const drug = await makeDrug('LOT')
    const lot = await createWarehouseStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '20', expiresOn: '2027-09-01' },
      SYSTEM_USER_ID,
    )

    await post({ drugId: Number(drug.id), quantity: '5', lotId: Number(lot.id) })

    const stockRes = await getDrugStock(`?q=${encodeURIComponent(`${NAME_PREFIX}LOT`)}`)
    const stockBody = await readJson(stockRes)
    const row = stockBody.data.find((r: { id: number }) => r.id === Number(drug.id))

    expect(row.nearestExpiry).toBe('2027-09-01')
  })

  test('เบิกเกินยอดคงเหลือของล็อตที่เลือก → 400 INVALID', async () => {
    const drug = await makeDrug('LOT-OVER')
    const lot = await createWarehouseStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '5' },
      SYSTEM_USER_ID,
    )
    await createWarehouseStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '50' }, SYSTEM_USER_ID)

    const res = await post({ drugId: Number(drug.id), quantity: '8', lotId: Number(lot.id) })
    const body = await readJson(res)

    expect(res.status).toBe(400)
    expect(body.error?.code).toBe('INVALID')
  })

  test('เบิกเกินยอดคงเหลือในคลัง → 400 INVALID', async () => {
    const drug = await makeDrug('OVER')
    await createWarehouseStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '5' },
      SYSTEM_USER_ID,
    )

    const res = await post({ drugId: Number(drug.id), quantity: '10' })
    const body = await readJson(res)

    expect(res.status).toBe(400)
    expect(body.error?.code).toBe('INVALID')
  })

  test('ส่งฟิลด์ที่ไม่รู้จัก → 400', async () => {
    const drug = await makeDrug('UNKNOWN-FIELD')
    await createWarehouseStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '5' },
      SYSTEM_USER_ID,
    )

    const res = await post({ drugId: Number(drug.id), quantity: '1', batchCode: 'X1' })

    expect(res.status).toBe(400)
  })

  test('ไม่มียาตัวนี้ → 404', async () => {
    const res = await post({ drugId: 999_999_999, quantity: '5' })
    const body = await readJson(res)

    expect(res.status).toBe(404)
    expect(body.error?.code).toBe('NOT_FOUND')
  })

  test('ไม่ได้ล็อกอิน → 401', async () => {
    const drug = await makeDrug('NO-LOGIN')

    const res = await post({ drugId: Number(drug.id), quantity: '5' }, false)

    expect(res.status).toBe(401)
  })
})
