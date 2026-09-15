import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import { listDrugStockBalances } from '../../src/modules/drug-stock/drug-stock.service.ts'

/**
 * สต็อกยา · ดูยอดคงเหลือ
 *
 * ยอดคงเหลือคือผลรวม `quantity` ของ `DrugStockMovement` ต่อยาแต่ละตัว — ไม่ได้เก็บ
 * เป็นตัวเลขแยกไว้ที่ `Drug` (ดู `///` บนหัวโมเดล)
 */

const NAME_PREFIX = 'TEST-STOCK-LIST-'

async function makeDrug(suffix: string, opts: { isActive?: boolean; deleted?: boolean } = {}) {
  const drug = await db.drug.create({
    data: {
      name: `${NAME_PREFIX}${suffix}`,
      isActive: opts.isActive ?? true,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
      ...(opts.deleted
        ? { deletedAt: new Date(), deletedBy: SYSTEM_USER_ID }
        : {}),
    },
  })
  return drug
}

async function move(
  drugId: bigint,
  type: 'RECEIVE' | 'DISPENSE' | 'ADJUST',
  quantity: string,
  expiresOn?: string,
) {
  return db.drugStockMovement.create({
    data: {
      drugId,
      type,
      quantity,
      reason: type === 'ADJUST' ? 'ทดสอบปรับยอด' : null,
      expiresOn: expiresOn ? new Date(`${expiresOn}T00:00:00Z`) : null,
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
    await db.drugStockMovement.deleteMany({ where: { drugId: { in: ids } } })
  }
  await db.drug.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
})

describe('สต็อกยา · ดูยอดคงเหลือ', () => {
  test('มีประวัติรับเข้า จ่ายออก ปรับยอด → ยอดคงเหลือเป็นผลรวมที่ถูกต้อง', async () => {
    const drug = await makeDrug('SUM')
    await move(drug.id, 'RECEIVE', '50')
    await move(drug.id, 'DISPENSE', '-10')
    await move(drug.id, 'ADJUST', '-5')

    const rows = await listDrugStockBalances({ q: 'SUM' })
    const row = rows.find((r) => r.drugId === drug.id)

    expect(row).toBeDefined()
    expect(row?.quantity.toString()).toBe('35')
  })

  test('ยาที่ยังไม่เคยมีการเคลื่อนไหวเลย → ยอดคงเหลือเป็น 0', async () => {
    const drug = await makeDrug('ZERO-ACTIVE')

    const rows = await listDrugStockBalances({ q: 'ZERO-ACTIVE' })
    const row = rows.find((r) => r.drugId === drug.id)

    expect(row).toBeDefined()
    expect(row?.quantity.toString()).toBe('0')
  })

  test('ยาที่เลิกใช้แล้วและสต็อกเป็น 0 → ไม่ปรากฏในลิสต์', async () => {
    const drug = await makeDrug('INACTIVE-ZERO', { isActive: false })

    const rows = await listDrugStockBalances({ q: 'INACTIVE-ZERO' })

    expect(rows.find((r) => r.drugId === drug.id)).toBeUndefined()
  })

  test('ยาที่เลิกใช้แล้วแต่ยังมีสต็อกค้าง → ปรากฏในลิสต์', async () => {
    const drug = await makeDrug('INACTIVE-STOCK', { isActive: false })
    await move(drug.id, 'RECEIVE', '20')

    const rows = await listDrugStockBalances({ q: 'INACTIVE-STOCK' })
    const row = rows.find((r) => r.drugId === drug.id)

    expect(row).toBeDefined()
    expect(row?.quantity.toString()).toBe('20')
  })

  test('ยาที่ถูกลบแล้ว → ไม่ปรากฏในลิสต์แม้จะมีสต็อกค้าง', async () => {
    const drug = await makeDrug('DELETED', { deleted: true })
    await move(drug.id, 'RECEIVE', '20')

    const rows = await listDrugStockBalances({ q: 'DELETED' })

    expect(rows.find((r) => r.drugId === drug.id)).toBeUndefined()
  })

  test('รับเข้าหลายล็อตวันหมดอายุต่างกัน → คืนวันที่ใกล้หมดอายุที่สุด', async () => {
    const drug = await makeDrug('EXPIRY-NEAREST')
    await move(drug.id, 'RECEIVE', '10', '2027-12-31')
    await move(drug.id, 'RECEIVE', '10', '2027-03-15')
    await move(drug.id, 'RECEIVE', '10', '2027-08-01')

    const rows = await listDrugStockBalances({ q: 'EXPIRY-NEAREST' })
    const row = rows.find((r) => r.drugId === drug.id)

    expect(row?.nearestExpiry?.toISOString().slice(0, 10)).toBe('2027-03-15')
  })

  test('ไม่เคยระบุวันหมดอายุเลย → nearestExpiry เป็น null', async () => {
    const drug = await makeDrug('EXPIRY-NONE')
    await move(drug.id, 'RECEIVE', '10')

    const rows = await listDrugStockBalances({ q: 'EXPIRY-NONE' })
    const row = rows.find((r) => r.drugId === drug.id)

    expect(row?.nearestExpiry).toBeNull()
  })

  test('ค้นด้วยชื่อ → กรองเฉพาะยาที่ชื่อตรง', async () => {
    const a = await makeDrug('SEARCH-A')
    const b = await makeDrug('SEARCH-B')

    const rows = await listDrugStockBalances({ q: `${NAME_PREFIX}SEARCH-A` })

    expect(rows.find((r) => r.drugId === a.id)).toBeDefined()
    expect(rows.find((r) => r.drugId === b.id)).toBeUndefined()
  })
})
