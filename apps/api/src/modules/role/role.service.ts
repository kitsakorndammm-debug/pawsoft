import { inUse, invalid, notFound } from '../../kit/app-error.ts'
import { writeAudit } from '../../kit/audit.ts'
import { db, inTx, type Db, type Tx } from '../../kit/db.ts'
import { asDuplicate } from '../../kit/duplicate.ts'
import { PERMISSIONS } from '../../kit/permissions.ts'
import { cleanRequired, literal } from '../../kit/text.ts'
import { revokeSessionsOf } from '../auth/auth.service.ts'
import type { Role } from '../../../prisma/generated/client.ts'

/**
 * บทบาท — ชุดสิทธิ์ที่บัญชีหนึ่งถืออยู่
 *
 * **หน้าจอเป็นหน้าเดียวร่วมกับสิทธิ์** (FE แจ้ง 2026-08-26) ชื่อบทบาทกับสวิตช์สิทธิ์
 * อยู่ฟอร์มเดียวกัน กดบันทึกทีเดียว · `create` กับ `update` จึงรับ `permissionKeys`
 * มาทั้งชุด ไม่มีเส้น grant/revoke ทีละตัว
 *
 * ตาราง `permission` ไม่มี CRUD เลย — แถวในนั้นมาจาก `src/kit/permissions.ts` ผ่าน
 * `syncPermissions()` ตอนบูต · key ที่ผู้ใช้เพิ่มเองจะไม่มีโค้ดไหนถามถึง
 *
 * **บทบาทระบบทำอะไรไม่ได้เลย** (ผู้ใช้ตัดสิน 2026-08-26) — ดู `guardSystem`
 */

const MODULE = 'role'
const LABEL = 'บทบาท'
const NAME_MAX = 100

export const ROLE_LIST_LIMIT = 500
export const ROLE_PAGE_SIZE = 50

const name = (raw: string) =>
  cleanRequired(raw, { field: 'name', label: `ชื่อ${LABEL}`, max: NAME_MAX })

function refuseDuplicate(e: unknown, value: string): never {
  return asDuplicate(e, { message: `มี${LABEL}ชื่อนี้อยู่แล้ว`, field: 'name', value })
}

/**
 * บทบาทระบบแตะไม่ได้ — ทั้งชื่อ ทั้งสิทธิ์ ทั้งการลบ
 *
 * มันถือทุก key ที่ประกาศไว้โดยไม่ผ่าน `role_permission` ซึ่งเป็นสิ่งที่ทำให้ระบบยังแก้
 * ตัวเองได้วันที่โมดูลใหม่ประกาศ key ใหม่ (ดู `///` บนหัว `Role`) · เปิดให้แก้เมื่อไหร่
 * ก็มีทางที่ผู้ดูแลถอนสิทธิ์ของตัวเองออกจากหน้าที่ใช้แก้เรื่องนี้ แล้วไม่มีทางกลับ
 *
 * `IN_USE` ไม่ใช่ `FORBIDDEN` — คนที่กดถือสิทธิ์ครบแล้ว สิ่งที่ปฏิเสธคือตัวแถว ไม่ใช่ตัวคน
 */
function guardSystem(role: Role): void {
  if (role.isSystem) {
    throw inUse(`${LABEL}ของระบบแก้ไขหรือลบไม่ได้`, { id: String(role.id) })
  }
}

/**
 * key ที่ส่งมาต้องเป็น key ที่โค้ดประกาศไว้จริง
 *
 * ปล่อยผ่านแปลว่ามีแถวใน `role_permission` ที่ไม่มี route ไหนถามถึง — หน้าตั้งค่าจะโชว์
 * สวิตช์ที่ติดอยู่แต่กดแล้วไม่มีผล และไม่มีใครรู้ว่าทำไม
 *
 * เทียบกับ `PERMISSIONS` ในโค้ด ไม่ใช่กับตาราง เพราะโค้ดเป็นเจ้าของสารบัญ · แถวในตาราง
 * ที่ตกค้างจาก deploy ก่อนหน้าจะถูก `syncPermissions` กวาดทิ้งอยู่แล้ว
 *
 * คืนลิสต์ที่ตัดซ้ำแล้ว — ส่ง key เดิมมาสองครั้งไม่ใช่ความผิดพลาดที่ต้องปฏิเสธ
 * มันคือหน้าจอที่ส่งของซ้ำมา และผลลัพธ์ที่ผู้ใช้ต้องการก็ชัดอยู่แล้ว
 */
