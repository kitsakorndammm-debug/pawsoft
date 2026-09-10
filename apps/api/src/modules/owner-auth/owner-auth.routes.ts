import { Elysia, t } from 'elysia'
import { ok } from '../../kit/response.ts'
import { tokenFrom } from '../../kit/actor.ts'
import {
  exchangeGoogleCode,
  googleAuthUrl,
  googleConfigured,
  loginWithGoogle,
  newOAuthState,
  ownerLogout,
  ownerMe,
} from './owner-auth.service.ts'

/**
 * เข้าและออกจากระบบฝั่งเจ้าของสัตว์ — ผ่าน Google
 *
 * สองเส้นที่ต่างจากฝั่งหลังบ้านโดยสิ้นเชิง:
 *
 *   `GET /api/owner-auth/google`           พาไปหน้าเลือกบัญชีของ Google
 *   `GET /api/owner-auth/google/callback`  Google พากลับมาที่นี่พร้อม `code`
 *
 * ทั้งคู่เป็น `GET` เพราะเบราว์เซอร์เป็นคนเดินทาง ไม่ใช่ JavaScript เป็นคนยิง
 */

export const OWNER_SESSION_COOKIE = 'pawsoft_owner'

/** cookie กันปลอม request ระหว่างเดินทางไป-กลับ Google · อายุสั้นเพราะใช้ครั้งเดียว */
const OAUTH_STATE_COOKIE = 'pawsoft_oauth_state'

const COOKIE_BASE = {
  httpOnly: true,
  sameSite: 'lax',
  secure: false,
  path: '/',
} as const

const SESSION_DAYS = 30

const ipOf = (request: Request) =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined

const uaOf = (request: Request) => request.headers.get('user-agent') ?? undefined

const ownerWebUrl = () => process.env['OWNER_WEB_URL'] ?? 'http://localhost:3200'

const toWire = (a: { id: bigint; email: string; displayName: string; pictureUrl: string | null }) => ({
  id: Number(a.id),
  email: a.email,
  displayName: a.displayName,
  pictureUrl: a.pictureUrl,
})

