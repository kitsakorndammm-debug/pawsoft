import { defineConfig } from 'prisma/config'
import { PrismaPg } from '@prisma/adapter-pg'

/**
 * Prisma 7 อ่านการตั้งค่าจากไฟล์นี้ ไม่ใช่จาก `package.json` อีกต่อไป
 *
 * `schema` ชี้ไปที่ **โฟลเดอร์** ไม่ใช่ไฟล์ — สคีมาแยกตามโดเมน ไฟล์ละเรื่อง
 * (`auth.prisma` `system.prisma`) เพราะไฟล์เดียวยาวพันบรรทัดคือไฟล์ที่ไม่มีใครอ่าน
 *
 * **การต่อฐานอยู่ที่นี่ ไม่ใช่ใน `datasource` ของสคีมาแล้ว** — Prisma 7 เอา
 * `url = env("DATABASE_URL")` ออกไป · ตัวนี้ใช้เฉพาะตอนรัน CLI (`db push` · `studio`)
 * ส่วนโปรแกรมจริงต่อผ่าน adapter ที่ `kit/db.ts` สร้างเอง
 */
export default defineConfig({
  schema: './prisma/schema',

  /**
   * `db push` ต่อฐานเองโดยไม่ผ่าน adapter — มันต้องแก้โครงสร้างฐาน ซึ่งเป็นงานที่
   * client ไม่ได้ทำ · ค่านี้จึงต้องมี แม้ `adapter` ข้างล่างจะมีอยู่แล้ว
   */
  datasource: {
    url: process.env['DATABASE_URL'] ?? '',
  },

  migrations: {
    // ยังไม่ได้ใช้ migration — โครงยังเปลี่ยนบ่อยเกินกว่าจะเก็บประวัติทีละขั้น
    // ขึ้น production เมื่อไหร่ค่อยเปลี่ยนมาใช้ และไฟล์แรกคือสคีมาทั้งก้อน ณ วันนั้น
    path: './prisma/migrations',
  },

  adapter: () => {
    const connectionString = process.env['DATABASE_URL']
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set')
    }

    return Promise.resolve(new PrismaPg({ connectionString }))
  },
})
