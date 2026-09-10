import { inUse, notFound } from '../../kit/app-error.ts'
import { diffFields, writeAudit } from '../../kit/audit.ts'
import { db, inTx, type Db, type Tx } from '../../kit/db.ts'
import { asDuplicate } from '../../kit/duplicate.ts'
import { closeGap, resolveMoveTarget, shiftBetween, shiftDownForNew,
  lockSortList,
} from '../../kit/sort-order.ts'
import { cleanRequired, literal } from '../../kit/text.ts'
import type { Department } from '../../../prisma/generated/client.ts'

/**
 * แผนก — ฝ่ายผลิต ฝ่ายขาย ฝ่ายบัญชี
 *
 * รูปเดียวกับทะเบียนอื่น ต่างตรงเดียว: **มีคนสังกัดอยู่** ตำแหน่งกับพนักงานชี้มาที่นี่
 * การลบจึงต้องถามถึงพวกเขาก่อน (ผู้ใช้ตัดสิน 2026-08-26 · ดู `///` บนหัว `Department`)
 */

const MODULE = 'department'
const LABEL = 'แผนก'
const NAME_MAX = 200

export const DEPARTMENT_LIST_LIMIT = 500

const name = (raw: string) =>
  cleanRequired(raw, { field: 'name', label: `ชื่อ${LABEL}`, max: NAME_MAX })

function refuseDuplicate(e: unknown, value: string): never {
  return asDuplicate(e, { message: `มี${LABEL}ชื่อนี้อยู่แล้ว`, field: 'name', value })
}

/**
 * ลูกที่ยังใช้งานอยู่กันการลบไว้ — พร้อมบอกว่ามีกี่ตัว
 *
 * ตัวเลขคือสิ่งที่เปลี่ยน "ลบไม่ได้" ให้เป็นอะไรที่ผู้ใช้ทำต่อได้ เขารู้ว่าต้องย้ายอีกเท่าไหร่
 */
async function guardDelete(id: bigint, at: Tx | Db): Promise<void> {
  const [positions, employees] = await Promise.all([
    at.position.count({ where: { departmentId: id, deletedAt: null } }),
    at.employee.count({ where: { departmentId: id, deletedAt: null } }),
  ])

  if (positions > 0 || employees > 0) {
    throw inUse('ลบแผนกนี้ไม่ได้ เพราะยังมีตำแหน่งหรือพนักงานสังกัดอยู่', {
      positions,
      employees,
    })
  }
}

/**
 * ลูกที่ถูกลบไปแล้วเลิกชี้มาที่แผนกที่กำลังจะหายไป
 *
 * ปล่อยให้ชี้ต่อ คือแถวที่อ้างของที่ไม่มีอยู่ · เฉพาะตัวที่ตายแล้วเท่านั้น — ตัวที่ยังอยู่
 * คือเหตุผลที่ `guardDelete` ข้างบนปฏิเสธไปก่อนหน้านี้
 */
async function detachDeletedChildren(id: bigint, tx: Tx): Promise<void> {
  await tx.position.updateMany({
    where: { departmentId: id, deletedAt: { not: null } },
    data: { departmentId: null },
  })
  await tx.employee.updateMany({
    where: { departmentId: id, deletedAt: { not: null } },
    data: { departmentId: null },
  })
}

export type ListDepartmentsInput = {
  q?: string | undefined
  limit?: number | undefined
}

/**
 * ดูรายการ — ทั้งลิสต์ ไม่แบ่งหน้า
 *
 * `orderBy` มีสองคีย์เพราะแถวที่ถือ `sortOrder` เท่ากันไม่มีลำดับที่แน่นอนถ้าไม่มีคีย์ที่สอง
 * และ Postgres คืนมาสลับกันได้ระหว่างสองครั้งที่เรียก — ลิสต์จะดูเหมือนสลับตัวเองทุกครั้ง
 * ที่ refresh · `id: 'desc'` ทำให้แถวที่เพิ่งสร้างขึ้นบน และไม่ขึ้นกับว่าฐานเรียงภาษาไทยยังไง
 */
