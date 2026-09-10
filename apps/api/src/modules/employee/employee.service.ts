import { invalid, notFound } from '../../kit/app-error.ts'
import { diffFields, writeAudit } from '../../kit/audit.ts'
import { db, inTx, type Db, type Tx } from '../../kit/db.ts'
import { asDuplicate } from '../../kit/duplicate.ts'
import { cleanOptional, cleanRequired, literal } from '../../kit/text.ts'
import { findUserByEmployee, suspendUser } from '../user/user.service.ts'
import { WorkStatus, type Employee } from '../../../prisma/generated/client.ts'

/**
 * พนักงาน
 *
 * **ไม่ใช่ทะเบียน** — ต่างกันห้าอย่าง: ตัวระบุคือ `code` ไม่ใช่ `name` · `code` unique
 * เต็มตาราง ไม่ใช่เฉพาะแถวที่ยังอยู่ · ชื่อแยกสามช่อง · มี FK สี่ตัว ไม่ใช่ตัวเดียว ·
 * และไม่มี `sortOrder` เพราะไม่มีใครลากจัดลำดับคน
 *
 * ผลของข้อสุดท้าย: ไม่มี `move` และ `list` แบ่งหน้าได้ ต่างจากทะเบียนที่คืนทั้งหมด
 */

const MODULE = 'employee'

const CODE_MAX = 30
const NAME_MAX = 100
const NICKNAME_MAX = 50
const PHONE_MAX = 30
const EMAIL_MAX = 255

/**
 * รูปเดียวกับ `employee_email_shape_check` ใน `sql/parts/03-org.sql`
 *
 * ต้องเช็คซ้ำที่นี่ — ไม่งั้นอีเมลที่พิมพ์ผิดหลุดไปโดน CHECK ที่ฐานปฏิเสธ ซึ่งออกไปเป็น
 * 500 แทนที่จะเป็นข้อความบอกว่าอีเมลไม่ถูกต้อง (แบบเดียวกับ `requireLinks`)
 */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

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

/** อีเมล — ไม่บังคับ · ต้องมีรูปเป็นอีเมลถ้ากรอกมา (ดู `EMAIL_SHAPE`) */
function cleanEmail(raw: string | null | undefined): string | null {
  const value = cleanOptional(raw, { field: 'email', label: 'อีเมล', max: EMAIL_MAX })
  if (value === null) return null

  if (!EMAIL_SHAPE.test(value)) throw invalid('อีเมลไม่ถูกต้อง', { field: 'email', value })

  return value
}

/**
 * เพดานของบันทึกอิสระ — **ฐานไม่จำกัด เพดานอยู่ที่นี่** (ผู้ใช้ตัดสิน 2026-08-26)
 *
 * คอลัมน์เป็น `Text` เพราะไม่มีความยาวที่ตอบได้ว่าพอสำหรับบันทึกเรื่องคน · แต่ไม่มีเพดาน
 * เลยแปลว่าใครก็วางไฟล์ทั้งไฟล์ลงช่องนี้ได้ แล้วทุกหน้าที่โหลดพนักงานต้องแบกมันไปด้วย
 */
const NOTE_MAX = 5_000

/** ขนาดหน้าเริ่มต้นและเพดาน — ขอมากกว่านี้ได้ แต่ไม่เกินนี้ */
export const EMPLOYEE_PAGE_SIZE = 50
export const EMPLOYEE_PAGE_SIZE_MAX = 200

/**
 * รหัสที่ซ้ำคือการปฏิเสธ ไม่ใช่ 500
 *
 * `employee_code_uniq` ไม่มี `WHERE` ต่างจากทุกตารางทะเบียน — รหัสยังถูกจองไว้หลังแถว
 * ถูก soft delete เพราะการยกรหัสของคนที่ลาออกให้คนใหม่ ทำให้ประวัติสองคนอ่านเป็นคนเดียว
 */
function refuseDuplicate(e: unknown, code: string): never {
  return asDuplicate(e, { message: 'มีพนักงานรหัสนี้อยู่แล้ว', field: 'code', value: code })
}

