import { afterEach, beforeAll, describe, expect, test } from 'bun:test'

import { app } from '../../src/app.ts'
import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import { createWarehouseStockMovement } from '../../src/modules/warehouse-stock/warehouse-stock.service.ts'
import { readJson } from '../support/api-response.ts'
import { loginAsAdmin } from '../support/login.ts'

/** `GET /api/warehouse-stock/:drugId/movements` · ดูประวัติการเคลื่อนไหวของยาตัวเดียวในคลัง */

const NAME_PREFIX = 'TEST-WAREHOUSE-API-HIST-'

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
    new Request(`http://localhost/api/warehouse-stock/${drugId}/movements`, {
      headers: withCookie ? { cookie } : {},
    }),
  )
}

describe('GET /api/warehouse-stock/:drugId/movements', () => {
  test('ยามีประวัติ → 200 คืนครบทุกแถว ชนิดบนสายถูกต้อง', async () => {
    const drug = await makeDrug('OK')
    await createWarehouseStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '20' },
      SYSTEM_USER_ID,
    )

    const res = await get(drug.id)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(typeof body.data[0].id).toBe('number')
    expect(body.data[0].quantity).toBe('20')
    expect(typeof body.data[0].createdAt).toBe('string')
    expect(typeof body.data[0].createdByName).toBe('string')
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
