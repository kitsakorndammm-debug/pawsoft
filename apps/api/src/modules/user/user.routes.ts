import {
  Elysia,
  t } from 'elysia'
import { invalid } from '../../kit/app-error.ts'
import { ok } from '../../kit/response.ts'
import {
  getActor,
  guardHrRead,
  guardHrWrite,
  parseId,
  parseIdFilter,
  refuseUnknownFields,
  refuseUnknownQuery,
} from '../../kit/route-guard.ts'
import {
  createUser,
  findAccountOfEmployee,
  resetPassword,
  suspendUser,
  unlockUser,
  unsuspendUser,
  updateUser,
} from './user.service.ts'

/**
 * `/api/users` — บัญชีผู้ใช้
 *
 * มีเส้นเดียวตอนนี้: ปลดระงับ · **ระบบระงับให้เอง แต่ไม่ปลดให้เอง** (ผู้ใช้ตัดสิน
 * 2026-08-26) — การระงับเป็นผลข้างเคียงของการที่คนพ้นสภาพหรือถูกลบ ส่วนการปลดเป็น
 * คำสั่งที่คนต้องกด เพราะบัญชีถูกระงับได้จากหลายเหตุ และไม่มีคอลัมน์ไหนบอกว่าเหตุไหน
 *
 * **รหัสผ่านออกไปทางเส้น `POST` เส้นเดียว และครั้งเดียว** — ผู้ดูแลไม่เคยรู้รหัสของใคร
 * ไม่มีช่องให้พิมพ์ ไม่มีเส้นไหนคืนรหัสซ้ำ (ผู้ใช้ตัดสิน 2026-08-26)
 *
 * ยังไม่มี `list` `update` — ยังไม่มีใบสั่ง
 */


const CREATE_FIELDS = new Set(['username', 'roleId', 'employeeId'])
/**
 * แก้ได้แค่สองฟิลด์นี้
 *
 * `passwordHash` ไม่อยู่ในนี้ และไม่มีเส้นไหนรับมัน — ผู้ดูแลตั้งรหัสให้ใครไม่ได้
 * `suspendedAt` / `lockedAt` ก็ไม่อยู่ เพราะมีคำสั่งของตัวเองที่เขียนบันทึกให้ถูกเรื่อง
 */
const UPDATE_FIELDS = new Set(['username', 'roleId'])

const LIST_QUERY_KEYS = new Set(['employeeId'])

