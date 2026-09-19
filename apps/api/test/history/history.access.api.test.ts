import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { app } from '../../src/app.ts'
import { SESSION_COOKIE, SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import { seed } from '../../src/kit/seed.ts'
import { createUser } from '../../src/modules/user/user.service.ts'
import { readJson } from '../support/api-response.ts'

/**
 * `/api/history/*` · ทุกคนที่ล็อกอินได้ดูได้ ไม่ต้องมีสิทธิ์เฉพาะ (ผู้ใช้ตัดสิน
 * 2026-09-18: "เข้าระบบได้ก็ดูได้เลย ไม่ต้องมีสิทธิ์พิเศษ")
 *
 * **พิสูจน์ด้วยบัญชีที่ไม่มี permission อะไรเลย** ไม่ใช่ admin — สร้างบทบาทเปล่า ๆ
 * (`isSystem: false`, ไม่ grant key ไหนเลย) แล้วล็อกอินด้วยบัญชีนั้น ถ้าเห็น 200 ทุกเส้น
 * แปลว่าไม่มีการ์ดสิทธิ์เฉพาะแอบเหลืออยู่จริง — ทดสอบด้วย `admin` (ถือทุก key) จะพิสูจน์
 * เรื่องนี้ไม่ได้เลย
 */

const USERNAME_PREFIX = 'test-history-access-'

let cookie: string

beforeAll(async () => {
  await seed()

  const role = await db.role.create({
    data: {
      name: `${USERNAME_PREFIX}role-${Date.now()}`,
      isSystem: false,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  })

  const username = `${USERNAME_PREFIX}${Date.now()}`
  const { password } = await createUser({ username, roleId: role.id }, SYSTEM_USER_ID)
  await db.user.update({ where: { username }, data: { mustChangePassword: false } })

  const res = await app.handle(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
  )
  const setCookie = res.headers.get('set-cookie') ?? ''
  const match = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(setCookie)
  if (!match) throw new Error('ไม่พบ session cookie')
  cookie = `${SESSION_COOKIE}=${match[1]}`
})

afterAll(async () => {
  const users = await db.user.findMany({
    where: { username: { startsWith: USERNAME_PREFIX } },
    select: { id: true },
  })
  const userIds = users.map((u) => u.id)
  if (userIds.length > 0) {
    await db.userSession.deleteMany({ where: { userId: { in: userIds } } })
    // ลบ `login_log` ก่อนลบ user เสมอ — `SUCCESS`/`FAILED_PASSWORD` มี CHECK บังคับ
    // `user_id IS NOT NULL` และการลบ user จะ cascade เป็น SET NULL ที่ผิด CHECK ทันที
    // (เจอเหตุผลเดียวกันนี้แล้วที่ `reset-business-data.ts`)
    await db.loginLog.deleteMany({ where: { userId: { in: userIds } } })
  }
  await db.user.deleteMany({ where: { username: { startsWith: USERNAME_PREFIX } } })
  await db.role.deleteMany({ where: { name: { startsWith: `${USERNAME_PREFIX}role-` } } })
})

async function get(path: string, withCookie = true) {
  return app.handle(
    new Request(`http://localhost${path}`, { headers: withCookie ? { cookie } : {} }),
  )
}

describe('บัญชีที่ไม่มี permission อะไรเลย', () => {
  test('GET /api/history/drugs → 200', async () => {
    const res = await get('/api/history/drugs')
    expect(res.status).toBe(200)
    expect((await readJson(res)).ok).toBe(true)
  })

  test('GET /api/history/payments → 200', async () => {
    const res = await get('/api/history/payments')
    expect(res.status).toBe(200)
  })

  test('GET /api/history/visits → 200', async () => {
    const res = await get('/api/history/visits')
    expect(res.status).toBe(200)
  })
})

describe('ไม่ได้ล็อกอิน', () => {
  test('GET /api/history/drugs → 401', async () => {
    const res = await get('/api/history/drugs', false)
    expect(res.status).toBe(401)
  })

  test('GET /api/history/payments → 401', async () => {
    const res = await get('/api/history/payments', false)
    expect(res.status).toBe(401)
  })

  test('GET /api/history/visits → 401', async () => {
    const res = await get('/api/history/visits', false)
    expect(res.status).toBe(401)
  })
})
