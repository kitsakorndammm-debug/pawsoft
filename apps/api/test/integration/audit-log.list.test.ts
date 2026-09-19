import { afterEach, describe, expect, test } from 'bun:test'

import { isAppError } from '../../src/kit/app-error.ts'
import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { db } from '../../src/kit/db.ts'
import {
  listAuditLogActors,
  listAuditLogModules,
  listAuditLogs,
} from '../../src/modules/audit-log/audit-log.service.ts'

/**
 * ประวัติการใช้งาน (audit log) · ดูรายการ
 *
 * **สร้างแถวตรงเข้าฐานด้วย `db.auditLog.create`** ไม่เรียก `writeAudit` ผ่านโมดูลอื่น —
 * ที่นี่พิสูจน์แค่ว่า `listAuditLogs` กรอง/แบ่งหน้า/ผูกชื่อผู้ใช้ถูก ไม่ใช่ว่าโมดูลอื่น
 * เขียนบันทึกถูกต้อง (นั่นเป็นเรื่องของเทสของโมดูลนั้น)
 */

const MODULE_PREFIX = 'TEST-AUDIT-LOG-'

async function makeLog(input: {
  module: string
  action: string
  userId: bigint
  createdAt: Date
  recordId?: bigint | null
}) {
  return db.auditLog.create({
    data: {
      module: input.module,
      action: input.action,
      userId: input.userId,
      createdAt: input.createdAt,
      recordId: input.recordId ?? null,
      after: { note: 'ข้อมูลทดสอบ' },
    },
  })
}

afterEach(async () => {
  await db.auditLog.deleteMany({ where: { module: { startsWith: MODULE_PREFIX } } })
})

describe('ประวัติการใช้งาน · ดูรายการ', () => {
  test('ไม่กรองอะไร → เห็นแถวที่สร้างไว้ พร้อมชื่อผู้ใช้ผูกมาด้วย', async () => {
    const module = `${MODULE_PREFIX}A`
    await makeLog({ module, action: `${module}.create`, userId: 1n, createdAt: new Date() })

    const result = await listAuditLogs({ module })

    expect(result.total).toBe(1)
    expect(result.rows[0]?.action).toBe(`${module}.create`)
    expect(result.rows[0]?.userName.length).toBeGreaterThan(0)
  })

  test('userId ไม่มีในตาราง user → ใช้ "ไม่ทราบ" แทนชื่อ', async () => {
    const module = `${MODULE_PREFIX}NOUSER`
    await makeLog({ module, action: `${module}.create`, userId: 999_999_999n, createdAt: new Date() })

    const result = await listAuditLogs({ module })

    expect(result.rows[0]?.userName).toBe('ไม่ทราบ')
  })

  test('กรองด้วย module → เห็นเฉพาะของ module นั้น', async () => {
    const moduleA = `${MODULE_PREFIX}FILTER-A`
    const moduleB = `${MODULE_PREFIX}FILTER-B`
    await makeLog({ module: moduleA, action: `${moduleA}.create`, userId: 1n, createdAt: new Date() })
    await makeLog({ module: moduleB, action: `${moduleB}.create`, userId: 1n, createdAt: new Date() })

    const result = await listAuditLogs({ module: moduleA })

    expect(result.total).toBe(1)
    expect(result.rows[0]?.module).toBe(moduleA)
  })

  test('กรองด้วยวันที่ → เห็นเฉพาะวันนั้น (เขตเวลาไทย)', async () => {
    const module = `${MODULE_PREFIX}DATE`
    await makeLog({
      module,
      action: `${module}.create`,
      userId: 1n,
      createdAt: new Date('2027-05-10T10:00:00+07:00'),
    })
    await makeLog({
      module,
      action: `${module}.create`,
      userId: 1n,
      createdAt: new Date('2027-05-11T10:00:00+07:00'),
    })

    const result = await listAuditLogs({ module, date: '2027-05-10' })

    expect(result.total).toBe(1)
  })

  test('วันที่ผิดรูป → โยน INVALID', async () => {
    const module = `${MODULE_PREFIX}BADDATE`
    let caught: unknown
    try {
      await listAuditLogs({ module, date: '10-05-2027' })
    } catch (e) {
      caught = e
    }

    expect(isAppError(caught) && caught.code).toBe('INVALID')
  })

  test('แบ่งหน้า → pageSize จำกัดจำนวนแถว และ total นับทั้งหมดไม่ใช่แค่หน้านี้', async () => {
    const module = `${MODULE_PREFIX}PAGE`
    for (let i = 0; i < 5; i++) {
      await makeLog({ module, action: `${module}.create`, userId: 1n, createdAt: new Date() })
    }

    const result = await listAuditLogs({ module, page: 1, pageSize: 2 })

    expect(result.total).toBe(5)
    expect(result.rows.length).toBe(2)
  })

  test('เรียงล่าสุดก่อน', async () => {
    const module = `${MODULE_PREFIX}ORDER`
    await makeLog({
      module,
      action: `${module}.old`,
      userId: 1n,
      createdAt: new Date('2027-01-01T00:00:00Z'),
    })
    await makeLog({
      module,
      action: `${module}.new`,
      userId: 1n,
      createdAt: new Date('2027-06-01T00:00:00Z'),
    })

    const result = await listAuditLogs({ module })

    expect(result.rows[0]?.action).toBe(`${module}.new`)
    expect(result.rows[1]?.action).toBe(`${module}.old`)
  })
})

