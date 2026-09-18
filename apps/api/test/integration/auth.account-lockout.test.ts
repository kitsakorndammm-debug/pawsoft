import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { isAppError } from '../../src/kit/app-error.ts'
import { db } from '../../src/kit/db.ts'
import { login } from '../../src/modules/auth/auth.service.ts'
import { createUser } from '../../src/modules/user/user.service.ts'
import { seed } from '../../src/kit/seed.ts'

/**
 * เข้าสู่ระบบ · ล็อกบัญชีอัตโนมัติ
 *
 * (ผู้ใช้ตัดสิน 2026-09-18: "ใน 1 นาที ถ้า 3 ครั้งไม่ถูกต้อง จะต้องติดต่อแอดมิน")
 * เดิม `LOGIN_ATTEMPT_LIMIT = 5` เป็นตัวนับสะสมไม่มีเวลากำกับ (พิมพ์ผิดครั้งเดียวเมื่อ
 * สามชั่วโมงก่อนก็นับรวมกับตอนนี้) — เปลี่ยนเป็นนับเฉพาะที่เกิดในนาทีล่าสุดจริง ๆ
 * (คำนวณจาก `login_log`) และลดเพดานเป็น 3
 */

const USERNAME_PREFIX = 'test-lockout-'
let seq = 0

async function makeTestUser() {
  await seed()
  const role = await db.role.findFirst({ where: { isSystem: true }, select: { id: true } })
  if (!role) throw new Error('ไม่พบบทบาทระบบ — seed() ควรสร้างไว้แล้ว')

  seq += 1
  const username = `${USERNAME_PREFIX}${Date.now()}-${seq}`
  const { user, password } = await createUser({ username, roleId: role.id }, SYSTEM_USER_ID)

  return { user, password }
}

afterEach(async () => {
  const users = await db.user.findMany({
    where: { username: { startsWith: USERNAME_PREFIX } },
    select: { id: true },
  })
  const ids = users.map((u) => u.id)
  if (ids.length > 0) {
    await db.loginLog.deleteMany({ where: { userId: { in: ids } } })
  }
  await db.user.deleteMany({ where: { username: { startsWith: USERNAME_PREFIX } } })
})

describe('เข้าสู่ระบบ · ล็อกบัญชีอัตโนมัติ', () => {
  test('พิมพ์รหัสผิด 3 ครั้งในนาทีเดียว → ล็อกที่ครั้งที่สาม ไม่ใช่ก่อนหน้านั้น', async () => {
    const { user } = await makeTestUser()

    for (let i = 0; i < 2; i++) {
      let caught: unknown
      try {
        await login({ username: user.username, password: 'ผิดแน่นอน' })
      } catch (e) {
        caught = e
      }
      expect(isAppError(caught) && caught.code).toBe('UNAUTHORIZED')
    }

    const beforeThird = await db.user.findUnique({
      where: { id: user.id },
      select: { lockedAt: true },
    })
    expect(beforeThird?.lockedAt).toBeNull()

    try {
      await login({ username: user.username, password: 'ผิดแน่นอน' })
    } catch {
      // คาดไว้แล้ว — ตรวจผลที่ตัวข้อมูลด้านล่าง
    }

    const afterThird = await db.user.findUnique({
      where: { id: user.id },
      select: { lockedAt: true, lockCount: true },
    })
    expect(afterThird?.lockedAt).not.toBeNull()
    expect(afterThird?.lockCount).toBe(1)
  })

  test('ล็อกแล้ว แม้พิมพ์รหัสถูก ก็ยังเข้าไม่ได้ — ต้องให้แอดมินปลดก่อน', async () => {
    const { user, password } = await makeTestUser()

    for (let i = 0; i < 3; i++) {
      try {
        await login({ username: user.username, password: 'ผิดแน่นอน' })
      } catch {
        // วนให้ครบเพดานเพื่อให้ล็อก
      }
    }

    let caught: unknown
    try {
      await login({ username: user.username, password })
    } catch (e) {
      caught = e
    }

    expect(isAppError(caught) && caught.code).toBe('UNAUTHORIZED')
  })

  test('รหัสผิดที่เกิดนอกหน้าต่าง 1 นาที ไม่นับรวมกับครั้งใหม่', async () => {
    const { user } = await makeTestUser()

    // จำลองว่ามีรหัสผิดค้างมาจาก 5 นาทีก่อน — นอกหน้าต่าง 1 นาทีที่ตัวจำกัดสนใจ
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000)
    await db.loginLog.createMany({
      data: Array.from({ length: 5 }, () => ({
        identifier: user.username,
        result: 'FAILED_PASSWORD' as const,
        userId: user.id,
        createdAt: fiveMinutesAgo,
      })),
    })

    // พิมพ์ผิดใหม่แค่ 2 ครั้ง (ต่ำกว่าเพดาน 3) — ถ้านับของเก่ารวมด้วยจะล็อกไปแล้ว
    for (let i = 0; i < 2; i++) {
      try {
        await login({ username: user.username, password: 'ผิดแน่นอน' })
      } catch {
        // ตามคาด
      }
    }

    const after = await db.user.findUnique({ where: { id: user.id }, select: { lockedAt: true } })
    expect(after?.lockedAt).toBeNull()
  })
})
