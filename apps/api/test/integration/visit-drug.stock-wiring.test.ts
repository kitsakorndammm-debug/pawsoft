import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import { createDrugStockMovement, listDrugStockBalances } from '../../src/modules/drug-stock/drug-stock.service.ts'
import { addVisitDrug, removeVisitDrug } from '../../src/modules/visit/visit-item.service.ts'

/**
 * รายการยาในคิว · ผูกกับสต็อกยา
 *
 * `addVisitDrug`/`removeVisitDrug` ยืม `recordDispenseStockMovement` จาก
 * `drug-stock.service.ts` มาใช้ — เทสนี้พิสูจน์ว่าสต็อกเปลี่ยนจริง ไม่ใช่แค่ว่า
 * `VisitDrug` ถูกสร้าง/ลบถูกต้อง (ดู `///` บน `service` skill: "ยืมแล้วต้องมีเทส")
 */

const NAME_PREFIX = 'TEST-STOCK-WIRING-'

async function makeDrug(suffix: string) {
  return db.drug.create({
    data: {
      name: `${NAME_PREFIX}${suffix}`,
      unit: 'เม็ด',
      price: '5.00',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  })
}

async function makeOpenVisit() {
  const queueNumber = Number(Date.now() % 1_000_000)
  return db.visit.create({
    data: {
      queueNumber,
      queueDate: new Date(),
      walkInPetName: `${NAME_PREFIX}pet`,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  })
}

async function balanceOf(drugId: bigint): Promise<string> {
  const rows = await listDrugStockBalances({})
  return rows.find((r) => r.drugId === drugId)?.quantity.toString() ?? '0'
}

afterEach(async () => {
  const drugs = await db.drug.findMany({
    where: { name: { startsWith: NAME_PREFIX } },
    select: { id: true },
  })
  const ids = drugs.map((d) => d.id)
  if (ids.length > 0) {
    await db.visitDrug.deleteMany({ where: { drugId: { in: ids } } })
    await db.drugStockMovement.deleteMany({ where: { drugId: { in: ids } } })
  }
  await db.drug.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
  await db.visit.deleteMany({ where: { walkInPetName: `${NAME_PREFIX}pet` } })
})

describe('รายการยาในคิว · ผูกกับสต็อกยา', () => {
  test('จ่ายยาในคิว → สต็อกถูกตัดอัตโนมัติ', async () => {
    const drug = await makeDrug('DISPENSE')
    await createDrugStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '50' }, SYSTEM_USER_ID)
    const visit = await makeOpenVisit()

    await addVisitDrug({ visitId: visit.id, drugId: drug.id, quantity: '4' }, SYSTEM_USER_ID)

    expect(await balanceOf(drug.id)).toBe('46')
  })

  test('ลบรายการยาที่จ่ายผิดออกจากคิว → สต็อกถูกคืนอัตโนมัติ', async () => {
    const drug = await makeDrug('REVERSE')
    await createDrugStockMovement({ drugId: drug.id, type: 'RECEIVE', quantity: '50' }, SYSTEM_USER_ID)
    const visit = await makeOpenVisit()

    const created = await addVisitDrug({ visitId: visit.id, drugId: drug.id, quantity: '4' }, SYSTEM_USER_ID)
    expect(await balanceOf(drug.id)).toBe('46')

    await removeVisitDrug(created.id, SYSTEM_USER_ID)

    expect(await balanceOf(drug.id)).toBe('50')
  })

  test('จ่ายยาที่สต็อกไม่พอ → ยังจ่ายได้เสมอ ยอดคงเหลือติดลบ', async () => {
    const drug = await makeDrug('INSUFFICIENT')
    const visit = await makeOpenVisit()

    await addVisitDrug({ visitId: visit.id, drugId: drug.id, quantity: '3' }, SYSTEM_USER_ID)

    expect(await balanceOf(drug.id)).toBe('-3')
  })

  test('ลบรายการยาแล้ว แถวสต็อกยังอยู่ครบ แค่ visitDrugId หลุดเป็น null', async () => {
    const drug = await makeDrug('ORPHAN')
    const visit = await makeOpenVisit()
    const created = await addVisitDrug({ visitId: visit.id, drugId: drug.id, quantity: '2' }, SYSTEM_USER_ID)

    await removeVisitDrug(created.id, SYSTEM_USER_ID)

    const movements = await db.drugStockMovement.findMany({
      where: { drugId: drug.id },
      orderBy: { id: 'asc' },
    })

    expect(movements).toHaveLength(2)
    expect(movements[0]?.type).toBe('DISPENSE')
    expect(movements[0]?.visitDrugId).toBeNull()
    expect(movements[1]?.type).toBe('DISPENSE_REVERSED')
    expect(movements[1]?.visitDrugId).toBeNull()
  })
})
