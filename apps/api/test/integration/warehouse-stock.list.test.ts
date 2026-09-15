import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import { listWarehouseStockBalances } from '../../src/modules/warehouse-stock/warehouse-stock.service.ts'

/**
 * คลังยา · ดูยอดคงเหลือ
 *
 * ยอดคงเหลือคือผลรวม `quantity` ของ `WarehouseStockMovement` ต่อยาแต่ละตัว — คนละยอด
 * กับ `DrugStockMovement` (สต็อกที่หมอใช้จ่ายคนไข้) โดยตั้งใจ
 */

const NAME_PREFIX = 'TEST-WAREHOUSE-LIST-'

async function makeDrug(suffix: string, opts: { isActive?: boolean; deleted?: boolean } = {}) {
  return db.drug.create({
    data: {
      name: `${NAME_PREFIX}${suffix}`,
      isActive: opts.isActive ?? true,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
      ...(opts.deleted ? { deletedAt: new Date(), deletedBy: SYSTEM_USER_ID } : {}),
    },
  })
}

async function move(drugId: bigint, type: 'RECEIVE' | 'WITHDRAW' | 'ADJUST', quantity: string) {
  return db.warehouseStockMovement.create({
    data: {
      drugId,
      type,
      quantity,
      reason: type === 'ADJUST' ? 'ทดสอบปรับยอด' : null,
      createdBy: SYSTEM_USER_ID,
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

describe('คลังยา · ดูยอดคงเหลือ', () => {
  test('มีประวัติซื้อเข้า เบิกออก ปรับยอด → ยอดคงเหลือเป็นผลรวมที่ถูกต้อง', async () => {
    const drug = await makeDrug('SUM')
    await move(drug.id, 'RECEIVE', '99')
    await move(drug.id, 'WITHDRAW', '-10')
    await move(drug.id, 'ADJUST', '-5')

    const rows = await listWarehouseStockBalances({ q: 'SUM' })
    const row = rows.find((r) => r.drugId === drug.id)

    expect(row).toBeDefined()
    expect(row?.quantity.toString()).toBe('84')
  })

  test('ยาที่ยังไม่เคยมีการเคลื่อนไหวเลย → ยอดคงเหลือเป็น 0', async () => {
    const drug = await makeDrug('ZERO-ACTIVE')

    const rows = await listWarehouseStockBalances({ q: 'ZERO-ACTIVE' })
    const row = rows.find((r) => r.drugId === drug.id)

    expect(row).toBeDefined()
    expect(row?.quantity.toString()).toBe('0')
  })

  test('ยาที่เลิกใช้แล้วและคลังเป็น 0 → ไม่ปรากฏในลิสต์', async () => {
    const drug = await makeDrug('INACTIVE-ZERO', { isActive: false })

    const rows = await listWarehouseStockBalances({ q: 'INACTIVE-ZERO' })

    expect(rows.find((r) => r.drugId === drug.id)).toBeUndefined()
  })

  test('ยาที่เลิกใช้แล้วแต่ยังมีของค้างในคลัง → ปรากฏในลิสต์', async () => {
    const drug = await makeDrug('INACTIVE-STOCK', { isActive: false })
    await move(drug.id, 'RECEIVE', '20')

    const rows = await listWarehouseStockBalances({ q: 'INACTIVE-STOCK' })
    const row = rows.find((r) => r.drugId === drug.id)

    expect(row).toBeDefined()
    expect(row?.quantity.toString()).toBe('20')
  })

  test('ยาที่ถูกลบแล้ว → ไม่ปรากฏในลิสต์แม้จะมีของค้างในคลัง', async () => {
    const drug = await makeDrug('DELETED', { deleted: true })
    await move(drug.id, 'RECEIVE', '20')

    const rows = await listWarehouseStockBalances({ q: 'DELETED' })

    expect(rows.find((r) => r.drugId === drug.id)).toBeUndefined()
  })

  test('ค้นด้วยชื่อ → กรองเฉพาะยาที่ชื่อตรง', async () => {
    const a = await makeDrug('SEARCH-A')
    const b = await makeDrug('SEARCH-B')

    const rows = await listWarehouseStockBalances({ q: `${NAME_PREFIX}SEARCH-A` })

    expect(rows.find((r) => r.drugId === a.id)).toBeDefined()
    expect(rows.find((r) => r.drugId === b.id)).toBeUndefined()
  })
})
