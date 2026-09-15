import { afterEach, beforeAll, describe, expect, test } from 'bun:test'

import { app } from '../../src/app.ts'
import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import { createDrugStockMovement } from '../../src/modules/drug-stock/drug-stock.service.ts'
import { readJson } from '../support/api-response.ts'
import { loginAsAdmin } from '../support/login.ts'

/**
 * `GET /api/drug-stock` · ดูยอดคงเหลือสต็อกยา
 *
 * ใช้สิทธิ์ร่วมกับหน้าจัดการยา (`MASTER_PERMISSION`) — ยาเป็นข้อมูลตั้งต้นของคลินิก
 * (ผู้ใช้ตัดสิน 2026-09-08)
 */

const NAME_PREFIX = 'TEST-STOCK-API-LIST-'

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
    await db.drugStockMovement.deleteMany({ where: { drugId: { in: ids } } })
  }
  await db.drug.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
})

function get(query: string, withCookie = true) {
  return app.handle(
    new Request(`http://localhost/api/drug-stock${query}`, {
      headers: withCookie ? { cookie } : {},
    }),
  )
}

describe('GET /api/drug-stock', () => {
  test('มียาพร้อมยอดคงเหลือ → 200 คืนยอดที่ถูกต้อง เป็น string', async () => {
    const drug = await makeDrug('OK')
    await createDrugStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '25' }, SYSTEM_USER_ID)

    const res = await get(`?q=${encodeURIComponent(`${NAME_PREFIX}OK`)}`)
    const body = await readJson(res)
    const row = body.data.find((r: { id: number }) => r.id === Number(drug.id))

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(typeof row.id).toBe('number')
    expect(row.quantity).toBe('25')
    expect(typeof row.quantity).toBe('string')
  })

  test('รับเข้าพร้อมวันหมดอายุ → คืน nearestExpiry เป็นวันที่ในรูป YYYY-MM-DD', async () => {
    const drug = await makeDrug('EXPIRY')
    await createDrugStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '10', expiresOn: '2027-06-30' },
      SYSTEM_USER_ID,
    )

    const res = await get(`?q=${encodeURIComponent(`${NAME_PREFIX}EXPIRY`)}`)
    const body = await readJson(res)
    const row = body.data.find((r: { id: number }) => r.id === Number(drug.id))

    expect(row.nearestExpiry).toBe('2027-06-30')
  })

  test('ไม่เคยระบุวันหมดอายุ → nearestExpiry เป็น null', async () => {
    const drug = await makeDrug('NO-EXPIRY')
    await createDrugStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '10' }, SYSTEM_USER_ID)

    const res = await get(`?q=${encodeURIComponent(`${NAME_PREFIX}NO-EXPIRY`)}`)
    const body = await readJson(res)
    const row = body.data.find((r: { id: number }) => r.id === Number(drug.id))

    expect(row.nearestExpiry).toBeNull()
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