function cleanKeys(keys: readonly string[]): string[] {
  const declared = new Set(PERMISSIONS.map((p) => p.key))
  const unknown = keys.filter((k) => !declared.has(k))

  if (unknown.length > 0) {
    throw invalid('มีสิทธิ์ที่ระบบไม่รู้จัก', { permissionKeys: unknown })
  }

  return [...new Set(keys)]
}

/** id ของ key เหล่านี้ในตาราง — สิ่งที่ `role_permission` ต้องใช้ */
async function permissionIdsOf(keys: readonly string[], at: Tx | Db): Promise<bigint[]> {
  if (keys.length === 0) return []

  const rows = await at.permission.findMany({
    where: { key: { in: [...keys] } },
    select: { id: true },
  })

  return rows.map((r) => r.id)
}

/** key ที่บทบาทนี้ถืออยู่จริงในตาราง เรียงแล้วเพื่อให้เทียบกันได้ */
async function heldKeys(roleId: bigint, at: Tx | Db): Promise<string[]> {
  const rows = await at.rolePermission.findMany({
    where: { roleId },
    select: { permission: { select: { key: true } } },
  })

  return rows.map((r) => r.permission.key).sort()
}

export type RoleRow = Role & {
  /** จำนวนบัญชีที่ถือบทบาทนี้ — หน้าจอใช้รู้ก่อนกดลบว่าต้องย้ายคนออกกี่คน */
  userCount: number
}

export type ListRolesInput = {
  q?: string | undefined
  page?: number | undefined
  pageSize?: number | undefined
}

/**
 * ดูรายการ — **แบ่งหน้าได้ ต่างจากทะเบียนอื่น**
 *
 * ตารางนี้ไม่มี `sortOrder` ไม่มีใครลากจัดลำดับ · กฎ "ตารางที่มี `sortOrder` ห้ามแบ่งหน้า"
 * จึงไม่มีผลตรงนี้ และบทบาทเป็นของที่มีได้เยอะตามจำนวนแผนกในบริษัท
 *
 * เรียงตามชื่อ พร้อม `id` เป็นคีย์ที่สอง — ชื่อซ้ำกันไม่ได้อยู่แล้ว แต่คีย์ที่สองทำให้ลำดับ
 * ไม่ขึ้นกับว่าฐานเรียงภาษาไทยยังไงในกรณีที่เทียบแล้วเท่ากัน
 */
/**
 * ตัวกรองของลิสต์ — **`list` กับ `count` ต้องใช้ก้อนเดียวกัน**
 *
 * แยกกันเขียนเมื่อไหร่ก็มีวันที่ตัวหนึ่งได้เงื่อนไขใหม่แล้วอีกตัวไม่ได้ · ตารางจะบอกว่ามี
 * 30 แถวแต่เดินดูได้ 12 และไม่มีใครรู้ว่าเลขไหนผิด
 */
function listWhere(q: string | undefined) {
  return {
    deletedAt: null,
    ...(q ? { name: { contains: literal(q) } } : {}),
  }
}

/**
 * หน้าที่ขอมา ปรับให้อยู่ในช่วงที่ยอมรับได้
 *
 * เขียนที่เดียวเพราะ `list` กับ `listRolesPage` ต้องได้เลขชุดเดียวกัน — ตัวหนึ่ง clamp
 * แล้วอีกตัวไม่ clamp แปลว่า `page` ที่ตอบกลับไปไม่ใช่หน้าที่แถวชุดนั้นมาจากจริง
 */
function resolvePaging(input: ListRolesInput): { page: number; pageSize: number } {
  return {
    page: Math.max(input.page ?? 1, 1),
    pageSize: Math.min(input.pageSize ?? ROLE_PAGE_SIZE, ROLE_LIST_LIMIT),
  }
}

export async function listRoles(input: ListRolesInput = {}, tx?: Tx): Promise<RoleRow[]> {
  const { page, pageSize } = resolvePaging(input)

  const rows = await (tx ?? db).role.findMany({
    where: listWhere(input.q?.trim()),
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: { _count: { select: { users: true } } },
  })

  return rows.map(({ _count, ...role }) => ({ ...role, userCount: _count.users }))
}

/**
 * นับทั้งหมดที่ตรงตัวกรอง — สิ่งที่ตารางแบ่งหน้าต้องรู้เพื่อวาดปุ่มหน้าถัดไป
 *
 * **`page` กับ `pageSize` ที่ติดมากับ input ถูกมองข้าม** — มันนับทั้งชุด ไม่ใช่หน้าเดียว ·
 * รับ `ListRolesInput` ทั้งก้อนเพื่อให้ route ส่งของชุดเดียวกันเข้าทั้งสองตัวได้
 * โดยไม่ต้องแกะฟิลด์ทีละอัน ซึ่งเป็นจุดที่ตัวกรองของสองเส้นเริ่มไม่ตรงกัน
 */
