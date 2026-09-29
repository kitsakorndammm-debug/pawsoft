import nodemailer from 'nodemailer'

/**
 * ส่งอีเมล — ผ่าน SMTP จริงถ้าตั้งค่าไว้ครบ ไม่งั้น**พิมพ์ออก log แทน**
 *
 * ยังไม่ได้ตั้ง `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` ครบทั้งสี่ตัว → ถือว่า
 * ยังไม่พร้อมส่งจริง พิมพ์เนื้อหาที่ควรส่งออกที่ console แทน — ทำให้ทดสอบ flow ที่ต้องใช้
 * อีเมล (เช่น OTP) ได้ตั้งแต่ก่อนมีบัญชีอีเมลจริง ต่อ SMTP จริงเมื่อไหร่ก็ทำงานทันที
 * โดยไม่ต้องแก้โค้ด — แค่ตั้ง env
 */

function isConfigured(): boolean {
  return Boolean(
    process.env['SMTP_HOST'] &&
      process.env['SMTP_PORT'] &&
      process.env['SMTP_USER'] &&
      process.env['SMTP_PASS'],
  )
}

let cachedTransport: ReturnType<typeof nodemailer.createTransport> | null = null

function transport() {
  if (cachedTransport) return cachedTransport

  const port = Number(process.env['SMTP_PORT'])
  cachedTransport = nodemailer.createTransport({
    host: process.env['SMTP_HOST'],
    port,
    // 465 เป็น TLS ตั้งแต่ต่อ ส่วน 587 (ที่พบบ่อยสุด) ใช้ STARTTLS หลังต่อแบบธรรมดา
    secure: port === 465,
    auth: { user: process.env['SMTP_USER'], pass: process.env['SMTP_PASS'] },
  })

  return cachedTransport
}

export type SendMailInput = { to: string; subject: string; text: string }

export async function sendMail(input: SendMailInput): Promise<void> {
  if (!isConfigured()) {
    console.log(
      `[mailer] ยังไม่ตั้งค่า SMTP — พิมพ์อีเมลที่ควรส่งไว้ที่นี่แทน\n` +
        `  ถึง: ${input.to}\n  หัวข้อ: ${input.subject}\n  เนื้อหา: ${input.text}`,
    )
    return
  }

  await transport().sendMail({
    from: process.env['SMTP_USER'],
    to: input.to,
    subject: input.subject,
    text: input.text,
  })
}
