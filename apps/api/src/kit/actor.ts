import { forbidden } from './app-error.ts'
import { me, type MeResult } from '../modules/auth/auth.service.ts'

/**
 * ใครเป็นคนยิง request นี้ และเขาทำสิ่งนี้ได้ไหม
 *
 * **ไม่รับค่าจาก header ที่บอกว่า "ฉันคือผู้ใช้คนที่ 5"** — token คือสิ่งเดียวที่พิสูจน์
 * ตัวตน เพราะมันคือของที่ระบบออกให้เอง และ hash ของมันอยู่ในตาราง `user_session`
 */

/**
 * บัญชีระบบ — เจ้าของ `createdBy` ของแถวที่ไม่มีคนจริงอยู่เบื้องหลัง
 *
 * ตรงกับบัญชีแรกที่ seed สร้าง · เป็นเลขเดียวที่โค้ดฝังไว้ได้ เพราะมันคือจุดที่ทุกอย่าง
 * เริ่ม — ดู `///` บนหัว `User` ในสคีมา
 *
 * **ไม่ใช่ค่า fallback ของ request ที่ไม่ได้ล็อกอิน** — request แบบนั้นถูกปฏิเสธด้วย
 * `401` แทน · บัญชีนี้เหลือไว้ให้ seed กับงานที่ระบบทำเองโดยไม่มีคนสั่ง
 */
export const SYSTEM_USER_ID = 1n

/**
 * ชื่อ cookie ของฝั่งหลังบ้าน
 *
 * **อยู่ที่นี่ ไม่ใช่ใน `auth.routes`** เพราะทิศของการพึ่งพา: `kit` เป็นของที่โมดูลใช้
 * ไม่ใช่ของที่ใช้โมดูล · `auth.routes` เป็นฝ่าย import ไป
 *
 * **ค่านี้ต้องตรงกับที่ `apps/web/src/proxy.ts` มองหาเป๊ะ ๆ** — ไม่ตรงเมื่อไหร่ได้
 * วนล็อกอินไม่รู้จบโดยไม่มี error ให้เห็น: middleware ไม่เห็น cookie เลยเด้งไปหน้า
 * ล็อกอิน หน้าล็อกอินเห็นว่าล็อกอินอยู่แล้วเลยเด้งกลับ วนแบบนั้นไป
 */
export const SESSION_COOKIE = 'pawsoft_session'

/** ข้อมูลของคนที่ยิง request มา */
export type Actor = {
  userId: bigint
  /** ทุก key ที่บทบาทของเขาถืออยู่ — บทบาทระบบถือทุก key ที่ประกาศไว้ */
  permissions: string[]
}

/** context เท่าที่ `getActor` ต้องใช้ — พิมพ์แคบไว้ให้เทสเรียกได้โดยไม่ต้องสร้าง Elysia ทั้งตัว */
export type ActorContext = {
  cookie?: Record<string, { value?: unknown }> | undefined
  request: Request
}

/**
 * token ของ request นี้ — จาก cookie ก่อน แล้วค่อย `Authorization: Bearer`
 */
export function tokenFrom(ctx: ActorContext, cookieName = SESSION_COOKIE): string {
  // Elysia ให้ชนิดของค่าใน cookie เป็น `unknown` เพราะ cookie ถือ payload ที่เซ็นหรือ
  // เป็น JSON ได้ · ตัวนี้ถือ token หรือไม่ถืออะไรเลย และอย่างอื่นไม่ใช่ token
  const fromCookie = ctx.cookie?.[cookieName]?.value
  if (typeof fromCookie === 'string' && fromCookie.length > 0) return fromCookie

  const header = ctx.request.headers.get('authorization') ?? ''
  const match = /^Bearer (.+)$/i.exec(header.trim())

  return match?.[1]?.trim() ?? ''
}

/**
 * อ่านว่าใครเป็นคนยิง request นี้
 *
 * **โยน `401` ถ้าไม่มีเซสชันที่ใช้ได้** — ทั้งไม่ได้ส่ง token มา ส่งมาแต่ใช้ไม่ได้
 * เซสชันหมดอายุ หรือบัญชีถูกระงับ/ถูกล็อกหลังล็อกอินไปแล้ว
 *
 * **โยน `403` ถ้าบัญชียังค้างเปลี่ยนรหัสผ่าน** · รหัสที่ผู้ดูแลออกให้เดินทางผ่านแชท
 * หรือกระดาษ ใครที่เห็นระหว่างทางก็ล็อกอินได้ · ปล่อยให้ทำอย่างอื่นได้แปลว่ารหัสที่
 * ยังค้างอยู่ในกล่องข้อความของใครไม่รู้ ใช้ทำงานจริงได้ · **ด่านอยู่ที่นี่ที่เดียว**
 * ไม่ได้ฝากไว้กับหน้าจอ
 *
 * `403` ไม่ใช่ `401` — ระบบรู้ว่าใคร และล็อกอินใหม่ก็ไม่ช่วย · สิ่งที่ต้องทำคือเปลี่ยนรหัส
 */
export async function getActor(ctx: ActorContext): Promise<Actor> {
  const user = await me(tokenFrom(ctx))

  if (user.mustChangePassword) {
    throw forbidden('ต้องเปลี่ยนรหัสผ่านก่อนใช้งาน', { mustChangePassword: true })
  }

  return { userId: user.id, permissions: user.permissions }
}

/**
 * เหมือน `getActor` แต่ยอมให้บัญชีที่ยังค้างเปลี่ยนรหัสผ่านเข้ามาได้
 *
 * **มีผู้เรียกได้แค่สามเส้น** — เปลี่ยนรหัส (ทางออกเดียวของบัญชีที่ติดธง) · `me`
 * (หน้าจอต้องอ่านธงถึงจะรู้ว่าต้องพาไปไหน) · ออกจากระบบ (ต้องออกได้เสมอ)
 */
export async function getActorAllowingPasswordChange(ctx: ActorContext): Promise<Actor> {
  const user = await me(tokenFrom(ctx))

  return { userId: user.id, permissions: user.permissions }
}

/**
 * อ่านว่าใครยิงมา แล้วตรวจว่าเขาถือ key นี้ไหม
 *
 * **สอง response ที่ต่างกัน และต่างกันโดยตั้งใจ:**
 *
 *   - `401` ระบบไม่รู้ว่าใครยิงมา — หน้าเว็บพาไปหน้าล็อกอิน
 *   - `403` ระบบรู้ว่าใคร แต่เขาทำสิ่งนี้ไม่ได้ — พาไปล็อกอินใหม่ก็ไม่ช่วย
 *
 * ยุบเป็น `401` อย่างเดียวเมื่อไหร่ คนที่ไม่มีสิทธิ์จะโดนเด้งออกไปหน้าล็อกอินทุกครั้ง
 * แล้วล็อกอินสำเร็จ แล้วโดนเด้งอีก วนแบบนั้นไปโดยไม่มีอะไรบอกว่าเกิดอะไรขึ้น
 */
export async function requirePermission(ctx: ActorContext, key: string): Promise<Actor> {
  const actor = await getActor(ctx)

  if (!actor.permissions.includes(key)) {
    throw forbidden('ไม่มีสิทธิ์ทำรายการนี้', { permission: key })
  }

  return actor
}

export type { MeResult }
