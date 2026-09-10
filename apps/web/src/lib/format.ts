/**
 * แปลงค่าให้เป็นข้อความที่เอาขึ้นจอได้ — ไม่มีอะไรในนี้ผูกกับ React
 */

/**
 * ตัวย่อของชื่อ สำหรับวงกลมแทนรูปโปรไฟล์
 *
 * ชื่อคนไทยมักเป็น "ชื่อ นามสกุล" — เอาตัวแรกของคำแรกกับคำสุดท้าย
 * คำเดียวเอาสองตัวแรก · ว่างเปล่าได้ `?` เพราะวงกลมที่ไม่มีอะไรอยู่ข้างในดูเหมือนจอค้าง
 */
export function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0] ?? ''
  if (parts.length === 1) return first.slice(0, 2).toUpperCase()
  const last = parts[parts.length - 1] ?? ''
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase()
}

/** ชื่อเดือนไทยเต็ม — ใช้ทั้งใน `formatDate` และในหัวปฏิทินของ `AppDatePicker` */
export const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
]

/**
 * วันที่แบบที่คนไทยอ่าน — `28 สิงหาคม 2026`
 *
 * **ปี ค.ศ. ไม่ใช่ พ.ศ.** (ผู้ใช้ตัดสิน 2026-08-28) · ตรงกับระบบเดิม และตรงกับปีที่
 * ฐานเก็บ · แปลงเป็น พ.ศ. บนจอแล้วมีที่เดียวที่ตัวเลขต่างจากทุกที่ในระบบ ซึ่งกลายเป็น
 * คำถามทุกครั้งที่มีคนเทียบหน้าจอกับรายงาน
 *
 * **วันล้วนต้องส่งมาเป็นสตริง `YYYY-MM-DD`** — ส่ง `Date` มาแล้วมันถูกอ่านตามเขตเวลา
 * ของเครื่อง ซึ่งขยับวันได้หนึ่งวันสำหรับคนที่อยู่คนละฝั่งของกรีนิช
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return ''

  /*
   * สตริงวันล้วนแยกเอง ไม่ผ่าน `new Date()` — อย่างหลังตีความ `"2026-08-28"` ว่าเป็น
   * UTC เที่ยงคืน แล้วเครื่องที่อยู่ตะวันตกของกรีนิชจะได้วันที่ 27
   */
  if (typeof date === 'string') {
    const parts = date.slice(0, 10).split('-')
    const [year, month, day] = parts
    if (year && month && day) {
      const monthName = THAI_MONTHS[Number(month) - 1]
      if (monthName) return `${Number(day)} ${monthName} ${year}`
    }
  }

  const at = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(at.getTime())) return ''
  return `${at.getDate()} ${THAI_MONTHS[at.getMonth()]} ${at.getFullYear()}`
}

/**
 * ยอดเงินที่มาเป็นข้อความ → ข้อความที่มีคอมมาคั่นหลัก
 *
 * **ไม่แปลงเป็น `number` ระหว่างทาง** — `Number('9007199254740993')` คืนเลขที่ไม่ใช่
 * ตัวเดิม · ใส่คอมมาด้วยการเดินจากขวาไปซ้ายบนตัวข้อความเอง ปลอดภัยกับยอดทุกขนาด
 *
 * ค่าที่ไม่ใช่ตัวเลขล้วนคืนกลับไปเหมือนเดิม — มันคือของที่ผู้ใช้กำลังพิมพ์ค้างอยู่
 * ไม่ใช่ยอดที่จะแสดง
 *
 * ขึ้นมาอยู่ที่นี่เมื่อ 2026-08-28 ตอนที่หน้าลูกค้าเริ่มใช้ด้วย — ก่อนหน้านั้นอยู่ข้าง
 * หน้าตั้งค่าขั้นวงเงินซึ่งเป็นที่เดียวที่เรียกมัน
 */
export function formatAmount(raw: string): string {
  const digits = raw.replace(/,/g, '')
  if (!/^\d+$/.test(digits)) return raw

  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
