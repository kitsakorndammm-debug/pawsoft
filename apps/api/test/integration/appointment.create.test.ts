import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { isAppError } from '../../src/kit/app-error.ts'
import { db } from '../../src/kit/db.ts'
import { createAppointment } from '../../src/modules/appointment/appointment.service.ts'
import { createOwner } from '../../src/modules/owner/owner.service.ts'

/**
 * การจอง · เพิ่ม
 *
 * ครอบคลุมพฤติกรรมเดิม (staff จองแล้วได้ `BOOKED` ทันที · owner จองเองส่ง `PENDING` มา
 * เอง · จองซ้ำที่เดียวกันไม่ได้) และกฎใหม่ — **เพดาน 8 คิวต่อช่วงเวลา นับเฉพาะ `BOOKED`**
 * (ผู้ใช้ตัดสิน 2026-09-08) ยังไม่บล็อกตอนสร้างแบบ `PENDING` เพราะยังไม่ใช่คำมั่นของคลินิก
 */

const NAME_PREFIX = 'TEST-APPT-CREATE-'
const FUTURE_DATE = '2027-03-01'

async function makeOwner(suffix: string) {
  return createOwner({ name: `${NAME_PREFIX}${suffix}` }, SYSTEM_USER_ID)
}

/** `createdByOwnerAccountId` ชี้ `pet_owner_account` ไม่ใช่ `user` — ต้องมีแถวจริง */
async function makeOwnerAccount(suffix: string) {
  return db.petOwnerAccount.create({
    data: {
      googleSub: `${NAME_PREFIX}${suffix}`,
      email: `${NAME_PREFIX}${suffix}@example.com`,
      displayName: `${NAME_PREFIX}${suffix}`,
    },
  })
}

/**
 * ต้องมี `petId` จริง ๆ ไม่ใช่แค่ `petNameText` — `appointment_no_double_booking_key`
 * เป็น unique index บน `(owner_id, pet_id, booked_on, slot)` และ Postgres ไม่ถือว่า
 * `NULL = NULL` จึงไม่กันซ้ำเลยถ้า `pet_id` เป็น null ทั้งสองแถว (พบระหว่างเขียนเทสนี้)
 */
