import { db } from '../../src/kit/db.ts'
import { SYSTEM_USER_ID } from '../../src/kit/actor.ts'
import { seed } from '../../src/kit/seed.ts'
import {
  BILLING_PERMISSION,
  DRUG_STOCK_PERMISSION,
  MASTER_PERMISSION,
  MEDICAL_PERMISSION,
  RECEPTION_PERMISSION,
} from '../../src/kit/permissions.ts'
import { seedMaster } from './master.ts'

/**
 * ปูฐาน `pawsoft_e2e` ให้ Playwright — **บัญชีคนละสิทธิ์ ไม่ใช่ admin ตัวเดียว**
 *
 * ระบบนี้มีกฎที่พิสูจน์ไม่ได้เลยถ้าใช้ admin ทำทุกอย่าง:
 *
 *   `invoice_verifier_not_submitter_check`  คนส่งยอดกับคนยืนยันต้องคนละคน
 *   `main:medical:write`                    เคาน์เตอร์ลงผลวินิจฉัยไม่ได้
 *
 * เทสที่ล็อกอิน admin อย่างเดียวจะเขียวทั้งที่กฎพวกนี้พังอยู่ — เพราะ admin ผ่านทุกด่าน
 *
 * **รันซ้ำได้** ทุกขั้นเป็น upsert · เทสที่ล้มกลางทางแล้วรันใหม่ไม่ต้องล้างฐานเอง
 */

/** รหัสเดียวกันหมด — ฐานนี้เป็นของเทส ไม่มีข้อมูลจริงให้ปกป้อง */
export const E2E_PASSWORD = 'e2e-pass-1234'

export const E2E_USERS = {
  /** เคาน์เตอร์ — รับคิว · ออกใบเสร็จ · รับเงิน · **ลงผลวินิจฉัยไม่ได้** */
  counter: 'e2e_counter',
  /** หมอ — ลงผลวินิจฉัยกับสั่งยา */
  vet: 'e2e_vet',
  /** บัญชี — ยืนยันยอด · **ต้องไม่ใช่คนเดียวกับที่ส่ง** */
  accountant: 'e2e_account',
} as const

async function upsertRole(name: string, keys: readonly string[]): Promise<bigint> {
  const existing = await db.role.findFirst({ where: { name, deletedAt: null }, select: { id: true } })

  const roleId =
    existing?.id ??
    (
      await db.role.create({
        data: { name, createdBy: SYSTEM_USER_ID, updatedBy: SYSTEM_USER_ID },
        select: { id: true },
      })
    ).id

  /**
   * ตั้งสิทธิ์ใหม่ทุกครั้ง — รันซ้ำแล้วสิทธิ์ต้องตรงกับที่ประกาศไว้ ไม่ใช่สะสมของเก่า
   *
   * **`role_permission` ผูกด้วย `permissionId` ไม่ใช่ key** — ต้องแปลงก่อน ·
   * `seed()` sync ตาราง `permission` ให้แล้วตั้งแต่ต้น main()
   */
  const rows = await db.permission.findMany({
    where: { key: { in: [...keys] } },
    select: { id: true, key: true },
  })

  const missing = keys.filter((k) => !rows.some((r) => r.key === k))
  if (missing.length > 0) {
    throw new Error(`ไม่พบ permission: ${missing.join(', ')} — syncPermissions() ทำงานหรือยัง`)
  }

  await db.rolePermission.deleteMany({ where: { roleId } })
  await db.rolePermission.createMany({
    data: rows.map((r) => ({ roleId, permissionId: r.id, createdBy: SYSTEM_USER_ID })),
    skipDuplicates: true,
  })

  return roleId
}

async function upsertUser(username: string, roleId: bigint): Promise<void> {
  const passwordHash = await Bun.password.hash(E2E_PASSWORD)

  const existing = await db.user.findUnique({ where: { username }, select: { id: true } })

  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        roleId,
        // ปลดล็อกทุกอย่าง — เทสรอบก่อนที่ล็อกอินผิดจะทิ้งบัญชีที่ถูกล็อกไว้
        mustChangePassword: false,
        suspendedAt: null,
        suspendedBy: null,
        failedAttempts: 0,
        lockedAt: null,
        updatedBy: SYSTEM_USER_ID,
      },
    })

    return
  }

  await db.user.create({
    data: {
      username,
      passwordHash,
      roleId,
      mustChangePassword: false,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  })
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'] ?? ''

  /**
   * **กันปูทับฐาน dev** — สคริปต์นี้สร้างบัญชีที่รหัสผ่านเดาได้และปลดล็อกไว้หมด
   * เผลอรันใส่ฐานจริงคือการเปิดประตูทิ้งไว้
   */
  if (!url.includes('pawsoft_e2e')) {
    throw new Error(
      `DATABASE_URL ต้องชี้ไปฐาน pawsoft_e2e เท่านั้น — ตอนนี้ชี้ไป "${url.replace(/:[^:@]*@/, ':***@')}"`,
    )
  }

  await seed()
  const master = await seedMaster()

  // สต็อกยา (ดู+บันทึก) — ตรงกับ `///` บน `DRUG_STOCK_PERMISSION` ("เคาน์เตอร์ดู+บันทึกได้")
  // ตกหล่นในชุดสิทธิ์ตัวอย่างเดิม (พบจริง 2026-09-23) แก้พร้อมกันทั้ง master.ts กับที่นี่
  const counterRole = await upsertRole('เคาน์เตอร์ (e2e)', [
    RECEPTION_PERMISSION.read,
    RECEPTION_PERMISSION.write,
    BILLING_PERMISSION.read,
    BILLING_PERMISSION.collect,
    MASTER_PERMISSION.read,
    DRUG_STOCK_PERMISSION.read,
    DRUG_STOCK_PERMISSION.write,
  ])

  /**
   * **หมอมี `reception:write` ด้วย** — ปุ่ม "เรียก" บนหน้าคิวการ์ดด้วยสิทธิ์นี้
   *
   * หมอเป็นคนเรียกคนไข้เข้าห้องตรวจเองในคลินิกจริง · ให้เฉพาะ `medical:write`
   * แปลว่าหมอเปิดกล่องบันทึกผลตรวจไม่ได้เลย เพราะไปถึงสถานะนั้นไม่ได้
   *
   * ที่หมอ**ไม่มี**คือ `billing:collect` กับ `billing:verify` — เงินไม่ใช่งานของหมอ
   */
  const vetRole = await upsertRole('สัตวแพทย์ (e2e)', [
    RECEPTION_PERMISSION.read,
    RECEPTION_PERMISSION.write,
    MEDICAL_PERMISSION.write,
    MASTER_PERMISSION.read,
    // ดูสต็อกยาได้ (ไม่ใช่บันทึก) — ตรงกับ `///` บน `DRUG_STOCK_PERMISSION`
    DRUG_STOCK_PERMISSION.read,
  ])

  const accountantRole = await upsertRole('บัญชี (e2e)', [
    BILLING_PERMISSION.read,
    BILLING_PERMISSION.verify,
  ])

  await upsertUser(E2E_USERS.counter, counterRole)
  await upsertUser(E2E_USERS.vet, vetRole)
  await upsertUser(E2E_USERS.accountant, accountantRole)

  console.log('e2e seed พร้อม')
  console.log(`  ผู้ใช้: ${Object.values(E2E_USERS).join(' · ')} (รหัส ${E2E_PASSWORD})`)
  console.log(`  บริการ id=${master.serviceItemId} · ยา id=${master.drugId}`)

  await db.$disconnect()
}

await main()