/** FK ทั้งสี่ตัว — ชื่อคอลัมน์ คำไทย และวิธีถามว่ามีอยู่จริงไหม */
const LINKS = [
  {
    field: 'departmentId',
    label: 'แผนก',
    count: (id: bigint, at: Tx | Db) => at.department.count({ where: { id, deletedAt: null } }),
  },
  {
    field: 'positionId',
    label: 'ตำแหน่ง',
    count: (id: bigint, at: Tx | Db) => at.position.count({ where: { id, deletedAt: null } }),
  },
] as const

/**
 * ตำแหน่งต้องอยู่ในแผนกที่เลือก — **ตรงกันเป๊ะทั้งสองทาง**
 *
 * `Position.departmentId` เป็นข้อห้าม ไม่ใช่คำตอบ (`///` บน `Employee.departmentId`) ·
 * กฎนี้เขียนไว้ตั้งแต่ขั้น schema แต่ไม่มีใครบังคับจนถึงตอนนี้ — ยิง API ตรงแล้วผ่าน
 * (วัดจริง 2026-08-26)
 *
 * | แผนกของพนักงาน | ตำแหน่งที่ใส่ได้ |
 * |---|---|
 * | `null` | เฉพาะตำแหน่งที่ไม่สังกัดแผนก |
 * | แผนก A | เฉพาะตำแหน่งของแผนก A |
 *
 * **ตำแหน่งกลางไม่ใช่ตัวผ่านทุกแผนก** (ผู้ใช้ตัดสิน 2026-08-26) — คนที่มีแผนกแล้ว
 * ต้องมีตำแหน่งของแผนกนั้น · ปล่อยให้ใส่ตำแหน่งกลางได้ แปลว่าคำถาม "ใครอยู่แผนกนี้บ้าง"
 * ตอบได้ แต่ "แผนกนี้มีตำแหน่งอะไรบ้าง" ตอบไม่ได้
 *
 * ไม่ใส่ตำแหน่งเลย (`null`) ผ่านเสมอ — คนเข้าใหม่มีอยู่ก่อนที่จะมีตำแหน่ง
 */
async function requirePositionInDepartment(
  departmentId: bigint | null,
  positionId: bigint | null,
  at: Tx | Db,
): Promise<void> {
  if (positionId === null) return

  const position = await at.position.findFirst({
    where: { id: positionId, deletedAt: null },
    select: { departmentId: true },
  })
  // ตำแหน่งที่ไม่มีอยู่จริง เป็นเรื่องของ `requireLinks` ไม่ใช่ของที่นี่
  if (!position) return

  if (position.departmentId === departmentId) return

  throw invalid(
    departmentId === null
      ? 'ตำแหน่งนี้สังกัดแผนก — เลือกแผนกให้ตรงกัน หรือเลือกตำแหน่งที่ไม่สังกัดแผนก'
      : 'ตำแหน่งนี้ไม่ได้อยู่ในแผนกที่เลือก',
    {
      field: 'positionId',
      departmentId: departmentId === null ? null : String(departmentId),
      positionDepartmentId:
        position.departmentId === null ? null : String(position.departmentId),
    },
  )
}

/**
 * ตรวจว่าทุกตัวที่ส่งมามีอยู่จริงและยังไม่ถูกลบ
 *
 * ไม่ตรวจแล้วฐานปฏิเสธด้วย FK error ซึ่งเดินทางออกไปเป็น 500 — คนกรอกฟอร์มเห็น
 * "ระบบขัดข้อง" แทนที่จะรู้ว่าสาขาที่เลือกไว้ถูกปิดไปแล้วระหว่างที่ฟอร์มเปิดอยู่
 */
async function requireLinks(
  values: Record<string, bigint | null>,
  at: Tx | Db,
): Promise<void> {
  for (const link of LINKS) {
    const id = values[link.field]
    if (id === null || id === undefined) continue

    if ((await link.count(id, at)) === 0) {
      throw notFound(`ไม่พบ${link.label}ที่เลือก`, { field: link.field, [link.field]: String(id) })
    }
  }
}

/**
 * อ่านพนักงานทีละคน
 *
 * ลิสต์ตอบว่า "ใครบ้าง" ตัวนี้ตอบว่า "คนนี้เป็นใคร" — หน้าจอแก้ไขที่เปิดจากลิงก์หรือ
 * ถูกรีเฟรชกลางคัน ต้องได้ข้อมูลคนเดียวโดยไม่ต้องดึงทั้งลิสต์มากรองเอง
 *
 * **คนที่ถูกลบตอบเหมือนคนที่ไม่มีอยู่** — แถวยังอยู่ให้ `createdBy` ของเอกสารเก่าชี้ถึง
 * แต่ไม่ใช่ของที่หน้าจอเปิดมาแก้ได้ · ส่วนคนที่พ้นสภาพยังอ่านได้ เพราะต้องมีใครสักคน
 * เปิดดูได้ว่าใครออกไป และคืนสภาพจากตรงนั้น
 */
