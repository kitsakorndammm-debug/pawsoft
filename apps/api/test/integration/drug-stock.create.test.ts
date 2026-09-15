import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { isAppError } from '../../src/kit/app-error.ts'
import { db } from '../../src/kit/db.ts'
import { createDrugStockMovement } from '../../src/modules/drug-stock/drug-stock.service.ts'

/**
 * สต็อกยา · บันทึกรับเข้า/ปรับยอด
 *
 * **`create` ตัวนี้รับได้แค่ `RECEIVE`/`ADJUST`** — `DISPENSE`/`DISPENSE_REVERSED` เป็นของ
 * ที่ระบบสร้างเองตอนจ่าย/ลบรายการจ่ายยาเท่านั้น (ผู้ใช้ตัดสิน 2026-09-08) ·
 * **ห้ามทำให้ยอดคงเหลือติดลบ** (ผู้ใช้ตัดสิน 2026-09-08)
 */

const NAME_PREFIX = 'TEST-STOCK-CREATE-'

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
    await db.auditLog.deleteMany({ where: { module: 'drug-stock', recordId: { in: ids } } })
  }
  await db.drug.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
})

describe('สต็อกยา · บันทึกรับเข้า/ปรับยอด', () => {
  test('รับเข้าจำนวนบวก → บันทึกได้ ยอดคงเหลือเพิ่มตาม', async () => {
    const drug = await makeDrug('RECEIVE-OK')

    const created = await createDrugStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '30' },
      SYSTEM_USER_ID,
    )

    expect(created.type).toBe('RECEIVE')
    expect(created.quantity.toString()).toBe('30')
    expect(created.drugId).toBe(drug.id)
  })

  test('ปรับยอดพร้อมเหตุผล → บันทึกได้', async () => {
    const drug = await makeDrug('ADJUST-OK')
    await createDrugStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '20' }, SYSTEM_USER_ID)

    const created = await createDrugStockMovement(
      { drugId: drug.id, type: 'ADJUST', quantity: '-3', reason: 'นับสต็อกจริงไม่ตรง' },
      SYSTEM_USER_ID,
    )

    expect(created.type).toBe('ADJUST')
    expect(created.quantity.toString()).toBe('-3')
    expect(created.reason).toBe('นับสต็อกจริงไม่ตรง')
  })

  test('บันทึก audit log ไว้ด้วย', async () => {
    const drug = await makeDrug('AUDIT')

    const created = await createDrugStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '10' },
      SYSTEM_USER_ID,
    )

    const log = await db.auditLog.findFirst({
      where: { module: 'drug-stock', recordId: created.id },
    })

    expect(log).toBeDefined()
    expect(log?.action).toBe('drug-stock.create')
  })

  test('ปรับยอดไม่กรอกเหตุผล → ปฏิเสธ', async () => {
    const drug = await makeDrug('ADJUST-NO-REASON')
    expect.assertions(2)

    try {
      await createDrugStockMovement({ drugId: drug.id, type: 'ADJUST', quantity: '-1' }, SYSTEM_USER_ID)
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('รับเข้าด้วยจำนวนติดลบหรือศูนย์ → ปฏิเสธ', async () => {
    const drug = await makeDrug('RECEIVE-NONPOSITIVE')
    expect.assertions(2)

    try {
      await createDrugStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '0' }, SYSTEM_USER_ID)
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('ปรับยอดจนยอดคงเหลือติดลบ → ปฏิเสธ', async () => {
    const drug = await makeDrug('NEGATIVE-BALANCE')
    await createDrugStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '5' }, SYSTEM_USER_ID)
    expect.assertions(2)

    try {
      await createDrugStockMovement(
        { drugId: drug.id, type: 'ADJUST', quantity: '-10', reason: 'ของเสีย' },
        SYSTEM_USER_ID,
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('ระบุ type เป็น DISPENSE ตรงๆ → ปฏิเสธ (สงวนไว้ให้ระบบสร้างเองเท่านั้น)', async () => {
    const drug = await makeDrug('DISPENSE-BLOCKED')
    expect.assertions(2)

    try {
      await createDrugStockMovement(
        // @ts-expect-error ทดสอบว่า runtime กันไว้ด้วย ไม่ใช่แค่ชนิดที่ typecheck กัน
        { drugId: drug.id, type: 'DISPENSE', quantity: '-1' },
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
      await createDrugStockMovement(
        { drugId: 999_999_999n, type: 'RECEIVE', quantity: '10' },
        SYSTEM_USER_ID,
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('NOT_FOUND')
    }
  })

  test('รับเข้าพร้อมวันหมดอายุ → บันทึกได้ เก็บวันหมดอายุไว้', async () => {
    const drug = await makeDrug('RECEIVE-EXPIRES')

    const created = await createDrugStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '10', expiresOn: '2027-06-30' },
      SYSTEM_USER_ID,
    )

    expect(created.expiresOn?.toISOString().slice(0, 10)).toBe('2027-06-30')
  })

  test('ปรับยอดพร้อมวันหมดอายุ → ปฏิเสธ (ใส่ได้เฉพาะตอนรับเข้า)', async () => {
    const drug = await makeDrug('ADJUST-EXPIRES-BLOCKED')
    await createDrugStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '10' }, SYSTEM_USER_ID)
    expect.assertions(2)

    try {
      await createDrugStockMovement(
        { drugId: drug.id, type: 'ADJUST', quantity: '-1', reason: 'ทดสอบ', expiresOn: '2027-06-30' },
        SYSTEM_USER_ID,
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('รับเข้าด้วยวันหมดอายุรูปแบบผิด → ปฏิเสธ', async () => {
    const drug = await makeDrug('RECEIVE-EXPIRES-BAD-FORMAT')
    expect.assertions(2)

    try {
      await createDrugStockMovement(
        { drugId: drug.id, type: 'RECEIVE', quantity: '10', expiresOn: '30/06/2027' },
        SYSTEM_USER_ID,
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
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
      await createDrugStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '10' }, SYSTEM_USER_ID)
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('NOT_FOUND')
    }
  })
})
