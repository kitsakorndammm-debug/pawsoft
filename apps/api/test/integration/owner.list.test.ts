import { afterEach, describe, expect, test } from 'bun:test'

import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import { createOwner, linkOwnerAccount, listOwners } from '../../src/modules/owner/owner.service.ts'

/**
 * เจ้าของสัตว์ · ดูรายการ — กรองด้วยสถานะการเชื่อมบัญชี Google
 *
 * (ผู้ใช้ตัดสิน 2026-09-08: หน้าพนักงานต้องแยกดู "ลงทะเบียนแล้ว" กับ "ยังไม่ได้
 * ลงทะเบียน" ได้ง่าย — ลงทะเบียนคือเชื่อม `PetOwnerAccount` แล้ว)
 */

const NAME_PREFIX = 'TEST-OWNER-LIST-'

async function makeOwner(suffix: string) {
  return createOwner({ name: `${NAME_PREFIX}${suffix}` }, SYSTEM_USER_ID)
}

async function makeAccount(suffix: string) {
  return db.petOwnerAccount.create({
    data: {
      googleSub: `${NAME_PREFIX}${suffix}`,
      email: `${NAME_PREFIX}${suffix}@example.com`,
      displayName: `${NAME_PREFIX}${suffix}`,
    },
  })
}

afterEach(async () => {
  await db.owner.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
  await db.petOwnerAccount.deleteMany({ where: { googleSub: { startsWith: NAME_PREFIX } } })
})

describe('เจ้าของสัตว์ · ดูรายการ › กรองด้วยสถานะเชื่อมบัญชี', () => {
  test('linked: true → คืนเฉพาะที่เชื่อมบัญชีแล้ว', async () => {
    const linkedOwner = await makeOwner('LINKED')
    const account = await makeAccount('LINKED')
    await linkOwnerAccount(linkedOwner.id, account.id, SYSTEM_USER_ID)
    await makeOwner('UNLINKED')

    const result = await listOwners({ q: NAME_PREFIX, linked: true })
    const names = result.rows.map((r) => r.name)

    expect(names).toContain(`${NAME_PREFIX}LINKED`)
    expect(names).not.toContain(`${NAME_PREFIX}UNLINKED`)
  })

  test('linked: false → คืนเฉพาะที่ยังไม่ได้เชื่อมบัญชี', async () => {
    const linkedOwner = await makeOwner('LINKED2')
    const account = await makeAccount('LINKED2')
    await linkOwnerAccount(linkedOwner.id, account.id, SYSTEM_USER_ID)
    await makeOwner('UNLINKED2')

    const result = await listOwners({ q: NAME_PREFIX, linked: false })
    const names = result.rows.map((r) => r.name)

    expect(names).not.toContain(`${NAME_PREFIX}LINKED2`)
    expect(names).toContain(`${NAME_PREFIX}UNLINKED2`)
  })

  test('ไม่ส่ง linked → คืนทั้งสองกลุ่ม', async () => {
    const linkedOwner = await makeOwner('LINKED3')
    const account = await makeAccount('LINKED3')
    await linkOwnerAccount(linkedOwner.id, account.id, SYSTEM_USER_ID)
    await makeOwner('UNLINKED3')

    const result = await listOwners({ q: NAME_PREFIX })
    const names = result.rows.map((r) => r.name)

    expect(names).toContain(`${NAME_PREFIX}LINKED3`)
    expect(names).toContain(`${NAME_PREFIX}UNLINKED3`)
  })
})
