import { invalid, notFound } from '../../kit/app-error.ts'
import { diffFields, writeAudit } from '../../kit/audit.ts'
import { db, inTx, type Db, type Tx } from '../../kit/db.ts'
import { duplicateIndexOf } from '../../kit/duplicate.ts'
import { createWithCode, nextCode } from '../../kit/next-code.ts'
import {
  isPhotoTypeAllowed,
  PHOTO_MAX_SIZE,
  removePhoto,
  storePhoto,
} from './pet.storage.ts'
import { cleanOptional, cleanRequired, literal } from '../../kit/text.ts'
import type { Pet, PetSex } from '../../../prisma/generated/client.ts'

/**
 * สัตว์เลี้ยง
 *
 * **เจ้าของบังคับ** — สัตว์ที่ไม่มีเจ้าของคือแถวที่ไม่มีใครติดต่อได้ · เคสฉุกเฉินที่ยัง
 * ไม่รู้ว่าเป็นของใคร **ไม่สร้างแถวนี้** แต่เปิด `Visit` แบบไม่ผูกสัตว์แทน แล้วค่อยผูก
 * ทีหลัง (ดู `visit.service.ts`)
 *
 * **รหัสระบบออกให้** เหมือน `Owner` — เจ้าของไม่ได้ตั้งรหัสให้สัตว์ตัวเอง
 */

const MODULE = 'pet'
const LABEL = 'สัตว์เลี้ยง'

const CODE_PREFIX = 'P'
const CODE_WIDTH = 5

const NAME_MAX = 200
const COLOR_MAX = 200
const MICROCHIP_MAX = 50
const TEXT_MAX = 2_000

export const PET_PAGE_SIZE = 50
export const PET_PAGE_SIZE_MAX = 200

/**
 * น้ำหนักรับเข้ามาเป็น**ข้อความ** ด้วยเหตุผลเดียวกับราคาใน `drug.service.ts` —
 * `Decimal` ที่เดินทางเป็น `number` เสียความแม่น และขนาดยาคิดจากน้ำหนัก
 *
 * ศูนย์และติดลบไม่ผ่าน — ต่างจากราคาที่ศูนย์แปลว่าแจกฟรี · สัตว์หนัก 0 กก. ไม่มี
 */
function cleanWeight(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null

  const value = raw.trim()
  if (value.length === 0) return null

  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw invalid('น้ำหนักต้องเป็นตัวเลข ทศนิยมไม่เกินสองตำแหน่ง', { field: 'weightKg', value })
  }
  if (Number(value) <= 0) {
    throw invalid('น้ำหนักต้องมากกว่า 0', { field: 'weightKg', value })
  }

  return value
}

/** วันที่รับเข้ามาเป็น `YYYY-MM-DD` — เก็บเป็น `@db.Date` ไม่มีเวลา ไม่มี timezone */
function cleanDate(raw: string | null | undefined, field: string, label: string): Date | null {
  if (raw === null || raw === undefined) return null

  const value = raw.trim()
  if (value.length === 0) return null

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw invalid(`${label}ต้องเป็นวันที่ในรูป YYYY-MM-DD`, { field, value })
  }

  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) throw invalid(`${label}ไม่ใช่วันที่ที่มีอยู่จริง`, { field, value })

  return date
}

export async function findPet(id: bigint, tx?: Tx): Promise<Pet> {
  const row = await (tx ?? db).pet.findFirst({ where: { id, deletedAt: null } })
  if (!row) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })

  return row
}

export type ListPetsInput = {
  q?: string | undefined
  /** กรองตามเจ้าของ — ใช้ตอนเปิดหน้าเจ้าของแล้วดูสัตว์ของเขา */
  ownerId?: bigint | undefined
  speciesId?: bigint | undefined
  /** รวมตัวที่เสียชีวิตแล้วด้วยหรือไม่ — ค่าตั้งต้นคือไม่รวม */
  includeDeceased?: boolean | undefined
  page?: number | undefined
  pageSize?: number | undefined
}

