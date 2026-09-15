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

  // สายพันธุ์ไทยแท้ก่อน แล้วตามด้วยสายพันธุ์สากลที่พบบ่อย ปิดท้ายด้วย "พันธุ์ผสม"
  // ซึ่งเป็นตัวเลือกที่ใช้จริงบ่อยที่สุด (แมว/หมาที่มาส่วนใหญ่ไม่มีสายพันธุ์แท้)
  await upsertBreed('เปอร์เซีย', cat)
  await upsertBreed('ไทยบ้าน', cat)
  await upsertBreed('วิเชียรมาศ', cat)
  await upsertBreed('โคราช (สีสวาด)', cat)
  await upsertBreed('ขาวมณี', cat)
  await upsertBreed('ศุภลักษณ์', cat)
  await upsertBreed('สยาม', cat)
  await upsertBreed('สก็อตติชโฟลด์', cat)
  await upsertBreed('อเมริกันชอร์ตแฮร์', cat)
  await upsertBreed('บริติชชอร์ตแฮร์', cat)
  await upsertBreed('เมนคูน', cat)
  await upsertBreed('แร็กดอลล์', cat)
  await upsertBreed('สฟิงซ์', cat)
  await upsertBreed('เบงกอล', cat)
  await upsertBreed('รัสเซียนบลู', cat)
  await upsertBreed('เอ็กโซติกชอร์ตแฮร์', cat)
  await upsertBreed('อบิสซิเนียน', cat)
  await upsertBreed('เบอร์แมน', cat)
  await upsertBreed('นอร์วีเจียนฟอเรสต์', cat)
  await upsertBreed('แมวพันธุ์ผสม', cat)

  await upsertBreed('ไทยหลังอาน', dog)
  await upsertBreed('บางแก้ว', dog)
  await upsertBreed('โกลเด้น รีทรีฟเวอร์', dog)
  await upsertBreed('ลาบราดอร์ รีทรีฟเวอร์', dog)
  await upsertBreed('ปอมเมอเรเนียน', dog)
  await upsertBreed('ชิวาวา', dog)
  await upsertBreed('พุดเดิ้ล', dog)
  await upsertBreed('บีเกิ้ล', dog)
  await upsertBreed('ชิสุ', dog)
  await upsertBreed('ปั๊ก', dog)
  await upsertBreed('สุนัขพันธุ์ผสม', dog)

  // ---- บริการ ----
  const svcCat = await upsertServiceCategory('ตรวจรักษาทั่วไป')
  const svc = await upsertServiceItem('ตรวจร่างกายทั่วไป', '300.00', svcCat)
  await upsertServiceItem('ตรวจเลือด', '600.00', svcCat)
  await upsertServiceItem('ตรวจอุจจาระ', '200.00', svcCat)
  await upsertServiceItem('เอกซเรย์', '800.00', svcCat)

  const vaccineCat = await upsertServiceCategory('วัคซีนและป้องกันโรค')
  await upsertServiceItem('ฉีดวัคซีนรวม', '450.00', vaccineCat)
  await upsertServiceItem('ฉีดวัคซีนพิษสุนัขบ้า', '250.00', vaccineCat)
  await upsertServiceItem('ถ่ายพยาธิ', '150.00', vaccineCat)
  await upsertServiceItem('หยอดยากำจัดเห็บหมัด', '200.00', vaccineCat)

  const surgeryCat = await upsertServiceCategory('ทันตกรรมและศัลยกรรม')
  await upsertServiceItem('ขูดหินปูน', '1500.00', surgeryCat)
  await upsertServiceItem('ทำหมัน', '2500.00', surgeryCat)

  // ---- ยา ----
  // ชื่อสามัญ + วงเล็บชื่อการค้าที่รู้จักทั่วไป (เช่น "Praziquantel (Drontal)") —
  // พนักงานเรียกยาด้วยชื่อการค้าจริงในคลินิก แต่ชื่อสามัญคือตัวที่บอกว่ามันคือยาอะไร
  const drugCat = await upsertDrugCategory('ยาปฏิชีวนะ')
  const drug = await upsertDrug('Amoxicillin 250', '12.50', 'เม็ด', drugCat)
  await upsertDrug('Cephalexin 250', '10.00', 'เม็ด', drugCat)
  await upsertDrug('Doxycycline 100', '8.50', 'เม็ด', drugCat)
  await upsertDrug('Cefovecin (Convenia)', '850.00', 'ขวด', drugCat)

  const painCat = await upsertDrugCategory('ยาแก้ปวด-ลดการอักเสบ')
  await upsertDrug('Meloxicam (Metacam)', '450.00', 'ขวด', painCat)
  await upsertDrug('Tolfedine 6mg', '9.00', 'เม็ด', painCat)
  await upsertDrug('Tramadol 50', '15.00', 'เม็ด', painCat)
  await upsertDrug('Prednisolone 5', '8.00', 'เม็ด', painCat)

  const dewormCat = await upsertDrugCategory('ยาถ่ายพยาธิ-กำจัดเห็บหมัด')
  await upsertDrug('Praziquantel (Drontal)', '25.00', 'เม็ด', dewormCat)
  await upsertDrug('Fenbendazole (Panacur)', '60.00', 'ซอง', dewormCat)
  await upsertDrug('Ivermectin (Heartgard)', '120.00', 'เม็ด', dewormCat)
  await upsertDrug('Bravecto', '650.00', 'เม็ด', dewormCat)

  const supplementCat = await upsertDrugCategory('ยาบำรุง-วิตามิน')
  await upsertDrug('วิตามินรวม', '5.00', 'เม็ด', supplementCat)
  await upsertDrug('แคลเซียมเสริม', '6.00', 'เม็ด', supplementCat)

  const giCat = await upsertDrugCategory('ยาระบบทางเดินอาหาร')
  await upsertDrug('Omeprazole 20', '12.00', 'แคปซูล', giCat)

  // ---- แผนก ----
  const deptVet = await upsertDepartment('แผนกสัตวแพทย์', 1)
  const deptFront = await upsertDepartment('แผนกต้อนรับ', 2)
  const deptAccount = await upsertDepartment('แผนกบัญชี', 3)

  // ---- ตำแหน่ง ----
  // สังกัดแผนกให้ตรงกับบทบาทที่ตำแหน่งนั้นมักถือ — "แผนก" ยังไม่บังคับเลือก
  // (`docs/standards/web-conventions.md`) จึงไม่กระทบตำแหน่งที่คลินิกอื่นไม่อยากสังกัดแผนก
  await upsertPosition('สัตวแพทย์', 1, deptVet)
  await upsertPosition('ผู้ช่วยสัตวแพทย์', 2, deptVet)
  await upsertPosition('พนักงานเคาน์เตอร์', 3, deptFront)
  await upsertPosition('พนักงานบัญชี', 4, deptAccount)

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

async function upsertDepartment(name: string, sortOrder: number): Promise<bigint> {
  const found = await db.department.findFirst({ where: { name, deletedAt: null }, select: { id: true } })
  if (found) return found.id

  const row = await db.department.create({ data: { name, sortOrder, ...sys }, select: { id: true } })

  return row.id
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
