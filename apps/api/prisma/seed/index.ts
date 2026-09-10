import { db } from '../../src/kit/db.ts'
import { seed } from '../../src/kit/seed.ts'
import { seedMaster } from './master.ts'

/**
 * ปูฐาน dev — ของที่ระบบขาดไม่ได้ บวกข้อมูลตัวอย่างพอให้กดใช้งานได้
 *
 * **ไม่สร้างผู้ใช้เพิ่ม** ต่างจาก `seed-e2e-db.ts` · บัญชีที่รหัสผ่านเดาได้มีไว้ให้
 * เครื่องที่รันเทสเท่านั้น
 */
await seed()
const master = await seedMaster()

console.log('seed พร้อม — ข้อมูลหลักครบ')
console.log(`  บริการ id=${master.serviceItemId} · ยา id=${master.drugId}`)

await db.$disconnect()
