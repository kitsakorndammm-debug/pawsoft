import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import { getInvoiceDetail, listInvoices } from '../../src/modules/payment/payment.service.ts'
import { createOwner } from '../../src/modules/owner/owner.service.ts'

/**
 * ใบเสร็จ · พ่วงชื่อเจ้าของ/สัตว์มาด้วย
 *
 * (ผู้ใช้ขอ 2026-09-15: "ควรบอกชื่อของผู้ใช้ด้วย") — บัญชีที่กดยืนยันยอดต้องรู้ว่า
 * "ของใคร" ไม่ใช่แค่เลขที่ใบ ก่อนหน้านี้ `Invoice` ไม่พ่วงข้อมูลคิว/เจ้าของ/สัตว์มาเลย
 *
 * **ตั้งค่า Visit/Invoice ตรงเข้าฐาน ไม่ผ่าน `checkIn`/`issueInvoice`** — โมดูลนี้
 * ยังไม่มีเทสมาก่อน และการเดินให้ครบ workflow (เช็คอิน → ลงบริการ/ยา → ปิดคิว →
 * ออกใบ) ไม่ใช่สิ่งที่ต้องพิสูจน์ซ้ำที่นี่ — ที่นี่พิสูจน์แค่ว่าฟังก์ชัน "อ่าน" คืน
 * ชื่อถูกต้องเมื่อมีแถวอยู่แล้ว
 */

const NAME_PREFIX = 'TEST-INV-SUMMARY-'

async function makeOwner(suffix: string) {
  return createOwner({ name: `${NAME_PREFIX}${suffix}`, phone: '0812345678' }, SYSTEM_USER_ID)
}

async function makeSpecies(suffix: string) {
  return db.species.create({
    data: { name: `${NAME_PREFIX}${suffix}`, createdBy: SYSTEM_USER_ID, updatedBy: SYSTEM_USER_ID },
  })
}

async function makePet(suffix: string, ownerId: bigint) {
  const species = await makeSpecies(suffix)
  return db.pet.create({
    data: {
      code: `TIVS-${suffix}-${Date.now()}`.slice(0, 20),
      ownerId,
      speciesId: species.id,
      name: `${NAME_PREFIX}${suffix}`,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  })
}

let visitSeq = 0

async function makeVisit(input: {
  ownerId?: bigint | null
  petId?: bigint | null
  walkInOwnerName?: string | null
  walkInPetName?: string | null
}) {
  visitSeq += 1
  return db.visit.create({
    data: {
      queueNumber: 9_000 + visitSeq,
      queueDate: new Date('2026-09-15T00:00:00Z'),
      status: 'AWAITING_PAYMENT',
      ownerId: input.ownerId ?? null,
      petId: input.petId ?? null,
      walkInOwnerName: input.walkInOwnerName ?? null,
      walkInPetName: input.walkInPetName ?? null,
      arrivedAt: new Date(),
      // `AWAITING_PAYMENT` ต้องมี `calledAt` (CHECK ที่ฐาน) แต่ `doneAt` ต้องเป็น
      // `NULL` — ฐานบังคับให้ `doneAt` มีค่าได้เฉพาะตอน `status = 'DONE'` เท่านั้น
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
      subtotal: '100.00',
      total: '100.00',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  })
}

afterEach(async () => {
  const owners = await db.owner.findMany({
    where: { name: { startsWith: NAME_PREFIX } },
    select: { id: true },
  })
  const ids = owners.map((o) => o.id)
  const visits = await db.visit.findMany({
    where: { OR: [{ ownerId: { in: ids } }, { walkInOwnerName: { startsWith: NAME_PREFIX } }] },
    select: { id: true },
  })
  const visitIds = visits.map((v) => v.id)
  if (visitIds.length > 0) {
    await db.invoice.deleteMany({ where: { visitId: { in: visitIds } } })
  }
  await db.visit.deleteMany({ where: { id: { in: visitIds } } })
  if (ids.length > 0) {
    await db.pet.deleteMany({ where: { ownerId: { in: ids } } })
  }
  await db.owner.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
  await db.species.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
})

describe('ใบเสร็จ · พ่วงชื่อเจ้าของ/สัตว์', () => {
  test('เจ้าของและสัตว์ลงทะเบียนแล้ว → getInvoiceDetail คืนชื่อจริง', async () => {
    const owner = await makeOwner('REGISTERED')
    const pet = await makePet('REGISTERED', owner.id)
    const visit = await makeVisit({ ownerId: owner.id, petId: pet.id })
    const invoice = await makeInvoice(visit.id, `${NAME_PREFIX}REGISTERED`)

    const detail = await getInvoiceDetail(invoice.id)

    expect(detail.visit.ownerName).toBe(`${NAME_PREFIX}REGISTERED`)
    expect(detail.visit.ownerPhone).toBe('0812345678')
    expect(detail.visit.petName).toBe(`${NAME_PREFIX}REGISTERED`)
  })

  test('walk-in ไม่มีทะเบียน → ใช้ชื่อที่กรอกหน้างาน', async () => {
    const visit = await makeVisit({
      walkInOwnerName: `${NAME_PREFIX}WALKIN-OWNER`,
      walkInPetName: `${NAME_PREFIX}WALKIN-PET`,
    })
    const invoice = await makeInvoice(visit.id, `${NAME_PREFIX}WALKIN`)

    const detail = await getInvoiceDetail(invoice.id)

    expect(detail.visit.ownerName).toBe(`${NAME_PREFIX}WALKIN-OWNER`)
    expect(detail.visit.petName).toBe(`${NAME_PREFIX}WALKIN-PET`)
  })

  test('listInvoices ก็พ่วงชื่อมาด้วยเหมือนกัน (ไม่ใช่แค่ getInvoiceDetail)', async () => {
    const owner = await makeOwner('LIST')
    const visit = await makeVisit({ ownerId: owner.id, walkInPetName: `${NAME_PREFIX}LIST-PET` })
    await makeInvoice(visit.id, `${NAME_PREFIX}LIST`)

    const result = await listInvoices({ pageSize: 200 })
    const found = result.rows.find((r) => r.code === `${NAME_PREFIX}LIST`)

    expect(found?.visit.ownerName).toBe(`${NAME_PREFIX}LIST`)
    expect(found?.visit.petName).toBe(`${NAME_PREFIX}LIST-PET`)
  })
})