export async function findEmployee(id: bigint, tx?: Tx): Promise<Employee> {
  const row = await (tx ?? db).employee.findFirst({ where: { id, deletedAt: null } })
  if (!row) throw notFound('ไม่พบพนักงานคนนี้', { id: String(id) })

  return row
}

export type ListEmployeesInput = {
  /** ค้นจากรหัส ชื่อ นามสกุล หรือชื่อเล่น — คำเดียว ไม่ตัดคำ */
  q?: string | undefined
  /** หน้าที่เท่าไหร่ นับจาก 1 */
  page?: number | undefined
  pageSize?: number | undefined
}

export type ListEmployeesResult = {
  rows: Employee[]
  page: number
  pageSize: number
  /** จำนวนแถวทั้งหมดที่ตรงเงื่อนไข ไม่ใช่จำนวนในหน้านี้ */
  total: number
}

/**
 * ดูรายการพนักงาน — แบ่งหน้า
 *
 * ต่างจากทะเบียนที่คืนทั้งหมด เพราะพนักงานเป็นร้อยและไม่มีใครลากจัดลำดับ
 *
 * `?q=` ค้นสี่คอลัมน์พร้อมกันด้วย OR — คนหาพนักงานด้วยรหัสบ้าง ชื่อเล่นบ้าง แล้วแต่ว่า
 * จำอะไรได้ · **ค้นทีละคำ** พิมพ์ "สมชาย ใจดี" จะไม่เจอ เพราะไม่มีคอลัมน์ไหนเก็บทั้งก้อน
 * (ผู้ใช้ตัดสิน 2026-08-26)
 */
