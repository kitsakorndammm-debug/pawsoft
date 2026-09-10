import { createHash, randomBytes } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join, normalize, resolve, sep } from 'node:path'

/**
 * การอ่านเขียนสลิปบนดิสก์ — **ชั้นนี้ไม่รู้จักฐานข้อมูล**
 *
 * แยกจาก `payment.service.ts` เพราะสองอย่างนี้พังคนละแบบและทดสอบคนละวิธี · ที่นี่คือ
 * ที่ที่ path ถูกประกอบและถูกตรวจ ซึ่งเป็นจุดที่ traversal เกิดถ้ามันจะเกิด
 *
 * รูปเดียวกับ `upload.storage.ts` ของ PMK โดยตั้งใจ — โจทย์เดียวกัน คำตอบเดียวกัน
 */

/**
 * ที่เก็บไฟล์ — **อ่านตอนเรียก ไม่ใช่ตอนโหลดโมดูล**
 *
 * ไฟล์เทสตั้ง `UPLOAD_DIR` ของตัวเองแล้วชี้ไปโฟลเดอร์ชั่วคราว · อ่านค่าไว้ตั้งแต่ตอน
 * import แปลว่าค่าที่เทสตั้งมาทีหลังไม่มีผล แล้วเทสจะเขียนไฟล์ลงที่เก็บจริง
 */
export function getUploadDir(): string {
  return process.env['UPLOAD_DIR'] ?? join(process.cwd(), 'uploads')
}

/** เพดานขนาดสลิป — รูปจากมือถือใบหนึ่งไม่ควรเกินนี้ */
export const SLIP_MAX_SIZE = 5 * 1024 * 1024

/**
 * ชนิดที่รับ และลายเซ็นไบต์ต้นไฟล์ของแต่ละชนิด
 *
 * **ตรวจไบต์ ไม่เชื่อ `File.type`** — ค่านั้นเบราว์เซอร์เป็นคนบอก และคนที่ยิง request
 * เองตั้งเป็นอะไรก็ได้ · ไฟล์ที่รันได้ซึ่งเปลี่ยนนามสกุลกับ mime ให้ดูเหมือนรูป จะผ่าน
 * ด่านที่เชื่อ `type` อย่างเดียวไปทั้งดวง แล้วไปนั่งรออยู่ในที่เก็บไฟล์ของเรา
 *
 * ลายเซ็นของ WebP อยู่ที่ไบต์ 8–11 (`WEBP`) ไม่ใช่ที่ต้นไฟล์ — สี่ไบต์แรกเป็น `RIFF`
 * ซึ่งใช้กับรูปแบบอื่นด้วย จึงต้องดูทั้งสองช่วง
 */