async function makePet(suffix: string, ownerId: bigint) {
  const species = await db.species.create({
    data: { name: `${NAME_PREFIX}${suffix}`, createdBy: SYSTEM_USER_ID, updatedBy: SYSTEM_USER_ID },
  })
  return db.pet.create({
    data: {
      code: `TAPC-${suffix}-${Date.now()}`.slice(0, 20),
      ownerId,
      speciesId: species.id,
      name: `${NAME_PREFIX}${suffix}`,
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
  if (ids.length > 0) {
    await db.appointment.deleteMany({ where: { ownerId: { in: ids } } })
    await db.pet.deleteMany({ where: { ownerId: { in: ids } } })
  }
  await db.owner.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
  await db.species.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
  await db.petOwnerAccount.deleteMany({ where: { googleSub: { startsWith: NAME_PREFIX } } })
})

describe('การจอง · เพิ่ม', () => {
  test('พนักงานจองให้ (ทางโทรศัพท์) → ได้สถานะ BOOKED ทันที ไม่ต้องรอยืนยัน', async () => {
    const owner = await makeOwner('STAFF-BOOK')

    const created = await createAppointment(
      { bookedOn: FUTURE_DATE, slot: 'MORNING_1', ownerId: owner.id, petNameText: 'ข้าวปั้น' },
      { kind: 'staff', userId: SYSTEM_USER_ID },
    )

    expect(created.status).toBe('BOOKED')
    expect(created.source).toBe('PHONE')
  })

  test('ลูกค้าจองเอง ส่งสถานะ PENDING มา → ยังคงเป็น PENDING', async () => {
    const owner = await makeOwner('OWNER-BOOK')
    const account = await makeOwnerAccount('OWNER-BOOK')

    const created = await createAppointment(
      {
        bookedOn: FUTURE_DATE,
        slot: 'MORNING_2',
        ownerId: owner.id,
        petNameText: 'ข้าวปั้น',
        status: 'PENDING',
      },
      { kind: 'owner', accountId: account.id },
    )

    expect(created.status).toBe('PENDING')
    expect(created.source).toBe('ONLINE')
  })

  test('ไม่ระบุทั้ง petId และ petNameText → ปฏิเสธ', async () => {
    const owner = await makeOwner('NO-PET')
    expect.assertions(2)

    try {
      await createAppointment(
        { bookedOn: FUTURE_DATE, slot: 'MORNING_1', ownerId: owner.id },
        { kind: 'staff', userId: SYSTEM_USER_ID },
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('จองย้อนหลัง → ปฏิเสธ', async () => {
    const owner = await makeOwner('PAST-DATE')
    expect.assertions(2)

    try {
      await createAppointment(
        { bookedOn: '2020-01-01', slot: 'MORNING_1', ownerId: owner.id, petNameText: 'ข้าวปั้น' },
        { kind: 'staff', userId: SYSTEM_USER_ID },
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('เจ้าของที่เลือกไม่มีอยู่จริง → ปฏิเสธ', async () => {
    expect.assertions(2)

    try {
      await createAppointment(
        { bookedOn: FUTURE_DATE, slot: 'MORNING_1', ownerId: 999_999_999n, petNameText: 'ข้าวปั้น' },
        { kind: 'staff', userId: SYSTEM_USER_ID },
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('NOT_FOUND')
    }
  })

  test('เจ้าของและสัตว์ตัวเดียวกัน จองวันและช่วงเดียวกันซ้ำ → ปฏิเสธ', async () => {
    const owner = await makeOwner('DUP')
    const pet = await makePet('DUP', owner.id)
    await createAppointment(
      { bookedOn: FUTURE_DATE, slot: 'AFTERNOON_1', ownerId: owner.id, petId: pet.id },
      { kind: 'staff', userId: SYSTEM_USER_ID },
    )
    expect.assertions(2)

    try {
      await createAppointment(
        { bookedOn: FUTURE_DATE, slot: 'AFTERNOON_1', ownerId: owner.id, petId: pet.id },
        { kind: 'staff', userId: SYSTEM_USER_ID },
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('DUPLICATE')
    }
  })

  test('ช่วงเวลามี BOOKED ครบ 8 คิวแล้ว → จองแบบ BOOKED เพิ่มไม่ได้', async () => {
    // สร้างทีละคน ไม่ใช่ Promise.all — nextCode() ไม่ปลอดภัยกับการเรียกพร้อมกัน
    const owners = []
    for (let i = 0; i < 9; i++) owners.push(await makeOwner(`FULL-${i}`))

    for (const owner of owners.slice(0, 8)) {
      await createAppointment(
        { bookedOn: FUTURE_DATE, slot: 'AFTERNOON_2', ownerId: owner.id, petNameText: 'ข้าวปั้น' },
        { kind: 'staff', userId: SYSTEM_USER_ID },
      )
    }

    expect.assertions(2)
    try {
      await createAppointment(
        { bookedOn: FUTURE_DATE, slot: 'AFTERNOON_2', ownerId: owners[8]!.id, petNameText: 'ข้าวปั้น' },
        { kind: 'staff', userId: SYSTEM_USER_ID },
      )
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('ช่วงเวลาเต็มแล้ว แต่จองแบบ PENDING ยังทำได้ — ยังไม่ใช่คำมั่นของคลินิก', async () => {
    // วันที่แยกจากเทสอื่นในไฟล์นี้ — กันไม่ให้ MORNING_1 ที่เทสอื่นใช้อยู่ก่อนแล้วเต็มไปด้วย
    const isolatedDate = '2027-03-02'
    // สร้างทีละคน ไม่ใช่ Promise.all — nextCode() ไม่ปลอดภัยกับการเรียกพร้อมกัน
    const owners = []
    for (let i = 0; i < 9; i++) owners.push(await makeOwner(`PENDING-OK-${i}`))

    for (const owner of owners.slice(0, 8)) {
      await createAppointment(
        { bookedOn: isolatedDate, slot: 'MORNING_1', ownerId: owner.id, petNameText: 'ข้าวปั้น' },
        { kind: 'staff', userId: SYSTEM_USER_ID },
      )
    }

    const account = await makeOwnerAccount('PENDING-OK')
    const created = await createAppointment(
      {
        bookedOn: isolatedDate,
        slot: 'MORNING_1',
        ownerId: owners[8]!.id,
        petNameText: 'ข้าวปั้น',
        status: 'PENDING',
      },
      { kind: 'owner', accountId: account.id },
    )

    expect(created.status).toBe('PENDING')
  })
})