export async function countRoles(input: ListRolesInput = {}, tx?: Tx): Promise<number> {
  return (tx ?? db).role.count({ where: listWhere(input.q?.trim()) })
}

export type ListRolesPageResult = {
  rows: RoleRow[]
  /** หน้าที่ได้จริงหลัง clamp — ไม่ใช่เลขดิบที่ขอมา */
  page: number
  pageSize: number
  total: number
}

/**
 * หน้าเดียวพร้อมจำนวนทั้งหมด — สิ่งที่ `GET /api/roles` ส่งออกไป
 *
 * **คืน `page` กับ `pageSize` ที่ใช้จริง ไม่ใช่ที่ขอมา** — ทั้งคู่ถูก clamp (ขอหน้า 0
 * ได้หน้า 1 · ขอ pageSize 9999 ได้ 500) · ส่งเลขดิบกลับไปแปลว่าตารางคิดจำนวนหน้าจาก
 * ขนาดที่ไม่ได้ใช้ แล้ววาดปุ่มหน้าที่กดไปก็ได้ของซ้ำ
 *
 * นับกับดึงยิงพร้อมกัน — ตัวเลขกับแถวจึงบรรยายฐานที่เวลาเดียวกัน
 */
export async function listRolesPage(
  input: ListRolesInput = {},
  tx?: Tx,
): Promise<ListRolesPageResult> {
  const { page, pageSize } = resolvePaging(input)

  const [rows, total] = await Promise.all([listRoles(input, tx), countRoles(input, tx)])

  return { rows, page, pageSize, total }
}

export type RoleDetail = Role & {
  /** สิทธิ์ที่ถืออยู่ — บทบาทระบบคืนทุก key ที่ประกาศไว้ ทั้งที่ไม่มีแถวใน junction */
  permissionKeys: string[]
}

/**
 * อ่านทีละตัว — พ่วงสิทธิ์มาด้วยเสมอ
 *
 * **บทบาทระบบคืนทุก key ที่ประกาศไว้** ไม่ใช่ลิสต์ว่าง · มันถือทุก key อยู่จริงโดยไม่ผ่าน
 * `role_permission` (ดู `permissionsOf` ใน `auth.service`) · คืนว่างเปล่าแปลว่าหน้าจอ
 * จะวาดสวิตช์ปิดหมด แล้วคนอ่านจะเข้าใจว่าผู้ดูแลไม่มีสิทธิ์อะไรเลย ซึ่งตรงข้ามกับความจริง
 */
export async function getRole(id: bigint, tx?: Tx): Promise<RoleDetail> {
  const at = tx ?? db
  const role = await at.role.findFirst({ where: { id, deletedAt: null } })
  if (!role) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })

  if (role.isSystem) {
    const all = await at.permission.findMany({ select: { key: true } })
    return { ...role, permissionKeys: all.map((p) => p.key).sort() }
  }

  return { ...role, permissionKeys: await heldKeys(id, at) }
}

export type CreateRoleInput = {
  name: string
  permissionKeys: readonly string[]
}

/**
 * เพิ่มบทบาท — ชื่อกับสิทธิ์ลงพร้อมกันในทรานแซกชันเดียว
 *
 * แยกเป็นสองคำสั่งแปลว่ามีจังหวะที่บทบาทถูกสร้างแล้วแต่ยังไม่มีสิทธิ์ · คำสั่งที่สอง
 * ล้มเหลวเมื่อไหร่ก็ค้างอยู่แบบนั้น แล้วคนที่ถือบทบาทนั้นจะกดอะไรไม่ได้เลยโดยไม่มีใครรู้
 *
 * **`isSystem` ตั้งจากที่นี่ไม่ได้** — ค่ามาจาก seed เท่านั้น (ดู `///` บนหัว `Role`)
 * ปล่อยให้ request ตั้งได้เมื่อไหร่ ใครที่สร้างบทบาทได้ก็สร้างบทบาทที่ถือทุกสิทธิ์ได้
 */
