import { afterEach, beforeAll, describe, expect, test } from 'bun:test'

import { app } from '../../src/app.ts'
import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import { storePhoto } from '../../src/modules/pet/pet.storage.ts'
import { readJson } from '../support/api-response.ts'
import { loginAsAdmin } from '../support/login.ts'

/**
 * `GET /api/pets/:id/photo` · รูปสัตว์เลี้ยงฝั่งพนักงาน
 *
 * **`guardSignedIn` ไม่ใช่ `guardReceptionRead`** — บัญชีที่ดูบิลได้แต่ไม่มีสิทธิ์
 * จัดการสัตว์เลี้ยง (เช่นบัญชี) ต้องเห็นรูปสัตว์ในใบเสร็จได้ด้วย (ผู้ใช้ขอ 2026-09-29)
 */

const NAME_PREFIX = 'TEST-PET-PHOTO-API-'

let cookie: string

beforeAll(async () => {
  cookie = await loginAsAdmin()
})

async function makeSpecies(suffix: string) {
  return db.species.create({
    data: { name: `${NAME_PREFIX}${suffix}`, createdBy: SYSTEM_USER_ID, updatedBy: SYSTEM_USER_ID },
  })
}

async function makePet(suffix: string) {
  const species = await makeSpecies(suffix)
  const owner = await db.owner.create({
    data: {
      code: `TPPA${Date.now()}`.slice(0, 20),
      name: `${NAME_PREFIX}${suffix}`,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  })

  return db.pet.create({
    data: {
      code: `TPPA-${suffix}-${Date.now()}`.slice(0, 20),
      ownerId: owner.id,
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
    await db.pet.deleteMany({ where: { ownerId: { in: ids } } })
  }
  await db.owner.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
  await db.species.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
})

function get(petId: bigint, withCookie = true) {
  return app.handle(
    new Request(`http://localhost/api/pets/${petId}/photo`, {
      headers: withCookie ? { cookie } : {},
    }),
  )
}

/** พิกเซล PNG จริง 1x1 ใบเดียว — ลายเซ็นไฟล์ต้องผ่าน `isPhotoTypeAllowed` */
const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
)

describe('GET /api/pets/:id/photo', () => {
  test('สัตว์มีรูป → 200 คืนไบต์รูปพร้อม content-type ถูกต้อง', async () => {
    const pet = await makePet('OK')
    const photoPath = await storePhoto('image/png', PNG_1X1)
    await db.pet.update({ where: { id: pet.id }, data: { photoPath } })

    const res = await get(pet.id)
    const bytes = new Uint8Array(await res.arrayBuffer())

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(bytes).toEqual(PNG_1X1)
  })

  test('สัตว์ยังไม่มีรูป → 404 NOT_FOUND', async () => {
    const pet = await makePet('NO-PHOTO')

    const res = await get(pet.id)
    const body = await readJson(res)

    expect(res.status).toBe(404)
    expect(body.error?.code).toBe('NOT_FOUND')
  })

  test('ไม่มีสัตว์ตัวนี้ → 404 NOT_FOUND', async () => {
    const res = await get(999_999_999n)

    expect(res.status).toBe(404)
  })

  test('ไม่ได้ล็อกอิน → 401', async () => {
    const pet = await makePet('NO-LOGIN')

    const res = await get(pet.id, false)

    expect(res.status).toBe(401)
  })
})