function listWhere(input: ListPetsInput) {
  const q = input.q?.trim()

  return {
    deletedAt: null,
    ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
    ...(input.speciesId !== undefined ? { speciesId: input.speciesId } : {}),
    // เสียชีวิตแล้วยังอยู่ในประวัติ แต่ไม่ควรโผล่ในลิสต์ปกติ — คนละเรื่องกับ `deletedAt`
    ...(input.includeDeceased ? {} : { deceasedOn: null }),
    ...(q
      ? {
          OR: [
            { name: { contains: literal(q) } },
            { code: { contains: literal(q) } },
            { microchip: { contains: literal(q) } },
            // ค้นจากชื่อหรือเบอร์เจ้าของได้ด้วย — พนักงานจำชื่อเจ้าของได้แต่ลืมชื่อสัตว์
            { owner: { name: { contains: literal(q) } } },
            { owner: { phone: { contains: literal(q) } } },
          ],
        }
      : {}),
  }
}

function resolvePaging(input: ListPetsInput): { page: number; pageSize: number } {
  return {
    page: Math.max(Math.floor(input.page ?? 1), 1),
    pageSize: Math.min(Math.max(Math.floor(input.pageSize ?? PET_PAGE_SIZE), 1), PET_PAGE_SIZE_MAX),
  }
}

export type ListPetsResult = { rows: Pet[]; page: number; pageSize: number; total: number }

export async function listPets(input: ListPetsInput = {}, tx?: Tx): Promise<ListPetsResult> {
  const { page, pageSize } = resolvePaging(input)
  const at = tx ?? db
  const where = listWhere(input)

  const [rows, total] = await Promise.all([
    at.pet.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    at.pet.count({ where }),
  ])

  return { rows, page, pageSize, total }
}

/** เท่าที่ combobox ต้องรู้ — พก `ownerId` มาเพื่อกรองตามเจ้าของที่เลือกไว้ */
export type PetOption = {
  id: bigint
  code: string
  name: string
  ownerId: bigint
  speciesId: bigint
}

/**
 * สัตว์สำหรับ combobox — **ของเจ้าของคนเดียว**
 *
 * `ownerId` บังคับ ไม่ใช่ optional · ช่องเลือกสัตว์เปิดหลังเลือกเจ้าของเสมอ และการคืน
 * สัตว์ทั้งคลินิกมาให้เลือกคือทางที่พนักงานจะกดผิดตัว แล้วประวัติการรักษาไปอยู่กับ
 * สัตว์ของคนอื่น
 *
 * **ตัวที่เสียชีวิตแล้วไม่มา** — เหตุผลเดียวกับ `isActive` ของยา
 */
export async function lookupPets(ownerId: bigint, tx?: Tx): Promise<PetOption[]> {
  return (tx ?? db).pet.findMany({
    where: { ownerId, deletedAt: null, deceasedOn: null },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: 200,
    select: { id: true, code: true, name: true, ownerId: true, speciesId: true },
  })
}

export type PetInput = {
  ownerId: bigint
  name: string
  speciesId: bigint
  breedId?: bigint | null
  sex?: PetSex | undefined
  isNeutered?: boolean | null
  /** `YYYY-MM-DD` */
  bornOn?: string | null
  /** ข้อความ ไม่ใช่ตัวเลข — ดู `cleanWeight` */
  weightKg?: string | null
  color?: string | null
  microchip?: string | null
  allergyNote?: string | null
  note?: string | null
}

function clean(input: PetInput) {
  return {
    ownerId: input.ownerId,
    name: cleanRequired(input.name, { field: 'name', label: `ชื่อ${LABEL}`, max: NAME_MAX }),
    speciesId: input.speciesId,
    breedId: input.breedId ?? null,
    sex: input.sex ?? ('UNKNOWN' as PetSex),
    isNeutered: input.isNeutered ?? null,
    bornOn: cleanDate(input.bornOn, 'bornOn', 'วันเกิด'),
    weightKg: cleanWeight(input.weightKg),
    color: cleanOptional(input.color, { field: 'color', label: 'สีและตำหนิ', max: COLOR_MAX }),
    microchip: cleanOptional(input.microchip, {
      field: 'microchip',
      label: 'ไมโครชิป',
      max: MICROCHIP_MAX,
    }),
    allergyNote: cleanOptional(input.allergyNote, {
      field: 'allergyNote',
      label: 'ประวัติแพ้ยา',
      max: TEXT_MAX,
    }),
    note: cleanOptional(input.note, { field: 'note', label: 'บันทึก', max: TEXT_MAX }),
  }
}

