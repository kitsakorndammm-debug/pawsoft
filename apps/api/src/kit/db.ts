import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../prisma/generated/client.ts'

/**
 * ตัวต่อฐานข้อมูล — ตัวเดียวทั้งโปรเซส
 *
 * **ไม่มี extension ที่เติม soft delete ให้อัตโนมัติ** · ทุกคิวรีที่อ่านแถวที่ยังอยู่
 * เขียน `where: { deletedAt: null }` เอง
 *
 * extension จะเติมให้เฉพาะคิวรีชั้นบนสุด **แต่ไม่เติมให้ `include` ที่ซ้อนอยู่ข้างใน**
 * ซึ่งเป็นจุดที่ลืมง่ายที่สุดพอดี · กฎจึงต้องจำอยู่ดี แต่ดูเหมือนถูกจัดการไปแล้ว
 * เขียนออกมาเต็ม ๆ แปลว่าคิวรีบอกเองว่ามันเลือกอะไร และการกรองที่หายไปมองเห็นได้
 * ในตัวคิวรี ไม่ใช่มองเห็นจากการที่มันไม่อยู่ตรงนั้น
 */
const connectionString = process.env['DATABASE_URL']
if (!connectionString) {
  throw new Error('DATABASE_URL is not set')
}

const adapter = new PrismaPg({
  connectionString,
  /**
   * ปล่อยให้โปรเซสจบได้ทั้งที่ยังมี connection ว่างค้างอยู่ในพูล
   *
   * ไม่ตั้งค่านี้ พูลจะถือ event loop ไว้ แล้ว `bun test` จะค้างอยู่นานหลัง assertion
   * ตัวสุดท้าย · การ disconnect ท้ายไฟล์เทสไม่ใช่ทางออก เพราะทุกไฟล์ใช้ client ตัวนี้
   * ร่วมกัน ไฟล์แรกที่ disconnect จะทำให้ไฟล์ที่เหลือพัง
   */
  allowExitOnIdle: true,
})

export const db = new PrismaClient({ adapter })

export type Db = typeof db

/**
 * สิ่งที่ service ที่ถูกยืมไปใช้รับเข้ามา เพื่อให้มันร่วมทรานแซกชันกับผู้เรียก
 *
 * การถอนเซสชันตอนเปลี่ยนบทบาทต้อง commit หรือ rollback ไปพร้อมกับการแก้ที่ทำให้มัน
 * เกิดขึ้น · ฟังก์ชันที่เปิดทรานแซกชันของตัวเองจะปล่อยให้การแก้สำเร็จทั้งที่การถอน
 * ล้มเหลว แล้วคนนั้นจะถือสิทธิ์ที่เขาไม่มีแล้วต่อไป
 */
export type Tx = Omit<Db, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>

/**
 * ทำงานในทรานแซกชัน — ของผู้เรียกถ้ามี ไม่งั้นเปิดใหม่
 *
 * ทุก service ที่เขียนข้อมูลรับ `tx` เป็นพารามิเตอร์สุดท้ายและส่งต่อมาที่นี่ ผลคือ
 * ฟังก์ชันเดียวกันใช้ได้ทั้งสองแบบ: เรียกเดี่ยว ๆ ก็คุมทรานแซกชันของตัวเอง ·
 * ถูกยืมไปใช้กลางงานอื่นก็ commit หรือ rollback ไปพร้อมกับงานนั้น
 *
 * **ไม่มีทรานแซกชันซ้อน** — Postgres ทำได้ผ่าน savepoint แต่ Prisma เปิดทรานแซกชันใหม่
 * บนคนละ connection ซึ่งอ่านของที่ยังไม่ commit ของอีกฝั่งไม่เห็น แล้วจะกลายเป็นสองงาน
 * ที่ commit แยกกันทั้งที่เขียนโค้ดเหมือนเป็นงานเดียว
 */
export function inTx<T>(tx: Tx | undefined, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return tx ? fn(tx) : db.$transaction((fresh) => fn(fresh))
}
