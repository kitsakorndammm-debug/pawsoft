import { invalid, notFound } from '../../kit/app-error.ts'
import { diffFields, writeAudit } from '../../kit/audit.ts'
import { db, inTx, type Db, type Tx } from '../../kit/db.ts'
import { asDuplicate } from '../../kit/duplicate.ts'
import { cleanOptional, cleanRequired, literal } from '../../kit/text.ts'
import type { ServiceItem } from '../../../prisma/generated/client.ts'

/**
 * รายการรักษาและบริการ
 *
 * **ไม่ใช่ทะเบียนชื่อล้วน** — มีรหัส ราคา หน่วย และหมวด · และ**ไม่มี `sortOrder`**
 * เพราะไม่มีใครลากเรียงยาเป็นร้อยตัว · ผลคือไม่มี `move` และ `list` แบ่งหน้าได้
 *
 * **`code` กับ `price` ไม่บังคับ** (ผู้ใช้ตัดสิน 2026-09-01) · คลินิกที่ยังไม่ตั้งราคา
 * ก็บันทึกยาไว้ก่อนได้ แล้วค่อยเติมทีหลัง
 */

const MODULE = 'serviceItem'
const LABEL = 'รายการรักษา'

const CODE_MAX = 30
const NAME_MAX = 200
const TEXT_MAX = 5_000

export const SERVICE_ITEM_PAGE_SIZE = 50
export const SERVICE_ITEM_PAGE_SIZE_MAX = 200

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

  const found = await at.serviceCategory.count({ where: { id: categoryId, deletedAt: null } })
  if (found === 0) throw notFound('ไม่พบหมวดบริการที่เลือก', { field: 'categoryId' })
}

export async function findServiceItem(id: bigint, tx?: Tx): Promise<ServiceItem> {
  const row = await (tx ?? db).serviceItem.findFirst({ where: { id, deletedAt: null } })
  if (!row) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })

  return row
}

export type ListServiceItemsInput = {
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
function listWhere(input: ListServiceItemsInput) {
  const q = input.q?.trim()

  return {
    deletedAt: null,
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    ...(q
      ? {
          // ค้นได้สามช่อง — ชื่อการค้า ตัวยาสำคัญ และรหัส
          OR: [
            { name: { contains: literal(q) } },
            { code: { contains: literal(q) } },
          ],
        }
      : {}),
  }
}

function resolvePaging(input: ListServiceItemsInput): { page: number; pageSize: number } {
  return {
    page: Math.max(Math.floor(input.page ?? 1), 1),
    pageSize: Math.min(Math.max(Math.floor(input.pageSize ?? SERVICE_ITEM_PAGE_SIZE), 1), SERVICE_ITEM_PAGE_SIZE_MAX),
  }
}

export type ListServiceItemsResult = { rows: ServiceItem[]; page: number; pageSize: number; total: number }

export async function listServiceItems(input: ListServiceItemsInput = {}, tx?: Tx): Promise<ListServiceItemsResult> {
  const { page, pageSize } = resolvePaging(input)
  const at = tx ?? db
  const where = listWhere(input)

  // นับกับดึงยิงพร้อมกัน — ตัวเลขกับแถวจึงบรรยายฐานที่เวลาเดียวกัน
  const [rows, total] = await Promise.all([
    at.serviceItem.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    at.serviceItem.count({ where }),
  ])

  return { rows, page, pageSize, total }
}

/** เท่าที่ combobox ต้องรู้ — พร้อมราคา เพราะใบเสร็จต้องคิดเงินจากตรงนี้ */
export type ServiceItemOption = {
  id: bigint
  name: string
  price: string | null
}

/**
 * รายการรักษาสำหรับ combobox
 *
 * **คืนเฉพาะแถวที่ยังใช้งานอยู่** (`isActive`) — รายการที่เลิกให้บริการแล้วยังอยู่ใน
 * ประวัติเก่า แต่ไม่ควรโผล่ให้เลือกในใบใหม่
 *
 * **พก `price` มาด้วย** — คนที่เลือกรายการต้องเห็นราคาตอนเลือก ไม่ใช่หลังบันทึก
 */
export async function lookupServiceItems(tx?: Tx): Promise<ServiceItemOption[]> {
  const rows = await (tx ?? db).serviceItem.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: 1_000,
    select: { id: true, name: true, price: true },
  })

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    price: r.price === null ? null : r.price.toString(),
  }))
}

export type ServiceItemInput = {
  code?: string | null
  name: string
  description?: string | null
  /** ราคาเป็นข้อความ — ดู `cleanPrice` */
  price?: string | null
  categoryId?: bigint | null
}

function clean(input: ServiceItemInput) {
  const price = cleanPrice(input.price)


  return {
    code: cleanOptional(input.code, { field: 'code', label: `รหัส${LABEL}`, max: CODE_MAX }),
    name: cleanRequired(input.name, { field: 'name', label: `ชื่อ${LABEL}`, max: NAME_MAX }),
    description: cleanOptional(input.description, {
      field: 'description',
      label: 'คำอธิบาย',
      max: TEXT_MAX,
    }),
    price,
    categoryId: input.categoryId ?? null,
  }
}

export async function createServiceItem(input: ServiceItemInput, actorId: bigint, outerTx?: Tx): Promise<ServiceItem> {
  const data = clean(input)

  await requireCategory(data.categoryId, outerTx ?? db)

  try {
    return await inTx(outerTx, async (tx) => {
      const created = await tx.serviceItem.create({
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

export async function updateServiceItem(
  id: bigint,
  input: ServiceItemInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<ServiceItem> {
  const data = clean(input)
  const existing = await findServiceItem(id, outerTx)

  await requireCategory(data.categoryId, outerTx ?? db)

  try {
    return await inTx(outerTx, async (tx) => {
      const updated = await tx.serviceItem.update({
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
export async function setServiceItemActive(id: bigint, isActive: boolean, actorId: bigint): Promise<ServiceItem> {
  const existing = await findServiceItem(id)
  if (existing.isActive === isActive) return existing

  return inTx(undefined, async (tx) => {
    const updated = await tx.serviceItem.update({ where: { id }, data: { isActive, updatedBy: actorId } })

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
export async function deleteServiceItem(id: bigint, actorId: bigint, outerTx?: Tx): Promise<void> {
  const existing = await (outerTx ?? db).serviceItem.findUnique({ where: { id } })
  if (!existing) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })
  if (existing.deletedAt !== null) return

  await inTx(outerTx, async (tx) => {
    await tx.serviceItem.update({
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
