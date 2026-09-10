import { inUse, notFound } from '../../kit/app-error.ts'
import { diffFields, writeAudit } from '../../kit/audit.ts'
import { db, inTx, type Db, type Tx } from '../../kit/db.ts'
import { asDuplicate } from '../../kit/duplicate.ts'
import { cleanRequired, literal } from '../../kit/text.ts'
import type { Breed } from '../../../prisma/generated/client.ts'

/**
 * สายพันธุ์ — ชิวาวา · เปอร์เซีย
 *
 * **ผูกกับชนิดเสมอ** และชื่อห้ามซ้ำ**ภายในชนิดเดียวกัน ไม่ใช่ทั้งตาราง** — "เปอร์เซีย"
 * เป็นได้ทั้งพันธุ์แมวและพันธุ์กระต่าย และมันคนละพันธุ์กัน
 *
 * **ไม่มี `sortOrder` ต่างจาก `Species`** — พันธุ์หมามีเป็นร้อย ไม่มีใครลากเรียง ·
 * เรียงตามชื่อพอ · ผลคือไม่มี `move` และไม่ต้องยุ่งกับ `lockSortList`
 */

const MODULE = 'breed'
const LABEL = 'สายพันธุ์'
const NAME_MAX = 100

export const BREED_LIST_LIMIT = 1_000

const name = (raw: string) =>
  cleanRequired(raw, { field: 'name', label: `ชื่อ${LABEL}`, max: NAME_MAX })

function refuseDuplicate(e: unknown, value: string): never {
  return asDuplicate(e, {
    message: `มี${LABEL}ชื่อนี้ในชนิดสัตว์นี้อยู่แล้ว`,
    field: 'name',
    value,
  })
}

/** ชนิดที่เลือกต้องมีอยู่จริง — ไม่งั้น FK error หลุดออกไปเป็น 500 */
async function requireSpecies(speciesId: bigint, at: Tx | Db): Promise<void> {
  const found = await at.species.count({ where: { id: speciesId, deletedAt: null } })
  if (found === 0) throw notFound('ไม่พบชนิดสัตว์ที่เลือก', { field: 'speciesId' })
}

export async function findBreed(id: bigint, tx?: Tx): Promise<Breed> {
  const row = await (tx ?? db).breed.findFirst({ where: { id, deletedAt: null } })
  if (!row) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })

  return row
}

export type ListBreedsInput = {
  /** กรองตามชนิด — `undefined` = ทุกชนิด */
  speciesId?: bigint | undefined
  q?: string | undefined
  limit?: number | undefined
}

