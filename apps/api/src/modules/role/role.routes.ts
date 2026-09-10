import {
  Elysia,
  t } from 'elysia'
import { db } from '../../kit/db.ts'
import { ok,
  paged } from '../../kit/response.ts'
import {
  getActor,
  guardRead,
  guardSignedIn,
  guardWrite,
  parseId,
  refuseUnknownFields,
  refuseUnknownQuery,
} from '../../kit/route-guard.ts'
import { invalid } from '../../kit/app-error.ts'
import {
  createRole,
  deleteRole,
  getRole,
  listRoles,
  listRolesPage,
  updateRole,
  type RoleDetail,
  type RoleRow,
} from './role.service.ts'

/**
 * `/api/roles` — บทบาทและสิทธิ์
 *
 * **หน้าจอเป็นหน้าเดียว** (FE แจ้ง 2026-08-26) ชื่อบทบาทกับสวิตช์สิทธิ์อยู่ฟอร์มเดียวกัน
 * `POST` กับ `PATCH` จึงรับ `permissionKeys` มาทั้งชุด ไม่มีเส้น grant/revoke ทีละตัว
 *
 * `/api/permissions` อยู่ไฟล์เดียวกันเพราะมันคือฝั่งซ้ายของหน้าเดียวกัน — สารบัญ key
 * ที่หน้าจอเอาไปวาดสวิตช์ · **อ่านอย่างเดียว** ตาราง `permission` ไม่มี CRUD เลย
 * แถวมาจาก `src/kit/permissions.ts` ผ่าน `syncPermissions()` ตอนบูต
 *
 * บทบาทอยู่ในเมนูตั้งค่า จึงใช้ `main:master:*` ร่วมกับทะเบียนอื่น
 */


/**
 * รูปที่ส่งออกทางสาย — แถวในตาราง
 *
 * `isSystem` ออกไปด้วยเพราะหน้าจอใช้ปิดปุ่มแก้กับปุ่มลบ · ไม่บอกแปลว่าผู้ใช้กดแล้วค่อย
 * รู้ว่าทำไม่ได้ · `userCount` บอกว่าต้องย้ายคนออกกี่คนก่อนถึงจะลบได้
 */
function toWire(row: RoleRow) {
  return {
    id: Number(row.id),
    name: row.name,
    isSystem: row.isSystem,
    userCount: row.userCount,
  }
}

/** รูปของหน้าฟอร์ม — เหมือนแถวในลิสต์ บวกสิทธิ์ที่ถืออยู่ */
function toDetailWire(row: RoleDetail) {
  return {
    id: Number(row.id),
    name: row.name,
    isSystem: row.isSystem,
    permissionKeys: row.permissionKeys,
  }
}

const LIST_QUERY_KEYS = new Set(['q', 'page', 'pageSize'])
/** `/lookup` ไม่รับตัวกรองอะไรเลย — combobox ขอทั้งชุดที่เลือกได้ */
const LOOKUP_QUERY_KEYS = new Set<string>()
const NO_QUERY = new Set<string>()
const CREATE_FIELDS = new Set(['name', 'permissionKeys'])
const UPDATE_FIELDS = new Set(['name', 'permissionKeys'])

/**
 * เลขหน้าที่มากับ query
 *
 * ไม่ส่ง = ใช้ค่าตั้งต้น · ส่งมาแล้วอ่านไม่ออกคือคำขอที่ผิดรูป ไม่ใช่ "ใช้ค่าตั้งต้น"
 * ปล่อยผ่านเมื่อไหร่ คนที่พิมพ์เลขหน้าผิดจะได้หน้าแรกกลับไปพร้อมความเชื่อว่าอยู่หน้าที่ขอ
 */
function parseCount(raw: string | undefined, field: string): number | undefined {
  if (raw === undefined) return undefined
  if (!/^\d+$/.test(raw)) throw invalid(`${field} ต้องเป็นตัวเลข`, { [field]: raw })
  return Number(raw)
}

