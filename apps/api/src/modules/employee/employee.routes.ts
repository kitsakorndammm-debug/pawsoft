import {
  Elysia,
  t } from 'elysia'
import { invalid } from '../../kit/app-error.ts'
import { ok,
  paged } from '../../kit/response.ts'
import {
  getActor,
  guardHrRead,
  guardHrWrite,
  parseId,
  refuseUnknownFields,
  refuseUnknownQuery,
} from '../../kit/route-guard.ts'
import {
  createEmployee,
  deleteEmployee,
  EMPLOYEE_PAGE_SIZE,
  findEmployee,
  listEmployees,
  setEmployeeWorkStatus,
  updateEmployee,
} from './employee.service.ts'
import type { Employee } from '../../../prisma/generated/client.ts'

/**
 * `/api/employees` — พนักงาน
 *
 * ลิสต์แบ่งหน้า และ body มีสิบฟิลด์ ต่างจากทะเบียนที่มีแค่ชื่อกับลำดับ
 */

/**
 * พนักงานอยู่เมนูบุคคล ไม่ใช่เมนูตั้งค่า (ผู้ใช้ตัดสิน 2026-08-26)
 *
 * ข้อมูลคนกับทะเบียนอย่างแผนกหรือสาขาเป็นคนละอำนาจ — คนที่แก้ชื่อสาขาได้ไม่จำเป็น
 * ต้องเห็นเงินเดือนหรือแก้ประวัติใคร
 */

/**
 * รูปที่ส่งออกทางสาย
 *
 * `id` และ FK ทุกตัวเป็น number — `BigInt` ส่งตรง ๆ ไม่ได้ `JSON.stringify` โยน error
 * `workStatus` ส่งเป็นข้อความของ enum ตรง ๆ ให้หน้าจอเอาไปแปลเป็นคำไทยเอง
 */
/** วันที่ออกเป็น `YYYY-MM-DD` — ดู `pet.routes.ts` */
const toDate = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10))

function toWire(row: Employee) {
  return {
    id: Number(row.id),
    code: row.code,
    firstName: row.firstName,
    lastName: row.lastName,
    nickname: row.nickname,
    note: row.note,
    phone: row.phone,
    email: row.email,
    hiredAt: toDate(row.hiredAt),
    workStatus: row.workStatus,
    departmentId: row.departmentId === null ? null : Number(row.departmentId),
    positionId: row.positionId === null ? null : Number(row.positionId),
  }
}

const LIST_QUERY_KEYS = new Set(['q', 'page', 'pageSize'])

/** สิบฟิลด์ที่ `POST` รับ */
const CREATE_FIELDS = new Set([
  'code',
  'firstName',
  'lastName',
  'nickname',
  'note',
  'phone',
  'email',
  'hiredAt',
  'departmentId',
  'positionId',
])
/** `PATCH /:id` รับเท่ากับตอนเพิ่ม — `workStatus` มีเส้นของตัวเอง */
const UPDATE_FIELDS = CREATE_FIELDS
const WORK_STATUS_FIELDS = new Set(['workStatus'])

/** `?page=` และ `?pageSize=` ที่ไม่ใช่ตัวเลขคือคำขอที่ผิดรูป */
function parseCount(raw: string | undefined, field: string): number | undefined {
  if (raw === undefined) return undefined
  if (!/^\d+$/.test(raw)) throw invalid(`${field} ต้องเป็นตัวเลข`, { [field]: raw })
  return Number(raw)
}

const nullableId = t.Union([t.Number(), t.Null()])
const nullableText = t.Optional(t.Union([t.String(), t.Null()]))

/**
 * FK ที่ว่างได้ **ต้องส่งมาเสมอ แม้เป็น `null`**
 *
 * `null` แปลว่าไม่สังกัด · ไม่ส่งเลยแปลว่าฟอร์มไม่ได้ถาม — สองอย่างนี้คนละเรื่อง
 * กฎเดียวกับ `beforeId` ของการย้ายลำดับ
 */
const writeFields = {
  code: t.String(),
  firstName: t.String(),
  lastName: t.String(),
  nickname: nullableText,
  /**
   * บันทึกอิสระ — ไม่บังคับ · `null` หรือช่องว่างล้วนคือการล้างทิ้ง
   *
   * เพดานความยาวอยู่ที่ service (`NOTE_MAX`) ไม่ใช่ที่นี่ — route ไม่ตัดสินกฎ
   */
  note: nullableText,
  phone: nullableText,
  email: nullableText,
  /** วันที่เริ่มงาน — รูป `YYYY-MM-DD` เป็นข้อความ · service เป็นคนแปลงและตรวจรูป */
  hiredAt: nullableText,
  departmentId: nullableId,
  positionId: nullableId,
}