export async function listDepartments(
  input: ListDepartmentsInput = {},
  tx?: Tx,
): Promise<Department[]> {
  const q = input.q?.trim()
  const limit = Math.min(input.limit ?? DEPARTMENT_LIST_LIMIT, DEPARTMENT_LIST_LIMIT)

  return (tx ?? db).department.findMany({
    where: {
      deletedAt: null,
      ...(q ? { name: { contains: literal(q) } } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
    take: limit,
  })
}

export type CreateDepartmentInput = { name: string }

/**
 * เพิ่มรายการ — แถวใหม่ขึ้นบนสุดเสมอ
 *
 * ทั้งก้อนอยู่ในทรานแซกชันเดียว · วางแถวไว้ที่ตำแหน่ง 0 แปลว่าทุกแถวที่เหลือต้องเลื่อนลง
 * ทำนอกทรานแซกชันเมื่อไหร่ สองคนที่กดสร้างพร้อมกันจะเลื่อนทั้งคู่แล้วเขียนลงที่ 0 ทั้งคู่
 */
export async function createDepartment(
  input: CreateDepartmentInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Department> {
  const value = name(input.name)

  try {
    return await inTx(outerTx, async (tx) => {
      // เข้าคิวก่อนทำงาน — เหตุผลอยู่ที่ `lockSortList`
      await lockSortList({ tx, name: 'department' })
      await shiftDownForNew({ tx, table: tx.department, name: 'department' })

      const created = await tx.department.create({
        data: { name: value, sortOrder: 0, createdBy: actorId, updatedBy: actorId },
      })

      await writeAudit(tx, {
        action: `${MODULE}.create`,
        module: MODULE,
        recordId: created.id,
        after: { name: created.name, sortOrder: created.sortOrder },
        userId: actorId,
      })

      return created
    })
  } catch (e) {
    refuseDuplicate(e, value)
  }
}

export type UpdateDepartmentInput = { name: string }

/** แก้ชื่ออย่างเดียว — ลำดับเป็นงานของ `moveDepartment` */
export async function updateDepartment(
  id: bigint,
  input: UpdateDepartmentInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Department> {
  const value = name(input.name)

  // findFirst ไม่ใช่ findUnique — แถวต้องยังมีชีวิต และ `deletedAt` ไม่ได้อยู่ในคีย์ไหน
  const existing = await (outerTx ?? db).department.findFirst({
    where: { id, deletedAt: null },
  })
  if (!existing) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })

  const changed = diffFields({ name: existing.name }, { name: value })

  try {
    return await inTx(outerTx, async (tx) => {
      const updated = await tx.department.update({
        where: { id },
        data: { name: value, updatedBy: actorId },
      })

      // ฟอร์มแก้ข้อมูลส่งทุกฟิลด์กลับมาตอนกดบันทึก การกดบันทึกโดยไม่แก้อะไรจึงเป็น
      // เรื่องปกติ · log ที่บอกว่าไม่มีอะไรเปลี่ยน คือขยะในตารางเดียวที่ต้องอ่านออก
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
    refuseDuplicate(e, value)
  }
}

/**
 * ลบ — soft delete แล้วปิดช่องที่มันทิ้งไว้
 *
 * **ลบตัวที่ลบไปแล้วไม่ error แต่ไม่ทำอะไรเลย** — การลบเกิดครั้งเดียว การกดปุ่มสิบครั้ง
 * ไม่ควรอ่านเป็นการลบสิบครั้ง
 */
export async function deleteDepartment(
  id: bigint,
  actorId: bigint,
  outerTx?: Tx,
): Promise<void> {
  const existing = await (outerTx ?? db).department.findUnique({ where: { id } })
  if (!existing) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })

  if (existing.deletedAt !== null) return

  // ปฏิเสธก่อนเปิดทรานแซกชัน ถ้ายังมีใครสังกัดอยู่
  await guardDelete(id, outerTx ?? db)

  await inTx(outerTx, async (tx) => {
    // เข้าคิวก่อนทำงาน — เหตุผลอยู่ที่ `lockSortList`
    await lockSortList({ tx, name: 'department' })
    /**
     * อ่าน `sortOrder` **ใหม่หลังจับกุญแจ** ไม่ใช่ใช้ค่าที่อ่านมาตอนตรวจว่าแถวมีจริง
     *
     * ค่าที่อ่านก่อนเข้าคิวคือค่าก่อนที่คนข้างหน้าจะเลื่อนลิสต์ · ลบสิบแถวพร้อมกันแล้ว
     * ทุกคนอ่านค่าเดิมชุดเดียวกัน แล้วต่างคนต่างปิดช่องจากตำแหน่งที่ไม่มีอยู่แล้ว
     * ผลคือสองแถวถือเลขเดียวกัน โดยไม่มี error สักตัว (วัดจริง 2026-08-26)
     */
    const current = await tx.department.findUnique({ where: { id } })
    if (!current || current.deletedAt !== null) return
    const vacated = current.sortOrder
    await detachDeletedChildren(id, tx)

    await tx.department.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: actorId,
        // `updatedBy` ไม่ถูกแตะ — `deletedBy` บอกอยู่แล้วว่าใครลบ ทับอีกตัวไปด้วย
        // คือลบร่องรอยว่าใครแก้ข้อมูลแถวนี้เป็นคนสุดท้าย คนละคำถามกัน
        //
        // null ไม่ใช่ตัวเลข: แถวไม่ได้อยู่ในลิสต์แล้ว จึงไม่ถือตำแหน่งในลิสต์
        sortOrder: null,
      },
    })

    await closeGap({ tx, table: tx.department, name: 'department' }, vacated)

    await writeAudit(tx, {
      action: `${MODULE}.delete`,
      module: MODULE,
      recordId: id,
      before: { name: existing.name, sortOrder: vacated },
      after: null,
      userId: actorId,
    })
  })
}

