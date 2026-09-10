import { invalid, notFound } from '../../kit/app-error.ts'
import { diffFields, writeAudit } from '../../kit/audit.ts'
import { db, inTx, type Db, type Tx } from '../../kit/db.ts'
import { asDuplicate } from '../../kit/duplicate.ts'
import { cleanOptional, cleanRequired, literal } from '../../kit/text.ts'
import type { Drug } from '../../../prisma/generated/client.ts'

/**
 * ยาและเวชภัณฑ์
 *
 * **ไม่ใช่ทะเบียนชื่อล้วน** — มีรหัส ราคา หน่วย และหมวด · และ**ไม่มี `sortOrder`**
 * เพราะไม่มีใครลากเรียงยาเป็นร้อยตัว · ผลคือไม่มี `move` และ `list` แบ่งหน้าได้
 *
 * **`code` กับ `price` ไม่บังคับ** (ผู้ใช้ตัดสิน 2026-09-01) · คลินิกที่ยังไม่ตั้งราคา
 * ก็บันทึกยาไว้ก่อนได้ แล้วค่อยเติมทีหลัง
 */

const MODULE = 'drug'
const LABEL = 'ยา'

const CODE_MAX = 30
const NAME_MAX = 200
const GENERIC_MAX = 200
const UNIT_MAX = 30
const PACKAGE_MAX = 100
const TEXT_MAX = 5_000

export const DRUG_PAGE_SIZE = 50
export const DRUG_PAGE_SIZE_MAX = 200

/**
 * ราคาที่รับเข้ามาเป็น**ข้อความ** ไม่ใช่ตัวเลข
 *
 * `0.1 + 0.2 !== 0.3` — เงินที่เดินทางเป็น `number` คือเงินที่คลาดไปเศษสตางค์ตั้งแต่ก่อน
 * ถึงฐาน · Prisma รับ string เข้า `Decimal` ได้ตรง ๆ และเก็บค่าที่พิมพ์มาเป๊ะ
 *
 * `null` = ยังไม่ตั้งราคา · `'0'` = แจกฟรี · **สองอย่างนี้ต่างกัน**
 */
function cleanPrice(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null

  const value = raw.trim()
  if (value.length === 0) return null

  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw invalid('ราคาต้องเป็นตัวเลข ทศนิยมไม่เกินสองตำแหน่ง', { field: 'price', value })
  }

  return value
}

function refuseDuplicate(e: unknown, input: { code: string | null; name: string }): never {
  // ชนได้สองทาง — บอกให้ตรงว่าอันไหน ไม่งั้นคนแก้ผิดช่อง
  const message = /drug_code_live_key/.test(String(e)) ? `มี${LABEL}รหัสนี้อยู่แล้ว` : `มี${LABEL}ชื่อนี้อยู่แล้ว`
  const field = /drug_code_live_key/.test(String(e)) ? 'code' : 'name'

  return asDuplicate(e, { message, field, value: field === 'code' ? (input.code ?? '') : input.name })
}

/** หมวดที่เลือกต้องมีอยู่จริง — ไม่งั้น FK error หลุดออกไปเป็น 500 */
async function requireCategory(categoryId: bigint | null, at: Tx | Db): Promise<void> {
  if (categoryId === null) return

  const found = await at.drugCategory.count({ where: { id: categoryId, deletedAt: null } })
  if (found === 0) throw notFound('ไม่พบหมวดยาที่เลือก', { field: 'categoryId' })
}

export async function findDrug(id: bigint, tx?: Tx): Promise<Drug> {
  const row = await (tx ?? db).drug.findFirst({ where: { id, deletedAt: null } })
  if (!row) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })

  return row
}

export type ListDrugsInput = {
  q?: string | undefined
  /** กรองตามหมวด — `undefined` = ทุกหมวด */
  categoryId?: bigint | undefined
  page?: number | undefined
  pageSize?: number | undefined
}

/**
 * ตัวกรองของลิสต์ — **`list` กับ `count` ต้องใช้ก้อนเดียวกัน**
 *
 * แยกกันเขียนเมื่อไหร่ก็มีวันที่ตัวหนึ่งได้เงื่อนไขใหม่แล้วอีกตัวไม่ได้ · ตารางจะบอกว่ามี
 * 30 แถวแต่เดินดูได้ 12 และไม่มีใครรู้ว่าเลขไหนผิด
 */
