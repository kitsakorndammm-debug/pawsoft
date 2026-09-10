import { inUse, notFound } from '../../kit/app-error.ts'
import { diffFields, writeAudit } from '../../kit/audit.ts'
import { db, inTx, type Db, type Tx } from '../../kit/db.ts'
import { asDuplicate } from '../../kit/duplicate.ts'
import { closeGap, resolveMoveTarget, shiftBetween, shiftDownForNew,
  lockSortList,
} from '../../kit/sort-order.ts'
import { cleanRequired, literal } from '../../kit/text.ts'
import type { Position } from '../../../prisma/generated/client.ts'

/**
 * ตำแหน่ง — หัวหน้างาน ธุรการ กรรมการผู้จัดการ
 *
 * เป็นทั้งลูกและพ่อพร้อมกัน: สังกัด `department` ส่วน `employee` ถือมันอยู่
 *
 * ชื่อ unique **ทั้งตาราง ไม่ใช่ต่อแผนก** — "หัวหน้างาน" เป็นแถวเดียวที่ทุกแผนกใช้ร่วมกัน
 * และ **ลำดับก็เป็นของทั้งตาราง** ลิสต์มีชุดเดียว การกรองด้วยแผนกเป็นเรื่องของ `list`
 * ไม่ใช่ของลำดับ (ดู `///` บนหัว `Position` ในสคีมา)
 */

const MODULE = 'position'
const LABEL = 'ตำแหน่ง'
const NAME_MAX = 200

export const POSITION_LIST_LIMIT = 500

const name = (raw: string) =>
  cleanRequired(raw, { field: 'name', label: `ชื่อ${LABEL}`, max: NAME_MAX })

function refuseDuplicate(e: unknown, value: string): never {
  return asDuplicate(e, { message: `มี${LABEL}ชื่อนี้อยู่แล้ว`, field: 'name', value })
}

/**
 * ตรวจว่าแผนกที่ส่งมามีอยู่จริงและยังไม่ถูกลบ
 *
 * ไม่ตรวจแล้วฐานปฏิเสธด้วย FK error ซึ่งเดินทางออกไปเป็น 500 — คนกรอกฟอร์มเห็น
 * "ระบบขัดข้อง" แทนที่จะรู้ว่าแผนกที่เลือกไว้ถูกลบไปแล้วระหว่างที่ฟอร์มเปิดอยู่
 */
async function requireDepartment(departmentId: bigint | null, at: Tx | Db): Promise<void> {
  if (departmentId === null) return

  const found = await at.department.count({ where: { id: departmentId, deletedAt: null } })
  if (found === 0) {
    throw notFound('ไม่พบแผนกที่เลือก', {
      field: 'departmentId',
      departmentId: String(departmentId),
    })
  }
}

/** มีพนักงานถืออยู่ ลบไม่ได้ — เหมือนกฎของแผนก */
async function guardDelete(id: bigint, at: Tx | Db): Promise<void> {
  const employees = await at.employee.count({ where: { positionId: id, deletedAt: null } })
  if (employees > 0) {
    throw inUse('ลบตำแหน่งนี้ไม่ได้ เพราะยังมีพนักงานถืออยู่', { employees })
  }
}

/** พนักงานที่ถูกลบไปแล้วเลิกชี้มาที่ตำแหน่งที่กำลังจะหายไป */
async function detachDeletedChildren(id: bigint, tx: Tx): Promise<void> {
  await tx.employee.updateMany({
    where: { positionId: id, deletedAt: { not: null } },
    data: { positionId: null },
  })
}

export type ListPositionsInput = {
  q?: string | undefined
  limit?: number | undefined
  /** กรองเฉพาะตำแหน่งในแผนกนี้ — ไม่ส่งมาคือเอาทั้งหมด */
  departmentId?: bigint | undefined
}

/**
 * ดูรายการ — ทั้งลิสต์ ไม่แบ่งหน้า
 *
 * `?departmentId=` กรองได้ · **แถวที่ไม่สังกัดแผนกไหนถูกตัดออกตอนกรอง** โดยตั้งใจ
 * null แปลว่าไม่สังกัดใคร การกรองด้วยแผนกจึงไม่ควรคืนมันกลับมา
 */