export type MoveDepartmentInput = {
  /** `null` แปลว่าไปล่างสุด · ไม่ส่งมาเลยแปลว่าคนเรียกไม่ได้บอกว่าจะย้ายไปไหน */
  beforeId: bigint | null
}

/** ย้ายลำดับ — เลขคณิตอยู่ใน `@kit/sort-order` เพราะทุกทะเบียนเดินชุดเดียวกัน */
export async function moveDepartment(
  id: bigint,
  input: MoveDepartmentInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<void> {
  const at = outerTx ?? db

  const row = await at.department.findFirst({ where: { id, deletedAt: null } })
  if (!row) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })

  const from = row.sortOrder
  if (from === null) {
    // แถวที่ยังอยู่ต้องถือตำแหน่งเสมอ — มาถึงตรงนี้แปลว่าตารางไม่คงเส้นคงวา
    throw notFound(`${LABEL}นี้ไม่มีลำดับในลิสต์`, { id: String(id) })
  }

  const to = await resolveMoveTarget(at.department, {
    id,
    from,
    beforeId: input.beforeId,
    label: LABEL,
  })

  // อยู่ตรงนั้นอยู่แล้ว หรือลากลงบนตัวเอง — ไม่มีอะไรขยับ ไม่มีอะไรให้บันทึก
  if (to === null) return

  await inTx(outerTx, async (tx) => {
    // เข้าคิวก่อนทำงาน — เหตุผลอยู่ที่ `lockSortList`
    await lockSortList({ tx, name: 'department' })
    await shiftBetween({ tx, table: tx.department, name: 'department' }, { from, to })

    await tx.department.update({ where: { id }, data: { sortOrder: to, updatedBy: actorId } })

    await writeAudit(tx, {
      action: `${MODULE}.move`,
      module: MODULE,
      recordId: id,
      before: { sortOrder: from },
      after: { sortOrder: to },
      userId: actorId,
    })
  })
}
