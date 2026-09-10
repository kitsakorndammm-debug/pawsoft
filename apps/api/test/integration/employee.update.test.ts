import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { isAppError } from '../../src/kit/app-error.ts'
import { db } from '../../src/kit/db.ts'
import { createEmployee, updateEmployee } from '../../src/modules/employee/employee.service.ts'

/**
 * พนักงาน · แก้ไข
 *
 * ครอบคลุมสามฟิลด์ที่เพิ่งเปิดให้บันทึกได้จริง — `phone` `email` `hiredAt` — เหตุผลเดียว
 * กับ `employee.create.test.ts`
 */

const CODE_PREFIX = 'TEST-EMP-UPDATE-'

afterEach(async () => {
  await db.employee.deleteMany({ where: { code: { startsWith: CODE_PREFIX } } })
})

describe('พนักงาน · แก้ไข', () => {
  test('แก้เบอร์โทร อีเมล วันที่เริ่มงาน → บันทึกค่าที่แก้ไว้จริง', async () => {
    const created = await createEmployee(
      { code: `${CODE_PREFIX}1`, firstName: 'สมชาย', lastName: 'ใจดี' },
      SYSTEM_USER_ID,
    )

    const updated = await updateEmployee(
      created.id,
      {
        code: created.code,
        firstName: created.firstName,
        lastName: created.lastName,
        phone: '0898765432',
        email: 'new@example.com',
        hiredAt: '2026-03-01',
      },
      SYSTEM_USER_ID,
    )

    expect(updated.phone).toBe('0898765432')
    expect(updated.email).toBe('new@example.com')
    expect(updated.hiredAt?.toISOString().slice(0, 10)).toBe('2026-03-01')
  })

  test('ล้างเบอร์โทร อีเมล วันที่เริ่มงานที่เคยมีค่า → กลับเป็น null', async () => {
    const created = await createEmployee(
      {
        code: `${CODE_PREFIX}2`,
        firstName: 'สมหญิง',
        lastName: 'มีสุข',
        phone: '0812345678',
        email: 'old@example.com',
        hiredAt: '2025-06-01',
      },
      SYSTEM_USER_ID,
    )

    const updated = await updateEmployee(
      created.id,
      {
        code: created.code,
        firstName: created.firstName,
        lastName: created.lastName,
        phone: null,
        email: null,
        hiredAt: null,
      },
      SYSTEM_USER_ID,
    )

    expect(updated.phone).toBeNull()
    expect(updated.email).toBeNull()
    expect(updated.hiredAt).toBeNull()
  })

  test('แก้อีเมลให้ผิดรูป → ปฏิเสธ แถวเดิมไม่ถูกแตะ', async () => {
    expect.assertions(3)
    const created = await createEmployee(
      { code: `${CODE_PREFIX}3`, firstName: 'ทดสอบ', lastName: 'แก้อีเมล', email: 'valid@example.com' },
      SYSTEM_USER_ID,
    )

    try {
      await updateEmployee(
        created.id,
        {
          code: created.code,
          firstName: created.firstName,
          lastName: created.lastName,
          email: 'not-an-email',
        },
        SYSTEM_USER_ID,
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }

    const stillThere = await db.employee.findFirst({ where: { id: created.id } })
    expect(stillThere?.email).toBe('valid@example.com')
  })
})
