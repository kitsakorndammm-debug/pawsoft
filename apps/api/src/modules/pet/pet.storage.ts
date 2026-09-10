import { randomBytes } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join, normalize, resolve, sep } from 'node:path'

import { getUploadDir } from '../payment/payment.storage.ts'

/**
 * รูปสัตว์เลี้ยง — **เก็บเป็นไฟล์ ที่อยู่ลงฐาน**
 *
 * (ผู้ใช้กำหนด 2026-09-01: "อยากให้มีการอัพโหลดรูปด้วย")
 *
 * รูปเดียวกับสลิป (`payment.storage.ts`) และใช้ `getUploadDir()` ตัวเดียวกัน —
 * ที่เก็บเดียว ตั้งค่าที่เดียว · แยกไฟล์เพราะกฎต่างกัน: รูปสัตว์ไม่รับ PDF และ
 * ไม่ต้องกันอัปซ้ำด้วย hash (เจ้าของอัปรูปเดิมซ้ำได้ ไม่ใช่การโกง)
 */

/** 3 MB — รูปจากมือถือย่อแล้วอยู่ราว 1 MB · เผื่อไว้แต่ไม่ให้รับไฟล์ดิบจากกล้อง DSLR */
export const PHOTO_MAX_SIZE = 3 * 1024 * 1024

/**
 * **ตรวจไบต์จริง ไม่เชื่อ `File.type`** — ค่านั้นเบราว์เซอร์เป็นคนบอก และปลอมได้
 *
 * ไม่รับ PDF ต่างจากสลิป · รูปสัตว์ที่เป็น PDF คือไฟล์ที่แนบผิด
 */
const SIGNATURES: Record<string, { ext: string; test: (b: Uint8Array) => boolean }> = {
  'image/jpeg': {
    ext: '.jpg',
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  'image/png': {
    ext: '.png',
    test: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  'image/webp': {
    ext: '.webp',
    test: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
}

export const PHOTO_ALLOWED_MIME = Object.keys(SIGNATURES)

export function isPhotoTypeAllowed(mimeType: string, bytes: Uint8Array): boolean {
  const sig = SIGNATURES[mimeType]

  return sig !== undefined && bytes.length >= 12 && sig.test(bytes)
}

/** เก็บรูปลงดิสก์ — คืนที่อยู่สัมพัทธ์ที่จะลงคอลัมน์ `photo_path` */
export async function storePhoto(
  mimeType: string,
  bytes: Uint8Array,
  now: Date = new Date(),
): Promise<string> {
  const ext = SIGNATURES[mimeType]?.ext ?? ''
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const stem = randomBytes(16).toString('hex')

  const dir = getUploadDir()
  await mkdir(join(dir, 'pet', yyyy, mm), { recursive: true })
  await writeFile(join(dir, 'pet', yyyy, mm, `${stem}${ext}`), bytes)

  return `pet/${yyyy}/${mm}/${stem}${ext}`
}

/**
 * ที่อยู่เต็มของรูป — **`null` เมื่อค่านั้นพาออกนอกที่เก็บ**
 *
 * เหตุผลเดียวกับ `resolveSlipPath` · `..` กลางทางกับ path เต็มที่ขึ้นต้นด้วย `/`
 * คือสองรูปที่พาโค้ดไปอ่านไฟล์นอกโฟลเดอร์ที่ตั้งใจ
 */
export function resolvePhotoPath(relPath: string): string | null {
  const dir = resolve(getUploadDir())
  const abs = resolve(join(dir, normalize(relPath)))

  if (abs !== dir && !abs.startsWith(dir + sep)) return null

  return abs
}

/** ลบรูปเก่า — **เงียบเมื่อไฟล์หายไปแล้ว** เพราะปลายทางที่ต้องการคือ "ไม่มีไฟล์นี้" */
export async function removePhoto(relPath: string): Promise<void> {
  const abs = resolvePhotoPath(relPath)
  if (abs === null) return

  try {
    await unlink(abs)
  } catch {
    // ไม่มีอยู่แล้วก็ถือว่าสำเร็จ
  }
}