export async function listEmployees(
  input: ListEmployeesInput = {},
  tx?: Tx,
): Promise<ListEmployeesResult> {
  const q = input.q?.trim()
  const page = Math.max(1, Math.floor(input.page ?? 1))
  const pageSize = Math.min(
    Math.max(1, Math.floor(input.pageSize ?? EMPLOYEE_PAGE_SIZE)),
    EMPLOYEE_PAGE_SIZE_MAX,
  )

  const where = {
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { code: { contains: literal(q) } },
            { firstName: { contains: literal(q) } },
            { lastName: { contains: literal(q) } },
            { nickname: { contains: literal(q) } },
          ],
        }
      : {}),
  }

  const at = tx ?? db

  // Counted in the same query round as the page, so the total and the rows describe
  // the same moment.
  const [rows, total] = await Promise.all([
    at.employee.findMany({
      where,
      // No sortOrder on this table: newest first is the order a list of people reads
      // in, and id is unique so the order never wobbles.
      orderBy: { id: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    at.employee.count({ where }),
  ])

  return { rows, page, pageSize, total }
}

export type CreateEmployeeInput = {
  code: string
  firstName: string
  lastName: string
  nickname?: string | null
  /** บันทึกอิสระ · `null` หรือช่องว่างล้วน = ล้างทิ้ง */
  note?: string | null
  phone?: string | null
  email?: string | null
  /** วันที่เริ่มงาน — รูป `YYYY-MM-DD` · `null` หรือช่องว่างล้วน = ยังไม่ได้กรอก */
  hiredAt?: string | null
  departmentId?: bigint | null
  positionId?: bigint | null
}

export async function createEmployee(
  input: CreateEmployeeInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Employee> {
  const code = cleanRequired(input.code, { field: 'code', label: 'รหัสพนักงาน', max: CODE_MAX })
  const firstName = cleanRequired(input.firstName, { field: 'firstName', label: 'ชื่อ', max: NAME_MAX })
  const lastName = cleanRequired(input.lastName, { field: 'lastName', label: 'นามสกุล', max: NAME_MAX })
  const nickname = cleanOptional(input.nickname, { field: 'nickname', label: 'ชื่อเล่น', max: NICKNAME_MAX })
  const note = cleanOptional(input.note, { field: 'note', label: 'บันทึก', max: NOTE_MAX })
  const phone = cleanOptional(input.phone, { field: 'phone', label: 'เบอร์โทร', max: PHONE_MAX })
  const email = cleanEmail(input.email)
  const hiredAt = cleanDate(input.hiredAt, 'hiredAt', 'วันที่เริ่มงาน')

  const links = {
    departmentId: input.departmentId ?? null,
    positionId: input.positionId ?? null,
  }

  await requireLinks(links, outerTx ?? db)
  await requirePositionInDepartment(links.departmentId, links.positionId, outerTx ?? db)

  try {
    return await inTx(outerTx, async (tx) => {
      const created = await tx.employee.create({
        data: {
          code,
          firstName,
          lastName,
          nickname,
          note,
          phone,
          email,
          hiredAt,
          ...links,
          createdBy: actorId,
          updatedBy: actorId,
        },
      })

      await writeAudit(tx, {
        action: `${MODULE}.create`,
        module: MODULE,
        recordId: created.id,
        after: { code, firstName, lastName, nickname, note, phone, email, hiredAt, ...links },
        userId: actorId,
      })

      return created
    })
  } catch (e) {
    refuseDuplicate(e, code)
  }
}

export type UpdateEmployeeInput = CreateEmployeeInput

/**
 * แก้ไขพนักงาน
 *
 * **`code` แก้ได้** เป็นฟิลด์ธรรมดา ห้ามซ้ำเท่านั้น (ผู้ใช้ตัดสิน 2026-08-26)
 *
 * **ไม่รับ `workStatus`** — สภาพการทำงานมีประตูของตัวเองที่ `setEmployeeWorkStatus`
 * รับไว้ตรงนี้ด้วยเมื่อไหร่ ฟอร์มแก้ข้อมูลที่ส่งค่ามาตามฟอร์มจะระงับบัญชีคนไปเงียบ ๆ
 * โดยที่คนกดบันทึกไม่รู้ว่าเพิ่งทำอะไรลงไป
 */
export async function updateEmployee(
  id: bigint,
  input: UpdateEmployeeInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Employee> {
  const at = outerTx ?? db

  const existing = await at.employee.findFirst({ where: { id, deletedAt: null } })
  if (!existing) throw notFound('ไม่พบพนักงานคนนี้', { id: String(id) })

  const code = cleanRequired(input.code, { field: 'code', label: 'รหัสพนักงาน', max: CODE_MAX })
  const firstName = cleanRequired(input.firstName, { field: 'firstName', label: 'ชื่อ', max: NAME_MAX })
  const lastName = cleanRequired(input.lastName, { field: 'lastName', label: 'นามสกุล', max: NAME_MAX })
  const nickname = cleanOptional(input.nickname, { field: 'nickname', label: 'ชื่อเล่น', max: NICKNAME_MAX })
  const note = cleanOptional(input.note, { field: 'note', label: 'บันทึก', max: NOTE_MAX })
  const phone = cleanOptional(input.phone, { field: 'phone', label: 'เบอร์โทร', max: PHONE_MAX })
  const email = cleanEmail(input.email)
  const hiredAt = cleanDate(input.hiredAt, 'hiredAt', 'วันที่เริ่มงาน')

  const links = {
    departmentId: input.departmentId ?? null,
    positionId: input.positionId ?? null,
  }

  await requireLinks(links, at)
  await requirePositionInDepartment(links.departmentId, links.positionId, at)

  const next = { code, firstName, lastName, nickname, note, phone, email, hiredAt, ...links }
  const changed = diffFields(
    {
      code: existing.code,
      firstName: existing.firstName,
      lastName: existing.lastName,
      nickname: existing.nickname,
      note: existing.note,
      phone: existing.phone,
      email: existing.email,
      hiredAt: existing.hiredAt,
      departmentId: existing.departmentId,
      positionId: existing.positionId,
    },
    next,
  )

  try {
    return await inTx(outerTx, async (tx) => {
      const updated = await tx.employee.update({
        where: { id },
        data: { ...next, updatedBy: actorId },
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
    refuseDuplicate(e, code)
  }
}

/**
 * ลบพนักงาน — soft delete แล้วระงับบัญชีให้ด้วย
 *
 * บัญชีลบไม่ได้ (ตาราง `user` ไม่มี `deletedAt`) การระงับจึงเป็นผลที่เท่ากัน:
 * เข้าระบบไม่ได้ เซสชันถูกตัด แต่แถวยังอยู่ให้ `createdBy` ของทุกเอกสารชี้ถึง
 * (ผู้ใช้ตัดสิน 2026-08-26)
 *
 * **`code` ไม่ถูกปล่อยคืน** — unique เต็มตาราง รหัสของคนที่ลบไปแล้วยังถูกจองตลอดกาล
 */
export async function deleteEmployee(
  id: bigint,
  actorId: bigint,
  outerTx?: Tx,
): Promise<void> {
  const at = outerTx ?? db

  const existing = await at.employee.findUnique({ where: { id } })
  if (!existing) throw notFound('ไม่พบพนักงานคนนี้', { id: String(id) })

  if (existing.deletedAt !== null) return

  await inTx(outerTx, async (tx) => {
    await tx.employee.update({
      where: { id },
      // `updatedBy` ไม่ถูกแตะ — `deletedBy` บอกอยู่แล้วว่าใครลบ · ทับอีกตัวไปด้วย
      // คือลบร่องรอยว่าใครแก้ข้อมูลคนนี้เป็นคนสุดท้าย ซึ่งเป็นคนละคำถามกัน
      data: { deletedAt: new Date(), deletedBy: actorId },
    })

    const account = await findUserByEmployee(id, tx)
    if (account) await suspendUser(account.id, actorId, tx)

    await writeAudit(tx, {
      action: `${MODULE}.delete`,
      module: MODULE,
      recordId: id,
      before: { code: existing.code, firstName: existing.firstName, lastName: existing.lastName },
      after: null,
      userId: actorId,
    })
  })
}

/**
 * เปลี่ยนสภาพการทำงาน — ประตูเดียวของ `workStatus`
 *
 * แยกจาก `updateEmployee` เพราะหน้าจอมีปุ่มของตัวเอง (FE แจ้ง 2026-08-26) · ปุ่มที่
 * เปลี่ยนค่าเดียวไม่ควรต้องส่งชื่อ นามสกุล และ FK ทั้งสี่มาครบเพื่อกดหนึ่งครั้ง
 *
 * **เข้าสู่พ้นสภาพ → ระงับบัญชีให้** ในทรานแซกชันเดียวกับการเปลี่ยน · คนที่พ้นสภาพแล้ว
 * ยังล็อกอินได้ คือคนที่ออกไปแล้วแต่ยังเปิดใบเสนอราคาได้อยู่
 *
 * **กลับมาทำงาน → ไม่ปลดระงับให้** (ผู้ใช้ตัดสิน 2026-08-26) · บัญชีถูกระงับได้จาก
 * หลายเหตุ — พ้นสภาพ ถูกลบ หรือแอดมินสงสัยว่าบัญชีถูกยึด — และตาราง `user` ไม่มี
 * คอลัมน์บอกว่าเหตุไหน ปลดอัตโนมัติจึงเท่ากับให้คนที่แก้ทะเบียนพนักงานได้ ปลดบัญชี
 * ที่แอดมินระงับไว้ได้ด้วยการกดพ้นสภาพแล้วกดกลับ · การปลดเป็นคำสั่งของคน ไม่ใช่
 * ผลข้างเคียงของการแก้พนักงาน
 */
export async function setEmployeeWorkStatus(
  id: bigint,
  workStatus: WorkStatus,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Employee> {
  const at = outerTx ?? db

  const existing = await at.employee.findFirst({ where: { id, deletedAt: null } })
  if (!existing) throw notFound('ไม่พบพนักงานคนนี้', { id: String(id) })

  // Pressing the button twice is one event, not two: no second audit entry, and no
  // second suspension attempt.
  if (existing.workStatus === workStatus) return existing

  return inTx(outerTx, async (tx) => {
    const updated = await tx.employee.update({
      where: { id },
      data: { workStatus, updatedBy: actorId },
    })

    if (workStatus === WorkStatus.TERMINATED) {
      const account = await findUserByEmployee(id, tx)
      if (account) await suspendUser(account.id, actorId, tx)
    }

    await writeAudit(tx, {
      action: `${MODULE}.work-status`,
      module: MODULE,
      recordId: id,
      before: { workStatus: existing.workStatus },
      after: { workStatus },
      userId: actorId,
    })

    return updated
  })
}
