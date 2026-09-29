import { afterEach, describe, expect, test } from 'bun:test'

import { app } from '../../src/app.ts'
import { SESSION_COOKIE, SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import { seed } from '../../src/kit/seed.ts'
import { createUser } from '../../src/modules/user/user.service.ts'
import { readJson } from '../support/api-response.ts'

/**
 * `POST /api/auth/login` (ขั้น OTP) · `POST /api/auth/login/verify-otp` ·
 * `PATCH /api/auth/email`
 *
 * **ไม่ทดสอบ "กรอกโค้ดถูก" ผ่าน HTTP ที่นี่** — โค้ดจริงถูกสุ่มและไม่ถูกส่งออกทางไหน
 * นอกจากอีเมล (แม้แต่ dev fallback ก็แค่พิมพ์ log ไม่ใช่ค่าที่ดึงคืนได้ผ่าน HTTP) ·
 * เส้นทางกรอกถูกสำเร็จทั้งหมดถูกพิสูจน์แล้วที่ `test/integration/auth.otp.test.ts`
 * (ยิง `verifyLoginOtp` ตรง กับแถวที่รู้โค้ดจริงเพราะสร้างเข้าฐานเอง) — ที่นี่พิสูจน์แค่ว่า
 * HTTP wiring ถูก: สถานะ, รูปของ response, และเคสปฏิเสธที่ไม่ต้องรู้โค้ดจริง
 */

const USERNAME_PREFIX = 'test-otp-api-'
let seq = 0

async function makeTestUser(email: string | null) {
  await seed()
  const role = await db.role.findFirst({ where: { isSystem: true }, select: { id: true } })
  if (!role) throw new Error('ไม่พบบทบาทระบบ')

  seq += 1
  const username = `${USERNAME_PREFIX}${Date.now()}-${seq}`
  const { user, password } = await createUser({ username, roleId: role.id }, SYSTEM_USER_ID)

  // ปิด `mustChangePassword` — ไม่ใช่สิ่งที่เทสนี้ตรวจ (`getActor` ปฏิเสธด้วย 403
  // ถ้ายังค้างเปลี่ยนรหัส ซึ่งเป็นพฤติกรรมที่ถูกต้องอยู่แล้ว แต่ไม่เกี่ยวกับ OTP)
  await db.user.update({
    where: { id: user.id },
    data: { mustChangePassword: false, email: email ?? undefined },
  })

  return { user, password, username }
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

describe('POST /api/auth/login · บัญชีมีอีเมลรับ OTP', () => {
  test('รหัสผ่านถูก → 200 otpRequired: true พร้อม pendingToken ไม่ตั้ง cookie เซสชัน', async () => {
    const { username, password } = await makeTestUser('otp-api@example.com')

    const res = await app.handle(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }),
    )
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.data.otpRequired).toBe(true)
    expect(body.data.pendingToken).toMatch(/^[0-9a-f]{64}$/)

    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie.includes(SESSION_COOKIE)).toBe(false)
  })
})

describe('POST /api/auth/login/verify-otp', () => {
  test('pendingToken ไม่มีอยู่จริง → 401', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/auth/login/verify-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pendingToken: 'a'.repeat(64), code: '000000' }),
      }),
    )

    expect(res.status).toBe(401)
    const body = await readJson(res)
    expect(body.error?.code).toBe('UNAUTHORIZED')
  })

  test('ส่งฟิลด์ที่ไม่รู้จัก → 400', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/auth/login/verify-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pendingToken: 'x', code: '000000', extra: 'nope' }),
      }),
    )

    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/auth/email', () => {
  test('ล็อกอินแล้ว ส่งอีเมลรูปถูก → 200 คืนอีเมลใหม่', async () => {
    const { username, password } = await makeTestUser(null)

    const loginRes = await app.handle(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }),
    )
    const setCookie = loginRes.headers.get('set-cookie') ?? ''
    const match = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(setCookie)
    if (!match) throw new Error('ไม่พบ session cookie')
    const cookie = `${SESSION_COOKIE}=${match[1]}`

    const res = await app.handle(
      new Request('http://localhost/api/auth/email', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ email: 'new-otp-email@example.com' }),
      }),
    )
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.data.email).toBe('new-otp-email@example.com')
  })

  test('อีเมลรูปผิด → 400', async () => {
    const { username, password } = await makeTestUser(null)

    const loginRes = await app.handle(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }),
    )
    const setCookie = loginRes.headers.get('set-cookie') ?? ''
    const match = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(setCookie)
    if (!match) throw new Error('ไม่พบ session cookie')
    const cookie = `${SESSION_COOKIE}=${match[1]}`

    const res = await app.handle(
      new Request('http://localhost/api/auth/email', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ email: 'not-an-email' }),
      }),
    )

    expect(res.status).toBe(400)
    const body = await readJson(res)
    expect(body.error?.code).toBe('INVALID')
  })

  test('ไม่ได้ล็อกอิน → 401', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/auth/email', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'x@example.com' }),
      }),
    )

    expect(res.status).toBe(401)
  })
})
