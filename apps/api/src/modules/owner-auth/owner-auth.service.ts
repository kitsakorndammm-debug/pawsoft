import { createHash, randomBytes } from 'node:crypto'
import { db, inTx } from '../../kit/db.ts'
import { invalid, unauthorized, type AppError } from '../../kit/app-error.ts'
import { AppError as Err, ERROR_CODE } from '../../kit/app-error.ts'

/**
 * เข้าและออกจากระบบฝั่งเจ้าของสัตว์ — Google เท่านั้น
 *
 * **ไม่มีรหัสผ่านให้ตรวจ ไม่มีตัวนับรหัสผิด ไม่มีการล็อกบัญชี** · Google เป็นคนตรวจ
 * ตัวตนให้ก่อนจะส่งกลับมาถึงที่นี่ · สิ่งที่ไฟล์นี้ทำคือเชื่อคำตอบของ Google
 * (หลังพิสูจน์ว่ามาจาก Google จริง) แล้วออกเซสชันของเราเอง
 */

/**
 * สามสิบวัน — ไม่ใช่สิบชั่วโมงแบบฝั่งหลังบ้าน
 *
 * เจ้าของสัตว์เปิดเว็บนาน ๆ ครั้ง · บังคับล็อกอินใหม่ทุกวันบนหน้าที่คนเปิดเดือนละหน
 * คือความยุ่งยากที่ไม่ได้แลกกับอะไร: บัญชีนี้แก้อะไรของคลินิกไม่ได้เลย
 */
const SESSION_DAYS = 30

const TOKEN_BYTES = 32

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/**
 * ตั้งค่า OAuth ที่อ่านจาก env
 *
 * **อ่านตอนเรียก ไม่ใช่ตอนโหลดไฟล์** — ระบบต้องบูตได้แม้ยังไม่ได้ตั้งค่า Google
 * เพราะฝั่งหลังบ้านใช้งานได้เต็มที่โดยไม่ต้องมีมัน · ตรวจตอนโหลดไฟล์แปลว่าคลินิกที่
 * ยังไม่เปิดใช้ส่วนของลูกค้า จะเปิดระบบไม่ได้เลย
 */
function googleConfig() {
  const clientId = process.env['GOOGLE_CLIENT_ID'] ?? ''
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'] ?? ''
  const redirectUri = process.env['GOOGLE_REDIRECT_URI'] ?? ''

  if (!clientId || !clientSecret || !redirectUri) {
    // ตอบให้ตรงว่าเป็นเรื่องการตั้งค่าฝั่งเรา ไม่ใช่ผู้ใช้ทำอะไรผิด · ปล่อยให้ไปถึง
    // Google แล้วค่อยพังจะได้หน้า error ของ Google ที่อ่านไม่ออกว่าเกิดจากอะไร
    throw new Err(
      ERROR_CODE.INVALID,
      'ระบบยังไม่ได้ตั้งค่าการเข้าสู่ระบบด้วย Google กรุณาติดต่อผู้ดูแลระบบ',
    ) as AppError
  }

  return { clientId, clientSecret, redirectUri }
}

export const googleConfigured = () =>
  Boolean(
    process.env['GOOGLE_CLIENT_ID'] &&
      process.env['GOOGLE_CLIENT_SECRET'] &&
      process.env['GOOGLE_REDIRECT_URI'],
  )

/**
 * ที่อยู่ที่พาผู้ใช้ไปหน้าเลือกบัญชีของ Google
 *
 * `state` เป็นค่าสุ่มที่ต้องกลับมาเหมือนเดิม — กัน CSRF · ผู้เรียกเก็บมันไว้ใน cookie
 * แล้วเทียบตอนกลับมา
 *
 * ขอแค่ `openid email profile` · **ขอมากกว่านี้ Google บังคับให้ผ่านการตรวจสอบแอป**
 * ซึ่งเป็นต้นทุนที่ไม่ได้แลกกับอะไรเลยสำหรับระบบนี้
 */
export function googleAuthUrl(state: string): string {
  const { clientId, redirectUri } = googleConfig()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    // ขอหน้าเลือกบัญชีเสมอ — เครื่องที่หลายคนใช้ร่วมกัน (เคาน์เตอร์คลินิก) ไม่ควร
    // พาเข้าบัญชีของคนก่อนหน้าโดยอัตโนมัติ
    prompt: 'select_account',
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export type GoogleProfile = {
  sub: string
  email: string
  name: string
  picture?: string | undefined
}

/**
 * แลก `code` ที่ Google ส่งกลับมา เป็นข้อมูลตัวตน
 *
 * **ใช้ `id_token` ที่มากับคำตอบ ไม่ได้ยิงถาม userinfo ต่ออีกรอบ** — token นั้นออกโดย
 * Google ให้ `client_id` ของเราโดยเฉพาะ และเราเพิ่งได้มันมาจากการคุยกับ Google ตรง ๆ
 * ผ่าน HTTPS โดยใช้ `client_secret` · การถอดอ่านโดยไม่ตรวจลายเซ็นจึงปลอดภัยใน
 * บริบทนี้ (ไม่ใช่ token ที่รับมาจากเบราว์เซอร์)
 */
export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const { clientId, clientSecret, redirectUri } = googleConfig()

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!res.ok) {
    throw unauthorized('เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่')
  }

  const payload = (await res.json()) as { id_token?: string }
  if (!payload.id_token) throw unauthorized('เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่')

  const claims = decodeIdToken(payload.id_token)

  if (!claims.sub || !claims.email) {
    throw unauthorized('บัญชี Google นี้ไม่มีอีเมล ใช้เข้าสู่ระบบไม่ได้')
  }

  // อีเมลที่ Google เองยังไม่ยืนยัน ใช้เป็นตัวตนไม่ได้
  if (claims.email_verified === false) {
    throw unauthorized('อีเมลของบัญชี Google นี้ยังไม่ได้ยืนยัน')
  }

  return {
    sub: claims.sub,
    email: claims.email,
    name: claims.name ?? claims.email,
    picture: claims.picture,
  }
}

