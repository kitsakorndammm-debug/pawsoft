import { db, type Db, type Tx } from './db.ts'

/**
 * รหัสถัดไปของทะเบียนที่ระบบออกเลขให้เอง — `C0001` `P0042`
 *
 * **ไม่ใช่ `count() + 1`** และนี่คือจุดที่พลาดแล้วเจ็บ: แถวที่ถูกลบไปแล้วยังกินเลขอยู่
 * (unique เต็มตาราง ไม่ใช่ partial) · นับแถวที่เหลือแปลว่าได้เลขที่มีคนถืออยู่แล้ว
 * แล้วการสร้างจะพังทั้งที่ผู้ใช้ไม่ได้ทำอะไรผิด
 *
 * จึงอ่าน**เลขที่มากที่สุดที่เคยออก** รวมแถวที่ลบแล้วด้วย · เรียงแบบข้อความใช้ไม่ได้
 * (`C10` มาก่อน `C9`) จึงตัด prefix แล้วแปลงเป็นตัวเลขก่อนหาค่าสูงสุด
 *
 * **ยังชนกันได้ถ้าสองคำขอมาพร้อมกัน** — และนั่นถูกแล้ว: unique index เป็นคนตัดสิน
 * ส่วนตัวนี้แค่เดาเลขถัดไปให้ถูกในกรณีปกติ · ผู้เรียกจับ P2002 แล้วลองใหม่
 * (`createWithCode`) ไม่ใช่ล็อกตารางไว้ตั้งแต่แรก
 */
export async function nextCode(
  table: 'owner' | 'pet',
  prefix: string,
  width: number,
  at: Tx | Db = db,
): Promise<string> {
  // `substring` ตัด prefix ออกก่อน แล้ว `::bigint` ให้ Postgres เรียงแบบตัวเลข
  const rows = await at.$queryRawUnsafe<{ max: bigint | null }[]>(
    `SELECT max(substring(code from ${prefix.length + 1})::bigint) AS max
       FROM ${table}
      WHERE code ~ '^${prefix}[0-9]+$'`,
  )

  const max = rows[0]?.max ?? 0n

  return `${prefix}${String(Number(max) + 1).padStart(width, '0')}`
}

/**
 * สร้างแถวที่ระบบออกรหัสให้ — **ลองใหม่เมื่อรหัสชน**
 *
 * สองคนกดเพิ่มลูกค้าพร้อมกันจะอ่านเลขสูงสุดตัวเดียวกัน แล้วคนที่เขียนทีหลังชน ·
 * ไม่ใช่ความผิดของเขา และไม่ควรเห็น error · ลองใหม่ได้เลขถัดไปที่ว่างจริง
 *
 * จำกัดจำนวนครั้งไว้ เพราะการวนไม่จบเมื่อสาเหตุเป็นอย่างอื่นคือปัญหาที่หนักกว่าเดิม ·
 * ครบแล้วยังชน ปล่อย error ออกไปตามจริง
 */
export async function createWithCode<T>(
  makeCode: () => Promise<string>,
  create: (code: string) => Promise<T>,
  isCodeClash: (e: unknown) => boolean,
  attempts = 5,
): Promise<T> {
  let lastError: unknown

  for (let i = 0; i < attempts; i++) {
    const code = await makeCode()

    try {
      return await create(code)
    } catch (e) {
      if (!isCodeClash(e)) throw e
      lastError = e
    }
  }

  throw lastError
}