export async function listPositions(
  input: ListPositionsInput = {},
  tx?: Tx,
): Promise<Position[]> {
  const q = input.q?.trim()
  const limit = Math.min(input.limit ?? POSITION_LIST_LIMIT, POSITION_LIST_LIMIT)

  return (tx ?? db).position.findMany({
    where: {
      deletedAt: null,
      ...(q ? { name: { contains: literal(q) } } : {}),
      ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
    take: limit,
  })
}

export type CreatePositionInput = {
  name: string
  /** `null` แปลว่าไม่สังกัดแผนกไหน · ต้องส่งมาเสมอ แม้เป็น null */
  departmentId: bigint | null
}

/** เพิ่มรายการ — แถวใหม่ขึ้นบนสุดเสมอ */
export async function createPosition(
  input: CreatePositionInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Position> {
  const value = name(input.name)

  // ตรวจก่อนเปิดทรานแซกชัน — แผนกที่หายไปแล้วคือการปฏิเสธ ไม่ใช่ของที่ต้อง rollback
  await requireDepartment(input.departmentId, outerTx ?? db)

  try {
    return await inTx(outerTx, async (tx) => {
      // เข้าคิวก่อนทำงาน — เหตุผลอยู่ที่ `lockSortList`
      await lockSortList({ tx, name: 'position' })
      await shiftDownForNew({ tx, table: tx.position, name: 'position' })

      const created = await tx.position.create({
        data: {
          name: value,
          departmentId: input.departmentId,
          sortOrder: 0,
          createdBy: actorId,
          updatedBy: actorId,
        },
      })

      await writeAudit(tx, {
        action: `${MODULE}.create`,
        module: MODULE,
        recordId: created.id,
        after: {
          name: created.name,
          departmentId: created.departmentId,
          sortOrder: created.sortOrder,
        },
        userId: actorId,
      })

      return created
    })
  } catch (e) {
    refuseDuplicate(e, value)
  }
}

export type UpdatePositionInput = {
  name: string
  departmentId: bigint | null
}

/** แก้ชื่อกับแผนกที่สังกัด — ลำดับเป็นงานของ `movePosition` */
export async function updatePosition(
  id: bigint,
  input: UpdatePositionInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Position> {
  const value = name(input.name)

  const existing = await (outerTx ?? db).position.findFirst({ where: { id, deletedAt: null } })
  if (!existing) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })

  await requireDepartment(input.departmentId, outerTx ?? db)

  const changed = diffFields(
    { name: existing.name, departmentId: existing.departmentId },
    { name: value, departmentId: input.departmentId },
  )

  try {
    return await inTx(outerTx, async (tx) => {
      const updated = await tx.position.update({
        where: { id },
        data: { name: value, departmentId: input.departmentId, updatedBy: actorId },
      })

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

/** ลบ — soft delete แล้วปิดช่องที่มันทิ้งไว้ · ลบซ้ำไม่ error แต่ไม่ทำอะไรเลย */
export async function deletePosition(
  id: bigint,
  actorId: bigint,
  outerTx?: Tx,
): Promise<void> {
  const existing = await (outerTx ?? db).position.findUnique({ where: { id } })
  if (!existing) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })

  if (existing.deletedAt !== null) return

  await guardDelete(id, outerTx ?? db)

  await inTx(outerTx, async (tx) => {
    // เข้าคิวก่อนทำงาน — เหตุผลอยู่ที่ `lockSortList`
    await lockSortList({ tx, name: 'position' })
    /**
     * อ่าน `sortOrder` **ใหม่หลังจับกุญแจ** ไม่ใช่ใช้ค่าที่อ่านมาตอนตรวจว่าแถวมีจริง
     *
     * ค่าที่อ่านก่อนเข้าคิวคือค่าก่อนที่คนข้างหน้าจะเลื่อนลิสต์ · ลบสิบแถวพร้อมกันแล้ว
     * ทุกคนอ่านค่าเดิมชุดเดียวกัน แล้วต่างคนต่างปิดช่องจากตำแหน่งที่ไม่มีอยู่แล้ว
     * ผลคือสองแถวถือเลขเดียวกัน โดยไม่มี error สักตัว (วัดจริง 2026-08-26)
     */
    const current = await tx.position.findUnique({ where: { id } })
    if (!current || current.deletedAt !== null) return
    const vacated = current.sortOrder
    await detachDeletedChildren(id, tx)

    await tx.position.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: actorId,
        // `updatedBy` ไม่ถูกแตะ — `deletedBy` บอกอยู่แล้วว่าใครลบ · null ไม่ใช่ตัวเลข
        // เพราะแถวไม่ได้อยู่ในลิสต์แล้ว จึงไม่ถือตำแหน่งในลิสต์
        sortOrder: null,
      },
    })

    await closeGap({ tx, table: tx.position, name: 'position' }, vacated)

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

export type MovePositionInput = {
  /** `null` แปลว่าไปล่างสุด · ไม่ส่งมาเลยแปลว่าคนเรียกไม่ได้บอกว่าจะย้ายไปไหน */
  beforeId: bigint | null
}

/**
 * ย้ายลำดับ — ในลิสต์ชุดเดียวของทั้งตาราง ไม่ใช่ต่อแผนก
 *
 * แผนกเป็นตัวกรองของ `list` ไม่ใช่ขอบเขตของลำดับ · ถ้าลำดับเป็นของแต่ละแผนก
 * การย้ายตำแหน่งข้ามแผนกจะต้องเขียนเลขใหม่ทั้งสองฝั่ง ซึ่งไม่มีหน้าจอไหนขอ
 */
export async function movePosition(
  id: bigint,
  input: MovePositionInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<void> {
  const at = outerTx ?? db

  const row = await at.position.findFirst({ where: { id, deletedAt: null } })
  if (!row) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })

  const from = row.sortOrder
  if (from === null) {
    throw notFound(`${LABEL}นี้ไม่มีลำดับในลิสต์`, { id: String(id) })
  }

  const to = await resolveMoveTarget(at.position, {
    id,
    from,
    beforeId: input.beforeId,
    label: LABEL,
  })

  if (to === null) return

  await inTx(outerTx, async (tx) => {
    // เข้าคิวก่อนทำงาน — เหตุผลอยู่ที่ `lockSortList`
    await lockSortList({ tx, name: 'position' })
    await shiftBetween({ tx, table: tx.position, name: 'position' }, { from, to })

    await tx.position.update({ where: { id }, data: { sortOrder: to, updatedBy: actorId } })

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
