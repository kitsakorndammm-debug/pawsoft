import { db } from '../../src/kit/db.ts'
import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import {
  BILLING_PERMISSION,
  MASTER_PERMISSION,
  MEDICAL_PERMISSION,
  RECEPTION_PERMISSION,
} from '../../src/kit/permissions.ts'

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

  // ---- ตำแหน่ง ----
  // ไม่สังกัดแผนก (`departmentId: null`) — คลินิกที่เพิ่งเปิดใช้งานยังไม่มีแผนกเลย
  // ตำแหน่งต้องเลือกได้ทันทีโดยไม่ต้องรอสร้างแผนกก่อน
  await upsertPosition('สัตวแพทย์', 1, null)
  await upsertPosition('ผู้ช่วยสัตวแพทย์', 2, null)
  await upsertPosition('พนักงานเคาน์เตอร์', 3, null)
  await upsertPosition('พนักงานบัญชี', 4, null)

  // ---- บทบาท ----
  // ชุดสิทธิ์คลินิกทั่วไป — อ้างชุดเดียวกับที่ `seed-e2e-db.ts` ใช้พิสูจน์กฎ
  // `invoice_verifier_not_submitter_check` และ `main:medical:write` (เหตุผลของแต่ละ
  // key อยู่ที่นั่น) เพื่อให้แอดมินมีบทบาทให้เลือกตั้งแต่วันแรก ไม่ต้องไล่ติ๊กเอง
  await upsertRole('พนักงานเคาน์เตอร์', [
    RECEPTION_PERMISSION.read,
    RECEPTION_PERMISSION.write,
    BILLING_PERMISSION.read,
    BILLING_PERMISSION.collect,
    MASTER_PERMISSION.read,
  ])
  await upsertRole('สัตวแพทย์', [
    RECEPTION_PERMISSION.read,
    RECEPTION_PERMISSION.write,
    MEDICAL_PERMISSION.write,
    MASTER_PERMISSION.read,
  ])
  await upsertRole('พนักงานบัญชี', [BILLING_PERMISSION.read, BILLING_PERMISSION.verify])

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

/**
 * บทบาท + สิทธิ์ของมัน — ตั้งสิทธิ์ใหม่ทุกครั้งที่รัน ไม่สะสมของเก่า
 *
 * รันซ้ำแล้วสิทธิ์ต้องตรงกับที่ประกาศไว้ในโค้ดนี้เป๊ะ ไม่ใช่ผลรวมของทุกครั้งที่เคยรัน
 */
async function upsertRole(name: string, keys: readonly string[]): Promise<bigint> {
  const existing = await db.role.findFirst({ where: { name, deletedAt: null }, select: { id: true } })
  const roleId = existing?.id ?? (await db.role.create({ data: { name, ...sys }, select: { id: true } })).id

  const rows = await db.permission.findMany({ where: { key: { in: [...keys] } }, select: { id: true } })

  await db.rolePermission.deleteMany({ where: { roleId } })
  await db.rolePermission.createMany({
    data: rows.map((r) => ({ roleId, permissionId: r.id, createdBy: SYSTEM_USER_ID })),
    skipDuplicates: true,
  })

  return roleId
}

async function upsertPosition(
  name: string,
  sortOrder: number,
  departmentId: bigint | null,
): Promise<bigint> {
  const found = await db.position.findFirst({ where: { name, deletedAt: null }, select: { id: true } })
  if (found) return found.id

  const row = await db.position.create({
    data: { name, sortOrder, departmentId, ...sys },
    select: { id: true },
  })

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