export const ownerAuthRoutes = new Elysia({ prefix: '/api/owner-auth' })
  /**
   * ยังตั้งค่า Google ไว้หรือยัง
   *
   * หน้าเว็บถามก่อนวาดปุ่ม — ปุ่มที่กดแล้วเจอหน้า error คือปุ่มที่ไม่ควรมีให้กด
   */
  .get('/google/status', () => ok({ configured: googleConfigured() }))

  .get('/google', ({ cookie, redirect }) => {
    const state = newOAuthState()

    cookie[OAUTH_STATE_COOKIE]?.set({ ...COOKIE_BASE, value: state, maxAge: 600 })

    return redirect(googleAuthUrl(state))
  })

  /**
   * Google พากลับมาที่นี่
   *
   * **จบด้วย redirect ไปหน้าเว็บเสมอ ไม่ใช่ตอบ JSON** — คนที่มาถึงบรรทัดนี้คือเบราว์เซอร์
   * ที่กำลังเดินทาง ไม่ใช่โค้ดที่รอ JSON อยู่ · ตอบ JSON ก็จะได้หน้าขาว ๆ ที่มีข้อความ
   * `{"ok":true}` อยู่มุมซ้ายบน
   *
   * ข้อผิดพลาดส่งกลับเป็น query string ให้หน้าล็อกอินอ่านไปแสดง
   */
  .get('/google/callback', async ({ query, cookie, redirect, request }) => {
    const web = ownerWebUrl()
    const fail = (reason: string) =>
      redirect(`${web}/owner/login?error=${encodeURIComponent(reason)}`)

    // ผู้ใช้กดยกเลิกที่หน้า Google
    if (typeof query['error'] === 'string') return fail('ยกเลิกการเข้าสู่ระบบ')

    const code = query['code']
    const state = query['state']
    const expected = cookie[OAUTH_STATE_COOKIE]?.value

    cookie[OAUTH_STATE_COOKIE]?.set({ ...COOKIE_BASE, value: '', maxAge: 0 })

    if (typeof code !== 'string' || code.length === 0) return fail('ไม่ได้รับรหัสจาก Google')

    // `state` ที่ไม่ตรงแปลว่า request นี้ไม่ได้เริ่มจากหน้าเว็บของเรา
    if (typeof state !== 'string' || state !== expected) {
      return fail('คำขอไม่ถูกต้อง กรุณาลองใหม่')
    }

    try {
      const profile = await exchangeGoogleCode(code)
      const account = await loginWithGoogle(profile, {
        ip: ipOf(request),
        userAgent: uaOf(request),
      })

      cookie[OWNER_SESSION_COOKIE]?.set({
        ...COOKIE_BASE,
        value: account.token,
        maxAge: SESSION_DAYS * 24 * 3600,
      })

      return redirect(`${web}/owner`)
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'เข้าสู่ระบบไม่สำเร็จ')
    }
  })

  /**
   * **ล็อกอินฝั่งลูกค้าโดยข้าม Google — เปิดเฉพาะ `APP_ENV=local`**
   *
   * มีไว้ให้ Playwright · เทสที่ต้องผ่านหน้าเลือกบัญชีของ Google จริงคือเทสที่รัน
   * ใน CI ไม่ได้ (ต้องมีบัญชีจริง · ผ่าน 2FA · Google บล็อกเบราว์เซอร์อัตโนมัติ) ·
   * สิ่งที่เทสฝั่งลูกค้าต้องพิสูจน์คือหน้าจอหลังล็อกอิน ไม่ใช่ OAuth ของ Google
   *
   * **`APP_ENV` ต้องเป็น `local` เป๊ะ ๆ ไม่ใช่ "ไม่ใช่ production"** — ค่าที่ไม่ได้
   * ตั้งหรือสะกดผิดต้องแปลว่าปิด · เส้นนี้ออกเซสชันให้ใครก็ได้ที่รู้ `sub`
   * เปิดค้างบนเครื่องจริงคือประตูหลังที่ไม่ต้องใช้รหัสผ่าน
   *
   * ตอบ **404 ไม่ใช่ 403** เมื่อปิดอยู่ — 403 ยืนยันว่าเส้นนี้มีอยู่จริง ซึ่งเป็น
   * ข้อมูลที่คนนอกไม่ควรได้
   */
  .post(
    '/test-login',
    async ({ body, cookie, set }) => {
      if (process.env['APP_ENV'] !== 'local') {
        set.status = 404

        return { ok: false as const, error: { code: 'NOT_FOUND', message: 'ไม่พบเส้นทางนี้' } }
      }

      const account = await loginWithGoogle(
        {
          sub: body.sub,
          email: body.email ?? `${body.sub}@e2e.local`,
          name: body.name ?? body.sub,
          picture: undefined,
        },
        {},
      )

      cookie[OWNER_SESSION_COOKIE]?.set({
        ...COOKIE_BASE,
        value: account.token,
        maxAge: SESSION_DAYS * 24 * 3600,
      })

      return ok({ ...toWire(account), token: account.token })
    },
    {
      body: t.Object(
        {
          sub: t.String(),
          email: t.Optional(t.String()),
          name: t.Optional(t.String()),
        },
        { additionalProperties: false },
      ),
      detail: { tags: ['ลูกค้า'], summary: 'ล็อกอินสำหรับเทส (local เท่านั้น)' },
    },
  )

  .get('/me', async (ctx) => ok(toWire(await ownerMe(tokenFrom(ctx, OWNER_SESSION_COOKIE)))))

  .post('/logout', async (ctx) => {
    await ownerLogout(tokenFrom(ctx, OWNER_SESSION_COOKIE))

    ctx.cookie[OWNER_SESSION_COOKIE]?.set({ ...COOKIE_BASE, value: '', maxAge: 0 })

    return ok(null)
  })
