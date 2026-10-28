import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import {
  addPayment,
  getBillingSummary,
  submitInvoice,
  verifyInvoice,
} from '../../src/modules/payment/payment.service.ts'

/**
 * สรุปยอดบัญชี · รายเดือน/รายปี
 *
 * (ผู้ใช้ขอ 2026-10-29: "ให้มันตรงกับยอดที่เจ้าของได้รับ" — บัญชีเอาตัวเลขนี้ไปเทียบกับ
 * bank statement/เงินสดในมือเอง นอกระบบ · ระบบมีหน้าที่แค่สรุปยอดให้ถูก)
 *
 * **ตัดรอบด้วย `payment.receivedAt` ไม่ใช่ `invoice.verifiedAt`** — เงินเข้าจริงวันไหน
 * ต้องนับเดือนนั้น ต่อให้บัญชีมากดยืนยันข้ามเดือนไปแล้วก็ตาม
 */

const NAME_PREFIX = 'TEST-BILLSUM-'

let visitSeq = 0
let verifierId: bigint | null = null

async function makeVisit() {
  visitSeq += 1
  return db.visit.create({
    data: {
      queueNumber: 9_600 + visitSeq,
      queueDate: new Date('2026-10-01T00:00:00Z'),
      status: 'AWAITING_PAYMENT',
      walkInOwnerName: `${NAME_PREFIX}OWNER`,
      walkInPetName: `${NAME_PREFIX}PET`,
      arrivedAt: new Date(),
      calledAt: new Date(),
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  })
}

async function makeInvoice(visitId: bigint, code: string, total: string) {
  return db.invoice.create({
    data: {
      code,
      visitId,
      subtotal: total,
      total,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  })
}

/** บัญชีคนที่สอง — `verifyInvoice` ต้องไม่ใช่คนเดียวกับที่ `submitInvoice` */
async function makeVerifier(): Promise<bigint> {
  if (verifierId !== null) return verifierId

  const role = await db.role.findFirst({ select: { id: true } })
  if (!role) throw new Error('ไม่พบ role ใด ๆ ในฐานเทส')

  const user = await db.user.create({
    data: {
      username: `${NAME_PREFIX}VERIFIER-${Date.now()}`,
      passwordHash: 'TEST-HASH-NOT-A-REAL-PASSWORD',
      roleId: role.id,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  })
  verifierId = user.id
  return user.id
}

/**
 * รับเงินแล้วยืนยันทันที โดยกำหนดเวลาที่เงินเข้าจริงเอง (`receivedAt`)
 *
 * **สร้างคิวใหม่ให้เอง** — หนึ่งคิวมีได้แค่หนึ่งใบที่ยังไม่ถูกยกเลิก (`invoice_visit_live_key`)
 */
async function payAndVerify(
  code: string,
  total: string,
  method: 'CASH' | 'PROMPTPAY' | 'TRANSFER',
  receivedAt: Date,
) {
  const visit = await makeVisit()
  const invoice = await makeInvoice(visit.id, code, total)
  await addPayment(
    { invoiceId: invoice.id, method, amount: total, receivedAt },
    { kind: 'staff', userId: SYSTEM_USER_ID },
  )
  await submitInvoice(invoice.id, SYSTEM_USER_ID)
  await verifyInvoice(invoice.id, await makeVerifier())
  return invoice
}

afterEach(async () => {
  const visits = await db.visit.findMany({
    where: { walkInOwnerName: `${NAME_PREFIX}OWNER` },
    select: { id: true },
  })
  const visitIds = visits.map((v) => v.id)
  if (visitIds.length > 0) {
    await db.payment.deleteMany({ where: { invoice: { visitId: { in: visitIds } } } })
    await db.invoice.deleteMany({ where: { visitId: { in: visitIds } } })
  }
  await db.visit.deleteMany({ where: { id: { in: visitIds } } })
  if (verifierId !== null) {
    await db.user.delete({ where: { id: verifierId } }).catch(() => {})
    verifierId = null
  }
})

describe('สรุปยอดบัญชี · รายเดือน/รายปี', () => {
  test('เดือนที่ระบุ — รวมยอดเฉพาะใบ VERIFIED ที่เงินเข้าในเดือนนั้น แยกตามวิธีจ่าย', async () => {
    await payAndVerify(
      `${NAME_PREFIX}OCT-CASH`,
      '300.00',
      'CASH',
      new Date('2026-10-05T10:00:00+07:00'),
    )
    await payAndVerify(
      `${NAME_PREFIX}OCT-PP`,
      '200.00',
      'PROMPTPAY',
      new Date('2026-10-20T10:00:00+07:00'),
    )
    // นอกเดือนตุลา — ต้องไม่ถูกนับ
    await payAndVerify(`${NAME_PREFIX}NOV`, '999.00', 'CASH', new Date('2026-11-01T10:00:00+07:00'))

    const summary = await getBillingSummary({ year: 2026, month: 10 })

    expect(summary.year).toBe(2026)
    expect(summary.month).toBe(10)
    expect(summary.totalCount).toBe(2)
    expect(summary.totalAmount).toBe('500.00')

    const cash = summary.byMethod.find((m) => m.method === 'CASH')
    const promptpay = summary.byMethod.find((m) => m.method === 'PROMPTPAY')
    expect(cash?.count).toBe(1)
    expect(cash?.total).toBe('300.00')
    expect(promptpay?.count).toBe(1)
    expect(promptpay?.total).toBe('200.00')
  })

  test('ไม่ระบุเดือน — รวมยอดทั้งปี', async () => {
    await payAndVerify(
      `${NAME_PREFIX}JAN`,
      '100.00',
      'TRANSFER',
      new Date('2026-01-10T10:00:00+07:00'),
    )
    await payAndVerify(
      `${NAME_PREFIX}DEC`,
      '150.00',
      'TRANSFER',
      new Date('2026-12-20T10:00:00+07:00'),
    )

    const summary = await getBillingSummary({ year: 2026 })

    expect(summary.month).toBeNull()
    expect(summary.totalCount).toBe(2)
    expect(summary.totalAmount).toBe('250.00')
  })

  test('ใบที่ยังไม่ยืนยัน (รอบัญชีตรวจ) ไม่ถูกนับเข้ายอด', async () => {
    const visit = await makeVisit()
    const invoice = await makeInvoice(visit.id, `${NAME_PREFIX}PENDING`, '400.00')
    await addPayment(
      {
        invoiceId: invoice.id,
        method: 'CASH',
        amount: '400.00',
        receivedAt: new Date('2026-10-15T10:00:00+07:00'),
      },
      { kind: 'staff', userId: SYSTEM_USER_ID },
    )
    await submitInvoice(invoice.id, SYSTEM_USER_ID)
    // ไม่ verify

    const summary = await getBillingSummary({ year: 2026, month: 10 })

    expect(summary.totalCount).toBe(0)
    expect(summary.totalAmount).toBe('0.00')
  })

  test('เดือนที่ไม่มีข้อมูล — คืนยอด 0 ไม่ error', async () => {
    const summary = await getBillingSummary({ year: 2019, month: 1 })

    expect(summary.totalCount).toBe(0)
    expect(summary.totalAmount).toBe('0.00')
    expect(summary.byMethod).toHaveLength(0)
  })

  test('เดือนนอกช่วง 1-12 — ปฏิเสธ', async () => {
    await expect(getBillingSummary({ year: 2026, month: 13 })).rejects.toMatchObject({
      code: 'INVALID',
    })
    await expect(getBillingSummary({ year: 2026, month: 0 })).rejects.toMatchObject({
      code: 'INVALID',
    })
  })
})
