import { db } from '../../src/kit/db.ts'
import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'

/**
 * ข้อมูลหลักขั้นต่ำที่ทุกอย่างต้องมีถึงจะทำงานได้
 *
 * **แยกจาก `src/kit/seed.ts`** — อันนั้นเป็นของที่ระบบขาดไม่ได้เลย (permission ·
 * บัญชี system · admin) และรันตอนบูตทุกครั้ง · ที่นี่คือข้อมูลตัวอย่างที่ทำให้
 * "ลองใช้งานได้จริง" ซึ่งฐาน production ไม่ควรมี
 *
 * **ทุกตัว `upsert` ไม่ใช่ `create`** — รันซ้ำได้ · เทสที่ล้มกลางทางแล้วรันใหม่ไม่ควร
 * ต้องไปล้างฐานเองก่อน
 */

const sys = { createdBy: SYSTEM_USER_ID, updatedBy: SYSTEM_USER_ID }

export type MasterSeed = {
  speciesCatId: bigint
  speciesDogId: bigint
  serviceItemId: bigint
  drugId: bigint
}

export async function seedMaster(): Promise<MasterSeed> {
  // ---- ชนิดสัตว์ ----
  const cat = await upsertSpecies('แมว', 1)
  const dog = await upsertSpecies('สุนัข', 2)

  await upsertBreed('เปอร์เซีย', cat)
  await upsertBreed('ไทยบ้าน', cat)
  await upsertBreed('โกลเด้น รีทรีฟเวอร์', dog)

  // ---- บริการ ----
  const svcCat = await upsertServiceCategory('ตรวจรักษาทั่วไป')
  const svc = await upsertServiceItem('ตรวจร่างกายทั่วไป', '300.00', svcCat)
  await upsertServiceItem('ฉีดวัคซีนรวม', '450.00', svcCat)

  // ---- ยา ----
  const drugCat = await upsertDrugCategory('ยาปฏิชีวนะ')
  const drug = await upsertDrug('Amoxicillin 250', '12.50', 'เม็ด', drugCat)

  return {
    speciesCatId: cat,
    speciesDogId: dog,
    serviceItemId: svc,
    drugId: drug,
  }
}

async function upsertSpecies(name: string, sortOrder: number): Promise<bigint> {
  const found = await db.species.findFirst({ where: { name, deletedAt: null }, select: { id: true } })
  if (found) return found.id

  const row = await db.species.create({ data: { name, sortOrder, ...sys }, select: { id: true } })

  return row.id
}

async function upsertBreed(name: string, speciesId: bigint): Promise<bigint> {
  const found = await db.breed.findFirst({
    where: { name, speciesId, deletedAt: null },
    select: { id: true },
  })
  if (found) return found.id

  const row = await db.breed.create({ data: { name, speciesId, ...sys }, select: { id: true } })

  return row.id
}

async function upsertServiceCategory(name: string): Promise<bigint> {
  const found = await db.serviceCategory.findFirst({
    where: { name, deletedAt: null },
    select: { id: true },
  })
  if (found) return found.id

  const row = await db.serviceCategory.create({ data: { name, ...sys }, select: { id: true } })

  return row.id
}

async function upsertServiceItem(
  name: string,
  price: string,
  categoryId: bigint,
): Promise<bigint> {
  const found = await db.serviceItem.findFirst({
    where: { name, deletedAt: null },
    select: { id: true },
  })
  if (found) return found.id

  const row = await db.serviceItem.create({
    data: { name, price, categoryId, ...sys },
    select: { id: true },
  })

  return row.id
}

async function upsertDrugCategory(name: string): Promise<bigint> {
  const found = await db.drugCategory.findFirst({
    where: { name, deletedAt: null },
    select: { id: true },
  })
  if (found) return found.id

  const row = await db.drugCategory.create({ data: { name, ...sys }, select: { id: true } })

  return row.id
}

async function upsertDrug(
  name: string,
  price: string,
  unit: string,
  categoryId: bigint,
): Promise<bigint> {
  const found = await db.drug.findFirst({ where: { name, deletedAt: null }, select: { id: true } })
  if (found) return found.id

  const row = await db.drug.create({
    data: { name, price, unit, categoryId, ...sys },
    select: { id: true },
  })

  return row.id
}
