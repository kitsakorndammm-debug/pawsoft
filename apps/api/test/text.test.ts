import { describe, expect, test } from 'bun:test'

import { cleanOptional, cleanRequired, literal, normalizePhone } from '../src/kit/text.ts'

/**
 * ตัวช่วยข้อความ — **ฟังก์ชันบริสุทธิ์ ไม่แตะฐาน**
 *
 * เทสพวกนี้รันเป็นวินาที ต่างจาก e2e ที่ใช้เป็นนาที · ของที่ตรวจได้ตรงนี้ไม่ควร
 * ไปตรวจด้วยเบราว์เซอร์
 */

describe('normalizePhone', () => {
  /**
   * **นี่คือกฎที่ `owner_phone_live_key` พึ่งพา** (ผู้ใช้กำหนด 2026-09-01)
   *
   * เก็บตามที่พิมพ์มา `081-234-5678` กับ `0812345678` จะเป็นคนละค่าใน unique index
   * แล้วลูกค้าคนเดียวกันมีสองแถว · การเชื่อมบัญชีอัตโนมัติจะเดาผิดตัว
   */
  test('รูปแบบไหนก็เหลือตัวเลขล้วนเหมือนกัน', () => {
    for (const raw of [
      '0812345678',
      '081-234-5678',
      '081 234 5678',
      '(081)234-5678',
      '+66812345678',
      '0066812345678',
    ]) {
      expect(normalizePhone(raw)).toBe('0812345678')
    }
  })

  test('เบอร์บ้านสั้นกว่ามือถือ — ไม่ถูกตัดทิ้ง', () => {
    expect(normalizePhone('02-123-4567')).toBe('021234567')
  })

  test('ค่าว่างคืนค่าว่าง ไม่ใช่ throw', () => {
    expect(normalizePhone('')).toBe('')
    expect(normalizePhone('   ')).toBe('')
  })
})

describe('cleanRequired', () => {
  const opts = { field: 'name', label: 'ชื่อ', max: 10 }

  test('ตัดช่องว่างหัวท้าย', () => {
    expect(cleanRequired('  สมชาย  ', opts)).toBe('สมชาย')
  })

  test('ช่องว่างล้วนถือว่าไม่ได้กรอก', () => {
    expect(() => cleanRequired('   ', opts)).toThrow()
  })

  test('ยาวเกินถูกปฏิเสธ ไม่ใช่ตัดเงียบ ๆ', () => {
    expect(() => cleanRequired('12345678901', opts)).toThrow()
  })
})

describe('cleanOptional', () => {
  const opts = { field: 'note', label: 'บันทึก', max: 10 }

  /** `null` กับ `''` แยกกันไม่ออกในสายตาคนอ่านรายงาน — มีค่าเดียวพอ */
  test('ช่องว่างล้วนกลายเป็น null', () => {
    expect(cleanOptional('   ', opts)).toBeNull()
    expect(cleanOptional('', opts)).toBeNull()
    expect(cleanOptional(null, opts)).toBeNull()
    expect(cleanOptional(undefined, opts)).toBeNull()
  })
})

describe('literal', () => {
  /**
   * **วัดแล้วเมื่อ 2026-08-26: ค้นด้วย `%` คืนทุกแถวในตาราง**
   *
   * `contains` ของ Prisma กลายเป็น LIKE และส่งคำค้นผ่านไปตรง ๆ
   */
  test('escape ตัวที่ LIKE ถือว่าเป็น wildcard', () => {
    expect(literal('%')).toBe('\\%')
    expect(literal('_')).toBe('\\_')
    expect(literal('50%_off')).toBe('50\\%\\_off')
  })

  test('`\\` ถูก escape ก่อนตัวอื่น ไม่ escape ซ้อนตัวเอง', () => {
    expect(literal('a\\b')).toBe('a\\\\b')
  })

  test('ข้อความปกติไม่ถูกแตะ', () => {
    expect(literal('สมชาย')).toBe('สมชาย')
  })
})
