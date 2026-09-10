import { $ } from 'bun'

/**
 * สร้างและ push ฐานของเทส — `pawsoft_test` หรือ `pawsoft_e2e`
 *
 * **สามฐาน ไม่ใช่สอง** (บทเรียนที่ยกมาจากระบบก่อนหน้า):
 *
 *   `pawsoft`       เครื่อง dev · `bun run db:push`
 *   `pawsoft_test`  `bun test` · `bun run db:push:test`
 *   `pawsoft_e2e`   Playwright · `bun run e2e:prep`
 *
 * ใช้ฐานร่วมกันเมื่อไหร่ เทสที่ล้างตารางระหว่างรัน จะลบเซสชันของ e2e ที่กำลังเปิด
 * เบราว์เซอร์ค้างอยู่ แล้วทุกอย่างตอบ 401 พร้อมกันโดยไม่มีอะไรบอกว่าเพราะอะไร
 */

const TARGETS = {
  test: 'pawsoft_test',
  e2e: 'pawsoft_e2e',
} as const

const which = process.argv[2] as keyof typeof TARGETS | undefined

if (!which || !(which in TARGETS)) {
  console.error(`usage: bun prisma/push-test-db.ts <${Object.keys(TARGETS).join('|')}>`)
  process.exit(1)
}

const dbName = TARGETS[which]

const devUrl = process.env['DATABASE_URL']
if (!devUrl) {
  throw new Error('DATABASE_URL is not set')
}

/**
 * เปลี่ยนชื่อฐานใน URL ของ dev ไปเป็นของเทส
 *
 * **มีด่านตรวจว่าเปลี่ยนสำเร็จจริง** — URL ที่เปลี่ยนไม่ติดคือ URL ที่ยังชี้ฐาน dev อยู่
 * แล้วขั้นถัดไปคือ `db push --force-reset` ซึ่งจะล้างข้อมูล dev ทิ้งทั้งหมด
 */
const url = new URL(devUrl)
url.pathname = `/${dbName}`

if (!url.pathname.includes(dbName)) {
  throw new Error(`ไม่สามารถเปลี่ยนชื่อฐานใน DATABASE_URL เป็น ${dbName} ได้`)
}

const targetUrl = url.toString()

/**
 * `CREATE DATABASE` ต้องรันจากฐานอื่น เพราะสร้างฐานจากในตัวมันเองไม่ได้
 *
 * **ใช้ฐาน dev เป็นที่ยืน ไม่ใช่ฐานชื่อ `postgres`** — เซิร์ฟเวอร์ที่ไม่มีฐานชื่อนั้น
 * มีอยู่จริง (เจอเมื่อ 2026-08-31 บนเครื่องที่รัน Postgres จากอีกโปรเจค) แล้วสคริปต์
 * จะล้มด้วย `3D000 database "postgres" does not exist` ทั้งที่ไม่เกี่ยวกับงานตรงหน้าเลย
 *
 * ฐาน dev ต้องมีอยู่แล้วเสมอ เพราะคนที่รันคำสั่งนี้ผ่าน `db:push` มาก่อนหน้าแล้ว
 */
const adminUrl = new URL(devUrl)

const { PrismaPg } = await import('@prisma/adapter-pg')
const { PrismaClient } = await import('./generated/client.ts')

const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl.toString() }) })

const existing = await admin.$queryRawUnsafe<{ datname: string }[]>(
  'SELECT datname FROM pg_database WHERE datname = $1',
  dbName,
)

if (existing.length === 0) {
  // ชื่อฐานมาจากค่าคงที่ในไฟล์นี้ ไม่ได้มาจากผู้ใช้ · `CREATE DATABASE` รับพารามิเตอร์ไม่ได้
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`)
  console.log(`created database ${dbName}`)
}

await admin.$disconnect()

// **ไม่มี `--skip-generate`** — Prisma 7 เอาแฟล็กนั้นออก และการส่งมันไปทำให้ CLI
// ปฏิเสธทั้งคำสั่ง (`unknown or unexpected option`) ไม่ใช่แค่เมินเฉย
await $`bunx prisma db push --force-reset`.env({
  ...process.env,
  DATABASE_URL: targetUrl,
})

await $`bun prisma/patch.ts`.env({ ...process.env, DATABASE_URL: targetUrl })

console.log(`${dbName} ready`)
