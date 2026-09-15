import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { isAppError } from '../../src/kit/app-error.ts'
import { db } from '../../src/kit/db.ts'
import { createAppointment, listAppointmentDailyCounts } from '../../src/modules/appointment/appointment.service.ts'
import { createOwner } from '../../src/modules/owner/owner.service.ts'

/**
 * การจอง · จำนวนต่อวันในช่วง
 *
 * ใช้วาดมุมมองสัปดาห์/เดือน/ปีของตารางจอง — คำถามคือ "วันนี้เต็มแค่ไหน" ไม่ใช่
 * "ใครจองไว้บ้าง" จึงคืนแค่ตัวเลขต่อวัน ไม่ใช่รายชื่อ
 *
 * **นับเฉพาะ `BOOKED`** — เหตุผลเดียวกับเพดานที่ `requireSlotCapacity` (`PENDING`
 * ยังไม่ใช่คำมั่นของคลินิก)
 */

const NAME_PREFIX = 'TEST-APPT-DAILY-'

async function makeOwner(suffix: string) {
  return createOwner({ name: `${NAME_PREFIX}${suffix}` }, SYSTEM_USER_ID)
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
})

describe('การจอง · จำนวนต่อวันในช่วง', () => {
  test('มีจองหลายวันในช่วง → นับแยกวันถูกต้อง', async () => {
    const owner = await makeOwner('SUM')

    await createAppointment(
      { bookedOn: '2027-04-05', slot: 'MORNING_1', ownerId: owner.id, petNameText: 'A' },
      { kind: 'staff', userId: SYSTEM_USER_ID },
    )
    await createAppointment(
      { bookedOn: '2027-04-05', slot: 'MORNING_2', ownerId: owner.id, petNameText: 'B' },
      { kind: 'staff', userId: SYSTEM_USER_ID },
    )
    await createAppointment(
      { bookedOn: '2027-04-06', slot: 'MORNING_1', ownerId: owner.id, petNameText: 'C' },
      { kind: 'staff', userId: SYSTEM_USER_ID },
    )

    const rows = await listAppointmentDailyCounts({ from: '2027-04-01', to: '2027-04-30' })
    const day5 = rows.find((r) => r.bookedOn.toISOString().slice(0, 10) === '2027-04-05')
    const day6 = rows.find((r) => r.bookedOn.toISOString().slice(0, 10) === '2027-04-06')

    expect(day5?.count).toBe(2)
    expect(day6?.count).toBe(1)
  })

  test('นับเฉพาะ BOOKED — PENDING ไม่นับ', async () => {
    const owner = await makeOwner('PENDING')

    await createAppointment(
      {
        bookedOn: '2027-05-10',
        slot: 'MORNING_1',
        ownerId: owner.id,
        petNameText: 'A',
        status: 'PENDING',
      },
      { kind: 'staff', userId: SYSTEM_USER_ID },
    )

    const rows = await listAppointmentDailyCounts({ from: '2027-05-01', to: '2027-05-31' })
    const day = rows.find((r) => r.bookedOn.toISOString().slice(0, 10) === '2027-05-10')

    expect(day).toBeUndefined()
  })

  test('วันที่ไม่มีจองเลย → ไม่ปรากฏในผลลัพธ์ (ไม่ใช่แถวที่ count เป็น 0)', async () => {
    const rows = await listAppointmentDailyCounts({ from: '2027-06-01', to: '2027-06-30' })

    expect(rows.find((r) => r.bookedOn.toISOString().slice(0, 10) === '2027-06-15')).toBeUndefined()
  })

  test('นอกช่วงที่ขอ → ไม่นับ', async () => {
    const owner = await makeOwner('OUTSIDE')

    await createAppointment(
      { bookedOn: '2027-07-01', slot: 'MORNING_1', ownerId: owner.id, petNameText: 'A' },
      { kind: 'staff', userId: SYSTEM_USER_ID },
    )

    const rows = await listAppointmentDailyCounts({ from: '2027-08-01', to: '2027-08-31' })

    expect(rows.find((r) => r.bookedOn.toISOString().slice(0, 10) === '2027-07-01')).toBeUndefined()
  })

  test('from มาหลัง to → ปฏิเสธ', async () => {
    expect.assertions(2)

    try {
      await listAppointmentDailyCounts({ from: '2027-09-30', to: '2027-09-01' })
    } catch (e) {
      expect(isAppError(e)).toBe(true)
      expect(isAppError(e) && e.code).toBe('INVALID')
    }
  })
})
