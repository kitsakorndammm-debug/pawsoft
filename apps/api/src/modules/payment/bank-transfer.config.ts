/**
 * บัญชีธนาคารที่รับโอน — **มาจาก `.env` ไม่ใช่จากฐาน** เหตุผลเดียวกับ `promptpay.config.ts`
 *
 * ใช้แสดงให้ลูกค้าโอนตอนเลือกวิธี "โอนธนาคาร" แทนพร้อมเพย์ — ไม่มีการคำนวณอะไรกับค่านี้
 * (ต่างจากพร้อมเพย์ที่ต้องเข้ารหัสเป็น QR) จึงไม่ต้องตรวจรูปเบอร์/เลขบัญชี
 */

export type BankTransferSettings = {
  bankName: string
  accountNumber: string
  accountName: string
}

/** ตั้งค่าครบหรือยัง — หน้าเว็บถามก่อนวาดตัวเลือก "โอนธนาคาร" */
export function isBankTransferConfigured(): boolean {
  return (process.env['BANK_ACCOUNT_NUMBER'] ?? '').trim().length > 0
}

/** ค่าที่ตั้งไว้ — เรียกเฉพาะตอน `isBankTransferConfigured()` เป็นจริงแล้ว */
export function getBankTransferSettings(): BankTransferSettings {
  return {
    bankName: (process.env['BANK_NAME'] ?? '').trim(),
    accountNumber: (process.env['BANK_ACCOUNT_NUMBER'] ?? '').trim(),
    accountName: (process.env['BANK_ACCOUNT_NAME'] ?? '').trim(),
  }
}