export async function createRole(
  input: CreateRoleInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Role> {
  const value = name(input.name)
  const keys = cleanKeys(input.permissionKeys)

  try {
    return await inTx(outerTx, async (tx) => {
      const created = await tx.role.create({
        data: { name: value, createdBy: actorId, updatedBy: actorId },
      })

      const ids = await permissionIdsOf(keys, tx)
      if (ids.length > 0) {
        await tx.rolePermission.createMany({
          data: ids.map((permissionId) => ({
            roleId: created.id,
            permissionId,
            createdBy: actorId,
          })),
        })
      }

      await writeAudit(tx, {
        action: `${MODULE}.create`,
        module: MODULE,
        recordId: created.id,
        after: { name: value, permissionKeys: keys },
        userId: actorId,
      })

      return created
    })
  } catch (e) {
    refuseDuplicate(e, value)
  }
}

export type UpdateRoleInput = {
  name?: string | undefined
  /** ไม่ส่ง = ไม่แตะสิทธิ์เดิม · ส่งลิสต์ว่าง = ถอนทั้งหมด */
  permissionKeys?: readonly string[] | undefined
}

/**
 * แก้บทบาท — และเตะคนออกเมื่อมีสิทธิ์ถูกถอน
 *
 * **ไม่ส่ง `permissionKeys` กับส่งลิสต์ว่าง เป็นคนละเรื่อง** · ว่างคือถอนทั้งหมด
 * ไม่ส่งคือฟอร์มนี้ไม่ได้พูดถึงสิทธิ์เลย
 *
 * **ตัดเซสชันเฉพาะตอนที่มีสิทธิ์ถูกถอนจริง** (ผู้ใช้ตัดสิน 2026-08-26) — สิทธิ์อ่านสด
 * จากฐานทุก request อยู่แล้ว การถอนจึงมีผลทันทีโดยไม่ต้องตัด แต่หน้าเว็บที่เปิดค้างไว้
 * ยังวาดเมนูตามสิทธิ์ชุดเก่า คนที่ถูกถอนจะเห็นปุ่มที่กดแล้วโดนปฏิเสธ ซึ่งอ่านเหมือนระบบพัง
 *
 * เพิ่มสิทธิ์อย่างเดียวไม่เตะ และแก้แค่ชื่อก็ไม่เตะ — ไม่งั้นการแก้คำผิดในชื่อบทบาทจะเตะ
 * ทั้งแผนกออกจากระบบกลางวันทำงาน
 */
export async function updateRole(
  id: bigint,
  input: UpdateRoleInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Role> {
  const at = outerTx ?? db
  const existing = await at.role.findFirst({ where: { id, deletedAt: null } })
  if (!existing) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })

  guardSystem(existing)

  const value = input.name === undefined ? undefined : name(input.name)
  const keys = input.permissionKeys === undefined ? undefined : cleanKeys(input.permissionKeys)

  const before = keys === undefined ? [] : await heldKeys(id, at)
  const after = keys === undefined ? [] : [...keys].sort()

  // `diffFields` คืนก้อน `{before, after}` ไม่ใช่ boolean — ใช้มันตรง ๆ ใน `if` แปลว่า
  // เงื่อนไขเป็นจริงเสมอ เพราะ object ที่ไม่ใช่ null เป็น truthy ทั้งหมด · เทียบค่าเอง
  const nameChanged = value !== undefined && value !== existing.name
  const keysChanged = keys !== undefined && before.join(' ') !== after.join(' ')

  if (!nameChanged && !keysChanged) return existing

  /** สิทธิ์ที่หายไปจากชุดเดิม — ตัวที่ตัดสินว่าจะเตะคนออกไหม */
  const revoked = after.length === 0 ? before : before.filter((k) => !after.includes(k))

  try {
    return await inTx(outerTx, async (tx) => {
      const updated = await tx.role.update({
        where: { id },
        data: {
          ...(value === undefined ? {} : { name: value }),
          updatedBy: actorId,
        },
      })

      if (keysChanged) {
        // ลบทั้งชุดแล้วเขียนใหม่ ไม่ไล่ diff ทีละแถว — junction ไม่มีข้อมูลของตัวเอง
        // นอกจากคู่ที่มันเชื่อม การเขียนใหม่จึงไม่ทำให้อะไรหาย และอ่านง่ายกว่ามาก
        await tx.rolePermission.deleteMany({ where: { roleId: id } })

        const ids = await permissionIdsOf(keys ?? [], tx)
        if (ids.length > 0) {
          await tx.rolePermission.createMany({
            data: ids.map((permissionId) => ({ roleId: id, permissionId, createdBy: actorId })),
          })
        }
      }

      if (revoked.length > 0 && keysChanged) {
        await revokeSessionsForRole(id, tx)
      }

      await writeAudit(tx, {
        action: `${MODULE}.update`,
        module: MODULE,
        recordId: id,
        before: {
          ...(nameChanged ? { name: existing.name } : {}),
          ...(keysChanged ? { permissionKeys: before } : {}),
        },
        after: {
          ...(nameChanged ? { name: value } : {}),
          ...(keysChanged ? { permissionKeys: after } : {}),
        },
        userId: actorId,
      })

      return updated
    })
  } catch (e) {
    refuseDuplicate(e, value ?? existing.name)
  }
}