/** อ่านค่าจาก body แล้วแปลง id เป็น BigInt */
function inputFrom(body: Record<string, unknown>) {
  const at = (key: string) => {
    const value = body[key]
    return value === null || value === undefined ? null : BigInt(value as number)
  }

  return {
    code: body['code'] as string,
    firstName: body['firstName'] as string,
    lastName: body['lastName'] as string,
    nickname: (body['nickname'] as string | null | undefined) ?? null,
    note: (body['note'] as string | null | undefined) ?? null,
    phone: (body['phone'] as string | null | undefined) ?? null,
    email: (body['email'] as string | null | undefined) ?? null,
    hiredAt: (body['hiredAt'] as string | null | undefined) ?? null,
    departmentId: at('departmentId'),
    positionId: at('positionId'),
  }
}

export const employeeRoutes = new Elysia({ prefix: '/api/employees' })
  .get(
    '/',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, LIST_QUERY_KEYS)

      const result = await listEmployees({
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
      beforeHandle: guardHrRead,
      detail: { summary: 'ดูรายการพนักงาน', tags: ['พนักงาน'] },
    },
  )
  /**
   * อ่านทีละคน — รูปเดียวกับแถวหนึ่งแถวในลิสต์
   *
   * หน้าจอที่เปิดจากลิงก์กับที่เปิดจากการคลิกในตาราง ต้องได้ของหน้าตาเดียวกัน ไม่งั้น
   * ฟอร์มต้องรู้ว่าตัวเองถูกเปิดมาทางไหน
   *
   * **ประกาศหลังลิสต์** — ทั้งสองอยู่ตำแหน่งเดียวกันของต้นไม้เส้นทาง สลับลำดับแล้ว
   * ลิสต์จะถูกอ่านเป็น id
   */
  .get(
    '/:id',
    async ({ params }) => {
      const row = await findEmployee(parseId(params.id))
      return ok(toWire(row))
    },
    {
      beforeHandle: guardHrRead,
      detail: { summary: 'ดูพนักงานรายคน', tags: ['พนักงาน'] },
    },
  )
  .post(
    '/',
    async (ctx) => {
      const { userId } = await getActor(ctx)
      const row = await createEmployee(
        inputFrom(ctx.body as Record<string, unknown>),
        userId,
      )

      ctx.set.status = 201
      return ok(toWire(row))
    },
    {
      body: t.Object(writeFields, { additionalProperties: false }),
      transform: [guardHrWrite, refuseUnknownFields(CREATE_FIELDS)],
      detail: { summary: 'เพิ่มพนักงาน', tags: ['พนักงาน'] },
    },
  )
  .patch(
    '/:id',
    async (ctx) => {
      const { userId } = await getActor(ctx)
      const body = ctx.body as Record<string, unknown>

      const row = await updateEmployee(parseId(ctx.params.id), inputFrom(body), userId)

      return ok(toWire(row))
    },
    {
      body: t.Object(writeFields, { additionalProperties: false }),
      transform: [guardHrWrite, refuseUnknownFields(UPDATE_FIELDS)],
      detail: { summary: 'แก้ไขพนักงาน', tags: ['พนักงาน'] },
    },
  )
  /**
   * เปลี่ยนสภาพการทำงาน — เส้นของตัวเอง เพราะหน้าจอมีปุ่มของตัวเอง
   *
   * ปุ่มที่เปลี่ยนค่าเดียวไม่ควรต้องส่งชื่อ นามสกุล และ FK ทั้งสี่มาครบเพื่อกดหนึ่งครั้ง ·
   * FE ส่ง enum ที่ต้องการมาตรง ๆ ไม่ใช่ปุ่มสลับที่ฝั่งนี้เดาทิศเอง
   */
  .patch(
    '/:id/work-status',
    async (ctx) => {
      const { userId } = await getActor(ctx)
      const row = await setEmployeeWorkStatus(
        parseId(ctx.params.id),
        ctx.body.workStatus,
        userId,
      )

      return ok(toWire(row))
    },
    {
      body: t.Object(
        { workStatus: t.Union([t.Literal('ACTIVE'), t.Literal('TERMINATED')]) },
        { additionalProperties: false },
      ),
      transform: [guardHrWrite, refuseUnknownFields(WORK_STATUS_FIELDS)],
      detail: { summary: 'เปลี่ยนสภาพการทำงาน', tags: ['พนักงาน'] },
    },
  )
  .delete(
    '/:id',
    async (ctx) => {
      const { userId } = await getActor(ctx)
      await deleteEmployee(parseId(ctx.params.id), userId)

      return ok(null)
    },
    {
      transform: guardHrWrite,
      detail: { summary: 'ลบพนักงาน', tags: ['พนักงาน'] },
    },
  )

export { EMPLOYEE_PAGE_SIZE }
