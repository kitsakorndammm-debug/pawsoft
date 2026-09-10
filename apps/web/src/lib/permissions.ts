/**
 * permission key ที่หน้าเว็บถาม — **ต้องตรงกับที่ BE ประกาศใน `kit/permissions.ts` เป๊ะ ๆ**
 *
 * key ที่พิมพ์ผิดคือเมนูที่ไม่มีวันโผล่ให้ใครเห็น และไม่มี error บอกว่าเพราะอะไร ·
 * `useCan('main:hr:reed')` คืน `false` เงียบ ๆ เหมือนกับคนที่ไม่มีสิทธิ์จริง
 *
 * **นี่คือการซ่อน ไม่ใช่การกัน** — BE ปฏิเสธอีกชั้นเสมอ
 */

export const MASTER_READ = 'main:master:read'
export const MASTER_WRITE = 'main:master:write'

export const HR_READ = 'main:hr:read'
export const HR_WRITE = 'main:hr:write'


/**
 * เมนูหน้างาน — **แยกตามคนที่ทำงาน ไม่ใช่ตามหน้าจอ** (ผู้ใช้ตัดสิน 2026-09-01)
 *
 *   `RECEPTION_*`  เคาน์เตอร์ — คิว จอง ลูกค้า สัตว์
 *   `MEDICAL_*`    หมอ — วินิจฉัย จ่ายยา ปิดการตรวจ
 *   `BILLING_*`    การเงิน — รับเงิน (collect) แล้วบัญชียืนยัน (verify)
 *
 * ตรงกับฝั่ง BE เป๊ะ ๆ · key ที่พิมพ์ผิดคือปุ่มที่ไม่มีวันโผล่ และไม่มี error บอก
 */

export const RECEPTION_READ = 'main:reception:read'
export const RECEPTION_WRITE = 'main:reception:write'

/**
 * **เขียนผลตรวจและจ่ายยา — ของหมอเท่านั้น**
 *
 * ไม่มี `read` คู่ · คนที่เห็นคิวได้ควรเห็นผลวินิจฉัยด้วย สิ่งที่ต้องกันคือการเขียน
 */
export const MEDICAL_WRITE = 'main:medical:write'

export const BILLING_READ = 'main:billing:read'
/** รับเงินและแนบสลิป */
export const BILLING_COLLECT = 'main:billing:collect'
/** ยืนยันยอด — คนละคนกับที่รับเงิน (maker-checker) */
export const BILLING_VERIFY = 'main:billing:verify'

/** สต็อกยา — แยกจาก `MASTER_*` (ผู้ใช้ตัดสิน 2026-09-08) หมอดูได้ เคาน์เตอร์ดู+บันทึกได้ */
export const DRUG_STOCK_READ = 'main:drug-stock:read'
export const DRUG_STOCK_WRITE = 'main:drug-stock:write'
