import { createHash } from 'node:crypto'
import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { isAppError } from '../../src/kit/app-error.ts'
import { db } from '../../src/kit/db.ts'
import { seed } from '../../src/kit/seed.ts'
import { login, updateMyOtpEmail, verifyLoginOtp } from '../../src/modules/auth/auth.service.ts'
import { createUser } from '../../src/modules/user/user.service.ts'

/**
 * เข้าสู่ระบบ · OTP ขั้นที่สอง (ผู้ใช้ตัดสิน 2026-09-18)
 *
 * บัญชีที่ตั้ง `email` ไว้ต้องผ่าน OTP ก่อนได้ session จริง · บัญชีที่ไม่ได้ตั้งเข้าระบบ
 * ด้วยรหัสผ่านอย่างเดียวได้เหมือนเดิมทุกอย่าง (ดู `auth.account-lockout.test.ts` — ยิง
 * ผ่าน `login` ตรง ๆ เหมือนกัน)
 */

const USERNAME_PREFIX = 'test-otp-'
let seq = 0

const hash = (s: string) => createHash('sha256').update(s).digest('hex')

async function makeTestUser(email: string | null) {
  await seed()
  const role = await db.role.findFirst({ where: { isSystem: true }, select: { id: true } })
  if (!role) throw new Error('ไม่พบบทบาทระบบ — seed() ควรสร้างไว้แล้ว')

  seq += 1
  const username = `${USERNAME_PREFIX}${Date.now()}-${seq}`
  const { user, password } = await createUser({ username, roleId: role.id }, SYSTEM_USER_ID)

  if (email) await db.user.update({ where: { id: user.id }, data: { email } })

  return { user, password }
}

/** แถว OTP ที่รู้โค้ดจริง — สร้างตรงเข้าฐาน ไม่ผ่าน `login()` เพื่อทดสอบ `verifyLoginOtp` แยกจาก `issueLoginOtp` */
async function makeOtpRow(userId: bigint, code: string, options: { expiresInMs?: number } = {}) {
  const pendingToken = `pending-${Date.now()}-${Math.random()}`
  await db.loginOtp.create({
    data: {
      userId,
      codeHash: hash(code),
      pendingTokenHash: hash(pendingToken),
      expiresAt: new Date(Date.now() + (options.expiresInMs ?? 5 * 60_000)),
    },
  })
  return pendingToken
}

afterEach(async () => {
  const users = await db.user.findMany({
    where: { username: { startsWith: USERNAME_PREFIX } },
    select: { id: true },
  })
  const ids = users.map((u) => u.id)
  if (ids.length > 0) {
    await db.loginOtp.deleteMany({ where: { userId: { in: ids } } })
    await db.userSession.deleteMany({ where: { userId: { in: ids } } })
    await db.loginLog.deleteMany({ where: { userId: { in: ids } } })
  }
  await db.user.deleteMany({ where: { username: { startsWith: USERNAME_PREFIX } } })
})

describe('เข้าสู่ระบบ · ไม่มีอีเมลรับ OTP', () => {
  test('รหัสผ่านถูก → เข้าระบบได้ทันที ไม่มีขั้น OTP', async () => {
    const { user, password } = await makeTestUser(null)

    const result = await login({ username: user.username, password })

    expect(result.otpRequired).toBe(false)
    if (!result.otpRequired) expect(typeof result.token).toBe('string')
  })
})

describe('เข้าสู่ระบบ · มีอีเมลรับ OTP', () => {
  test('รหัสผ่านถูก → ยังไม่ได้ session ต้องกรอก OTP ก่อน', async () => {
    const { user, password } = await makeTestUser('otp-test@example.com')

    const result = await login({ username: user.username, password })

    expect(result.otpRequired).toBe(true)
    if (result.otpRequired) expect(result.pendingToken).toMatch(/^[0-9a-f]{64}$/)

    const rows = await db.loginOtp.findMany({ where: { userId: user.id } })
    expect(rows.length).toBe(1)

    const sessions = await db.userSession.findMany({ where: { userId: user.id } })
    expect(sessions.length).toBe(0)
  })

  test('ล็อกอินใหม่ก่อนกรอก OTP รอบก่อน → รอบเก่าใช้ไม่ได้แล้ว', async () => {
    const { user, password } = await makeTestUser('otp-test-2@example.com')

    const first = await login({ username: user.username, password })
    const second = await login({ username: user.username, password })

    if (!first.otpRequired || !second.otpRequired) throw new Error('คาดว่าต้องมี OTP ทั้งคู่')

    const rows = await db.loginOtp.findMany({ where: { userId: user.id } })
    expect(rows.length).toBe(1) // ของเก่าถูกลบไปแล้ว เหลือแค่ของใหม่

    let caught: unknown
    try {
      await verifyLoginOtp({ pendingToken: first.pendingToken, code: '000000' })
    } catch (e) {
      caught = e
    }
    expect(isAppError(caught) && caught.code).toBe('UNAUTHORIZED')
  })
})

