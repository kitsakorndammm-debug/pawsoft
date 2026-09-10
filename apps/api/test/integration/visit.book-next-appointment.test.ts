import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { isAppError } from '../../src/kit/app-error.ts'
import { db } from '../../src/kit/db.ts'
import { createAppointment } from '../../src/modules/appointment/appointment.service.ts'
import { createOwner } from '../../src/modules/owner/owner.service.ts'
import { bookNextVisitAppointment } from '../../src/modules/visit/visit.service.ts'

/**
 * คิว · นัดครั้งถัดไป
 *
 * หมอกดจากหน้ารักษา — ยืมตารางเดียวกับ `Appointment.createAppointment` (ดู `///` บน
 * `bookNextVisitAppointment`) เทสนี้พิสูจน์ว่ายืมมาแล้วใช้ได้จริง ไม่ใช่แค่ดูโค้ด
 * ต้นทางว่าถูก — **ตรวจว่าลง `pet_owner_account`/`appointment` ผิดคน หรือขาด
 * `ownerId` แล้วไม่ปฏิเสธ**
 */

const NAME_PREFIX = 'TEST-VISIT-NEXTAPPT-'
const FUTURE_DATE = '2027-05-01'

async function makeOwner(suffix: string) {
  return createOwner({ name: `${NAME_PREFIX}${suffix}` }, SYSTEM_USER_ID)
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
      code: `TVNA-${suffix}-${Date.now()}`.slice(0, 20),
      ownerId,
      speciesId: species.id,
      name: `${NAME_PREFIX}${suffix}`,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  })
}

let queueSeq = 0
async function makeVisit(opts: { ownerId?: bigint | null; petId?: bigint | null; walkInPetName?: string | null }) {
  queueSeq += 1
  return db.visit.create({
    data: {
      queueNumber: 900_000 + queueSeq,
      queueDate: new Date(),
      ownerId: opts.ownerId ?? null,
      petId: opts.petId ?? null,
      walkInPetName: opts.petId ? null : (opts.walkInPetName ?? `${NAME_PREFIX}walkin`),
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
  await db.visit.deleteMany({ where: { walkInPetName: { startsWith: NAME_PREFIX } } })
  if (ids.length > 0) {
    await db.appointment.deleteMany({ where: { ownerId: { in: ids } } })
    await db.visit.deleteMany({ where: { ownerId: { in: ids } } })
    await db.pet.deleteMany({ where: { ownerId: { in: ids } } })
  }
  await db.owner.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
  await db.species.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
})

describe('คิว · นัดครั้งถัดไป', () => {
  test('คิวผูกเจ้าของและสัตว์ในทะเบียนแล้ว → นัดได้ ได้ owner/pet ตรงกับคิว', async () => {
    const owner = await makeOwner('OK')
    const pet = await makePet('OK', owner.id)
    const visit = await makeVisit({ ownerId: owner.id, petId: pet.id })

    const appt = await bookNextVisitAppointment(
      { visitId: visit.id, bookedOn: FUTURE_DATE, slot: 'MORNING_1' },
      SYSTEM_USER_ID,
    )

    expect(appt.ownerId).toBe(owner.id)
    expect(appt.petId).toBe(pet.id)
    expect(appt.status).toBe('BOOKED')
  })

  test('คิวผูกเจ้าของแล้วแต่สัตว์ยังไม่มีทะเบียน (มีแค่ชื่อ) → นัดได้ ใช้ชื่อจากคิว', async () => {
    const owner = await makeOwner('NOPET')
    const visit = await makeVisit({ ownerId: owner.id, walkInPetName: `${NAME_PREFIX}จ้าวปั้น` })

    const appt = await bookNextVisitAppointment(
      { visitId: visit.id, bookedOn: FUTURE_DATE, slot: 'MORNING_2' },
      SYSTEM_USER_ID,
    )

    expect(appt.petId).toBeNull()
    expect(appt.petNameText).toBe(`${NAME_PREFIX}จ้าวปั้น`)
  })

  test('คิวยังไม่ผูกเจ้าของ (walk-in ล้วน) → ปฏิเสธ', async () => {
    const visit = await makeVisit({})
    expect.assertions(2)

    try {
      await bookNextVisitAppointment(
        { visitId: visit.id, bookedOn: FUTURE_DATE, slot: 'AFTERNOON_1' },
        SYSTEM_USER_ID,
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('ไม่มีคิวนี้อยู่จริง → ปฏิเสธ', async () => {
    expect.assertions(2)

    try {
      await bookNextVisitAppointment(
        { visitId: 999_999_999n, bookedOn: FUTURE_DATE, slot: 'AFTERNOON_1' },
        SYSTEM_USER_ID,
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('NOT_FOUND')
    }
  })

  test('ช่วงเวลาเต็มแล้ว → นัดครั้งถัดไปก็ถูกปฏิเสธเหมือนกัน (ยืมกฎเพดานมาด้วย)', async () => {
    const fullDate = '2027-05-02'
    const fillerOwners = []
    for (let i = 0; i < 8; i++) fillerOwners.push(await makeOwner(`FILL-${i}`))
    for (const o of fillerOwners) {
      await createAppointment(
        { bookedOn: fullDate, slot: 'AFTERNOON_2', ownerId: o.id, petNameText: 'x' },
        { kind: 'staff', userId: SYSTEM_USER_ID },
      )
    }

    const owner = await makeOwner('BLOCKED')
    const pet = await makePet('BLOCKED', owner.id)
    const visit = await makeVisit({ ownerId: owner.id, petId: pet.id })

    expect.assertions(2)
    try {
      await bookNextVisitAppointment(
        { visitId: visit.id, bookedOn: fullDate, slot: 'AFTERNOON_2' },
        SYSTEM_USER_ID,
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })
})
