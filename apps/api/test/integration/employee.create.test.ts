import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { isAppError } from '../../src/kit/app-error.ts'
import { db } from '../../src/kit/db.ts'
import { createEmployee } from '../../src/modules/employee/employee.service.ts'

/**
 * พนักงาน · เพิ่ม
 *
 * ครอบคลุมสามฟิลด์ที่เพิ่งเปิดให้บันทึกได้จริง — `phone` `email` `hiredAt` — ซึ่งมีคอลัมน์
 * อยู่ในฐานมาตั้งแต่ขั้น schema แต่ `createEmployee` ไม่เคยอ่านมันเลย (พบจากฟอร์มหน้าเว็บ
 * ส่งค่ามาแล้วโดน `refuseUnknownFields` ปฏิเสธว่า "ไม่รู้จักฟิลด์ phone")
 */

const CODE_PREFIX = 'TEST-EMP-CREATE-'

afterEach(async () => {
  await db.employee.deleteMany({ where: { code: { startsWith: CODE_PREFIX } } })
})

describe('พนักงาน · เพิ่ม', () => {
  test('กรอกเบอร์โทร อีเมล และวันที่เริ่มงานครบ → บันทึกได้ตรงตามที่กรอก', async () => {
    const created = await createEmployee(
      {
        code: `${CODE_PREFIX}1`,
        firstName: 'สมชาย',
        lastName: 'ใจดี',
        phone: '081-234-5678',
        email: 'somchai@example.com',
        hiredAt: '2026-01-15',
      },
      SYSTEM_USER_ID,
    )

    expect(created.phone).toBe('081-234-5678')
    expect(created.email).toBe('somchai@example.com')
    expect(created.hiredAt?.toISOString().slice(0, 10)).toBe('2026-01-15')
  })

  test('ไม่กรอกเบอร์โทร อีเมล วันที่เริ่มงาน → เก็บเป็น null ทั้งหมด', async () => {
    const created = await createEmployee(
      { code: `${CODE_PREFIX}2`, firstName: 'สมหญิง', lastName: 'มีสุข' },
      SYSTEM_USER_ID,
    )

    expect(created.phone).toBeNull()
    expect(created.email).toBeNull()
    expect(created.hiredAt).toBeNull()
  })

  test('อีเมลไม่มีรูปเป็นอีเมล → ปฏิเสธ ไม่ใช่ 500 จาก CHECK ของฐาน', async () => {
    expect.assertions(2)
    try {
      await createEmployee(
        {
          code: `${CODE_PREFIX}3`,
          firstName: 'ทดสอบ',
          lastName: 'อีเมลผิด',
          email: 'not-an-email',
        },
        SYSTEM_USER_ID,
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('วันที่เริ่มงานไม่ใช่รูป YYYY-MM-DD → ปฏิเสธ', async () => {
    expect.assertions(2)
    try {
      await createEmployee(
        {
          code: `${CODE_PREFIX}4`,
          firstName: 'ทดสอบ',
          lastName: 'วันที่ผิด',
          hiredAt: '15/01/2026',
        },
        SYSTEM_USER_ID,
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('รหัสซ้ำกับพนักงานที่มีอยู่แล้ว → ปฏิเสธ', async () => {
    expect.assertions(2)
    const code = `${CODE_PREFIX}5`
    await createEmployee({ code, firstName: 'คนแรก', lastName: 'ก' }, SYSTEM_USER_ID)

    try {
      await createEmployee({ code, firstName: 'คนที่สอง', lastName: 'ข' }, SYSTEM_USER_ID)
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('DUPLICATE')
    }
  })
})