/**
 * เตะทุกคนที่ถือบทบาทนี้ออกจากระบบ
 *
 * **ยืม `revokeSessionsOf` จาก `auth` ไม่ลบแถวเอง** — โมดูลที่เป็นเจ้าของตารางเป็น
 * เจ้าของกฎของมัน · ทีละคนเพราะการเพิกถอนของแต่ละบัญชีเป็นเหตุการณ์ของบัญชีนั้น
 * และวันที่การเพิกถอนต้องทำอะไรเพิ่ม จะได้ทำครบทุกคนโดยอัตโนมัติ
 */
async function revokeSessionsForRole(roleId: bigint, tx: Tx): Promise<void> {
  const holders = await tx.user.findMany({ where: { roleId }, select: { id: true } })

  for (const holder of holders) {
    await revokeSessionsOf(holder.id, tx)
  }
}

/**
 * คนที่ยังถือบทบาทนี้กันการลบไว้
 *
 * **นับทุกบัญชี รวมที่ถูกระงับ** — ตาราง `user` ไม่มี `deletedAt` เลย บัญชีที่ระงับไว้
 * ยังถูกปลดระงับได้ · ปล่อยให้บทบาทหายไปแปลว่าวันที่ปลด บัญชีนั้นจะชี้ไปยังบทบาทที่ถูกลบ
 * แล้วคนคนนั้นจะเข้าระบบมาโดยไม่มีสิทธิ์อะไรเลย โดยไม่มีใครรู้ว่าทำไม
 *
 * ต่างจาก `department` ที่เซ็ต FK ของลูกที่ตายแล้วเป็น null ได้ — `user.roleId` เป็น
 * NOT NULL บัญชีจะไม่มีบทบาทไม่ได้ ทางเดียวคือให้คนย้ายออกก่อน
 */
async function guardDelete(id: bigint, at: Tx | Db): Promise<void> {
  const users = await at.user.count({ where: { roleId: id } })

  if (users > 0) {
    throw inUse(`ลบ${LABEL}นี้ไม่ได้ เพราะยังมีบัญชีผู้ใช้ถืออยู่`, { users })
  }
}

/**
 * ลบบทบาท — soft delete และกวาดสิทธิ์ที่มันถืออยู่ทิ้ง
 *
 * สิทธิ์ถูกลบจริงเพราะ `role_permission` เป็น junction ไม่มี `deletedAt` · บทบาทที่ไม่มี
 * อยู่แล้วไม่ควรยังถือสิทธิ์อยู่ และชื่อกลับมาใช้ใหม่ได้ บทบาทใหม่ชื่อเดิมจึงต้องไม่สืบ
 * สิทธิ์ของตัวเก่า
 */
export async function deleteRole(id: bigint, actorId: bigint, outerTx?: Tx): Promise<void> {
  const existing = await (outerTx ?? db).role.findUnique({ where: { id } })
  if (!existing) throw notFound(`ไม่พบ${LABEL}นี้`, { id: String(id) })

  if (existing.deletedAt !== null) return

  guardSystem(existing)

  // ปฏิเสธก่อนเปิดทรานแซกชัน ถ้ายังมีคนถืออยู่
  await guardDelete(id, outerTx ?? db)

  await inTx(outerTx, async (tx) => {
    const before = await heldKeys(id, tx)

    await tx.role.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: actorId,
        // `updatedBy` ไม่ถูกแตะ — `deletedBy` บอกอยู่แล้วว่าใครลบ ทับอีกตัวไปด้วย
        // คือลบร่องรอยว่าใครแก้ข้อมูลแถวนี้เป็นคนสุดท้าย คนละคำถามกัน
      },
    })

    await tx.rolePermission.deleteMany({ where: { roleId: id } })

    await writeAudit(tx, {
      action: `${MODULE}.delete`,
      module: MODULE,
      recordId: id,
      before: { name: existing.name, permissionKeys: before },
      after: null,
      userId: actorId,
    })
  })
}
