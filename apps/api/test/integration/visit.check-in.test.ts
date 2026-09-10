import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { isAppError } from '../../src/kit/app-error.ts'
import { db } from '../../src/kit/db.ts'
import { createAppointment, todayDate } from '../../src/modules/appointment/appointment.service.ts'
import { createOwner } from '../../src/modules/owner/owner.service.ts'
import { checkIn } from '../../src/modules/visit/visit.service.ts'

/**
 * คิว · เปิดคิวจากใบจอง — **เช็คอินได้เฉพาะวันที่นัดไว้ หรือหลังจากนั้น**
 *
 * (ผู้ใช้ตัดสิน 2026-09-09) เดิมกด "มาถึงแล้ว" กับใบจองวันไหนก็ได้ทันที ไม่สนว่าใบจอง
 * นัดไว้วันไหน — คิวที่เกิดจะถูกลงเป็น**วันนี้เสมอ** (ดู `todayDate()` ใน `checkIn`)
 * ทำให้กดเช็คอินใบจองวันพรุ่งนี้แล้วได้คิววันนี้ไปเงียบ ๆ · ใบจองที่ยังไม่ถึงวันนัด
 * จึงต้องถูกปฏิเสธก่อนถึงจะเปิดคิวได้
 */

const NAME_PREFIX = 'TEST-VISIT-CHECKIN-'

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
      code: `TVCI-${suffix}-${Date.now()}`.slice(0, 20),
      ownerId,
      speciesId: species.id,
      name: `${NAME_PREFIX}${suffix}`,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  })
}

function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10)
}

afterEach(async () => {
  const owners = await db.owner.findMany({
    where: { name: { startsWith: NAME_PREFIX } },
    select: { id: true },
  })
  const ids = owners.map((o) => o.id)
  if (ids.length > 0) {
    await db.visit.deleteMany({ where: { ownerId: { in: ids } } })
    await db.appointment.deleteMany({ where: { ownerId: { in: ids } } })
    await db.pet.deleteMany({ where: { ownerId: { in: ids } } })
  }
  await db.owner.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
  await db.species.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
})

describe('คิว · เปิดคิวจากใบจอง › ต้องถึงวันนัดก่อน', () => {
  test('ใบจองนัดไว้วันพรุ่งนี้ → เช็คอินวันนี้ไม่ได้', async () => {
    const tomorrow = new Date(todayDate().getTime() + 24 * 60 * 60 * 1_000)
    const owner = await makeOwner('FUTURE')
    const pet = await makePet('FUTURE', owner.id)
    const appt = await createAppointment(
      { bookedOn: isoOf(tomorrow), slot: 'MORNING_1', ownerId: owner.id, petId: pet.id },
      { kind: 'staff', userId: SYSTEM_USER_ID },
    )

    expect.assertions(2)
    try {
      await checkIn({ appointmentId: appt.id, triage: 'NORMAL' }, SYSTEM_USER_ID)
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('ใบจองนัดไว้วันนี้ → เช็คอินได้ปกติ', async () => {
    const owner = await makeOwner('TODAY')
    const pet = await makePet('TODAY', owner.id)
    const appt = await createAppointment(
      { bookedOn: isoOf(todayDate()), slot: 'MORNING_2', ownerId: owner.id, petId: pet.id },
      { kind: 'staff', userId: SYSTEM_USER_ID },
    )

    const visit = await checkIn({ appointmentId: appt.id, triage: 'NORMAL' }, SYSTEM_USER_ID)

    expect(visit.appointmentId).toBe(appt.id)
  })

  test('ใบจองนัดไว้เมื่อวาน (เลยวันนัดมาแล้ว) → ยังเช็คอินได้', async () => {
    // `createAppointment` ห้ามจองย้อนหลังอยู่แล้ว — จำลอง "นัดไว้วันนี้ แต่ยังไม่มีใคร
    // มาเช็คอินจนข้ามวัน" ด้วยการแก้ `bookedOn` ตรง ๆ หลังสร้าง ไม่ผ่าน service
    const yesterday = new Date(todayDate().getTime() - 24 * 60 * 60 * 1_000)
    const owner = await makeOwner('PAST')
    const pet = await makePet('PAST', owner.id)
    const appt = await createAppointment(
      { bookedOn: isoOf(todayDate()), slot: 'AFTERNOON_1', ownerId: owner.id, petId: pet.id },
      { kind: 'staff', userId: SYSTEM_USER_ID },
    )
    await db.appointment.update({ where: { id: appt.id }, data: { bookedOn: yesterday } })

    const visit = await checkIn({ appointmentId: appt.id, triage: 'NORMAL' }, SYSTEM_USER_ID)

    expect(visit.appointmentId).toBe(appt.id)
  })
})
