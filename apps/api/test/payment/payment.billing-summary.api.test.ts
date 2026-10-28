import { afterEach, beforeAll, describe, expect, test } from 'bun:test'

import { app } from '../../src/app.ts'
import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import { addPayment, submitInvoice, verifyInvoice } from '../../src/modules/payment/payment.service.ts'
import { readJson } from '../support/api-response.ts'
import { loginAsAdmin } from '../support/login.ts'

/**
 * `GET /api/invoices/summary` · สรุปยอดบัญชีรายเดือน/รายปี
 */

const NAME_PREFIX = 'TEST-BILLSUM-API-'

let cookie: string
let verifierId: bigint

beforeAll(async () => {
  cookie = await loginAsAdmin()

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
})

async function makeVisit(seq: number) {
  return db.visit.create({
    data: {
      queueNumber: 9_700 + seq,
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

async function makeVerifiedInvoice(seq: number, code: string, total: string, receivedAt: Date) {
  const visit = await makeVisit(seq)
  const invoice = await db.invoice.create({
    data: {
      code,
      visitId: visit.id,
      subtotal: total,
      total,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  })
  await addPayment(
    { invoiceId: invoice.id, method: 'CASH', amount: total, receivedAt },
    { kind: 'staff', userId: SYSTEM_USER_ID },
  )
  await submitInvoice(invoice.id, SYSTEM_USER_ID)
  await verifyInvoice(invoice.id, verifierId)
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
})

function get(qs: string, withCookie = true) {
  return app.handle(
    new Request(`http://localhost/api/invoices/summary${qs}`, {
      headers: withCookie ? { cookie } : {},
    }),
  )
}

describe('GET /api/invoices/summary', () => {
  test('มียอดยืนยันแล้วในเดือนนั้น → 200 รวมยอดถูกต้อง แยกตามวิธีจ่าย', async () => {
    await makeVerifiedInvoice(1, `${NAME_PREFIX}A`, '300.00', new Date('2026-10-05T10:00:00+07:00'))
    await makeVerifiedInvoice(2, `${NAME_PREFIX}B`, '200.00', new Date('2026-10-20T10:00:00+07:00'))

    const res = await get('?year=2026&month=10')
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.year).toBe(2026)
    expect(body.data.month).toBe(10)
    expect(body.data.totalCount).toBe(2)
    expect(body.data.totalAmount).toBe('500.00')
    expect(typeof body.data.byMethod[0].count).toBe('number')
    expect(typeof body.data.byMethod[0].total).toBe('string')
  })

  test('ไม่ส่ง month → รวมยอดทั้งปี', async () => {
    const res = await get('?year=2026')
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.data.month).toBeNull()
  })

  test('ไม่ส่ง year → 400 INVALID', async () => {
    const res = await get('')
    const body = await readJson(res)

    expect(res.status).toBe(400)
    expect(body.error?.code).toBe('INVALID')
  })

  test('month นอกช่วง 1-12 → 400 INVALID', async () => {
    const res = await get('?year=2026&month=13')
    const body = await readJson(res)

    expect(res.status).toBe(400)
    expect(body.error?.code).toBe('INVALID')
  })

  test('ส่ง query ที่ไม่รู้จัก → 400', async () => {
    const res = await get('?year=2026&foo=bar')

    expect(res.status).toBe(400)
  })

  test('ไม่ได้ล็อกอิน → 401', async () => {
    const res = await get('?year=2026', false)

    expect(res.status).toBe(401)
  })
})