describe('verifyLoginOtp', () => {
  test('โค้ดถูก → ได้ session จริง และแถว OTP ถูกลบทิ้ง', async () => {
    const { user } = await makeTestUser(null)
    const pendingToken = await makeOtpRow(user.id, '123456')

    const result = await verifyLoginOtp({ pendingToken, code: '123456' })

    expect(typeof result.token).toBe('string')

    const rows = await db.loginOtp.findMany({ where: { userId: user.id } })
    expect(rows.length).toBe(0)

    const sessions = await db.userSession.findMany({ where: { userId: user.id } })
    expect(sessions.length).toBe(1)
  })

  test('โค้ดผิด (ยังไม่ครบเพดาน) → 401 และนับ attempts แต่แถวยังอยู่', async () => {
    const { user } = await makeTestUser(null)
    const pendingToken = await makeOtpRow(user.id, '123456')

    let caught: unknown
    try {
      await verifyLoginOtp({ pendingToken, code: '999999' })
    } catch (e) {
      caught = e
    }
    expect(isAppError(caught) && caught.code).toBe('UNAUTHORIZED')

    const row = await db.loginOtp.findFirst({ where: { userId: user.id } })
    expect(row?.attempts).toBe(1)
  })

  test('โค้ดผิดครบเพดาน → ลบแถวทิ้ง ต้องเริ่มล็อกอินใหม่', async () => {
    const { user } = await makeTestUser(null)
    const pendingToken = await makeOtpRow(user.id, '123456')

    for (let i = 0; i < 5; i++) {
      try {
        await verifyLoginOtp({ pendingToken, code: 'wrong-1' })
      } catch {
        // ตามคาดทุกครั้ง
      }
    }

    const row = await db.loginOtp.findFirst({ where: { userId: user.id } })
    expect(row).toBeNull()

    // แถวหายไปแล้ว — ต่อให้กรอกโค้ดที่ถูกจริง ก็ใช้ไม่ได้อีก
    let caught: unknown
    try {
      await verifyLoginOtp({ pendingToken, code: '123456' })
    } catch (e) {
      caught = e
    }
    expect(isAppError(caught) && caught.code).toBe('UNAUTHORIZED')
  })

  test('OTP หมดอายุแล้ว → 401 แม้กรอกโค้ดถูก และแถวถูกลบทิ้ง', async () => {
    const { user } = await makeTestUser(null)
    // ต้องมากกว่า created_at ตอนสร้าง (CHECK บังคับไว้) แล้วค่อยรอให้เวลาผ่านจริง ๆ
    const pendingToken = await makeOtpRow(user.id, '123456', { expiresInMs: 50 })
    await new Promise((resolve) => setTimeout(resolve, 100))

    let caught: unknown
    try {
      await verifyLoginOtp({ pendingToken, code: '123456' })
    } catch (e) {
      caught = e
    }
    expect(isAppError(caught) && caught.code).toBe('UNAUTHORIZED')

    const row = await db.loginOtp.findFirst({ where: { userId: user.id } })
    expect(row).toBeNull()
  })

  test('pendingToken ไม่มีอยู่จริง → 401', async () => {
    let caught: unknown
    try {
      await verifyLoginOtp({ pendingToken: 'a'.repeat(64), code: '123456' })
    } catch (e) {
      caught = e
    }
    expect(isAppError(caught) && caught.code).toBe('UNAUTHORIZED')
  })

  test('บัญชีถูกล็อกระหว่างรอกรอก OTP → 401 แม้โค้ดถูก', async () => {
    const { user } = await makeTestUser(null)
    const pendingToken = await makeOtpRow(user.id, '123456')
    await db.user.update({ where: { id: user.id }, data: { lockedAt: new Date() } })

    let caught: unknown
    try {
      await verifyLoginOtp({ pendingToken, code: '123456' })
    } catch (e) {
      caught = e
    }
    expect(isAppError(caught) && caught.code).toBe('UNAUTHORIZED')
  })
})

describe('updateMyOtpEmail', () => {
  test('ตั้งอีเมลรูปถูก → บันทึกสำเร็จ', async () => {
    const { user } = await makeTestUser(null)

    await updateMyOtpEmail(user.id, 'valid@example.com')

    const row = await db.user.findUnique({ where: { id: user.id }, select: { email: true } })
    expect(row?.email).toBe('valid@example.com')
  })

  test('อีเมลรูปผิด → โยน INVALID ไม่บันทึก', async () => {
    const { user } = await makeTestUser(null)

    let caught: unknown
    try {
      await updateMyOtpEmail(user.id, 'not-an-email')
    } catch (e) {
      caught = e
    }
    expect(isAppError(caught) && caught.code).toBe('INVALID')

    const row = await db.user.findUnique({ where: { id: user.id }, select: { email: true } })
    expect(row?.email).toBeNull()
  })

  test('ส่งค่าว่าง → ล้างอีเมล กลับไปล็อกอินด้วยรหัสผ่านอย่างเดียว', async () => {
    const { user, password } = await makeTestUser('had-email@example.com')

    await updateMyOtpEmail(user.id, '')

    const result = await login({ username: user.username, password })
    expect(result.otpRequired).toBe(false)
  })
})
