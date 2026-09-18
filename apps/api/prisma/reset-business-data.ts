import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db } from '../src/kit/db.ts'

/**
 * รีเซ็ตข้อมูลใช้งานจริงกลับไปเป็น 0 — **เตรียมระบบให้พร้อมส่งมอบลูกค้าใหม่**
 *
 * (ผู้ใช้ตัดสิน 2026-09-18: "รีเซ็ตแล้วสร้างใหม่ ให้เป็นของจริง" — เดิมใส่ข้อมูลมั่ว ๆ
 * ไว้ทดสอบ ตอนนี้จะขายจริงแล้วต้องเคลียร์ให้เหมือนแอปที่ยังไม่มีใครลงทะเบียน)
 *
 * **เก็บไว้ ไม่แตะ** — ของที่เป็นแม่แบบของโปรแกรม ไม่ใช่ข้อมูลของคลินิกเดิม:
 *   บัญชี `admin`/`system` · ชนิดสัตว์+สายพันธุ์ · ยา+รายการรักษา · แผนก/ตำแหน่ง/บทบาท
 *
 * **ลบให้เหลือ 0** — ทุกอย่างที่เกิดจากการใช้งานจริงของคลินิกเดิม: พนักงาน (ยกเว้น
 * admin) · เจ้าของสัตว์+สัตว์เลี้ยง+บัญชีล็อกอินฝั่งเจ้าของสัตว์ · คิว/การจอง ·
 * ใบเสร็จ/การชำระเงิน · ยอดสต็อกยา/คลังยา · ประวัติการใช้งานและประวัติล็อกอิน
 *
 * **ลำดับการลบสำคัญ** — ต้องลบตัวลูกก่อนตัวแม่เสมอ ไม่งั้นชน FK ที่เป็น `Restrict`
 * (invoice ก่อน visit · visit ก่อน appointment · appointment/pet ก่อน owner ·
 * owner ก่อน pet_owner_account · ฯลฯ) ดูรายละเอียดที่ comment ของแต่ละ FK ในสคีมา
 *
 * **`login_log` ต้องลบก่อนสุด** — `login_log_result_side_check` บังคับว่าบาง
 * `result` (เช่น `SUCCESS_GOOGLE`) ต้องมี `pet_owner_account_id`/`user_id` ไม่ว่าง ·
 * ลบ owner/user ก่อนจะไปชน `ON DELETE SET NULL` ที่ทำให้แถว log เก่าผิด CHECK ทันที
 * (เจอจริงตอนทดสอบกับฐาน dev — ต้องสลับลำดับมาเป็นแบบนี้)
 *
 * **สำรองข้อมูลเป็น JSON ก่อนลบเสมอ** — กันพลาด ต่อให้ตั้งใจลบจริงก็ควรมีที่ให้กู้ดู
 * ย้อนหลังได้ถ้าจำเป็น
 */

const CONFIRM_PHRASE = 'RESET-ALL-BUSINESS-DATA'

if (process.argv[2] !== `--confirm=${CONFIRM_PHRASE}`) {
  console.error(
    `ต้องยืนยันก่อนรัน — พิมพ์:\n  bun prisma/reset-business-data.ts --confirm=${CONFIRM_PHRASE}\n\n` +
      'คำสั่งนี้ลบข้อมูลพนักงาน (ยกเว้น admin) เจ้าของสัตว์ สัตว์เลี้ยง คิว/การจอง ' +
      'ใบเสร็จ สต็อกยา และประวัติการใช้งานทั้งหมด — กู้กลับไม่ได้ (มีสำรอง JSON ให้)',
  )
  process.exit(1)
}

async function backup() {
  const [employees, users, owners, pets, appointments, visits, invoices, payments] =
    await Promise.all([
      db.employee.findMany(),
      db.user.findMany({ where: { username: { notIn: ['admin', 'system'] } } }),
      db.owner.findMany(),
      db.pet.findMany(),
      db.appointment.findMany(),
      db.visit.findMany(),
      db.invoice.findMany(),
      db.payment.findMany(),
    ])

  const file = join(
    import.meta.dirname,
    `backup-before-reset-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  )

  await writeFile(
    file,
    JSON.stringify(
      { employees, users, owners, pets, appointments, visits, invoices, payments },
      (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
      2,
    ),
  )

  console.log(`สำรองข้อมูลไว้ที่ ${file}`)
}

async function countAll() {
  const [
    employee,
    user,
    owner,
    pet,
    appointment,
    visit,
    invoice,
    payment,
    drugStockMovement,
    warehouseStockMovement,
    petOwnerAccount,
    petOwnerSession,
    userSession,
    loginLog,
    auditLog,
  ] = await Promise.all([
    db.employee.count(),
    db.user.count({ where: { username: { notIn: ['admin', 'system'] } } }),
    db.owner.count(),
    db.pet.count(),
    db.appointment.count(),
    db.visit.count(),
    db.invoice.count(),
    db.payment.count(),
    db.drugStockMovement.count(),
    db.warehouseStockMovement.count(),
    db.petOwnerAccount.count(),
    db.petOwnerSession.count(),
    db.userSession.count(),
    db.loginLog.count(),
    db.auditLog.count(),
  ])

  return {
    employee,
    user,
    owner,
    pet,
    appointment,
    visit,
    invoice,
    payment,
    drugStockMovement,
    warehouseStockMovement,
    petOwnerAccount,
    petOwnerSession,
    userSession,
    loginLog,
    auditLog,
  }
}

console.log('ก่อนลบ:', await countAll())

await backup()

await db.$transaction(async (tx) => {
  // ลบ log/session ก่อนสุด — ตัวมันเองอ้าง user/pet_owner_account แบบ SET NULL
  // (ว่างได้) แต่บาง `result` (เช่น `SUCCESS_GOOGLE`) มี CHECK บังคับว่าต้องไม่ว่าง ·
  // ลบ owner/user ก่อนจะไปชน SET NULL cascade ที่ทำให้แถว log นั้นผิด CHECK ทันที
  await tx.userSession.deleteMany({})
  await tx.loginLog.deleteMany({})
  await tx.auditLog.deleteMany({})

  await tx.payment.deleteMany({})
  await tx.invoice.deleteMany({})
  await tx.visit.deleteMany({}) // cascade ลบ visit_service + visit_drug ให้เองที่ฐาน
  await tx.appointment.deleteMany({})
  await tx.drugStockMovement.deleteMany({})
  await tx.warehouseStockMovement.deleteMany({})
  await tx.pet.deleteMany({})
  await tx.petOwnerSession.deleteMany({})
  await tx.owner.deleteMany({})
  await tx.petOwnerAccount.deleteMany({})
  await tx.user.deleteMany({ where: { username: { notIn: ['admin', 'system'] } } })
  await tx.employee.deleteMany({})
})

console.log('หลังลบ:', await countAll())
console.log('เสร็จ — เหลือแค่ admin/system กับข้อมูลตั้งต้น (ยา/สายพันธุ์/แผนก/ตำแหน่ง/บทบาท)')

await db.$disconnect()
