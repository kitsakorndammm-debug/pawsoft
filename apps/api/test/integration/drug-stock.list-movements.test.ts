import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { isAppError } from '../../src/kit/app-error.ts'
import { db } from '../../src/kit/db.ts'
import {
  createDrugStockMovement,
  listDrugStockMovements,
} from '../../src/modules/drug-stock/drug-stock.service.ts'

/**
 * สต็อกยา · ดูประวัติการเคลื่อนไหวของยาตัวเดียว
 *
 * ต่างจาก `listDrugStockBalances` (สรุปยอดรวมทุกยา) — อันนี้คือลิสต์ดิบของ
 * `DrugStockMovement` filter ด้วย `drugId` ตัวเดียว ไม่แบ่งหน้า พร้อมชื่อคนบันทึก
 * (ผู้ใช้ตัดสิน 2026-09-08)
 */

const NAME_PREFIX = 'TEST-STOCK-HIST-'

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

describe('สต็อกยา · ดูประวัติการเคลื่อนไหว', () => {
  test('ยามีประวัติหลายรายการ → คืนครบทุกแถว เรียงล่าสุดก่อน', async () => {
    const drug = await makeDrug('MULTI')
    await createDrugStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '50' }, SYSTEM_USER_ID)
    await createDrugStockMovement(
      { drugId: drug.id, type: 'ADJUST', quantity: '-5', reason: 'นับสต็อกจริงไม่ตรง' },
      SYSTEM_USER_ID,
    )

    const rows = await listDrugStockMovements({ drugId: drug.id })

    expect(rows).toHaveLength(2)
    // ล่าสุดก่อน — รายการปรับยอดที่เพิ่งทำต้องอยู่บนสุด
    expect(rows[0]?.type).toBe('ADJUST')
    expect(rows[0]?.quantity.toString()).toBe('-5')
    expect(rows[0]?.reason).toBe('นับสต็อกจริงไม่ตรง')
    expect(rows[1]?.type).toBe('RECEIVE')
  })

  test('โชว์ชื่อคนบันทึกด้วย', async () => {
    const drug = await makeDrug('WHO')
    await createDrugStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '10' }, SYSTEM_USER_ID)

    const rows = await listDrugStockMovements({ drugId: drug.id })

    expect(rows).toHaveLength(1)
    expect(typeof rows[0]?.createdByName).toBe('string')
    expect(rows[0]?.createdByName.length).toBeGreaterThan(0)
  })

  test('ยาที่ยังไม่เคยมีการเคลื่อนไหวเลย → คืนลิสต์ว่าง ไม่ปฏิเสธ', async () => {
    const drug = await makeDrug('EMPTY')

    const rows = await listDrugStockMovements({ drugId: drug.id })

    expect(rows).toEqual([])
  })

  test('ไม่มียาตัวนี้ในระบบ → ปฏิเสธ', async () => {
    expect.assertions(2)

    try {
      await listDrugStockMovements({ drugId: 999_999_999n })
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('NOT_FOUND')
    }
  })
})
