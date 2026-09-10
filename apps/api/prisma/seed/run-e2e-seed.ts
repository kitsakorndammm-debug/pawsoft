import { $ } from 'bun'

/**
 * รัน seed ของ e2e โดย**ชี้ `DATABASE_URL` ไปฐาน e2e ให้เอง**
 *
 * เรียก `seed-e2e-db.ts` ตรง ๆ จะใช้ `DATABASE_URL` ของ dev แล้วโดนด่านกันปูทับ
 * เด้งกลับ · คนที่เจอจะไม่รู้ว่าต้องตั้ง env เองก่อน
 *
 * แปลงชื่อฐานด้วยกฎเดียวกับ `push-test-db.ts` — ที่เดียวที่รู้กฎนี้ควรมีสองที่
 * ที่สอดคล้องกัน ไม่ใช่สามที่ที่ต่างกัน
 */

const dev = process.env['DATABASE_URL']
if (!dev) throw new Error('DATABASE_URL is not set')

const url = dev.replace(/\/[^/?]+(\?|$)/, '/pawsoft_e2e$1')

if (!url.includes('pawsoft_e2e')) {
  throw new Error(`แปลงชื่อฐานไม่สำเร็จ — ได้ "${url.replace(/:[^:@]*@/, ':***@')}"`)
}

await $`bun prisma/seed/seed-e2e-db.ts`.env({ ...process.env, DATABASE_URL: url })
