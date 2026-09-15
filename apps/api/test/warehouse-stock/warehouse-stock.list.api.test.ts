import { afterEach, beforeAll, describe, expect, test } from 'bun:test'

import { app } from '../../src/app.ts'
import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import { createWarehouseStockMovement } from '../../src/modules/warehouse-stock/warehouse-stock.service.ts'
import { readJson } from '../support/api-response.ts'
import { loginAsAdmin } from '../support/login.ts'

/** `GET /api/warehouse-stock` · ดูยอดคงเหลือคลังยา */

const NAME_PREFIX = 'TEST-WAREHOUSE-API-LIST-'

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

function get(query: string, withCookie = true) {
  return app.handle(
    new Request(`http://localhost/api/warehouse-stock${query}`, {
      headers: withCookie ? { cookie } : {},
    }),
  )
}

describe('GET /api/warehouse-stock', () => {
  test('มียาพร้อมยอดคงเหลือ → 200 คืนยอดที่ถูกต้อง เป็น string', async () => {
    const drug = await makeDrug('OK')
    await createWarehouseStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '99' },
      SYSTEM_USER_ID,
    )

    const res = await get(`?q=${encodeURIComponent(`${NAME_PREFIX}OK`)}`)
    const body = await readJson(res)
    const row = body.data.find((r: { id: number }) => r.id === Number(drug.id))

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(typeof row.id).toBe('number')
    expect(row.quantity).toBe('99')
    expect(typeof row.quantity).toBe('string')
  })

  test('ค้นด้วยชื่อ → กรองเฉพาะยาที่ตรง', async () => {
    await makeDrug('SEARCH-X')
    await makeDrug('SEARCH-Y')

    const res = await get(`?q=${encodeURIComponent(`${NAME_PREFIX}SEARCH-X`)}`)
    const body = await readJson(res)
    const names = body.data.map((r: { name: string }) => r.name)

    expect(names).toContain(`${NAME_PREFIX}SEARCH-X`)
    expect(names).not.toContain(`${NAME_PREFIX}SEARCH-Y`)
  })

  test('ส่งพารามิเตอร์ที่ไม่รู้จัก → 400', async () => {
    const res = await get('?sort=name')

    expect(res.status).toBe(400)
  })

  test('ไม่ได้ล็อกอิน → 401', async () => {
    const res = await get('', false)

    expect(res.status).toBe(401)
  })
})