export const userRoutes = new Elysia({ prefix: '/api/users' })
  /**
   * บัญชีของพนักงานคนหนึ่ง — `data` เป็น `null` ถ้ายังไม่ได้เปิดให้
   *
   * **ไม่มีหน้าตารางบัญชี** (FE แจ้ง 2026-08-26) — จัดการผ่าน dialog ที่เปิดจากแถว
   * พนักงาน หน้าจอจึงถือ `employeeId` ไม่ใช่ `userId` · `employeeId` เป็นตัวกรอง
   * ที่บังคับ ไม่ใช่เส้นที่คืนบัญชีทั้งระบบแล้วกรองทีหลัง
   *
   * **`null` ไม่ใช่ 404** — พนักงานที่ยังไม่มีบัญชีเป็นเรื่องปกติ · dialog เปิดมาแล้ว
   * เจอสองหน้าตา: ยังไม่มีบัญชี (ปุ่มเปิดบัญชี) หรือมีแล้ว (ปุ่มจัดการ)
   *
   * สถานะระงับกับล็อกต้องมาด้วย ไม่งั้น dialog ไม่รู้จะโชว์ปุ่มระงับหรือปลดระงับ
   */
  .get(
    '/',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, LIST_QUERY_KEYS)

      const employeeId = parseIdFilter(query.employeeId, 'employeeId')
      if (employeeId === undefined) {
        throw invalid('ต้องระบุ employeeId', { field: 'employeeId' })
      }

      const account = await findAccountOfEmployee(employeeId)
      if (!account) return ok(null)

      return ok({
        id: Number(account.id),
        username: account.username,
        roleId: Number(account.roleId),
        roleName: account.roleName,
        employeeId: account.employeeId === null ? null : Number(account.employeeId),
        suspendedAt: account.suspendedAt?.toISOString() ?? null,
        lockedAt: account.lockedAt?.toISOString() ?? null,
        lockCount: account.lockCount,
        mustChangePassword: account.mustChangePassword,
        lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
      })
    },
    {
      query: t.Object({ employeeId: t.Optional(t.String()) }),
      beforeHandle: guardHrRead,
      detail: { summary: 'บัญชีของพนักงาน', tags: ['บัญชีผู้ใช้'] },
    },
  )
  /**
   * เปิดบัญชี — **คำตอบมีรหัสผ่านอยู่ และนี่คือครั้งเดียวที่มันออกไป**
   *
   * หน้าจอเอาไปโชว์ในกล่องที่ปิดแล้วดูอีกไม่ได้ · ไม่มีเส้นไหนคืนรหัสซ้ำ อยากได้ต้อง
   * รีเซ็ตซึ่งได้คนละตัว · ตารางเก็บแต่ hash และบันทึกไม่มีรหัสอยู่เลย
   *
   * **ไม่รับ `password` จากคนกด** — `refuseUnknownFields` ปฏิเสธไปตั้งแต่ `transform`
   * ผู้ดูแลจึงตั้งรหัสให้ใครไม่ได้ แม้จะยิง API ตรง
   */
  .post(
    '/',
    async (ctx) => {
      const { userId } = await getActor(ctx)
      const { user, password } = await createUser(
        {
          username: ctx.body.username,
          roleId: BigInt(ctx.body.roleId),
          employeeId: ctx.body.employeeId == null ? null : BigInt(ctx.body.employeeId),
        },
        userId,
      )

      ctx.set.status = 201
      return ok({
        id: Number(user.id),
        username: user.username,
        roleId: Number(user.roleId),
        employeeId: user.employeeId === null ? null : Number(user.employeeId),
        mustChangePassword: user.mustChangePassword,
        password,
      })
    },
    {
      body: t.Object({
        username: t.String(),
        roleId: t.Number(),
        employeeId: t.Optional(t.Union([t.Number(), t.Null()])),
      }),
      transform: [guardHrWrite, refuseUnknownFields(CREATE_FIELDS)],
      detail: { summary: 'เปิดบัญชีผู้ใช้', tags: ['บัญชีผู้ใช้'] },
    },
  )
  /**
   * แก้บัญชี — ชื่อผู้ใช้ หรือบทบาท
   *
   * **แก้อย่างใดอย่างหนึ่งแล้วเจ้าตัวหลุดจากระบบ** (ผู้ใช้ตัดสิน 2026-08-26)
   * เหตุผลอยู่ที่ `updateUser` ใน service
   *
   * ไม่รับ `passwordHash` และไม่รับธงสถานะ — ของพวกนั้นมีคำสั่งของตัวเอง
   */
  .patch(
    '/:id',
    async (ctx) => {
      const { userId } = await getActor(ctx)
      const row = await updateUser(
        parseId(ctx.params.id),
        {
          username: ctx.body.username,
          roleId: ctx.body.roleId === undefined ? undefined : BigInt(ctx.body.roleId),
        },
        userId,
      )

      return ok({
        id: Number(row.id),
        username: row.username,
        roleId: Number(row.roleId),
      })
    },
    {
      body: t.Object({
        username: t.Optional(t.String()),
        roleId: t.Optional(t.Number()),
      }),
      transform: [guardHrWrite, refuseUnknownFields(UPDATE_FIELDS)],
      detail: { summary: 'แก้ไขบัญชีผู้ใช้', tags: ['บัญชีผู้ใช้'] },
    },
  )
  /**
   * รีเซ็ตรหัสผ่าน — **คำตอบมีรหัสใหม่ และนี่คือครั้งเดียวที่มันออกไป** เหมือนตอนเปิดบัญชี
   *
   * `POST` ไม่ใช่ `PATCH` — มันสร้างของใหม่ที่ไม่มีมาก่อน และเรียกซ้ำได้ผลต่างกันทุกครั้ง
   * ซึ่งไม่ใช่ลักษณะของ `PATCH` ที่ควรลงเอยเหมือนเดิมเมื่อส่งค่าเดิม
   *
   * เซสชันของเจ้าของบัญชีถูกตัดไปด้วย — เหตุผลอยู่ที่ `resetPassword` ใน service
   */
  .post(
    '/:id/reset-password',
    async (ctx) => {
      const { userId } = await getActor(ctx)
      const { password } = await resetPassword(parseId(ctx.params.id), userId)

      return ok({ password })
    },
    {
      transform: guardHrWrite,
      detail: { summary: 'รีเซ็ตรหัสผ่าน', tags: ['บัญชีผู้ใช้'] },
    },
  )
  /**
   * ระงับบัญชี — ตัดทางเข้าระบบ และตัดเซสชันที่เปิดอยู่ทันที
   *
   * **นี่คือที่ที่ "ลบบัญชี" ไปจบ** — ตาราง `user` ไม่มี `deletedAt` เลย เพราะ `createdBy`
   * ของทุกตารางชี้มาที่มัน (ดู `///` บนหัว `User`)
   */
  .patch(
    '/:id/suspend',
    async (ctx) => {
      const { userId } = await getActor(ctx)
      await suspendUser(parseId(ctx.params.id), userId)

      return ok(null)
    },
    {
      transform: guardHrWrite,
      detail: { summary: 'ระงับบัญชีผู้ใช้', tags: ['บัญชีผู้ใช้'] },
    },
  )
  /**
   * ปลดล็อก — คืนสิทธิ์ให้ลองใหม่ หลังถูกล็อกเพราะเดารหัสผิดซ้ำ ๆ
   *
   * **คนละปุ่มกับปลดระงับ** — ระงับคือการตัดสินใจของผู้ดูแล ล็อกคือผลของการเดารหัส ·
   * บัญชีที่ติดทั้งสองอย่างต้องกดสองปุ่ม เพราะเป็นสองเรื่อง
   */
  .patch(
    '/:id/unlock',
    async (ctx) => {
      const { userId } = await getActor(ctx)
      await unlockUser(parseId(ctx.params.id), userId)

      return ok(null)
    },
    {
      transform: guardHrWrite,
      detail: { summary: 'ปลดล็อกบัญชีผู้ใช้', tags: ['บัญชีผู้ใช้'] },
    },
  )
  /**
   * ปลดระงับ — คืนทางเข้าระบบให้บัญชีหนึ่ง
   *
   * ใช้สิทธิ์ของเมนูบุคคล ไม่ใช่ของเมนูตั้งค่า · คืนทางเข้าระบบให้คนหนักกว่าการแก้ชื่อ
   * แผนก ใช้ key ร่วมกันแปลว่าใครแก้ทะเบียนได้ก็ปลดบัญชีที่ผู้ดูแลระงับไว้ได้
   *
   * `PATCH` เพราะเปลี่ยนสถานะของแถวเดียว ไม่ได้แทนที่ทั้งแถว
   */
  .patch(
    '/:id/unsuspend',
    async (ctx) => {
      const { userId } = await getActor(ctx)
      await unsuspendUser(parseId(ctx.params.id), userId)

      return ok(null)
    },
    {
      transform: guardHrWrite,
      detail: { summary: 'ปลดระงับบัญชีผู้ใช้', tags: ['บัญชีผู้ใช้'] },
    },
  )
