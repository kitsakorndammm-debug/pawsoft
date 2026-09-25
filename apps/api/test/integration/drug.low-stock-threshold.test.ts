import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { isAppError } from '../../src/kit/app-error.ts'
import { db } from '../../src/kit/db.ts'
import { createDrug, updateDrug } from '../../src/modules/drug/drug.service.ts'

/**
 * ยา · เกณฑ์แจ้งเตือนสต็อกต่ำต่อตัว
 *
 * **`null` = ใช้ค่ากลางของคลินิก** (ผู้ใช้ตัดสิน 2026-09-23 — ยาบางตัวใช้เร็วบางตัวใช้ช้า
 * เกณฑ์เดียวทั้งคลินิกไม่พอ) ดู `///` บน `Drug.lowStockThreshold` ในสคีมา
 *
 * ไม่มีเทสอื่นของโมดูล `drug` อยู่ก่อนแล้ว — ไฟล์นี้จึงครอบคลุมเฉพาะฟิลด์นี้ ไม่ใช่ทั้งโมดูล
 */

const NAME_PREFIX = 'TEST-DRUG-THRESHOLD-'

afterEach(async () => {
  await db.drug.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
})

describe('ยา · เกณฑ์แจ้งเตือนสต็อกต่ำ', () => {
  test('สร้างพร้อมเกณฑ์ → บันทึกไว้', async () => {
    const created = await createDrug(
      { name: `${NAME_PREFIX}CREATE`, lowStockThreshold: 20 },
      SYSTEM_USER_ID,
    )

    expect(created.lowStockThreshold).toBe(20)
  })

  test('สร้างไม่ระบุเกณฑ์ → เป็น null (ใช้ค่ากลางของคลินิก)', async () => {
    const created = await createDrug({ name: `${NAME_PREFIX}DEFAULT` }, SYSTEM_USER_ID)

    expect(created.lowStockThreshold).toBeNull()
  })

  test('แก้เกณฑ์ภายหลัง → เปลี่ยนค่าได้', async () => {
    const created = await createDrug(
      { name: `${NAME_PREFIX}UPDATE`, lowStockThreshold: 5 },
      SYSTEM_USER_ID,
    )

    const updated = await updateDrug(
      created.id,
      { name: created.name, lowStockThreshold: 30 },
      SYSTEM_USER_ID,
    )

    expect(updated.lowStockThreshold).toBe(30)
  })

  test('แก้กลับเป็น null → กลับไปใช้ค่ากลางของคลินิก', async () => {
    const created = await createDrug(
      { name: `${NAME_PREFIX}CLEAR`, lowStockThreshold: 5 },
      SYSTEM_USER_ID,
    )

    const updated = await updateDrug(
      created.id,
      { name: created.name, lowStockThreshold: null },
      SYSTEM_USER_ID,
    )

    expect(updated.lowStockThreshold).toBeNull()
  })

  test('เกณฑ์ติดลบ → ปฏิเสธ', async () => {
    expect.assertions(2)

    try {
      await createDrug({ name: `${NAME_PREFIX}NEGATIVE`, lowStockThreshold: -1 }, SYSTEM_USER_ID)
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('เกณฑ์เป็นเลขทศนิยม → ปฏิเสธ (ต้องเป็นจำนวนเต็ม)', async () => {
    expect.assertions(2)

    try {
      await createDrug({ name: `${NAME_PREFIX}DECIMAL`, lowStockThreshold: 2.5 }, SYSTEM_USER_ID)
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('เกณฑ์เป็นศูนย์ → ยอมรับ (เตือนเฉพาะตอนหมดเป๊ะ)', async () => {
    const created = await createDrug({ name: `${NAME_PREFIX}ZERO`, lowStockThreshold: 0 }, SYSTEM_USER_ID)

    expect(created.lowStockThreshold).toBe(0)
  })
})
