import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { isAppError } from '../../src/kit/app-error.ts'
import { db } from '../../src/kit/db.ts'
import {
  createDrugStockMovement,
  reverseDrugStockMovement,
} from '../../src/modules/drug-stock/drug-stock.service.ts'

/**
 * สต็อกยา · ย้อนรายการ
 *
 * **สร้างรายการปรับยอดตรงข้ามใหม่ ไม่แก้ของเดิม** (ผู้ใช้ตัดสิน 2026-09-20) — ของเดิม
 * ต้องยังอยู่ครบเสมอ ตรวจสอบย้อนหลังได้
 */

const NAME_PREFIX = 'TEST-STOCK-REVERSE-'

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

describe('สต็อกยา · ย้อนรายการ', () => {
  test('ย้อนรายการรับเข้าที่พิมพ์ผิด → สร้างรายการปรับยอดตรงข้าม ของเดิมยังอยู่', async () => {
    const drug = await makeDrug('RECEIVE-TYPO')
    const original = await createDrugStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '1000' },
      SYSTEM_USER_ID,
    )

    const reversed = await reverseDrugStockMovement(original.id, SYSTEM_USER_ID)

    expect(reversed.type).toBe('ADJUST')
    expect(reversed.quantity.toString()).toBe('-1000')
    expect(reversed.reason).toContain(`#${original.id}`)

    const stillThere = await db.drugStockMovement.findUnique({ where: { id: original.id } })
    expect(stillThere).not.toBeNull()
    expect(stillThere?.quantity.toString()).toBe('1000')

    const balance = await db.drugStockMovement.aggregate({
      where: { drugId: drug.id },
      _sum: { quantity: true },
    })
    expect(balance._sum.quantity?.toString()).toBe('0')
  })

  test('ย้อนรายการปรับยอด → บวกกลับตามจำนวนเดิม', async () => {
    const drug = await makeDrug('ADJUST-TYPO')
    await createDrugStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '50' }, SYSTEM_USER_ID)
    const original = await createDrugStockMovement(
      { drugId: drug.id, type: 'ADJUST', quantity: '-30', reason: 'พิมพ์ผิด' },
      SYSTEM_USER_ID,
    )

    const reversed = await reverseDrugStockMovement(original.id, SYSTEM_USER_ID)

    expect(reversed.quantity.toString()).toBe('30')
  })

  test('ย้อนรายการจ่ายยา (DISPENSE) → ปฏิเสธ ต้องแก้ผ่านหน้าคิวเท่านั้น', async () => {
    const drug = await makeDrug('DISPENSE-BLOCKED')
    await createDrugStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '10' }, SYSTEM_USER_ID)
    const dispense = await db.drugStockMovement.create({
      data: { drugId: drug.id, type: 'DISPENSE', quantity: '-1', createdBy: SYSTEM_USER_ID },
    })
    expect.assertions(2)

    try {
      await reverseDrugStockMovement(dispense.id, SYSTEM_USER_ID)
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('ย้อนแล้วยอดจะติดลบ → ปฏิเสธ', async () => {
    const drug = await makeDrug('WOULD-GO-NEGATIVE')
    const original = await createDrugStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '10' },
      SYSTEM_USER_ID,
    )
    // ใช้สต็อกไปแล้วบางส่วน — ย้อนรายการรับเข้าทั้งก้อนตอนนี้จะติดลบ
    await createDrugStockMovement(
      { drugId: drug.id, type: 'ADJUST', quantity: '-8', reason: 'ใช้ไปแล้ว' },
      SYSTEM_USER_ID,
    )
    expect.assertions(2)

    try {
      await reverseDrugStockMovement(original.id, SYSTEM_USER_ID)
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('ไม่มีรายการนี้ → ปฏิเสธ', async () => {
    expect.assertions(2)

    try {
      await reverseDrugStockMovement(999_999_999n, SYSTEM_USER_ID)
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('NOT_FOUND')
    }
  })

  test('บันทึก audit log ไว้ด้วย', async () => {
    const drug = await makeDrug('AUDIT')
    const original = await createDrugStockMovement(
      { drugId: drug.id, type: 'RECEIVE', quantity: '10' },
      SYSTEM_USER_ID,
    )

    const reversed = await reverseDrugStockMovement(original.id, SYSTEM_USER_ID)

    const log = await db.auditLog.findFirst({
      where: { module: 'drug-stock', recordId: reversed.id },
    })

    expect(log).toBeDefined()
    expect(log?.action).toBe('drug-stock.reverse')
  })
})