function listWhere(input: ListDrugsInput) {
  const q = input.q?.trim()

  return {
    deletedAt: null,
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    ...(q
      ? {
          // ค้นได้สามช่อง — ชื่อการค้า ตัวยาสำคัญ และรหัส
          OR: [
            { name: { contains: literal(q) } },
            { genericName: { contains: literal(q) } },
            { code: { contains: literal(q) } },
          ],
        }
      : {}),
  }
}

function resolvePaging(input: ListDrugsInput): { page: number; pageSize: number } {
  return {
    page: Math.max(Math.floor(input.page ?? 1), 1),
    pageSize: Math.min(Math.max(Math.floor(input.pageSize ?? DRUG_PAGE_SIZE), 1), DRUG_PAGE_SIZE_MAX),
  }
}

export type ListDrugsResult = { rows: Drug[]; page: number; pageSize: number; total: number }

export async function listDrugs(input: ListDrugsInput = {}, tx?: Tx): Promise<ListDrugsResult> {
  const { page, pageSize } = resolvePaging(input)
  const at = tx ?? db
  const where = listWhere(input)

  // นับกับดึงยิงพร้อมกัน — ตัวเลขกับแถวจึงบรรยายฐานที่เวลาเดียวกัน
  const [rows, total] = await Promise.all([
    at.drug.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    at.drug.count({ where }),
  ])

  return { rows, page, pageSize, total }
}

/** เท่าที่ combobox ต้องรู้ — พร้อมราคากับหน่วย เพราะใบสั่งยาต้องคิดเงินจากตรงนี้ */
export type DrugOption = {
  id: bigint
  name: string
  unit: string | null
  price: string | null
}

/**
 * ยาสำหรับ combobox
 *
 * **คืนเฉพาะแถวที่ยังใช้งานอยู่** (`isActive`) — ยาที่เลิกใช้แล้วยังอยู่ในประวัติเก่า
 * แต่ไม่ควรโผล่ให้เลือกในใบใหม่ · ต่างจาก `listDrugs` ที่หน้าจัดการเรียก ซึ่งต้องเห็น
 * ทั้งสองแบบเพื่อกดกลับมาใช้ได้
 *
 * **พก `price` กับ `unit` มาด้วย** ไม่ใช่แค่ `id` กับ `name` — คนที่เลือกยาใส่ใบสั่ง
 * ต้องเห็นราคาตอนเลือก ไม่ใช่หลังบันทึก · และใบต้องคัดลอกราคาไปเก็บของตัวเอง
 * ไม่ใช่ชี้กลับมาที่นี่ (ดู `///` บน `Drug.price` ในสคีมา)
 *
 * **ไม่แบ่งหน้า** — combobox โหลดทั้งชุดแล้วค้นในเครื่อง · เพดาน 1000 กันไว้เผื่อ
 * คลินิกที่มียาเยอะผิดปกติ ซึ่งถึงตอนนั้นต้องเปลี่ยนเป็นค้นที่เซิร์ฟเวอร์แทน
 */
export async function lookupDrugs(tx?: Tx): Promise<DrugOption[]> {
  const rows = await (tx ?? db).drug.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: 1_000,
    select: { id: true, name: true, unit: true, price: true },
  })

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    unit: r.unit,
    // เงินออกเป็นข้อความเสมอ — ดู `toWire` ที่ชั้น route
    price: r.price === null ? null : r.price.toString(),
  }))
}

export type DrugInput = {
  code?: string | null
  name: string
  genericName?: string | null
  unit?: string | null
  packageSize?: string | null
  /** ราคาเป็นข้อความ — ดู `cleanPrice` */
  price?: string | null
  categoryId?: bigint | null
  note?: string | null
}

