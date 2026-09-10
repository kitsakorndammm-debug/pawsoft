import { $ } from 'bun'

/**
 * `prisma db push` แล้วต่อด้วย `patch.ts` — สองขั้นที่ต้องไปด้วยกันเสมอ
 *
 * **มีไฟล์นี้แทนที่จะเขียนสองคำสั่งต่อกันใน `package.json` ด้วยเหตุผลเดียว: `.env`**
 *
 * Prisma CLI ไม่อ่าน `.env` ให้เอง (วัดเมื่อ 2026-08-31 กับ Prisma 7.10 — `db push`
 * ตอบว่า `Connection url is empty` ทั้งที่ไฟล์อยู่ตรงนั้น) ส่วน Bun อ่านให้อัตโนมัติ
 * ตอนรันสคริปต์ในโฟลเดอร์นี้ · ให้ Bun เป็นคนเรียก CLI จึงแปลว่าค่ามันถูกส่งต่อไปให้
 * และคนที่ clone มาใหม่ไม่ต้องมานั่งหาว่าทำไม push ไม่ผ่านทั้งที่ตั้งค่าไว้แล้ว
 */

const connectionString = process.env['DATABASE_URL']
if (!connectionString) {
  throw new Error('DATABASE_URL is not set — คัดลอก .env.example เป็น .env ก่อน')
}

// `--force-reset` ล้างข้อมูลทิ้งทั้งฐาน · ส่งต่อ argument จาก `db:reset` มาที่นี่
const extra = process.argv.slice(2)

/**
 * ถอน constraint ที่ **`patch.ts` เป็นเจ้าของ** ก่อนให้ Prisma ทำงาน
 *
 * Prisma มองไม่เห็นของในโฟลเดอร์ `sql/parts/` · พอเจอ index ที่มันไม่รู้จักก็จะสั่งลบ
 * แล้วถ้า index นั้นมี constraint พิงอยู่ Postgres จะปฏิเสธทั้งคำสั่ง:
 *
 *   `cannot drop index breed_id_species_key because constraint ... requires it`
 *
 * ผลคือ **`db:push` ครั้งที่สองเป็นต้นไปพังทุกครั้ง** (เจอจริง 2026-09-01 ตอนเพิ่ม
 * ตารางการชำระเงิน — ครั้งแรกผ่านเพราะฐานยังไม่มี constraint)
 *
 * ถอนเองที่นี่แปลว่า Prisma เจอฐานที่สะอาด แล้ว `patch.ts` สร้างกลับให้ทันทีหลังจากนั้น ·
 * ระหว่างสองขั้นนี้ฐานไม่มี constraint คุ้มอยู่ ซึ่งรับได้เพราะ `db:push` เป็นคำสั่งของ
 * เครื่อง dev ไม่ใช่ของ production
 *
 * **เพิ่มชื่อที่นี่ทุกครั้งที่ patch สร้าง constraint ที่พิง index** — ไม่ใช่ทุกตัวใน
 * `sql/parts/` ที่ต้องมา มีแต่ตัวที่ Prisma จะไปยุ่งด้วย
 */
const PATCH_OWNED = [
  // FK คู่ของ `pet` พิง unique `(id, species_id)` ของ `breed` — ดู `05-owner.sql`
  'ALTER TABLE pet DROP CONSTRAINT IF EXISTS pet_breed_matches_species_fk',
  'ALTER TABLE breed DROP CONSTRAINT IF EXISTS breed_id_species_key',
]

const { PrismaPg } = await import('@prisma/adapter-pg')
const { PrismaClient } = await import('./generated/client.ts')
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, allowExitOnIdle: true }) })

try {
  for (const sql of PATCH_OWNED) await db.$executeRawUnsafe(sql)
} catch {
  // ฐานยังไม่มีตารางพวกนี้ (push ครั้งแรก) — ไม่มีอะไรให้ถอน
} finally {
  await db.$disconnect()
}

await $`bunx prisma db push ${extra}`.env({ ...process.env, DATABASE_URL: connectionString })
await $`bun prisma/patch.ts`.env({ ...process.env, DATABASE_URL: connectionString })