describe('ประวัติการใช้งาน · รายชื่อ module', () => {
  test('คืนชื่อ module ที่มีแถวอยู่จริง ไม่ซ้ำ', async () => {
    const module = `${MODULE_PREFIX}DISTINCT`
    await makeLog({ module, action: `${module}.a`, userId: 1n, createdAt: new Date() })
    await makeLog({ module, action: `${module}.b`, userId: 1n, createdAt: new Date() })

    const modules = await listAuditLogModules()

    expect(modules.filter((m) => m === module).length).toBe(1)
  })
})

describe('ประวัติการใช้งาน · เกี่ยวกับใคร (subject)', () => {
  const NAME_PREFIX = 'TEST-AUDIT-SUBJECT-'

  afterEach(async () => {
    const owners = await db.owner.findMany({
      where: { name: { startsWith: NAME_PREFIX } },
      select: { id: true },
    })
    const drugs = await db.drug.findMany({
      where: { name: { startsWith: NAME_PREFIX } },
      select: { id: true },
    })
    await db.auditLog.deleteMany({
      where: {
        OR: [
          { module: 'owner', recordId: { in: owners.map((o) => o.id) } },
          { module: 'drug', recordId: { in: drugs.map((d) => d.id) } },
        ],
      },
    })
    await db.owner.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
    await db.drug.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } })
  })

  test('module owner → subject เป็นชื่อเจ้าของสัตว์จริง', async () => {
    const owner = await db.owner.create({
      data: {
        name: `${NAME_PREFIX}สมชาย`,
        code: `TASUB${Date.now()}`,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    })
    await db.auditLog.create({
      data: { module: 'owner', action: 'owner.update', userId: 1n, recordId: owner.id, after: {} },
    })

    const result = await listAuditLogs({ module: 'owner', pageSize: 200 })
    const row = result.rows.find((r) => r.recordId === owner.id)

    expect(row?.subject).toBe(`${NAME_PREFIX}สมชาย`)
  })

  test('module drug (ทะเบียน) → subject เป็นชื่อยาจริง', async () => {
    const drug = await db.drug.create({
      data: { name: `${NAME_PREFIX}พารา`, createdBy: SYSTEM_USER_ID, updatedBy: SYSTEM_USER_ID },
    })
    await db.auditLog.create({
      data: { module: 'drug', action: 'drug.update', userId: 1n, recordId: drug.id, after: {} },
    })

    const result = await listAuditLogs({ module: 'drug', pageSize: 200 })
    const row = result.rows.find((r) => r.recordId === drug.id)

    expect(row?.subject).toBe(`${NAME_PREFIX}พารา`)
  })

  test('module ที่ยังไม่มีตัวแปล → subject เป็น null ไม่พัง', async () => {
    const module = `${MODULE_PREFIX}UNKNOWN`
    await makeLog({ module, action: `${module}.a`, userId: 1n, createdAt: new Date(), recordId: 42n })

    const result = await listAuditLogs({ module })

    expect(result.rows[0]?.subject).toBeNull()
  })

  test('recordId เป็น null → subject เป็น null', async () => {
    const module = `${MODULE_PREFIX}NORECORD`
    await makeLog({ module, action: `${module}.a`, userId: 1n, createdAt: new Date(), recordId: null })

    const result = await listAuditLogs({ module })

    expect(result.rows[0]?.subject).toBeNull()
  })
})

describe('ประวัติการใช้งาน · ไฮไลต์การกระทำสำคัญ', () => {
  const marker = 987_654_321n

  afterEach(async () => {
    await db.auditLog.deleteMany({ where: { module: 'employee', recordId: marker } })
  })

  test('action อยู่ใน allowlist → risk เป็น true', async () => {
    await makeLog({
      module: 'employee',
      action: 'employee.delete',
      userId: 1n,
      createdAt: new Date(),
      recordId: marker,
    })

    const result = await listAuditLogs({ module: 'employee', pageSize: 200 })
    const row = result.rows.find((r) => r.recordId === marker)

    expect(row?.risk).toBe(true)
  })

  test('action ธรรมดา → risk เป็น false', async () => {
    const module = `${MODULE_PREFIX}NORMAL`
    await makeLog({ module, action: `${module}.create`, userId: 1n, createdAt: new Date() })

    const result = await listAuditLogs({ module })

    expect(result.rows[0]?.risk).toBe(false)
  })
})

describe('ประวัติการใช้งาน · รายชื่อคนทำ (actor)', () => {
  test('คืน userId/ชื่อของคนที่มีแถวจริง ไม่ซ้ำ', async () => {
    const module = `${MODULE_PREFIX}ACTOR`
    await makeLog({ module, action: `${module}.a`, userId: 1n, createdAt: new Date() })
    await makeLog({ module, action: `${module}.b`, userId: 1n, createdAt: new Date() })

    const actors = await listAuditLogActors()

    expect(actors.filter((a) => a.id === 1).length).toBe(1)
    expect(actors.find((a) => a.id === 1)?.name.length).toBeGreaterThan(0)
  })
})