function clean(input: DrugInput) {
  const price = cleanPrice(input.price)
  const unit = cleanOptional(input.unit, { field: 'unit', label: 'หน่วยนับ', max: UNIT_MAX })

  /**
   * **มีราคาแล้วต้องมีหน่วย** — ฐานบังคับไว้ด้วย CHECK อยู่แล้ว แต่ปฏิเสธที่นี่เพื่อให้
   * ได้ข้อความที่บอกว่าต้องทำอะไร แทน `ระบบขัดข้อง` ที่หลุดมาจาก constraint violation
   */
  if (price !== null && unit === null) {
    throw invalid('กรอกราคาแล้วต้องระบุหน่วยนับด้วย — ราคาต่อหน่วยอะไร', { field: 'unit' })
  }

  return {
    code: cleanOptional(input.code, { field: 'code', label: `รหัส${LABEL}`, max: CODE_MAX }),
    name: cleanRequired(input.name, { field: 'name', label: `ชื่อ${LABEL}`, max: NAME_MAX }),
    genericName: cleanOptional(input.genericName, {
      field: 'genericName',
      label: 'ตัวยาสำคัญ',
      max: GENERIC_MAX,
    }),
    unit,
    packageSize: cleanOptional(input.packageSize, {
      field: 'packageSize',
      label: 'ขนาดบรรจุ',
      max: PACKAGE_MAX,
    }),
    price,
    categoryId: input.categoryId ?? null,
    note: cleanOptional(input.note, { field: 'note', label: 'บันทึก', max: TEXT_MAX }),
  }
}

export async function createDrug(input: DrugInput, actorId: bigint, outerTx?: Tx): Promise<Drug> {
  const data = clean(input)

  await requireCategory(data.categoryId, outerTx ?? db)

  try {
    return await inTx(outerTx, async (tx) => {
      const created = await tx.drug.create({
        data: { ...data, createdBy: actorId, updatedBy: actorId },
      })

      await writeAudit(tx, {
        action: `${MODULE}.create`,
        module: MODULE,
        recordId: created.id,
        after: { code: created.code, name: created.name, price: created.price },
        userId: actorId,
      })

      return created
    })
  } catch (e) {
    refuseDuplicate(e, data)
  }
}

export async function updateDrug(
  id: bigint,
  input: DrugInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Drug> {
  const data = clean(input)
  const existing = await findDrug(id, outerTx)

  await requireCategory(data.categoryId, outerTx ?? db)

  try {
    return await inTx(outerTx, async (tx) => {
      const updated = await tx.drug.update({
        where: { id },
        data: { ...data, updatedBy: actorId },
      })

      const changed = diffFields({ ...existing }, { ...data })

      // ไม่มีอะไรเปลี่ยนจริง — ไม่ต้องมีแถวในบันทึก
      if (changed.after !== null) {
        await writeAudit(tx, {
          action: `${MODULE}.update`,
          module: MODULE,
          recordId: id,
          before: changed.before,
          after: changed.after,
          userId: actorId,
        })
      }

      return updated
    })
  } catch (e) {
    refuseDuplicate(e, data)
  }
}

/**
 * เลิกใช้ / กลับมาใช้
 *
 * **คนละเรื่องกับการลบ** · ยาที่เลิกใช้ยังอยู่ในประวัติการรักษาเก่า แค่ไม่โผล่ในรายการ
 * ให้เลือกใหม่ · ลบคือแถวที่สร้างผิดตั้งแต่แรก
 *
 * idempotent — กดซ้ำคือเหตุการณ์เดียว ไม่เขียนบันทึกสองรอบ
 */
export async function setDrugActive(id: bigint, isActive: boolean, actorId: bigint): Promise<Drug> {
  const existing = await findDrug(id)
  if (existing.isActive === isActive) return existing

  return inTx(undefined, async (tx) => {
    const updated = await tx.drug.update({ where: { id }, data: { isActive, updatedBy: actorId } })

    await writeAudit(tx, {
      action: `${MODULE}.set-active`,
      module: MODULE,
      recordId: id,
      before: { isActive: existing.isActive },
      after: { isActive },
      userId: actorId,
    })

    return updated
  })
}

/**
 * ลบ — soft delete
 *
 * idempotent · **ไม่แตะ `updatedBy`** เพราะทับแล้วจะลบร่องรอยว่าใครแก้ข้อมูลตัวนี้
 * เป็นคนสุดท้าย
 */
export async function deleteDrug(id: bigint, actorId: bigint, outerTx?: Tx): Promise<void> {
  const existing = await (outerTx ?? db).drug.findUnique({ where: { id } })
  if (!existing) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })
  if (existing.deletedAt !== null) return

  await inTx(outerTx, async (tx) => {
    await tx.drug.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorId },
    })

    await writeAudit(tx, {
      action: `${MODULE}.delete`,
      module: MODULE,
      recordId: id,
      before: { code: existing.code, name: existing.name },
      after: null,
      userId: actorId,
    })
  })
}
