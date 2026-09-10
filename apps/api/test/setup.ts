/**
 * รันก่อนทุกไฟล์เทส (`bunfig.toml` → `preload`)
 *
 * **หน้าที่เดียว: กันไม่ให้เทสยิงใส่ฐาน dev**
 *
 * เทสที่แตะฐานจะสร้างและลบข้อมูลตลอดเวลา · ชี้ไปฐานเดียวกับที่กำลังเปิดหน้าจอดูอยู่
 * แปลว่าข้อมูลที่กำลังดูหายไปกลางคัน · และถ้าเทสตัวไหนเผลอ `deleteMany` แบบไม่มี
 * `where` ก็คือข้อมูล dev หายทั้งตาราง
 *
 * **แปลงชื่อฐานให้เอง ไม่ใช่แค่เตือน** — เตือนแล้วปล่อยผ่านคือสิ่งที่คนอ่านข้ามอยู่ดี
 * ตอนรีบ · กฎเดียวกับ `push-test-db.ts` และ `run-e2e-seed.ts`
 */

const dev = process.env['DATABASE_URL']

if (dev !== undefined && !dev.includes('pawsoft_test')) {
  const testUrl = dev.replace(/\/[^/?]+(\?|$)/, '/pawsoft_test$1')

  if (!testUrl.includes('pawsoft_test')) {
    throw new Error(
      `แปลงชื่อฐานเป็น pawsoft_test ไม่สำเร็จ — ได้ "${testUrl.replace(/:[^:@]*@/, ':***@')}"`,
    )
  }

  process.env['DATABASE_URL'] = testUrl
}

/**
 * **`APP_ENV=local` เสมอในเทส** — บางเส้นผ่อนกฎเฉพาะ local (รหัสสั้น · test-login) ·
 * เทสที่รันด้วยค่าอื่นจะล้มด้วยเหตุผลที่ไม่เกี่ยวกับสิ่งที่กำลังตรวจ
 */
process.env['APP_ENV'] = 'local'
