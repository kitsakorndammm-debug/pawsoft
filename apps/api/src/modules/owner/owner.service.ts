import { SYSTEM_USER_ID } from '../../kit/actor.ts'
import { duplicate, invalid, notFound } from '../../kit/app-error.ts'
import { diffFields, writeAudit } from '../../kit/audit.ts'
import { db, inTx, type Db, type Tx } from '../../kit/db.ts'
import { duplicateIndexOf } from '../../kit/duplicate.ts'
import { createWithCode, nextCode } from '../../kit/next-code.ts'
import { cleanOptional, cleanRequired, literal, normalizePhone } from '../../kit/text.ts'
import type { Owner } from '../../../prisma/generated/client.ts'

/**
 * เจ้าของสัตว์ — **ตัวคน ไม่ใช่บัญชีล็อกอิน**
 *
 * ลูกค้าส่วนใหญ่ไม่มีวันสมัคร Google · เขาเดินเข้ามา บอกเบอร์ แล้วกลับ · แถวนี้จึงมีได้
 * โดยไม่มี `PetOwnerAccount` เลย และการจับคู่เป็นเรื่องที่เกิดทีหลังหรือไม่เกิดเลย
 *
 * **รหัสระบบออกให้ ไม่ใช่คนกรอก** — ไม่มีใครจำรหัสลูกค้าได้ตอนรับสาย และการให้กรอกเอง
 * แปลว่าจะมีคนกรอกซ้ำกัน
 */

const MODULE = 'owner'
const LABEL = 'เจ้าของสัตว์'

const CODE_PREFIX = 'C'
const CODE_WIDTH = 5

const NAME_MAX = 200
const PHONE_MAX = 30
const EMAIL_MAX = 255
const ADDRESS_MAX = 500
const NOTE_MAX = 2_000

export const OWNER_PAGE_SIZE = 50
export const OWNER_PAGE_SIZE_MAX = 200

export async function findOwner(id: bigint, tx?: Tx): Promise<Owner> {
  const row = await (tx ?? db).owner.findFirst({ where: { id, deletedAt: null } })
  if (!row) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })

  return row
}

export type ListOwnersInput = {
  q?: string | undefined
  page?: number | undefined
  pageSize?: number | undefined
  /**
   * กรองด้วยสถานะเชื่อมบัญชี Google — `true` = ลงทะเบียนแล้ว (มี `petOwnerAccountId`)
   * `false` = ยังไม่ได้ลงทะเบียน (พนักงานสร้างให้ตอนมาครั้งแรก) · ไม่ส่งมา = ทั้งสองกลุ่ม
   * (ผู้ใช้ตัดสิน 2026-09-08)
   */
  linked?: boolean | undefined
}

function listWhere(input: ListOwnersInput) {
  const q = input.q?.trim()

  return {
    deletedAt: null,
    ...(input.linked === undefined
      ? {}
      : { petOwnerAccountId: input.linked ? { not: null } : null }),
    ...(q
      ? {
          /**
           * ค้นสามช่อง — **เบอร์มาก่อนชื่อในลำดับความสำคัญ**
           *
           * คำถามแรกตอนรับสายคือ "เบอร์อะไร" ไม่ใช่ "ชื่ออะไร" เพราะชื่อซ้ำกันได้และ
           * สะกดผิดได้ · รหัสอยู่ด้วยเพราะลูกค้าเก่าถือบัตรมา
           */
          OR: [
            { phone: { contains: literal(q) } },
            { phoneAlt: { contains: literal(q) } },
            { name: { contains: literal(q) } },
            { code: { contains: literal(q) } },
          ],
        }
      : {}),
  }
}

function resolvePaging(input: ListOwnersInput): { page: number; pageSize: number } {
  return {
    page: Math.max(Math.floor(input.page ?? 1), 1),
    pageSize: Math.min(
      Math.max(Math.floor(input.pageSize ?? OWNER_PAGE_SIZE), 1),
      OWNER_PAGE_SIZE_MAX,
    ),
  }
}

