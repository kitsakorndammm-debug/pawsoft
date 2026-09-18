import { Elysia, t } from 'elysia'
import { ok } from '../../kit/response.ts'
import { SESSION_COOKIE, getActorAllowingPasswordChange, tokenFrom } from '../../kit/actor.ts'
import { checkRateLimit, clientIpOf } from '../../kit/rate-limit.ts'
import { refuseUnknownFields } from '../../kit/route-guard.ts'
import { changePassword, login, logout, me } from './auth.service.ts'

/**
 * เข้าและออกจากระบบฝั่งหลังบ้าน
 *
 * **route ไม่ตัดสินอะไร** — แปลง HTTP เข้า เรียก service แปลงออก
 */

/**
 * ตั้งค่า cookie ของเซสชัน
 *
 * **`secure: false` เพราะระบบรันบน LAN ที่ยังไม่มี TLS** · นี่คือบรรทัดเดียวที่ต้อง
 * เปลี่ยนเป็น `true` วันที่ขึ้น HTTPS จริง — ดู `docs/standards/auth.md`
 *
 * `sameSite: 'lax'` ไม่ใช่ `'strict'` — ฝั่งเจ้าของสัตว์กลับมาจาก Google ด้วยการ
 * redirect ข้ามเว็บ ซึ่ง `'strict'` จะไม่ส่ง cookie มาให้
 */
const COOKIE_BASE = {
  httpOnly: true,
  sameSite: 'lax',
  secure: false,
  path: '/',
} as const

const SESSION_HOURS = 10

/**
 * เข้มกว่าเพดานกลางของทั้งระบบ (`GLOBAL_RATE_LIMIT` ที่ `app.ts`) เพราะ login คือเส้นที่
 * โดนบรูทฟอร์ซ — ซ้อนอยู่กับการล็อกบัญชีหลังพิมพ์ผิด 3 ครั้งในนาทีเดียว (`LOGIN_ATTEMPT_LIMIT` ที่
 * `auth.service.ts`) แต่คนละกลไก: ตัวนั้นนับต่อบัญชี ตัวนี้นับต่อ IP — กันกรณีไล่เดา
 * รหัสข้ามหลายชื่อผู้ใช้จากเครื่องเดียว ซึ่งการล็อกต่อบัญชีเพียงอย่างเดียวกันไม่ได้
 */
const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 5 * 60_000 }

const LOGIN_FIELDS = new Set(['username', 'password'])
const CHANGE_PASSWORD_FIELDS = new Set(['newPassword'])

/** ไม่ส่ง id เป็น BigInt ออกไป — JSON แปลงไม่ได้ */
const toWire = (u: {
  id: bigint
  username: string
  mustChangePassword: boolean
  role: { id: bigint; name: string }
  permissions: string[]
  employee: { id: bigint; firstName: string; lastName: string; nickname: string | null } | null
}) => ({
  id: Number(u.id),
  username: u.username,
  mustChangePassword: u.mustChangePassword,
  role: { id: Number(u.role.id), name: u.role.name },
  permissions: u.permissions,
  employee: u.employee
    ? {
        id: Number(u.employee.id),
        firstName: u.employee.firstName,
        lastName: u.employee.lastName,
        nickname: u.employee.nickname,
      }
    : null,
})

/** ที่อยู่ผู้ยิง — เก็บไว้ให้คนอ่านเท่านั้น ไม่ได้ใช้ตัดสินอะไร เพราะปลอมได้ */
const ipOf = (request: Request) =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined

const uaOf = (request: Request) => request.headers.get('user-agent') ?? undefined

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  .post(
    '/login',
    async ({ body, request, cookie }) => {
      // ตรวจก่อนแตะฐาน/hash เลย — โดนบล็อกแล้วไม่ต้องเสียงานฝั่งเซิร์ฟเวอร์เพิ่ม
      checkRateLimit(`login:${clientIpOf(request)}`, LOGIN_RATE_LIMIT)

      const user = await login({
        username: body.username,
        password: body.password,
        ip: ipOf(request),
        userAgent: uaOf(request),
      })

      // **token ไม่อยู่ใน response body** — ใส่ไว้จะทำให้ `httpOnly` ไม่มีความหมาย
      cookie[SESSION_COOKIE]?.set({
        ...COOKIE_BASE,
        value: user.token,
        maxAge: SESSION_HOURS * 3600,
      })

      return ok(toWire(user))
    },
    {
      body: t.Object({ username: t.String(), password: t.String() }),
      transform: refuseUnknownFields(LOGIN_FIELDS),
    },
  )

  .post('/logout', async (ctx) => {
    await logout(tokenFrom(ctx))

    // ลบ cookie ด้วย ไม่ใช่แค่ลบแถว — cookie ที่ค้างอยู่จะทำให้ middleware คิดว่า
    // ยังล็อกอินอยู่ แล้วปล่อยผ่านไปเจอ 401 ที่หน้าถัดไปแทน
    ctx.cookie[SESSION_COOKIE]?.set({ ...COOKIE_BASE, value: '', maxAge: 0 })

    return ok(null)
  })

  /**
   * ใครล็อกอินอยู่
   *
   * เรียก `me` ตรง ๆ ไม่ผ่าน `getActor` — บัญชีที่ยังค้างเปลี่ยนรหัสต้องอ่านเส้นนี้ได้
   * ไม่งั้นหน้าจอไม่รู้ว่าต้องพาไปหน้าไหน
   */
  .get('/me', async (ctx) => ok(toWire(await me(tokenFrom(ctx)))))

  .post(
    '/change-password',
    async (ctx) => {
      // **ไม่รับ user id จาก body** — มันมาจากเซสชัน จึงไม่มีการตรวจความเป็นเจ้าของให้ลืม
      const actor = await getActorAllowingPasswordChange(ctx)

      await changePassword(actor.userId, ctx.body.newPassword)

      // ทุกเซสชันถูกถอนรวมของตัวเอง — cookie ที่ถืออยู่ใช้ไม่ได้แล้ว
      ctx.cookie[SESSION_COOKIE]?.set({ ...COOKIE_BASE, value: '', maxAge: 0 })

      return ok(null)
    },
    {
      body: t.Object({ newPassword: t.String() }),
      transform: refuseUnknownFields(CHANGE_PASSWORD_FIELDS),
    },
  )
