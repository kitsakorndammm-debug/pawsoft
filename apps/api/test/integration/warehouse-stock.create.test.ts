import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { isAppError } from '../../src/kit/app-error.ts'
import { db } from '../../src/kit/db.ts'
import { createWarehouseStockMovement } from '../../src/modules/warehouse-stock/warehouse-stock.service.ts'

/**
 * คลังยา · บันทึกซื้อเข้า/ปรับยอด
 *
 * **`create` ตัวนี้รับได้แค่ `RECEIVE`/`ADJUST`** — `WITHDRAW` เป็นของที่ระบบสร้างเองตอน
 * เบิกจากคลัง (`withdrawFromWarehouse`) เท่านั้น เหตุผลเดียวกับที่ `DISPENSE` ของ
 * `drug-stock` เปิดให้ตั้งค่าตรงไม่ได้
 */

const NAME_PREFIX = 'TEST-WAREHOUSE-CREATE-'

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
    await db.auditLog.deleteMany({ where: { module: 'warehouse-stock', recordId: { in: ids } } })
  }
  await db.drug.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
})

describe('คลังยา · บันทึกซื้อเข้า/ปรับยอด', () => {
  test('ซื้อเข้าจำนวนบวก → บันทึกได้ ยอดคงเหลือเพิ่มตาม', async () => {
    const drug = await makeDrug('RECEIVE-OK')

    const created = await createWarehouseStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '99' },
      SYSTEM_USER_ID,
    )

    expect(created.type).toBe('RECEIVE')
    expect(created.quantity.toString()).toBe('99')
    expect(created.drugId).toBe(drug.id)
  })

  test('ซื้อเข้าพร้อมวันหมดอายุและวันที่ซื้อเข้า → บันทึกทั้งสองวันไว้ (ล็อตนี้)', async () => {
    const drug = await makeDrug('RECEIVE-LOT-DATES')

    const created = await createWarehouseStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '30', expiresOn: '2027-01-15', receivedOn: '2026-09-20' },
      SYSTEM_USER_ID,
    )

    expect(created.expiresOn?.toISOString().slice(0, 10)).toBe('2027-01-15')
    expect(created.receivedOn?.toISOString().slice(0, 10)).toBe('2026-09-20')
  })

  test('ปรับยอดใส่วันหมดอายุมาด้วย → ปฏิเสธ (มีความหมายเฉพาะตอนซื้อเข้า)', async () => {
    const drug = await makeDrug('ADJUST-EXPIRES-BLOCKED')
    await createWarehouseStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '20' }, SYSTEM_USER_ID)
    expect.assertions(2)

    try {
      await createWarehouseStockMovement(
        { drugId: drug.id, type: 'ADJUST', quantity: '-3', reason: 'ทดสอบ', expiresOn: '2027-01-01' },
        SYSTEM_USER_ID,
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('ปรับยอดพร้อมเหตุผล → บันทึกได้', async () => {
    const drug = await makeDrug('ADJUST-OK')
    await createWarehouseStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '20' }, SYSTEM_USER_ID)

    const created = await createWarehouseStockMovement(
      { drugId: drug.id, type: 'ADJUST', quantity: '-3', reason: 'นับคลังจริงไม่ตรง' },
      SYSTEM_USER_ID,
    )

    expect(created.type).toBe('ADJUST')
    expect(created.quantity.toString()).toBe('-3')
    expect(created.reason).toBe('นับคลังจริงไม่ตรง')
  })

  test('บันทึก audit log ไว้ด้วย', async () => {
    const drug = await makeDrug('AUDIT')

    const created = await createWarehouseStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '10' },
      SYSTEM_USER_ID,
    )

    const log = await db.auditLog.findFirst({
      where: { module: 'warehouse-stock', recordId: created.id },
    })

    expect(log).toBeDefined()
    expect(log?.action).toBe('warehouse-stock.create')
  })

  test('ปรับยอดไม่กรอกเหตุผล → ปฏิเสธ', async () => {
    const drug = await makeDrug('ADJUST-NO-REASON')
    expect.assertions(2)

    try {
      await createWarehouseStockMovement(
        { drugId: drug.id, type: 'ADJUST', quantity: '-1' },
        SYSTEM_USER_ID,
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('ซื้อเข้าด้วยจำนวนติดลบหรือศูนย์ → ปฏิเสธ', async () => {
    const drug = await makeDrug('RECEIVE-NONPOSITIVE')
    expect.assertions(2)

    try {
      await createWarehouseStockMovement(
        { drugId: drug.id, type: 'RECEIVE', quantity: '0' },
        SYSTEM_USER_ID,
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('ปรับยอดจนยอดคงเหลือติดลบ → ปฏิเสธ', async () => {
    const drug = await makeDrug('NEGATIVE-BALANCE')
    await createWarehouseStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '5' }, SYSTEM_USER_ID)
    expect.assertions(2)

    try {
      await createWarehouseStockMovement(
        { drugId: drug.id, type: 'ADJUST', quantity: '-10', reason: 'ของเสีย' },
        SYSTEM_USER_ID,
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('ระบุ type เป็น WITHDRAW ตรงๆ → ปฏิเสธ (สงวนไว้ให้ระบบสร้างเองเท่านั้น)', async () => {
    const drug = await makeDrug('WITHDRAW-BLOCKED')
    expect.assertions(2)

    try {
      await createWarehouseStockMovement(
        // @ts-expect-error ทดสอบว่า runtime กันไว้ด้วย ไม่ใช่แค่ชนิดที่ typecheck กัน
        { drugId: drug.id, type: 'WITHDRAW', quantity: '-1' },
        SYSTEM_USER_ID,
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('ไม่มียาตัวนี้ในระบบ → ปฏิเสธ', async () => {
    expect.assertions(2)

    try {
      await createWarehouseStockMovement(
        { drugId: 999_999_999n, type: 'RECEIVE', quantity: '10' },
        SYSTEM_USER_ID,
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('NOT_FOUND')
    }
  })

  test('ยาถูกลบไปแล้ว → ปฏิเสธเหมือนไม่มีอยู่', async () => {
    const drug = await makeDrug('DELETED-DRUG')
    await db.drug.update({
      where: { id: drug.id },
      data: { deletedAt: new Date(), deletedBy: SYSTEM_USER_ID },
    })
    expect.assertions(2)

    try {
      await createWarehouseStockMovement(
        { drugId: drug.id, type: 'RECEIVE', quantity: '10' },
        SYSTEM_USER_ID,
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('NOT_FOUND')
    }
  })
})
