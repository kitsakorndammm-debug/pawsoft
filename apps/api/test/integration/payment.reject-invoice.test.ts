import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import {
  addPayment,
  getInvoiceDetail,
  rejectInvoice,
  submitInvoice,
} from '../../src/modules/payment/payment.service.ts'

/**
 * ใบเสร็จ · ตีกลับ
 *
 * **ลูกค้าจ่ายเองแล้วถูกตีกลับ → ยอดที่ผิดต้องหายไปให้อัตโนมัติ** (ผู้ใช้รายงาน
 * 2026-09-29: "หน้าผู้ใช้ไม่มีจ่ายบิลอะ" หลังถูกตีกลับ) — สาเหตุคือ `paid` ไม่เคยถูก
 * ลดกลับตอนตีกลับ ยอดค้างเลยค้างที่ 0 ทั้งที่ยังไม่ได้รับเงินจริง
 *
 * **แต่ยอดที่พนักงานบันทึกจากการจ่ายหน้าร้านต้องไม่ถูกลบอัตโนมัติ** — เงินอาจได้
 * รับจริงแล้ว แค่หลักฐาน/ยอดที่กรอกผิด ต้องรอพนักงานตรวจแก้เอง ไม่ใช่ให้ลูกค้า
 * เข้าใจผิดว่าต้องจ่ายซ้ำ
 */

const NAME_PREFIX = 'TEST-REJECT-INV-'

let visitSeq = 0

async function makeVisit() {
  visitSeq += 1
  return db.visit.create({
    data: {
      queueNumber: 9_500 + visitSeq,
      queueDate: new Date('2026-09-29T00:00:00Z'),
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

async function makeInvoice(visitId: bigint, code: string) {
  return db.invoice.create({
    data: {
      code,
      visitId,
      subtotal: '500.00',
      total: '500.00',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  })
}

async function makeOwnerAccount(suffix: string) {
  return db.petOwnerAccount.create({
    data: {
      googleSub: `${NAME_PREFIX}${suffix}-${Date.now()}`,
      email: `${NAME_PREFIX}${suffix}-${Date.now()}@example.com`.toLowerCase(),
      displayName: `${NAME_PREFIX}${suffix}`,
    },
  })
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
  await db.petOwnerAccount.deleteMany({ where: { displayName: { startsWith: NAME_PREFIX } } })
})

describe('ใบเสร็จ · ตีกลับ', () => {
  test('ลูกค้าแนบเอง แล้วถูกตีกลับ → ยอดที่แนบไว้ถูกลบออก ยอดค้างเปิดกลับมาเต็ม', async () => {
    const account = await makeOwnerAccount('OWNER-PAID')
    const visit = await makeVisit()
    const invoice = await makeInvoice(visit.id, `${NAME_PREFIX}OWNER-PAID`)

    await addPayment(
      { invoiceId: invoice.id, method: 'TRANSFER', amount: '500.00' },
      { kind: 'owner', accountId: account.id },
    )
    await submitInvoice(invoice.id, SYSTEM_USER_ID)

    await rejectInvoice(invoice.id, 'ยอดไม่ตรง', SYSTEM_USER_ID)

    const detail = await getInvoiceDetail(invoice.id)

    expect(detail.status).toBe('REJECTED')
    expect(detail.rejectReason).toBe('ยอดไม่ตรง')
    expect(detail.paid.toString()).toBe('0')
    expect(detail.total.sub(detail.paid).toString()).toBe('500')
    expect(detail.payments).toHaveLength(0)
  })

  test('พนักงานบันทึกจากการจ่ายหน้าร้าน แล้วถูกตีกลับ → ยอดยังอยู่ รอพนักงานแก้เอง', async () => {
    const visit = await makeVisit()
    const invoice = await makeInvoice(visit.id, `${NAME_PREFIX}STAFF-PAID`)

    await addPayment(
      { invoiceId: invoice.id, method: 'CASH', amount: '500.00' },
      { kind: 'staff', userId: SYSTEM_USER_ID },
    )
    await submitInvoice(invoice.id, SYSTEM_USER_ID)

    await rejectInvoice(invoice.id, 'สลิปอ่านไม่ออก', SYSTEM_USER_ID)

    const detail = await getInvoiceDetail(invoice.id)

    expect(detail.status).toBe('REJECTED')
    expect(detail.paid.toString()).toBe('500')
    expect(detail.payments).toHaveLength(1)
  })
})
