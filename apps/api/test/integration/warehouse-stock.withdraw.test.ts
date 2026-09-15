import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { isAppError } from '../../src/kit/app-error.ts'
import { db } from '../../src/kit/db.ts'
import { listDrugStockBalances } from '../../src/modules/drug-stock/drug-stock.service.ts'
import {
  createWarehouseStockMovement,
  listWarehouseStockBalances,
  withdrawFromWarehouse,
} from '../../src/modules/warehouse-stock/warehouse-stock.service.ts'

/**
 * คลังยา · เบิกไปเป็นสต็อกที่หมอใช้
 *
 * **สร้างสองแถวพร้อมกันเสมอ** — `WITHDRAW` ฝั่งคลัง (ลบ) กับ `RECEIVE` ฝั่ง `drug-stock`
 * (บวก) อยู่ทรานแซกชันเดียวกัน (ผู้ใช้ตัดสิน 2026-09-15)
 */

const NAME_PREFIX = 'TEST-WAREHOUSE-WITHDRAW-'

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
    await db.auditLog.deleteMany({ where: { module: 'warehouse-stock', recordId: { in: ids } } })
  }
  await db.drug.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
})

describe('คลังยา · เบิกไปเป็นสต็อกที่หมอใช้', () => {
  test('เบิกสำเร็จ → คลังลด สต็อกที่หมอใช้เพิ่มเท่ากัน', async () => {
    const drug = await makeDrug('OK')
    await createWarehouseStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '99' }, SYSTEM_USER_ID)

    await withdrawFromWarehouse({ drugId: drug.id, quantity: '20' }, SYSTEM_USER_ID)

    const warehouseRows = await listWarehouseStockBalances({ q: 'OK' })
    const drugStockRows = await listDrugStockBalances({ q: 'OK' })

    expect(warehouseRows.find((r) => r.drugId === drug.id)?.quantity.toString()).toBe('79')
    expect(drugStockRows.find((r) => r.drugId === drug.id)?.quantity.toString()).toBe('20')
  })

  test('เบิกพร้อมวันหมดอายุ → ส่งต่อไปเป็นวันหมดอายุของแถวที่หมอใช้', async () => {
    const drug = await makeDrug('EXPIRES')
    await createWarehouseStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '30' }, SYSTEM_USER_ID)

    await withdrawFromWarehouse(
      { drugId: drug.id, quantity: '10', expiresOn: '2027-06-30' },
      SYSTEM_USER_ID,
    )

    const drugStockRows = await listDrugStockBalances({ q: 'EXPIRES' })
    const row = drugStockRows.find((r) => r.drugId === drug.id)

    expect(row?.nearestExpiry?.toISOString().slice(0, 10)).toBe('2027-06-30')
  })

  test('เบิกเกินยอดคงเหลือในคลัง → ปฏิเสธ ไม่มีอะไรถูกสร้างเลยทั้งสองฝั่ง', async () => {
    const drug = await makeDrug('OVER')
    await createWarehouseStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '5' }, SYSTEM_USER_ID)
    expect.assertions(4)

    try {
      await withdrawFromWarehouse({ drugId: drug.id, quantity: '10' }, SYSTEM_USER_ID)
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }

    const warehouseRows = await listWarehouseStockBalances({ q: 'OVER' })
    const drugStockRows = await listDrugStockBalances({ q: 'OVER' })

    expect(warehouseRows.find((r) => r.drugId === drug.id)?.quantity.toString()).toBe('5')
    // ยาที่ `isActive` เป็นจริงโผล่ในลิสต์เสมอแม้ยอดเป็น 0 — เช็คที่ยอด ไม่ใช่ว่าแถวหายไป
    expect(drugStockRows.find((r) => r.drugId === drug.id)?.quantity.toString()).toBe('0')
  })

  test('เบิกด้วยจำนวนศูนย์ → ปฏิเสธ', async () => {
    const drug = await makeDrug('ZERO')
    await createWarehouseStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '5' }, SYSTEM_USER_ID)
    expect.assertions(2)

    try {
      await withdrawFromWarehouse({ drugId: drug.id, quantity: '0' }, SYSTEM_USER_ID)
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('ไม่มียาตัวนี้ในระบบ → ปฏิเสธ', async () => {
    expect.assertions(2)

    try {
      await withdrawFromWarehouse({ drugId: 999_999_999n, quantity: '10' }, SYSTEM_USER_ID)
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('NOT_FOUND')
    }
  })

  test('บันทึก audit log ของฝั่งคลังไว้ด้วย', async () => {
    const drug = await makeDrug('AUDIT')
    await createWarehouseStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '20' }, SYSTEM_USER_ID)

    const created = await withdrawFromWarehouse({ drugId: drug.id, quantity: '5' }, SYSTEM_USER_ID)

    const log = await db.auditLog.findFirst({
      where: { module: 'warehouse-stock', recordId: created.id },
    })

    expect(log).toBeDefined()
    expect(log?.action).toBe('warehouse-stock.withdraw')
  })
})
