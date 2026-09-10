import { afterEach, beforeAll, describe, expect, test } from 'bun:test'

import { app } from '../../src/app.ts'
import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import { createOwner, linkOwnerAccount } from '../../src/modules/owner/owner.service.ts'
import { readJson } from '../support/api-response.ts'
import { loginAsAdmin } from '../support/login.ts'

/**
 * `GET /api/owners` · กรองด้วย `linked`
 *
 * (ผู้ใช้ตัดสิน 2026-09-08) หน้าพนักงานแยกดู "ลงทะเบียนแล้ว" กับ "ยังไม่ได้ลงทะเบียน" —
 * ลงทะเบียนคือเชื่อม `PetOwnerAccount` แล้ว
 */

const NAME_PREFIX = 'TEST-OWNER-API-LIST-'

let cookie: string

beforeAll(async () => {
  cookie = await loginAsAdmin()
})

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

function get(query: string) {
  return app.handle(new Request(`http://localhost/api/owners${query}`, { headers: { cookie } }))
}

describe('GET /api/owners?linked=', () => {
  test('linked=true → คืนเฉพาะที่เชื่อมบัญชีแล้ว', async () => {
    const linked = await makeOwner('LINKED')
    const account = await makeAccount('LINKED')
    await linkOwnerAccount(linked.id, account.id, SYSTEM_USER_ID)
    await makeOwner('UNLINKED')

    const res = await get(`?q=${encodeURIComponent(NAME_PREFIX)}&linked=true`)
    const body = await readJson(res)
    const names = body.data.map((r: { name: string }) => r.name)

    expect(res.status).toBe(200)
    expect(names).toContain(`${NAME_PREFIX}LINKED`)
    expect(names).not.toContain(`${NAME_PREFIX}UNLINKED`)
  })

  test('linked=false → คืนเฉพาะที่ยังไม่ได้ลงทะเบียน', async () => {
    const linked = await makeOwner('LINKED2')
    const account = await makeAccount('LINKED2')
    await linkOwnerAccount(linked.id, account.id, SYSTEM_USER_ID)
    await makeOwner('UNLINKED2')

    const res = await get(`?q=${encodeURIComponent(NAME_PREFIX)}&linked=false`)
    const body = await readJson(res)
    const names = body.data.map((r: { name: string }) => r.name)

    expect(names).not.toContain(`${NAME_PREFIX}LINKED2`)
    expect(names).toContain(`${NAME_PREFIX}UNLINKED2`)
  })

  test('linked ค่าที่ไม่รู้จัก → 400', async () => {
    const res = await get('?linked=maybe')

    expect(res.status).toBe(400)
  })
})