type IdTokenClaims = {
  sub?: string
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
}

/** ถอดส่วนกลางของ JWT · ไม่ตรวจลายเซ็น ด้วยเหตุผลที่อธิบายไว้ที่ `exchangeGoogleCode` */
function decodeIdToken(idToken: string): IdTokenClaims {
  const part = idToken.split('.')[1]
  if (!part) throw unauthorized('เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่')

  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as IdTokenClaims
  } catch {
    throw unauthorized('เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่')
  }
}

export type OwnerMeResult = {
  id: bigint
  email: string
  displayName: string
  pictureUrl: string | null
}

export type OwnerLoginResult = OwnerMeResult & { token: string }

/**
 * หาบัญชีจาก Google profile หรือสร้างใหม่ถ้ายังไม่มี แล้วออกเซสชัน
 *
 * **ค้นด้วย `googleSub` ไม่ใช่ `email`** — `sub` คือตัวตนที่ Google รับประกันว่าไม่
 * เปลี่ยน · อีเมลเปลี่ยนได้ และเลิกใช้แล้วโดนเอาไปให้คนอื่นได้ในองค์กร
 *
 * **อัปเดตอีเมลและชื่อตามทุกครั้ง** — เจ้าของสัตว์ที่เปลี่ยนอีเมลกับ Google ยังเป็น
 * คนเดิม และประวัติสัตว์เลี้ยงของเขาต้องตามมาด้วย
 */
export async function loginWithGoogle(
  profile: GoogleProfile,
  meta: { ip?: string | undefined; userAgent?: string | undefined },
): Promise<OwnerLoginResult> {
  const token = randomBytes(TOKEN_BYTES).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)

  const account = await inTx(undefined, async (tx) => {
    const existing = await tx.petOwnerAccount.findUnique({
      where: { googleSub: profile.sub },
      select: { id: true, suspendedAt: true },
    })

    if (existing?.suspendedAt) {
      throw unauthorized('บัญชีนี้ถูกระงับ กรุณาติดต่อคลินิก')
    }

    const row = existing
      ? await tx.petOwnerAccount.update({
          where: { id: existing.id },
          data: {
            email: profile.email,
            displayName: profile.name,
            pictureUrl: profile.picture ?? null,
            lastLoginAt: new Date(),
          },
          select: { id: true, email: true, displayName: true, pictureUrl: true },
        })
      : await tx.petOwnerAccount.create({
          data: {
            googleSub: profile.sub,
            email: profile.email,
            displayName: profile.name,
            pictureUrl: profile.picture ?? null,
            lastLoginAt: new Date(),
          },
          select: { id: true, email: true, displayName: true, pictureUrl: true },
        })

    await tx.petOwnerSession.create({
      data: {
        petOwnerAccountId: row.id,
        tokenHash: hashToken(token),
        expiresAt,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 500) ?? null,
      },
    })

    return row
  })

  await db.loginLog.create({
    data: {
      identifier: profile.email.slice(0, 255),
      result: 'SUCCESS_GOOGLE',
      petOwnerAccountId: account.id,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
    },
  })

  return { ...account, token }
}

/** ใครถือ token ของฝั่งเจ้าของสัตว์นี้อยู่ */
export async function ownerMe(token: string): Promise<OwnerMeResult> {
  if (token.length === 0) throw unauthorized('กรุณาเข้าสู่ระบบ')

  const session = await db.petOwnerSession.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      petOwnerAccount: {
        select: { id: true, email: true, displayName: true, pictureUrl: true, suspendedAt: true },
      },
    },
  })

  if (!session) throw unauthorized('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่')

  if (session.expiresAt <= new Date()) {
    await db.petOwnerSession.delete({ where: { id: session.id } })
    throw unauthorized('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่')
  }

  if (session.petOwnerAccount.suspendedAt) {
    throw unauthorized('บัญชีนี้ถูกระงับ กรุณาติดต่อคลินิก')
  }

  await db.petOwnerSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  })

  const { id, email, displayName, pictureUrl } = session.petOwnerAccount

  return { id, email, displayName, pictureUrl }
}

/** ออกจากระบบฝั่งเจ้าของสัตว์ · ไม่โยน error เมื่อ token ใช้ไม่ได้ ด้วยเหตุผลเดียวกับฝั่งหลังบ้าน */
export async function ownerLogout(token: string): Promise<void> {
  if (token.length === 0) return

  await db.petOwnerSession.deleteMany({ where: { tokenHash: hashToken(token) } })
}

/** ค่าสุ่มสำหรับ `state` ของ OAuth */
export const newOAuthState = () => randomBytes(16).toString('hex')

export { invalid }
