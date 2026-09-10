import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../prisma/generated/client.ts'

/**
 * รันไฟล์ใน `sql/parts/` ทีละคำสั่ง — ครึ่งของสคีมาที่ Prisma เขียนไม่ได้
 *
 * ต่อท้าย `prisma db push` เสมอ (ดู script `db:push`) เพราะ push เป็นคนสร้างตาราง
 * ส่วนไฟล์พวกนี้เป็นคนใส่ข้อบังคับลงไป · **`prisma db push` เปล่า ๆ จะลบ partial unique
 * ทิ้งเงียบ ๆ** เพราะไม่มีอะไรในสคีมาอธิบายว่ามันควรมีอยู่
 *
 * **ต่อผ่าน Prisma ไม่ใช่ `psql`** — เครื่อง dev ที่เป็น Windows ไม่มี client ของ
 * Postgres ลงไว้ และฐานอยู่ใน Docker · การพึ่ง `psql` แปลว่าคนที่ clone มาใหม่ต้องลง
 * เครื่องมือเพิ่มก่อนถึงจะ push ฐานได้
 */

const PARTS_DIR = join(import.meta.dirname, 'sql', 'parts')

/**
 * ตัดไฟล์เป็นคำสั่งทีละอัน
 *
 * รันทีละคำสั่งไม่ใช่ทั้งไฟล์รวดเดียว เพราะ error ที่โยนออกมาจากก้อนใหญ่บอกแค่ว่า
 * "มีอะไรผิดสักที่" · ทีละคำสั่งบอกได้ว่าคำสั่งไหน
 *
 * **`;` ที่อยู่ใน `$$ ... $$` ไม่ใช่ตัวจบคำสั่ง** — `DO $$ ... END $$;` ทั้งก้อนคือ
 * คำสั่งเดียว แต่ข้างในมี `;` คั่นทุกบรรทัด · ตัดด้วย `.split(';')` เปล่า ๆ จะได้
 * เศษที่รันไม่ได้สักชิ้น (`02-catalogue.sql` เป็นตัวแรกที่เจอ 2026-08-31)
 *
 * ตัวตัดนี้จึงเดินทีละตัวอักษร จำว่าตอนนี้อยู่ในบล็อก `$...$` หรือเปล่า และข้าม
 * คอมเมนต์ `--` ทิ้งก่อน · แท็กที่คั่นรับได้ทั้ง `$$` เปล่าและแบบมีชื่อ (`$fn$`)
 */
function splitStatements(sql: string): string[] {
  const body = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')

  const statements: string[] = []
  let current = ''
  let dollarTag: string | null = null

  for (let i = 0; i < body.length; i += 1) {
    if (dollarTag === null) {
      // เปิดบล็อกไหม — `$$` หรือ `$ชื่อ$`
      const open = /^\$[A-Za-z_]*\$/.exec(body.slice(i))
      if (open) {
        dollarTag = open[0]
        current += dollarTag
        i += dollarTag.length - 1
        continue
      }

      if (body[i] === ';') {
        statements.push(current)
        current = ''
        continue
      }
    } else if (body.startsWith(dollarTag, i)) {
      current += dollarTag
      i += dollarTag.length - 1
      dollarTag = null
      continue
    }

    current += body[i]
  }

  statements.push(current)

  return statements.map((s) => s.trim()).filter((s) => s.length > 0)
}

async function main() {
  const connectionString = process.env['DATABASE_URL']
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  const files = (await readdir(PARTS_DIR))
    .filter((name) => name.endsWith('.sql'))
    // เรียงตามชื่อไฟล์ — เลขนำหน้าสองหลักคือลำดับ · ตารางที่อ้างถึงตารางอื่นต้องมาทีหลัง
    .sort()

  let ran = 0
  let total = 0

  for (const file of files) {
    const statements = splitStatements(await readFile(join(PARTS_DIR, file), 'utf8'))
    total += statements.length

    for (const statement of statements) {
      try {
        await db.$executeRawUnsafe(statement)
        ran += 1
      } catch (e) {
        // บอกว่าคำสั่งไหนพัง ไม่ใช่แค่ว่าไฟล์พัง — คำสั่งเดียวในไฟล์ที่มีสามสิบคำสั่ง
        // หาไม่เจอถ้าไม่พิมพ์ออกมา
        console.error(`\n${file} — statement failed:\n${statement}\n`)
        throw e
      }
    }
  }

  // เลขสองตัวที่ไม่ตรงกันแปลว่ามีคำสั่งหล่นไป · เป็นบรรทัดที่ต้องมองทุกครั้งที่ push
  console.log(`patch.sql applied — ${ran}/${total} statements`)

  await db.$disconnect()
}

await main()