/**
 * ตรวจว่าเจ้าของ ชนิด และพันธุ์ที่เลือกมามีจริงและเข้ากัน
 *
 * **พันธุ์ต้องเป็นพันธุ์ของชนิดที่เลือก** — ฐานบังคับด้วย FK คู่อยู่แล้ว แต่ error ที่
 * หลุดมาจาก constraint อ่านไม่รู้เรื่อง · ตรวจที่นี่เพื่อบอกว่าช่องไหนผิดและผิดยังไง
 */
async function requireRefs(data: ReturnType<typeof clean>, at: Tx | Db): Promise<void> {
  const [owner, species] = await Promise.all([
    at.owner.count({ where: { id: data.ownerId, deletedAt: null } }),
    at.species.count({ where: { id: data.speciesId, deletedAt: null } }),
  ])

  if (owner === 0) throw notFound('ไม่พบเจ้าของที่เลือก', { field: 'ownerId' })
  if (species === 0) throw notFound('ไม่พบชนิดสัตว์ที่เลือก', { field: 'speciesId' })

  if (data.breedId === null) return

  const breed = await at.breed.findFirst({
    where: { id: data.breedId, deletedAt: null },
    select: { speciesId: true, name: true },
  })
  if (!breed) throw notFound('ไม่พบสายพันธุ์ที่เลือก', { field: 'breedId' })

  if (breed.speciesId !== data.speciesId) {
    throw invalid(`"${breed.name}" ไม่ใช่สายพันธุ์ของชนิดสัตว์ที่เลือก`, { field: 'breedId' })
  }
}

const isCodeClash = (e: unknown) => duplicateIndexOf(e) === 'pet_code_key'

function refuseDuplicate(e: unknown, data: { microchip: string | null }): never {
  if (duplicateIndexOf(e) === 'pet_microchip_live_key') {
    throw invalid('มีสัตว์ที่ใช้ไมโครชิปเลขนี้อยู่แล้ว', {
      field: 'microchip',
      microchip: data.microchip ?? '',
    })
  }

  throw e
}

export async function createPet(input: PetInput, actorId: bigint, outerTx?: Tx): Promise<Pet> {
  const data = clean(input)
  await requireRefs(data, outerTx ?? db)

  try {
    return await createWithCode(
      () => nextCode('pet', CODE_PREFIX, CODE_WIDTH, outerTx ?? db),
      (code) =>
        inTx(outerTx, async (tx) => {
          const created = await tx.pet.create({
            data: { ...data, code, createdBy: actorId, updatedBy: actorId },
          })

          await writeAudit(tx, {
            action: `${MODULE}.create`,
            module: MODULE,
            recordId: created.id,
            after: { code: created.code, name: created.name, ownerId: Number(created.ownerId) },
            userId: actorId,
          })

          return created
        }),
      isCodeClash,
    )
  } catch (e) {
    refuseDuplicate(e, data)
  }
}

