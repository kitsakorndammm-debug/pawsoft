import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { isAppError } from '../../src/kit/app-error.ts'
import { db } from '../../src/kit/db.ts'
import {
  createWarehouseStockMovement,
  listWarehouseStockLots,
  withdrawFromWarehouse,
} from '../../src/modules/warehouse-stock/warehouse-stock.service.ts'

/**
 * คลังยา · ดูล็อตที่ยังเหลือของยาตัวเดียว
 *
 * **หนึ่งแถว `RECEIVE` = หนึ่งล็อต** ใช้เลือกตอน "เบิกจากคลัง" (FEFO — ใกล้หมดอายุก่อน
 * ไปก่อน) ผู้ใช้ตัดสิน 2026-09-23
 */

const NAME_PREFIX = 'TEST-WAREHOUSE-LOTS-'

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

describe('คลังยา · ดูล็อตที่ยังเหลือ', () => {
  test('หลายล็อต → เรียงใกล้หมดอายุก่อน', async () => {
    const drug = await makeDrug('SORT')
    await createWarehouseStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '10', expiresOn: '2027-06-01' },
      SYSTEM_USER_ID,
    )
    await createWarehouseStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '10', expiresOn: '2027-01-01' },
      SYSTEM_USER_ID,
    )

    const lots = await listWarehouseStockLots(drug.id)

    expect(lots).toHaveLength(2)
    expect(lots[0]?.expiresOn?.toISOString().slice(0, 10)).toBe('2027-01-01')
    expect(lots[1]?.expiresOn?.toISOString().slice(0, 10)).toBe('2027-06-01')
  })

  test('ล็อตที่ไม่รู้วันหมดอายุ → ไปท้ายสุดเสมอ', async () => {
    const drug = await makeDrug('NO-EXPIRY-LAST')
    await createWarehouseStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '10' }, SYSTEM_USER_ID)
    await createWarehouseStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '10', expiresOn: '2027-01-01' },
      SYSTEM_USER_ID,
    )

    const lots = await listWarehouseStockLots(drug.id)

    expect(lots).toHaveLength(2)
    expect(lots[0]?.expiresOn?.toISOString().slice(0, 10)).toBe('2027-01-01')
    expect(lots[1]?.expiresOn).toBeNull()
  })

  test('เบิกจนล็อตหมด → ไม่โผล่ในลิสต์อีก', async () => {
    const drug = await makeDrug('DEPLETED')
    const lot = await createWarehouseStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '10' },
      SYSTEM_USER_ID,
    )
    await withdrawFromWarehouse({ drugId: drug.id, quantity: '10', lotId: lot.id }, SYSTEM_USER_ID)

    const lots = await listWarehouseStockLots(drug.id)

    expect(lots).toEqual([])
  })

  test('เบิกไปบางส่วน → ยอดคงเหลือของล็อตลดตาม', async () => {
    const drug = await makeDrug('PARTIAL')
    const lot = await createWarehouseStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '10' },
      SYSTEM_USER_ID,
    )
    await withdrawFromWarehouse({ drugId: drug.id, quantity: '4', lotId: lot.id }, SYSTEM_USER_ID)

    const lots = await listWarehouseStockLots(drug.id)

    expect(lots).toHaveLength(1)
    expect(lots[0]?.remaining.toString()).toBe('6')
    expect(lots[0]?.quantityReceived.toString()).toBe('10')
  })

  test('ปรับยอดคลังไม่ใช่ล็อต → ไม่โผล่ในลิสต์ล็อต', async () => {
    const drug = await makeDrug('ADJUST-NOT-LOT')
    await createWarehouseStockMovement(
      { drugId: drug.id, type: 'ADJUST', quantity: '20', reason: 'นับยอดตั้งต้น' },
      SYSTEM_USER_ID,
    )

    const lots = await listWarehouseStockLots(drug.id)

    expect(lots).toEqual([])
  })

  test('ยาที่ยังไม่เคยซื้อเข้าเลย → คืนลิสต์ว่าง ไม่ปฏิเสธ', async () => {
    const drug = await makeDrug('EMPTY')

    const lots = await listWarehouseStockLots(drug.id)

    expect(lots).toEqual([])
  })

  test('ไม่มียาตัวนี้ในระบบ → ปฏิเสธ', async () => {
    expect.assertions(2)

    try {
      await listWarehouseStockLots(999_999_999n)
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('NOT_FOUND')
    }
  })
})