export type ListOwnersResult = { rows: Owner[]; page: number; pageSize: number; total: number }

export async function listOwners(input: ListOwnersInput = {}, tx?: Tx): Promise<ListOwnersResult> {
  const { page, pageSize } = resolvePaging(input)
  const at = tx ?? db
  const where = listWhere(input)

  const [rows, total] = await Promise.all([
    at.owner.findMany({
      where,
      // ใหม่สุดขึ้นก่อน — คนที่เพิ่งเพิ่มคือคนที่กำลังยืนอยู่ตรงหน้า
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    at.owner.count({ where }),
  ])

  return { rows, page, pageSize, total }
}

/** เท่าที่ combobox ต้องรู้ — พก `phone` มาด้วยเพราะชื่อซ้ำกันได้และเบอร์คือตัวแยก */
export type OwnerOption = { id: bigint; code: string; name: string; phone: string | null }

/**
 * เจ้าของสำหรับ combobox
 *
 * **ต้องมีคำค้นเสมอ ไม่คืนทั้งตาราง** — ต่างจาก `lookupDrugs` ที่โหลดทั้งชุดได้เพราะยา
 * มีหลักร้อย · ลูกค้าคลินิกมีหลักหมื่นและโตขึ้นทุกวัน · โหลดทั้งชุดคือหน้าที่ค้างตอน
 * เปิดและ payload ที่โตขึ้นเรื่อย ๆ จนวันหนึ่งพัง โดยไม่มีใครสังเกตว่ามันเริ่มช้าตั้งแต่เมื่อไหร่
 */
export async function lookupOwners(q: string, tx?: Tx): Promise<OwnerOption[]> {
  const term = q.trim()
  if (term.length === 0) return []

  return (tx ?? db).owner.findMany({
    where: listWhere({ q: term }),
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: 50,
    select: { id: true, code: true, name: true, phone: true },
  })
}

export type OwnerInput = {
  name: string
  phone?: string | null
  phoneAlt?: string | null
  email?: string | null
  address?: string | null
  note?: string | null
}

/** เบอร์ที่ทำให้เป็นตัวเลขล้วนแล้ว — `null` เมื่อไม่ได้กรอก */
function phoneOrNull(raw: string | null | undefined): string | null {
  const value = cleanOptional(raw, { field: 'phone', label: 'เบอร์โทร', max: PHONE_MAX })
  if (value === null) return null

  const digits = normalizePhone(value)

  return digits.length === 0 ? null : digits
}

function clean(input: OwnerInput) {
  return {
    name: cleanRequired(input.name, { field: 'name', label: 'ชื่อ', max: NAME_MAX }),
    /**
     * **เก็บเป็นตัวเลขล้วนเสมอ ไม่ว่าคนกรอกจะพิมพ์มาแบบไหน**
     *
     * (ผู้ใช้กำหนด 2026-09-01) · ทำที่นี่ที่เดียวแปลว่าทุกเส้นทางที่เขียน `owner`
     * ได้รูปเดียวกัน — พนักงานสร้าง · พนักงานแก้ · ลูกค้าสมัครเอง
     *
     * จำเป็นกับ `owner_phone_live_key` ด้วย — ดู `normalizePhone`
     */
    phone: phoneOrNull(input.phone),
    phoneAlt: phoneOrNull(input.phoneAlt),
    email: cleanOptional(input.email, { field: 'email', label: 'อีเมล', max: EMAIL_MAX }),
    address: cleanOptional(input.address, { field: 'address', label: 'ที่อยู่', max: ADDRESS_MAX }),
    note: cleanOptional(input.note, { field: 'note', label: 'บันทึก', max: NOTE_MAX }),
  }
}

const isCodeClash = (e: unknown) => duplicateIndexOf(e) === 'owner_code_key'

/**
 * เบอร์ชนกับลูกค้าคนอื่น — **ข้อความต้องบอกว่าทำอะไรต่อได้**
 *
 * `owner_phone_live_key` เป็นด่านจริง · ที่นี่แค่แปลงให้อ่านรู้เรื่อง · error ดิบของ
 * Postgres บอกชื่อ index ซึ่งไม่มีความหมายกับพนักงานที่กำลังกรอกฟอร์มอยู่
 */
function rethrowPhoneClash(e: unknown): never {
  if (duplicateIndexOf(e) === 'owner_phone_live_key') {
    throw duplicate('เบอร์นี้มีลูกค้าใช้อยู่แล้ว — ค้นหาด้วยเบอร์เพื่อเปิดข้อมูลเดิม', {
      field: 'phone',
    })
  }

  throw e
}

export async function createOwner(
  input: OwnerInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Owner> {
  const data = clean(input)

  try {
    return await createWithCode(
    () => nextCode('owner', CODE_PREFIX, CODE_WIDTH, outerTx ?? db),
    (code) =>
      inTx(outerTx, async (tx) => {
        const created = await tx.owner.create({
          data: { ...data, code, createdBy: actorId, updatedBy: actorId },
        })

        await writeAudit(tx, {
          action: `${MODULE}.create`,
          module: MODULE,
          recordId: created.id,
          after: { code: created.code, name: created.name, phone: created.phone },
          userId: actorId,
        })

        return created
      }),
    isCodeClash,
    )
  } catch (e) {
    rethrowPhoneClash(e)
  }
}

export async function updateOwner(
  id: bigint,
  input: OwnerInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Owner> {
  const data = clean(input)
  const existing = await findOwner(id, outerTx)

  try {
    return await inTx(outerTx, async (tx) => {
    const updated = await tx.owner.update({ where: { id }, data: { ...data, updatedBy: actorId } })
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
    rethrowPhoneClash(e)
  }
}

/**
 * จับคู่บัญชี Google — **งานของพนักงาน ไม่ใช่ของระบบ**
 *
 * (ผู้ใช้กำหนด 2026-09-01: "พนักงานจะสามารถจับคู่ภายหลังได้ เผื่อกรณีครั้งแรกลูกค้ามา
 * หน้างานแล้วไปสมัครทีหลัง")
 *
 * **ไม่จับคู่อัตโนมัติด้วยอีเมล** ทั้งที่ทำได้ — อีเมลที่ตรงกันไม่ได้แปลว่าเป็นคนเดียวกัน
 * (คนในบ้านเดียวกันใช้อีเมลเดียวกันพาสัตว์คนละตัวมา) และผลของการเดาผิดคือคนแปลกหน้า
 * เห็นประวัติสัตว์ของคนอื่น · ให้คนที่คุยกับลูกค้าอยู่ตรงหน้าเป็นคนยืนยัน
 */
export async function linkOwnerAccount(
  id: bigint,
  petOwnerAccountId: bigint | null,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Owner> {
  const existing = await findOwner(id, outerTx)
  if (existing.petOwnerAccountId === petOwnerAccountId) return existing

  const at = outerTx ?? db

  if (petOwnerAccountId !== null) {
    const account = await at.petOwnerAccount.findUnique({
      where: { id: petOwnerAccountId },
      select: { id: true, email: true },
    })
    if (!account) throw notFound('ไม่พบบัญชีนี้', { field: 'petOwnerAccountId' })

    /**
     * บัญชีนี้ถูกจับคู่กับคนอื่นไปแล้วหรือยัง — **ตรวจก่อนเพื่อบอกว่าไปอยู่กับใคร**
     *
     * `@unique` กันไว้อยู่แล้ว แต่ข้อความที่หลุดมาจาก constraint บอกได้แค่ว่าซ้ำ ·
     * พนักงานที่เห็น "บัญชีนี้ผูกกับ C0042 สมหญิง อยู่แล้ว" รู้ทันทีว่าต้องไปถอนที่ไหน
     */
    const taken = await at.owner.findFirst({
      where: { petOwnerAccountId, deletedAt: null, NOT: { id } },
      select: { code: true, name: true },
    })
    if (taken) {
      throw duplicate(`บัญชีนี้ผูกกับ ${taken.code} ${taken.name} อยู่แล้ว`, {
        field: 'petOwnerAccountId',
        ownerCode: taken.code,
      })
    }
  }

  return inTx(outerTx, async (tx) => {
    const updated = await tx.owner.update({
      where: { id },
      data: { petOwnerAccountId, updatedBy: actorId },
    })

    await writeAudit(tx, {
      action: `${MODULE}.${petOwnerAccountId === null ? 'unlink' : 'link'}-account`,
      module: MODULE,
      recordId: id,
      before: { petOwnerAccountId: existing.petOwnerAccountId },
      after: { petOwnerAccountId },
      userId: actorId,
    })

    return updated
  })
}

/**
 * ลบ — soft delete
 *
 * **ปฏิเสธถ้ายังมีสัตว์อยู่** · เจ้าของที่หายไปแต่สัตว์ยังอยู่ คือแถวที่ไม่มีใคร
 * ติดต่อได้และไม่มีใครรู้ว่าทำไม · ให้ลบสัตว์ก่อน หรือย้ายไปเจ้าของคนอื่น
 */
export async function deleteOwner(id: bigint, actorId: bigint, outerTx?: Tx): Promise<void> {
  const at = outerTx ?? db
  const existing = await at.owner.findUnique({ where: { id } })
  if (!existing) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })
  if (existing.deletedAt !== null) return

  const pets = await at.pet.count({ where: { ownerId: id, deletedAt: null } })
  if (pets > 0) {
    throw invalid(`ยังมีสัตว์เลี้ยง ${pets} ตัวอยู่กับ${LABEL}นี้ — ย้ายหรือลบสัตว์ก่อน`, {
      field: 'id',
      pets,
    })
  }

  await inTx(outerTx, async (tx) => {
    await tx.owner.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: actorId } })

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

/** บัญชี Google เท่าที่หน้าเชื่อมบัญชีต้องรู้ */
export type UnlinkedAccount = { id: bigint; email: string; displayName: string }

/**
 * บัญชี Google ที่**ยังไม่ถูกจับคู่กับใคร**
 *
 * `owner: null` คือเงื่อนไขทั้งหมด — `Owner.petOwnerAccountId` เป็น `@unique` และ
 * relation ฝั่งนี้จึงเป็น 0..1 · บัญชีที่มี `owner` แล้วคือบัญชีที่จับคู่ไปแล้ว
 *
 * **ค้นจากอีเมลและชื่อ** ที่ Google ส่งมา · ต้องมีคำค้นเสมอ ด้วยเหตุผลเดียวกับ
 * `lookupOwners` — รายชื่ออีเมลทั้งหมดไม่ใช่ของที่ควรส่งออกไปทั้งชุด
 */
export async function lookupUnlinkedAccounts(
  q: string,
  tx?: Tx,
): Promise<UnlinkedAccount[]> {
  const term = q.trim()
  if (term.length === 0) return []

  return (tx ?? db).petOwnerAccount.findMany({
    where: {
      owner: null,
      suspendedAt: null,
      OR: [
        { email: { contains: literal(term) } },
        { displayName: { contains: literal(term) } },
      ],
    },
    orderBy: [{ email: 'asc' }, { id: 'asc' }],
    take: 30,
    select: { id: true, email: true, displayName: true },
  })
}

/* ------------------------------------------------------------------ *
 * ลูกค้าสมัครเอง — ไม่เคยมาคลินิกมาก่อน
 *
 * (ผู้ใช้ทักท้วง 2026-09-01: "ไม่ใช่ลูกค้าทุกคนที่จะเคยมาคลินิกนะ")
 * ------------------------------------------------------------------ */

/**
 * สร้างแถว `owner` ให้บัญชี Google ที่ยังไม่มีตัวตนในระบบ — **ลูกค้ากรอกเอง**
 *
 * **`createdBy` เป็น `SYSTEM_USER_ID` ไม่ใช่พนักงานคนไหน** · ไม่มีพนักงานอยู่ในเหตุการณ์
 * นี้เลย · ใส่ id ของพนักงานสักคนลงไปแปลว่าโกหกว่าเขาเป็นคนสร้าง แล้ววันที่ต้องสืบว่า
 * ข้อมูลนี้มาจากไหน จะได้คำตอบที่ผิด
 *
 * **ผูก `petOwnerAccountId` ทันทีในทรานแซกชันเดียวกัน** — แยกเป็นสองขั้นแปลว่ามีช่วง
 * ที่แถวลอยอยู่โดยไม่มีเจ้าของ ถ้าขั้นที่สองพัง
 */
export async function selfRegisterOwner(
  input: { name: string; phone: string },
  accountId: bigint,
  outerTx?: Tx,
): Promise<Owner> {
  // กันสมัครซ้ำ — บัญชีหนึ่งมี owner ได้ใบเดียว (`pet_owner_account_id` เป็น unique)
  const existing = await (outerTx ?? db).owner.findFirst({
    where: { petOwnerAccountId: accountId, deletedAt: null },
  })
  if (existing !== null) return existing

  /**
   * **เบอร์บังคับที่นี่ — ต่างจากลูกค้าที่พนักงานสร้างให้**
   *
   * (ผู้ใช้กำหนด 2026-09-01: "เบอร์บังคับด้วยสิ")
   *
   * `createOwner` ปล่อยว่างได้เพราะคนที่เดินเข้ามาหน้าเคาน์เตอร์ยืนอยู่ตรงนั้นจริง ๆ ·
   * แต่คนที่จองออนไลน์ไม่มีใครเห็นหน้า และการจองทุกใบต้องรอพนักงานโทรยืนยัน ·
   * ไม่มีเบอร์แปลว่าใบนั้นค้างอยู่ตลอดกาลโดยไม่มีทางติดต่อกลับได้เลย
   */
  const phone = normalizePhone(
    cleanRequired(input.phone, { field: 'phone', label: 'เบอร์โทร', max: PHONE_MAX }),
  )

  /**
   * ตรวจแค่ว่าเป็นตัวเลขและยาวพอ — **ไม่บังคับรูปแบบตายตัว**
   *
   * คนกรอกกันคนละแบบ (`08x-xxx-xxxx` · เว้นวรรค · ติดกันหมด) และเบอร์บ้านต่างจังหวัด
   * ก็สั้นกว่ามือถือ · บังคับรูปแบบเป๊ะ ๆ จะปฏิเสธเบอร์ที่ใช้ได้จริง
   */
  if (phone.length < 9) {
    throw invalid('เบอร์โทรไม่ถูกต้อง — กรอกให้ครบทุกหลัก', { field: 'phone', value: phone })
  }

  /**
   * **เบอร์ตรงกับลูกค้าเดิม → เชื่อมบัญชีให้เลย ไม่สร้างแถวใหม่**
   *
   * (ผู้ใช้กำหนด 2026-09-01: "เบอร์จะเป็น unique ในระบบของลูกค้านะ ถ้าเกิด login
   * google เข้ามาแล้วใส่เบอร์ตรงก็จะเชื่อมข้อมูลให้เองเลย")
   *
   * คนที่เคยพาสัตว์มารักษาแล้วเพิ่งมาสมัครออนไลน์ จะเห็นประวัติเดิม · สัตว์เดิม ·
   * บิลเดิมทันที โดยไม่ต้องรอพนักงานจับคู่ให้
   *
   * **ไม่แตะแถวที่มีบัญชีอื่นผูกอยู่แล้ว** — นั่นแปลว่าเบอร์นั้นถูกใช้ยืนยันตัวตน
   * ไปแล้วโดยบัญชีอื่น · ทับลงไปคือการยึดบัญชีคนอื่น · ปล่อยให้ตกไปที่ `create`
   * แล้ว `owner_phone_live_key` จะปฏิเสธ พร้อมข้อความให้ติดต่อคลินิก
   *
   * **ไม่ทับชื่อเดิมด้วย** · ชื่อในระบบคือชื่อที่พนักงานกรอกจากบัตรจริง · ชื่อบัญชี
   * Google เป็นชื่อเล่นหรือชื่ออังกฤษได้ และไม่ควรไปแทนที่ของเดิม
   */
  const sameLine = await (outerTx ?? db).owner.findFirst({
    where: { phone, deletedAt: null },
    select: { id: true, petOwnerAccountId: true },
  })

  if (sameLine !== null && sameLine.petOwnerAccountId === null) {
    return inTx(outerTx, async (tx) => {
      const linked = await tx.owner.update({
        where: { id: sameLine.id },
        data: { petOwnerAccountId: accountId, updatedBy: SYSTEM_USER_ID },
      })

      await writeAudit(tx, {
        action: `${MODULE}.self_link`,
        module: MODULE,
        recordId: linked.id,
        before: { petOwnerAccountId: null },
        after: { petOwnerAccountId: Number(accountId), matchedBy: 'phone' },
        userId: SYSTEM_USER_ID,
      })

      return linked
    })
  }

  /**
   * เบอร์นี้มีบัญชีอื่นผูกไว้แล้ว — **ปฏิเสธพร้อมบอกทางออก**
   *
   * ปล่อยให้ไปตกที่ unique index ก็ได้ แต่ข้อความจะเป็น "เบอร์นี้มีลูกค้าใช้อยู่แล้ว"
   * ซึ่งชวนให้ลูกค้าคิดว่ากรอกผิด · ที่จริงคือเบอร์ถูกต้องแต่มีคนสมัครไปก่อนแล้ว
   * และทางออกคือโทรหาคลินิก ไม่ใช่กรอกใหม่
   */
  if (sameLine !== null && sameLine.petOwnerAccountId !== null) {
    throw duplicate('เบอร์นี้ผูกกับบัญชีอื่นแล้ว — ติดต่อคลินิกเพื่อตรวจสอบ', {
      field: 'phone',
    })
  }

  const data = clean({ name: input.name, phone })

  try {
    return await createWithCode(
    () => nextCode('owner', CODE_PREFIX, CODE_WIDTH, outerTx ?? db),
    (code) =>
      inTx(outerTx, async (tx) => {
        const created = await tx.owner.create({
          data: {
            ...data,
            code,
            petOwnerAccountId: accountId,
            createdBy: SYSTEM_USER_ID,
            updatedBy: SYSTEM_USER_ID,
          },
        })

        await writeAudit(tx, {
          action: `${MODULE}.self_register`,
          module: MODULE,
          recordId: created.id,
          after: { code: created.code, name: created.name, phone: created.phone },
          userId: SYSTEM_USER_ID,
        })

        return created
      }),
      isCodeClash,
    )
  } catch (e) {
    rethrowPhoneClash(e)
  }
}

/**
 * ลูกค้าที่ถือเบอร์นี้ — **คืนได้ไม่เกินหนึ่งคน**
 *
 * เดิมชื่อ `ownersSharingPhone` และคืนเป็นลิสต์ เพราะตอนนั้นเบอร์ซ้ำกันได้ ·
 * ตั้งแต่มี `owner_phone_live_key` เบอร์ชี้ไปลูกค้าได้คนเดียว (ผู้ใช้กำหนด 2026-09-01)
 * ฟังก์ชันที่คืนลิสต์จึงหลอกให้คนอ่านคิดว่ายังมีหลายคนได้
 */
export async function ownerByPhone(
  phone: string,
  at: Tx | Db = db,
): Promise<{ id: bigint; code: string; name: string } | null> {
  const value = normalizePhone(phone.trim())
  if (value.length === 0) return null

  return at.owner.findFirst({
    where: { phone: value, deletedAt: null },
    select: { id: true, code: true, name: true },
  })
}