export async function listBreeds(input: ListBreedsInput = {}, tx?: Tx): Promise<Breed[]> {
  const q = input.q?.trim()

  return (tx ?? db).breed.findMany({
    where: {
      deletedAt: null,
      ...(input.speciesId !== undefined ? { speciesId: input.speciesId } : {}),
      ...(q ? { name: { contains: literal(q) } } : {}),
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: Math.min(input.limit ?? BREED_LIST_LIMIT, BREED_LIST_LIMIT),
  })
}

export type BreedOption = { id: bigint; speciesId: bigint; name: string }

/**
 * สายพันธุ์สำหรับ combobox
 *
 * **พก `speciesId` มาด้วยเสมอ** ไม่ใช่แค่ `id` กับ `name` — หน้าจอต้องกรองพันธุ์ตาม
 * ชนิดที่เลือกไว้ในช่องก่อนหน้า · ไม่มีตัวนี้ ฟอร์มจะโชว์พันธุ์หมาให้คนที่เลือกแมว
 * แล้วฐานจะปฏิเสธตอนกดบันทึก ซึ่งสายเกินไป
 */
export async function lookupBreeds(speciesId?: bigint, tx?: Tx): Promise<BreedOption[]> {
  return (tx ?? db).breed.findMany({
    where: {
      deletedAt: null,
      ...(speciesId !== undefined ? { speciesId } : {}),
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: BREED_LIST_LIMIT,
    select: { id: true, speciesId: true, name: true },
  })
}

export type BreedInput = { speciesId: bigint; name: string }

export async function createBreed(
  input: BreedInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Breed> {
  const value = name(input.name)
  await requireSpecies(input.speciesId, outerTx ?? db)

  try {
    return await inTx(outerTx, async (tx) => {
      const created = await tx.breed.create({
        data: {
          speciesId: input.speciesId,
          name: value,
          createdBy: actorId,
          updatedBy: actorId,
        },
      })

      await writeAudit(tx, {
        action: `${MODULE}.create`,
        module: MODULE,
        recordId: created.id,
        after: { speciesId: Number(created.speciesId), name: created.name },
        userId: actorId,
      })

      return created
    })
  } catch (e) {
    refuseDuplicate(e, value)
  }
}

/**
 * แก้ไข — **ย้ายชนิดได้ แต่เฉพาะตอนที่ยังไม่มีสัตว์ถือพันธุ์นี้อยู่**
 *
 * ย้าย "ชิวาวา" จากหมาไปแมวทั้งที่มีหมา 30 ตัวถือพันธุ์นี้ แปลว่าหมาสามสิบตัวกลายเป็น
 * ข้อมูลที่ขัดกันเอง — และ FK คู่ที่ฐานจะปฏิเสธการอัปเดตนั้นด้วย error ที่อ่านไม่รู้เรื่อง ·
 * ปฏิเสธที่นี่พร้อมบอกจำนวน คนแก้จึงรู้ว่าต้องทำอะไรต่อ
 */
export async function updateBreed(
  id: bigint,
  input: BreedInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Breed> {
  const value = name(input.name)
  const at = outerTx ?? db
  const existing = await findBreed(id, outerTx)

  if (existing.speciesId !== input.speciesId) {
    await requireSpecies(input.speciesId, at)

    const pets = await at.pet.count({ where: { breedId: id, deletedAt: null } })
    if (pets > 0) {
      throw inUse(`ย้ายชนิดของ${LABEL}นี้ไม่ได้ เพราะมีสัตว์ ${pets} ตัวถือพันธุ์นี้อยู่`, {
        field: 'speciesId',
        pets,
      })
    }
  }

  try {
    return await inTx(outerTx, async (tx) => {
      const updated = await tx.breed.update({
        where: { id },
        data: { speciesId: input.speciesId, name: value, updatedBy: actorId },
      })

      const changed = diffFields(
        { speciesId: Number(existing.speciesId), name: existing.name },
        { speciesId: Number(input.speciesId), name: value },
      )

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

export async function deleteBreed(id: bigint, actorId: bigint, outerTx?: Tx): Promise<void> {
  const at = outerTx ?? db
  const existing = await at.breed.findUnique({ where: { id } })
  if (!existing) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })
  if (existing.deletedAt !== null) return

  const pets = await at.pet.count({ where: { breedId: id, deletedAt: null } })
  if (pets > 0) {
    throw inUse(`ลบ${LABEL}นี้ไม่ได้ เพราะมีสัตว์ ${pets} ตัวถือพันธุ์นี้อยู่`, { pets })
  }

  await inTx(outerTx, async (tx) => {
    /**
     * สัตว์ที่ถูกลบไปแล้วเลิกชี้มาที่พันธุ์ที่กำลังจะหายไป
     *
     * `pet.breedId` เป็น nullable จึงปลดได้ ต่างจาก `speciesId` ที่บังคับ · ตัวที่ยังอยู่
     * คือเหตุผลที่ปฏิเสธไปข้างบนแล้ว
     */
    await tx.pet.updateMany({
      where: { breedId: id, deletedAt: { not: null } },
      data: { breedId: null },
    })

    await tx.breed.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: actorId } })

    await writeAudit(tx, {
      action: `${MODULE}.delete`,
      module: MODULE,
      recordId: id,
      before: { speciesId: Number(existing.speciesId), name: existing.name },
      after: null,
      userId: actorId,
    })
  })
}