const SIGNATURES: Record<string, { ext: string; match: (b: Uint8Array) => boolean }> = {
  'image/png': {
    ext: '.png',
    match: (b) => starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  'image/jpeg': {
    ext: '.jpg',
    match: (b) => starts(b, [0xff, 0xd8, 0xff]),
  },
  'image/webp': {
    ext: '.webp',
    match: (b) =>
      starts(b, [0x52, 0x49, 0x46, 0x46]) &&
      b.length >= 12 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
  /** ธนาคารบางแห่งให้สลิปมาเป็น PDF */
  'application/pdf': {
    ext: '.pdf',
    match: (b) => starts(b, [0x25, 0x50, 0x44, 0x46]),
  },
}

function starts(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false

  return sig.every((v, i) => bytes[i] === v)
}

/** ชนิดที่ระบบรับ — หน้าเว็บใช้ค่านี้ตั้ง `accept` ของช่องเลือกไฟล์ */
export const SLIP_ALLOWED_MIME = Object.keys(SIGNATURES)

/** ชนิดที่ยอมรับได้ และไบต์ข้างในตรงกับที่อ้างมาจริงไหม */
export function isSlipTypeAllowed(mimeType: string, bytes: Uint8Array): boolean {
  const sig = SIGNATURES[mimeType]

  return sig !== undefined && sig.match(bytes)
}

/**
 * ลายนิ้วมือของไฟล์ — **ตัวที่กันสลิปใบเดียวถูกแนบหลายใบเสร็จ**
 *
 * คิดจากไบต์ทั้งก้อน ไม่ใช่จากชื่อไฟล์หรือขนาด · เปลี่ยนชื่อไฟล์แล้วอัปใหม่จะได้ค่า
 * เดิม ซึ่งเป็นสิ่งที่เราต้องการพอดี · ฐานมี unique index บนค่านี้ (`07-payment.sql`)
 *
 * **ไม่กันคนที่แก้ไฟล์ทีละพิกเซลแล้วอัปใหม่** — กันแบบนั้นต้องใช้ perceptual hash
 * ซึ่งมี false positive ของตัวเอง · ตัวนี้กัน "ก๊อปไฟล์เดิมมาแนบซ้ำ" ซึ่งเป็นรูปที่
 * เกิดจริงและเกิดบ่อยกว่ามาก
 */
export function hashSlip(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export type StoredSlip = {
  /** ที่อยู่แบบสัมพัทธ์ใต้ `UPLOAD_DIR` — ค่าที่ลงคอลัมน์ `slip_path` */
  path: string
  hash: string
  size: number
}

/**
 * เขียนสลิปลงดิสก์แล้วคืนที่อยู่ของมัน — **ไม่ตรวจอะไรเลย ผู้เรียกตรวจมาก่อนแล้ว**
 *
 * ชื่อบนดิสก์เป็นค่าสุ่ม ไม่ใช่ชื่อที่ผู้ใช้ตั้ง · ชื่อของผู้ใช้ซ้ำกันได้ มีอักขระที่ระบบไฟล์
 * ไม่รับได้ และเดาได้ · สามข้อนั้นหายไปพร้อมกันเมื่อชื่อบนดิสก์เป็นของที่เราออกเอง
 *
 * แยกโฟลเดอร์ตามปี/เดือน — โฟลเดอร์เดียวที่มีไฟล์เป็นแสนคือโฟลเดอร์ที่ `ls` ค้าง
 */
export async function storeSlip(
  mimeType: string,
  bytes: Uint8Array,
  now: Date = new Date(),
): Promise<StoredSlip> {
  const ext = SIGNATURES[mimeType]?.ext ?? ''
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const stem = randomBytes(16).toString('hex')

  const dir = getUploadDir()
  await mkdir(join(dir, 'slip', yyyy, mm), { recursive: true })
  await writeFile(join(dir, 'slip', yyyy, mm, `${stem}${ext}`), bytes)

  return {
    path: `slip/${yyyy}/${mm}/${stem}${ext}`,
    hash: hashSlip(bytes),
    size: bytes.length,
  }
}

/**
 * แปลงที่อยู่สัมพัทธ์เป็นที่อยู่เต็ม — คืน `null` เมื่อค่านั้นพาออกนอกที่เก็บ
 *
 * `..` ที่ฝังอยู่กลางทาง และที่อยู่แบบเต็มที่ขึ้นต้นด้วย `/` คือสองรูปที่พาโค้ดไปอ่าน
 * ไฟล์นอกโฟลเดอร์ที่ตั้งใจ · ค่าที่ลงฐานมาจากที่นี่อยู่แล้ว แต่ฟังก์ชันนี้จะได้รับค่า
 * จากที่อื่นในอนาคต และตอนนั้นด่านนี้คือสิ่งเดียวที่ขวางอยู่
 */
export function resolveSlipPath(relPath: string): string | null {
  const dir = resolve(getUploadDir())
  const abs = resolve(join(dir, normalize(relPath)))

  if (abs !== dir && !abs.startsWith(dir + sep)) return null

  return abs
}

/**
 * ลบไฟล์ — **เงียบเมื่อไม่มีไฟล์นั้น**
 *
 * ใช้ตอน rollback: เขียนไฟล์สำเร็จแล้วแต่เขียนฐานไม่สำเร็จ · ไฟล์ที่หายไปแล้วไม่ใช่
 * ความล้มเหลวของการลบ มันคือผลลัพธ์ที่ต้องการอยู่แล้ว
 */
export async function removeSlip(relPath: string): Promise<void> {
  const abs = resolveSlipPath(relPath)
  if (abs === null) return

  try {
    await unlink(abs)
  } catch {
    // ไม่มีไฟล์ หรือลบไปแล้ว — ผลลัพธ์ตรงกับที่ต้องการ
  }
}
