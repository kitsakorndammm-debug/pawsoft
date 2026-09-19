import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import { listDrugHistory } from '../../src/modules/history/history.service.ts'
import { createOwner } from '../../src/modules/owner/owner.service.ts'

/**
 * ประวัติยา (รวมทุกตัว พร้อมผู้ป่วยที่เกี่ยวข้อง) — ผู้ใช้ตัดสิน 2026-09-18
 *
 * ตั้งค่า Drug/Visit/VisitDrug/DrugStockMovement ตรงเข้าฐาน ไม่ผ่าน workflow เต็ม
 * (checkIn → จ่ายยา) เหตุผลเดียวกับ `payment.invoice-visit-summary.test.ts` — ที่นี่
 * พิสูจน์แค่ว่า `listDrugHistory` ต่อข้อมูลถูก ไม่พิสูจน์ซ้ำว่า workflow การจ่ายยาทำงานถูก
 */

const NAME_PREFIX = 'TEST-DRUG-HIST-'

async function makeDrug(suffix: string) {
  return db.drug.create({
    data: {
      name: `${NAME_PREFIX}${suffix}`,
      unit: 'เม็ด',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  })
}

async function makeOwner(suffix: string) {
  return createOwner({ name: `${NAME_PREFIX}${suffix}` }, SYSTEM_USER_ID)
}

async function makeSpecies(suffix: string) {
  return db.species.create({
    data: { name: `${NAME_PREFIX}${suffix}`, createdBy: SYSTEM_USER_ID, updatedBy: SYSTEM_USER_ID },
  })
}

async function makePet(suffix: string, ownerId: bigint) {
  const species = await makeSpecies(suffix)
  return db.pet.create({
    data: {
      code: `TDHP-${suffix}-${Date.now()}`.slice(0, 20),
      ownerId,
      speciesId: species.id,
      name: `${NAME_PREFIX}${suffix}`,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  })
}

let visitSeq = 0

async function makeVisit(input: { ownerId?: bigint | null; petId?: bigint | null }) {
  visitSeq += 1
  return db.visit.create({
    data: {
      queueNumber: 8_000 + visitSeq,
      queueDate: new Date('2026-09-18T00:00:00Z'),
      status: 'WAITING',
      ownerId: input.ownerId ?? null,
      petId: input.petId ?? null,
      arrivedAt: new Date(),
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  })
}

async function makeVisitDrug(visitId: bigint, drugId: bigint) {
  return db.visitDrug.create({
    data: {
      visitId,
      drugId,
      nameSnapshot: 'snapshot',
      quantity: '2',
      unitPrice: '10.00',
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
  const drugIds = drugs.map((d) => d.id)
  if (drugIds.length > 0) {
    await db.drugStockMovement.deleteMany({ where: { drugId: { in: drugIds } } })
    await db.visitDrug.deleteMany({ where: { drugId: { in: drugIds } } })
  }

  const owners = await db.owner.findMany({
    where: { name: { startsWith: NAME_PREFIX } },
    select: { id: true },
  })
  const ownerIds = owners.map((o) => o.id)
  const visits = await db.visit.findMany({
    where: { ownerId: { in: ownerIds } },
    select: { id: true },
  })
  const visitIds = visits.map((v) => v.id)
  if (visitIds.length > 0) await db.visit.deleteMany({ where: { id: { in: visitIds } } })
  if (ownerIds.length > 0) await db.pet.deleteMany({ where: { ownerId: { in: ownerIds } } })
  await db.owner.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
  await db.species.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
  await db.drug.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
})

describe('ประวัติยา · listDrugHistory', () => {
  test('RECEIVE ที่ไม่ผูกคิว → patient เป็น null', async () => {
    const drug = await makeDrug('RECEIVE')
    await db.drugStockMovement.create({
      data: { drugId: drug.id, type: 'RECEIVE', quantity: '50', createdBy: SYSTEM_USER_ID },
    })

    const result = await listDrugHistory({ pageSize: 200 })
    const row = result.rows.find((r) => r.drugName === drug.name)

    expect(row?.type).toBe('RECEIVE')
    expect(row?.patient).toBeNull()
  })

  test('DISPENSE ที่ผูกกับคิวจริง → พ่วงชื่อสัตว์/เจ้าของมาด้วย', async () => {
    const drug = await makeDrug('DISPENSE')
    const owner = await makeOwner('DISPENSE')
    const pet = await makePet('DISPENSE', owner.id)
    const visit = await makeVisit({ ownerId: owner.id, petId: pet.id })
    const visitDrug = await makeVisitDrug(visit.id, drug.id)

    await db.drugStockMovement.create({
      data: {
        drugId: drug.id,
        type: 'DISPENSE',
        quantity: '-2',
        visitDrugId: visitDrug.id,
        createdBy: SYSTEM_USER_ID,
      },
    })

    const result = await listDrugHistory({ pageSize: 200 })
    const row = result.rows.find((r) => r.drugName === drug.name)

    expect(row?.type).toBe('DISPENSE')
    expect(row?.patient?.petName).toBe(pet.name)
    expect(row?.patient?.ownerName).toBe(owner.name)
    expect(row?.patient?.queueNumber).toBe(visit.queueNumber)
  })

  test('เรียงล่าสุดก่อน และแบ่งหน้าได้', async () => {
    const drug = await makeDrug('PAGE')
    for (let i = 0; i < 3; i++) {
      await db.drugStockMovement.create({
        data: { drugId: drug.id, type: 'ADJUST', quantity: '1', reason: 'นับใหม่', createdBy: SYSTEM_USER_ID },
      })
    }

    const result = await listDrugHistory({ page: 1, pageSize: 2 })

    expect(result.rows.length).toBe(2)
    expect(result.total).toBeGreaterThanOrEqual(3)
  })
})
