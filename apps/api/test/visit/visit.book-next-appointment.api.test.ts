import { afterEach, beforeAll, describe, expect, test } from 'bun:test'

import { app } from '../../src/app.ts'
import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import { createAppointment } from '../../src/modules/appointment/appointment.service.ts'
import { createOwner } from '../../src/modules/owner/owner.service.ts'
import { readJson } from '../support/api-response.ts'
import { loginAsAdmin } from '../support/login.ts'

/**
 * `POST /api/visits/:id/next-appointment` · หมอนัดครั้งถัดไปจากหน้ารักษา
 *
 * ใช้สิทธิ์ `medical:write` (ไม่ใช่ `reception:write` ของ endpoint จองเดิม) เพราะหมอ
 * ไม่ถือ `reception:write` — ดู `///` บน `bookNextVisitAppointment`
 */

const NAME_PREFIX = 'TEST-VISIT-NEXTAPPT-API-'
const FUTURE_DATE = '2027-06-01'

let cookie: string

beforeAll(async () => {
  cookie = await loginAsAdmin()
})

async function makeOwner(suffix: string) {
  return createOwner({ name: `${NAME_PREFIX}${suffix}` }, SYSTEM_USER_ID)
}

/**
 * ต้องมี `petId` จริง ไม่ใช่แค่ชื่อ — `appointment_no_double_booking_key` เป็น unique
 * index บน `(owner_id, pet_id, booked_on, slot)` และ Postgres ไม่ถือว่า `NULL = NULL`
 * จึงไม่กันซ้ำเลยถ้า `pet_id` เป็น null ทั้งสองแถว (ดู `appointment.create.test.ts`)
 */
async function makePet(suffix: string, ownerId: bigint) {
  const species = await db.species.create({
    data: { name: `${NAME_PREFIX}${suffix}`, createdBy: SYSTEM_USER_ID, updatedBy: SYSTEM_USER_ID },
  })
  return db.pet.create({
    data: {
      code: `TVNAA-${suffix}-${Date.now()}`.slice(0, 20),
      ownerId,
      speciesId: species.id,
      name: `${NAME_PREFIX}${suffix}`,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  })
}

let queueSeq = 0
async function makeVisit(opts: { ownerId?: bigint | null; petId?: bigint | null }) {
  queueSeq += 1
  return db.visit.create({
    data: {
      queueNumber: 910_000 + queueSeq,
      queueDate: new Date(),
      ownerId: opts.ownerId ?? null,
      petId: opts.petId ?? null,
      walkInPetName: opts.petId ? null : `${NAME_PREFIX}pet`,
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
  await db.visit.deleteMany({ where: { walkInPetName: `${NAME_PREFIX}pet` } })
  if (ids.length > 0) {
    await db.appointment.deleteMany({ where: { ownerId: { in: ids } } })
    await db.visit.deleteMany({ where: { ownerId: { in: ids } } })
    await db.pet.deleteMany({ where: { ownerId: { in: ids } } })
  }
  await db.owner.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
  await db.species.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
})

function post(visitId: bigint, body: unknown, withCookie = true) {
  return app.handle(
    new Request(`http://localhost/api/visits/${visitId}/next-appointment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(withCookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  )
}

describe('POST /api/visits/:id/next-appointment', () => {
  test('คิวผูกเจ้าของแล้ว → 201 ได้ใบจองใหม่ ชนิดบนสายถูกต้อง', async () => {
    const owner = await makeOwner('OK')
    const visit = await makeVisit({ ownerId: owner.id })

    const res = await post(visit.id, { bookedOn: FUTURE_DATE, slot: 'MORNING_1' })
    const body = await readJson(res)

    expect(res.status).toBe(201)
    expect(body.ok).toBe(true)
    expect(typeof body.data.id).toBe('number')
    expect(body.data.ownerId).toBe(Number(owner.id))
    expect(body.data.status).toBe('BOOKED')
    expect(body.data.bookedOn).toBe(FUTURE_DATE)
  })

  test('คิวยังไม่ผูกเจ้าของ → 400 INVALID', async () => {
    const visit = await makeVisit({})

    const res = await post(visit.id, { bookedOn: FUTURE_DATE, slot: 'MORNING_2' })
    const body = await readJson(res)

    expect(res.status).toBe(400)
    expect(body.error?.code).toBe('INVALID')
  })

  test('ไม่มีคิวนี้ → 404 NOT_FOUND', async () => {
    const res = await post(999_999_999n, { bookedOn: FUTURE_DATE, slot: 'MORNING_1' })
    const body = await readJson(res)

    expect(res.status).toBe(404)
    expect(body.error?.code).toBe('NOT_FOUND')
  })

  test('ส่งฟิลด์ที่ไม่รู้จัก → 400', async () => {
    const owner = await makeOwner('UNKNOWN-FIELD')
    const visit = await makeVisit({ ownerId: owner.id })

    const res = await post(visit.id, { bookedOn: FUTURE_DATE, slot: 'MORNING_1', ownerId: 1 })

    expect(res.status).toBe(400)
  })

  test('ไม่ได้ล็อกอิน → 401', async () => {
    const owner = await makeOwner('NO-LOGIN')
    const visit = await makeVisit({ ownerId: owner.id })

    const res = await post(visit.id, { bookedOn: FUTURE_DATE, slot: 'MORNING_1' }, false)

    expect(res.status).toBe(401)
  })

  test('เจ้าของและสัตว์เดียวกันจองช่วงเดียวกันซ้ำ → 409 DUPLICATE', async () => {
    const owner = await makeOwner('DUP')
    const pet = await makePet('DUP', owner.id)
    const visit = await makeVisit({ ownerId: owner.id, petId: pet.id })
    await createAppointment(
      { bookedOn: FUTURE_DATE, slot: 'AFTERNOON_1', ownerId: owner.id, petId: pet.id },
      { kind: 'staff', userId: SYSTEM_USER_ID },
    )

    const res = await post(visit.id, { bookedOn: FUTURE_DATE, slot: 'AFTERNOON_1' })
    const body = await readJson(res)

    expect(res.status).toBe(409)
    expect(body.error?.code).toBe('DUPLICATE')
  })
})