export const roleRoutes = new Elysia({ prefix: '/api/roles' })
  .get(
    '/',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, LIST_QUERY_KEYS)

      const result = await listRolesPage({
        q: query.q,
        page: parseCount(query.page, 'page'),
        pageSize: parseCount(query.pageSize, 'pageSize'),
      })

      return paged(result.rows.map(toWire), {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      })
    },
    {
      query: t.Object({
        q: t.Optional(t.String()),
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
      }),
      beforeHandle: guardRead,
      detail: { summary: 'ดูรายการบทบาท', tags: ['บทบาท'] },
    },
  )
  /**
   * `/lookup` — สำหรับ combobox ในหน้าอื่น เช่นหน้าเปิดบัญชีผู้ใช้
   *
   * **ประกาศก่อน `/:id`** — ทั้งคู่อยู่ตำแหน่งเดียวกันในต้นไม้ของ path สลับกันเมื่อไหร่
   * คำว่า `lookup` จะถูกอ่านเป็น id แล้วได้ 400
   */
  .get(
    '/lookup',
    async ({ request }) => {
      refuseUnknownQuery(request.url, LOOKUP_QUERY_KEYS)

      const rows = await listRoles({ pageSize: 500 })
      return ok(rows.map((row) => ({ id: Number(row.id), name: row.name })))
    },
    {
      beforeHandle: guardSignedIn,
      detail: { summary: 'บทบาทสำหรับ combobox', tags: ['บทบาท'] },
    },
  )
  .get(
    '/:id',
    async ({ params, request }) => {
      refuseUnknownQuery(request.url, NO_QUERY)

      return ok(toDetailWire(await getRole(parseId(params.id))))
    },
    {
      beforeHandle: guardRead,
      detail: { summary: 'อ่านบทบาททีละตัว', tags: ['บทบาท'] },
    },
  )
  .post(
    '/',
    async (ctx) => {
      const { userId } = await getActor(ctx)
      const row = await createRole(
        { name: ctx.body.name, permissionKeys: ctx.body.permissionKeys },
        userId,
      )

      ctx.set.status = 201
      return ok({ id: Number(row.id), name: row.name, isSystem: row.isSystem })
    },
    {
      body: t.Object({ name: t.String(), permissionKeys: t.Array(t.String()) }),
      transform: [guardWrite, refuseUnknownFields(CREATE_FIELDS)],
      detail: { summary: 'เพิ่มบทบาท', tags: ['บทบาท'] },
    },
  )
  /**
   * แก้บทบาท — **ไม่ส่ง `permissionKeys` มา แปลว่าไม่แตะสิทธิ์เดิม**
   *
   * ต่างจากส่งลิสต์ว่างซึ่งแปลว่าถอนทั้งหมด · ฟอร์มที่แก้แค่ชื่อจึงไม่ต้องส่งสิทธิ์ทั้งชุด
   * กลับมาด้วย และไม่มีทางที่การแก้ชื่อจะถอนสิทธิ์ทิ้งโดยไม่ตั้งใจ
   */
  .patch(
    '/:id',
    async (ctx) => {
      const { userId } = await getActor(ctx)
      const row = await updateRole(
        parseId(ctx.params.id),
        { name: ctx.body.name, permissionKeys: ctx.body.permissionKeys },
        userId,
      )

      return ok({ id: Number(row.id), name: row.name, isSystem: row.isSystem })
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        permissionKeys: t.Optional(t.Array(t.String())),
      }),
      transform: [guardWrite, refuseUnknownFields(UPDATE_FIELDS)],
      detail: { summary: 'แก้ไขบทบาท', tags: ['บทบาท'] },
    },
  )
  .delete(
    '/:id',
    async (ctx) => {
      const { userId } = await getActor(ctx)
      await deleteRole(parseId(ctx.params.id), userId)

      return ok(null)
    },
    {
      transform: guardWrite,
      detail: { summary: 'ลบบทบาท', tags: ['บทบาท'] },
    },
  )

/**
 * `/api/permissions` — สารบัญสิทธิ์ทั้งระบบ
 *
 * **อ่านอย่างเดียว ไม่มี CRUD** — key ถูกสร้างจากระบบเท่านั้น (ผู้ใช้ยืนยัน 2026-08-26)
 * แถวมาจาก `src/kit/permissions.ts` ผ่าน `syncPermissions()` ตอนบูต · key ที่ผู้ใช้
 * เพิ่มเองจะไม่มีโค้ดไหนถามถึง จึงเป็นสวิตช์ที่กดแล้วไม่มีผล
 *
 * อ่านจากตารางไม่ใช่จากค่าคงที่ในโค้ด เพราะ `syncPermissions` เป็นตัวชี้ขาดว่าอะไรมีอยู่จริง
 * — และ `role_permission` ก็ชี้ไปที่แถวในตารางนี้ ไม่ใช่ที่ค่าในไฟล์
 *
 * **ไม่ส่ง `id` ออกไป** — ทั้งระบบอ้างสิทธิ์ด้วย `key` เลขแถวเป็นของภายใน
 */
export const permissionRoutes = new Elysia({ prefix: '/api/permissions' }).get(
  '/',
  async ({ request }) => {
    refuseUnknownQuery(request.url, NO_QUERY)

    const rows = await db.permission.findMany({
      orderBy: [{ groupCode: 'asc' }, { key: 'asc' }],
      select: { key: true, label: true, groupCode: true, groupName: true },
    })

    return ok(rows)
  },
  {
    beforeHandle: guardRead,
    detail: { summary: 'สารบัญสิทธิ์ทั้งระบบ', tags: ['บทบาท'] },
  },
)
