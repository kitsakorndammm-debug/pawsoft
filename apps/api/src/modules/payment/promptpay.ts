import { createHash } from 'node:crypto'

/**
 * สร้าง payload ของ QR พร้อมเพย์ — **มาตรฐาน EMVCo ของธนาคารแห่งประเทศไทย**
 *
 * ไม่ต้องต่อที่ไหน ไม่มีค่าธรรมเนียม · payload เป็นข้อความล้วนที่แอปธนาคารอ่านได้
 * ทุกแอป · ฝั่งเว็บเอาไปวาดเป็น QR เอง
 *
 * **ระบบไม่รู้ว่าเงินเข้าหรือยัง** — นั่นคือข้อแลกของการไม่ใช้ gateway · การยืนยันจึง
 * ต้องมีคนดูสลิปแล้วกด ซึ่งตรงกับที่คลินิกทำอยู่แล้ว (ดู `///` บน `BILLING_PERMISSION`)
 *
 * โครงของ payload เป็นชุด TLV ซ้อนกัน: `ID(2) + LEN(2) + VALUE`
 */

/** เบอร์พร้อมเพย์หรือเลขผู้เสียภาษี — ตรงกับ `promptpay_config.target_kind` */
export type PromptPayTargetKind = 'PHONE' | 'TAX_ID'

/** `29` = Merchant Account Information ของพร้อมเพย์ */
const TAG_MERCHANT = '29'
const PROMPTPAY_AID = 'A000000677010111'

/** `01` = เบอร์โทร · `02` = เลขประจำตัวผู้เสียภาษี / เลขบัตรประชาชน */
const SUBTAG_PHONE = '01'
const SUBTAG_TAX_ID = '02'

/** หนึ่งช่อง TLV — ความยาวเป็นเลขสองหลักเสมอ */
function tlv(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, '0')}${value}`
}

/**
 * เบอร์ไทยเป็นรูปสากล — `0812345678` เป็น `0066812345678`
 *
 * มาตรฐานบังคับ 13 หลักโดยเติมศูนย์ข้างหน้า · ส่งเบอร์รูปเดิมไปแอปธนาคารจะอ่าน
 * ไม่ออก และไม่มีอะไรบอกว่าเพราะอะไร
 */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const local = digits.startsWith('0') ? digits.slice(1) : digits

  return `0066${local}`.padStart(13, '0')
}

/**
 * CRC-16/CCITT-FALSE — **สี่ตัวท้ายของ payload**
 *
 * แอปธนาคารตรวจค่านี้ก่อนอ่านอย่างอื่น · ผิดไปหนึ่งบิตแปลว่า QR สแกนไม่ติดเลย
 * ไม่ใช่ว่าได้ยอดผิด
 *
 * คิดจากข้อความทั้งก้อน**รวม `6304`** ที่เป็นหัวของช่อง CRC เอง แต่ไม่รวมค่าของมัน
 */
function crc16(payload: string): string {
  let crc = 0xffff

  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8

    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export type PromptPayInput = {
  target: string
  targetKind: PromptPayTargetKind
  /** ยอดเงินเป็น**ข้อความ** — ดูเหตุผลข้างล่าง */
  amount: string
}

/**
 * payload ที่เอาไปวาด QR ได้เลย
 *
 * **ยอดเป็นข้อความตลอดทาง** — เงินที่ผ่าน `number` เสียความแม่น และ QR ที่ยอดคลาด
 * ไปหนึ่งสตางค์คือ QR ที่ลูกค้าจ่ายแล้วยอดไม่ตรงใบเสร็จ · ที่นี่แค่จัดรูปทศนิยม
 * สองตำแหน่งแล้วต่อสตริง ไม่มีการคำนวณเลข
 *
 * **`01` = ใช้ครั้งเดียว** ไม่ใช่ `11` (ใช้ซ้ำได้) · QR ที่ระบุยอดต้องเป็นแบบใช้ครั้งเดียว
 * เสมอ ไม่งั้นลูกค้าสแกนซ้ำแล้วจ่ายซ้ำได้
 */
export function buildPromptPayPayload(input: PromptPayInput): string {
  const amount = normalizeAmount(input.amount)

  const account =
    input.targetKind === 'PHONE'
      ? tlv(SUBTAG_PHONE, formatPhone(input.target))
      : tlv(SUBTAG_TAX_ID, input.target.replace(/\D/g, ''))

  const body =
    tlv('00', '01') + // เวอร์ชันของรูปแบบ
    tlv('01', '12') + // 12 = ใช้ครั้งเดียว (ระบุยอดแล้ว)
    tlv(TAG_MERCHANT, tlv('00', PROMPTPAY_AID) + account) +
    tlv('53', '764') + // สกุลเงิน — 764 คือบาท (ISO 4217)
    tlv('54', amount) +
    tlv('58', 'TH') // ประเทศ

  // `6304` คือหัวของช่อง CRC — ต้องอยู่ในข้อความที่เอาไปคิดค่า
  const withCrcTag = `${body}6304`

  return `${withCrcTag}${crc16(withCrcTag)}`
}

/**
 * ยอดในรูปที่มาตรฐานรับ — ทศนิยมสองตำแหน่งเสมอ
 *
 * `250` เป็น `250.00` · `250.5` เป็น `250.50` · ทำด้วยการต่อสตริง ไม่แปลงเป็นเลข
 */
function normalizeAmount(raw: string): string {
  const value = raw.trim()

  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new Error(`ยอดเงินผิดรูป: ${raw}`)
  }

  const [whole, frac = ''] = value.split('.')

  return `${whole}.${frac.padEnd(2, '0')}`
}

/**
 * รหัสอ้างอิงของ QR ที่ออกครั้งนี้ — **ไม่ได้อยู่ใน payload**
 *
 * พร้อมเพย์แบบไม่ผ่าน gateway ไม่มีช่องให้ฝากเลขอ้างอิงที่กลับมากับเงิน · เลขนี้จึง
 * เป็นของฝั่งเราล้วน ๆ ไว้ผูกว่า "การจ่ายแถวนี้มาจาก QR ใบไหน"
 *
 * คิดจากใบเสร็จ+ยอด+เวลา แล้วตัดให้สั้น — อ่านออกตอนไล่ปัญหา และไม่ชนกันในทางปฏิบัติ
 */
export function makePromptPayRef(invoiceCode: string, amount: string, now: Date = new Date()): string {
  const seed = `${invoiceCode}|${amount}|${now.toISOString()}`

  return `PP-${createHash('sha256').update(seed).digest('hex').slice(0, 12).toUpperCase()}`
}
