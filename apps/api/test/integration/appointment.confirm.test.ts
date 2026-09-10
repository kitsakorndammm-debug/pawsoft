import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { isAppError } from '../../src/kit/app-error.ts'
import { db } from '../../src/kit/db.ts'
import { confirmAppointment, createAppointment } from '../../src/modules/appointment/appointment.service.ts'
import { createOwner } from '../../src/modules/owner/owner.service.ts'

/**
 * การจอง · ยืนยัน
 *
 * ครอบคลุมพฤติกรรมเดิม (ยืนยันได้จาก `PENDING` เท่านั้น) และกฎใหม่ — **เพดาน 8 คิวต่อ
 * ช่วงเวลา นับเฉพาะ `BOOKED`** เช็คตอนยืนยันด้วย เพราะช่วงอาจเต็มไปแล้วระหว่างที่ใบนี้
 * ยังรอพนักงานโทรกลับ (ผู้ใช้ตัดสิน 2026-09-08)
 */

const NAME_PREFIX = 'TEST-APPT-CONFIRM-'

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

async function bookedAppointment(ownerId: bigint, bookedOn: string, slot: 'MORNING_1' | 'MORNING_2' | 'AFTERNOON_1' | 'AFTERNOON_2') {
  return createAppointment(
    { bookedOn, slot, ownerId, petNameText: 'ข้าวปั้น' },
    { kind: 'staff', userId: SYSTEM_USER_ID },
  )
}

async function pendingAppointment(
  ownerId: bigint,
  accountId: bigint,
  bookedOn: string,
  slot: 'MORNING_1' | 'MORNING_2' | 'AFTERNOON_1' | 'AFTERNOON_2',
) {
  return createAppointment(
    { bookedOn, slot, ownerId, petNameText: 'ข้าวปั้น', status: 'PENDING' },
    { kind: 'owner', accountId },
  )
}

afterEach(async () => {
  const owners = await db.owner.findMany({
    where: { name: { startsWith: NAME_PREFIX } },
    select: { id: true },
  })
  const ids = owners.map((o) => o.id)
  if (ids.length > 0) {
    await db.appointment.deleteMany({ where: { ownerId: { in: ids } } })
  }
  await db.owner.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
  await db.petOwnerAccount.deleteMany({ where: { googleSub: { startsWith: NAME_PREFIX } } })
})

describe('การจอง · ยืนยัน', () => {
  test('ยืนยันใบที่รออยู่ (PENDING) → เป็น BOOKED และบันทึกว่าใครยืนยัน', async () => {
    const owner = await makeOwner('OK')
    const account = await makeOwnerAccount('OK')
    const pending = await pendingAppointment(owner.id, account.id, '2027-04-01', 'MORNING_1')

    const confirmed = await confirmAppointment(pending.id, SYSTEM_USER_ID)

    expect(confirmed.status).toBe('BOOKED')
    expect(confirmed.confirmedBy).toBe(SYSTEM_USER_ID)
    expect(confirmed.confirmedAt).not.toBeNull()
  })

  test('ยืนยันใบที่ BOOKED อยู่แล้ว → ปฏิเสธ', async () => {
    const owner = await makeOwner('ALREADY-BOOKED')
    const booked = await bookedAppointment(owner.id, '2027-04-01', 'MORNING_2')
    expect.assertions(2)

    try {
      await confirmAppointment(booked.id, SYSTEM_USER_ID)
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })

  test('ยืนยันใบที่ไม่มีอยู่จริง → ปฏิเสธ', async () => {
    expect.assertions(2)

    try {
      await confirmAppointment(999_999_999n, SYSTEM_USER_ID)
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('NOT_FOUND')
    }
  })

  test('ช่วงเวลามี BOOKED ครบ 8 คิวแล้ว ก่อนกดยืนยัน → ยืนยันไม่ได้ ยังค้างเป็น PENDING', async () => {
    const bookedDate = '2027-04-02'
    // สร้างทีละคน ไม่ใช่ Promise.all — nextCode() ไม่ปลอดภัยกับการเรียกพร้อมกัน
    const bookedOwners = []
    for (let i = 0; i < 8; i++) bookedOwners.push(await makeOwner(`FULL-${i}`))
    for (const owner of bookedOwners) {
      await bookedAppointment(owner.id, bookedDate, 'AFTERNOON_1')
    }

    const waitingOwner = await makeOwner('WAITING')
    const waitingAccount = await makeOwnerAccount('WAITING')
    const pending = await pendingAppointment(waitingOwner.id, waitingAccount.id, bookedDate, 'AFTERNOON_1')

    expect.assertions(3)
    try {
      await confirmAppointment(pending.id, SYSTEM_USER_ID)
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }

    const stillPending = await db.appointment.findUnique({ where: { id: pending.id } })
    expect(stillPending?.status).toBe('PENDING')
  })
})
