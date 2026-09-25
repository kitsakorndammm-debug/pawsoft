import { afterEach, beforeAll, describe, expect, test } from 'bun:test'

import { app } from '../../src/app.ts'
import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import { createWarehouseStockMovement } from '../../src/modules/warehouse-stock/warehouse-stock.service.ts'
import { readJson } from '../support/api-response.ts'
import { loginAsAdmin } from '../support/login.ts'

/** `GET /api/warehouse-stock/:drugId/lots` · ดูล็อตที่ยังเหลือของยาตัวเดียว */

const NAME_PREFIX = 'TEST-WAREHOUSE-API-LOTS-'

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

function get(drugId: bigint, withCookie = true) {
  return app.handle(
    new Request(`http://localhost/api/warehouse-stock/${drugId}/lots`, {
      headers: withCookie ? { cookie } : {},
    }),
  )
}

describe('GET /api/warehouse-stock/:drugId/lots', () => {
  test('มีล็อตที่ยังเหลือ → 200 เรียงใกล้หมดอายุก่อน ชนิดบนสายถูกต้อง', async () => {
    const drug = await makeDrug('OK')
    await createWarehouseStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '20', expiresOn: '2027-06-01' },
      SYSTEM_USER_ID,
    )
    await createWarehouseStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '10', expiresOn: '2027-01-01' },
      SYSTEM_USER_ID,
    )

    const res = await get(drug.id)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.data).toHaveLength(2)
    expect(body.data[0].expiresOn).toBe('2027-01-01')
    expect(typeof body.data[0].id).toBe('number')
    expect(body.data[0].remaining).toBe('10')
    expect(body.data[0].quantityReceived).toBe('10')
  })

  test('ยาที่ยังไม่เคยซื้อเข้าเลย → 200 ลิสต์ว่าง', async () => {
    const drug = await makeDrug('EMPTY')

    const res = await get(drug.id)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.data).toEqual([])
  })

  test('ไม่มียาตัวนี้ → 404 NOT_FOUND', async () => {
    const res = await get(999_999_999n)
    const body = await readJson(res)

    expect(res.status).toBe(404)
    expect(body.error?.code).toBe('NOT_FOUND')
  })

  test('ไม่ได้ล็อกอิน → 401', async () => {
    const drug = await makeDrug('NO-LOGIN')

    const res = await get(drug.id, false)

    expect(res.status).toBe(401)
  })
})