export async function updatePet(
  id: bigint,
  input: PetInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Pet> {
  const data = clean(input)
  const existing = await findPet(id, outerTx)
  await requireRefs(data, outerTx ?? db)

  try {
    return await inTx(outerTx, async (tx) => {
      const updated = await tx.pet.update({ where: { id }, data: { ...data, updatedBy: actorId } })

      const changed = diffFields({ ...existing }, { ...data })
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
 * ทำเครื่องหมายว่าเสียชีวิต — **ไม่ใช่การลบ**
 *
 * ประวัติการรักษายังต้องอยู่ และเจ้าของยังกลับมาถามได้ · แค่ไม่โผล่ในช่องเลือกสัตว์
 * ตอนเปิดคิวใหม่ · ส่งค่า `null` เพื่อยกเลิก (กรอกผิดตัว)
 */
export async function setPetDeceased(
  id: bigint,
  deceasedOn: string | null,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Pet> {
  const existing = await findPet(id, outerTx)
  const date = cleanDate(deceasedOn, 'deceasedOn', 'วันที่เสียชีวิต')

  if (date !== null && existing.bornOn !== null && date < existing.bornOn) {
    throw invalid('วันที่เสียชีวิตอยู่ก่อนวันเกิด', { field: 'deceasedOn' })
  }

  const same =
    (existing.deceasedOn === null && date === null) ||
    (existing.deceasedOn !== null && date !== null && existing.deceasedOn.getTime() === date.getTime())
  if (same) return existing

  return inTx(outerTx, async (tx) => {
    const updated = await tx.pet.update({
      where: { id },
      data: { deceasedOn: date, updatedBy: actorId },
    })

    await writeAudit(tx, {
      action: `${MODULE}.set-deceased`,
      module: MODULE,
      recordId: id,
      before: { deceasedOn: existing.deceasedOn },
      after: { deceasedOn: date },
      userId: actorId,
    })

    return updated
  })
}

/**
 * ลบ — soft delete
 *
 * **ปฏิเสธถ้าเคยมาคลินิกแล้ว** · สัตว์ที่มีประวัติการรักษาแล้วลบทิ้ง แปลว่าใบเสร็จเก่า
 * ชี้ไปหาแถวที่หายไป · ตัวที่ตายแล้วใช้ `setPetDeceased` ส่วนตัวที่กรอกผิดตั้งแต่แรก
 * (ยังไม่เคยมา) ลบได้
 */
export async function deletePet(id: bigint, actorId: bigint, outerTx?: Tx): Promise<void> {
  const at = outerTx ?? db
  const existing = await at.pet.findUnique({ where: { id } })
  if (!existing) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })
  if (existing.deletedAt !== null) return

  const visits = await at.visit.count({ where: { petId: id, deletedAt: null } })
  if (visits > 0) {
    throw invalid(`ลบไม่ได้ เพราะมีประวัติการรักษา ${visits} ครั้ง — ใช้ "เสียชีวิต" แทนถ้าสัตว์ตายแล้ว`, {
      field: 'id',
      visits,
    })
  }

  await inTx(outerTx, async (tx) => {
    await tx.pet.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: actorId } })

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

/* ------------------------------------------------------------------ *
 * รูปสัตว์เลี้ยง
 *
 * (ผู้ใช้กำหนด 2026-09-01: "อยากให้มีการอัพโหลดรูปด้วย")
 * ------------------------------------------------------------------ */

/**
 * ตั้งรูปใหม่ — **ลบรูปเก่าออกจากดิสก์ด้วย**
 *
 * ไม่ลบ ไฟล์เก่าจะค้างอยู่ตลอดกาลโดยไม่มีใครอ้างถึง · เจ้าของที่เปลี่ยนรูปสิบครั้ง
 * คือสิบไฟล์ขยะ
 *
 * **ลบไฟล์เก่าหลังคอมมิตแล้วเท่านั้น** — ลบก่อนแล้วทรานแซกชันล้ม จะเหลือแถวที่ชี้ไป
 * ไฟล์ที่ไม่มีอยู่ ซึ่งแย่กว่าไฟล์ขยะที่ไม่มีใครชี้ถึง
 */
export async function setPetPhoto(
  id: bigint,
  file: { mimeType: string; bytes: Uint8Array },
  actorId: bigint,
  outerTx?: Tx,
): Promise<Pet> {
  const existing = await findPet(id, outerTx)

  if (file.bytes.length > PHOTO_MAX_SIZE) {
    throw invalid(`รูปใหญ่เกิน ${Math.floor(PHOTO_MAX_SIZE / 1024 / 1024)} MB`, { field: 'file' })
  }
  if (!isPhotoTypeAllowed(file.mimeType, file.bytes)) {
    throw invalid('รับเฉพาะรูป JPG · PNG · WebP', { field: 'file' })
  }

  const photoPath = await storePhoto(file.mimeType, file.bytes)

  const updated = await inTx(outerTx, async (tx) => {
    const row = await tx.pet.update({
      where: { id },
      data: { photoPath, updatedBy: actorId },
    })

    await writeAudit(tx, {
      action: `${MODULE}.photo`,
      module: MODULE,
      recordId: id,
      before: { photoPath: existing.photoPath },
      after: { photoPath },
      userId: actorId,
    })

    return row
  })

  if (existing.photoPath !== null) await removePhoto(existing.photoPath)

  return updated
}

/** เอารูปออก — คืนแถวที่ `photoPath` เป็น `null` */
export async function clearPetPhoto(
  id: bigint,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Pet> {
  const existing = await findPet(id, outerTx)
  if (existing.photoPath === null) return existing

  const updated = await inTx(outerTx, async (tx) => {
    const row = await tx.pet.update({
      where: { id },
      data: { photoPath: null, updatedBy: actorId },
    })

    await writeAudit(tx, {
      action: `${MODULE}.photo_clear`,
      module: MODULE,
      recordId: id,
      before: { photoPath: existing.photoPath },
      after: { photoPath: null },
      userId: actorId,
    })

    return row
  })

  await removePhoto(existing.photoPath)

  return updated
}
