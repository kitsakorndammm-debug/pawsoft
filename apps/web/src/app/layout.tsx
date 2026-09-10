import type { Metadata } from 'next'
import { Sarabun } from 'next/font/google'
import { Providers } from '@/components/providers'
import './globals.css'

/**
 * ฟอนต์เดียวทั้งระบบ · มาทาง `next/font` **ไม่ใช่ `<link>` ไป Google** — ฟอนต์ถูก
 * เสิร์ฟจากเครื่องเรา หน้าจอจึงไม่กระพริบเป็นฟอนต์ระบบก่อนหนึ่งจังหวะ และไม่พัง
 * ตอนเครื่องออกเน็ตนอกไม่ได้
 *
 * **ไม่มี italic** — ภาษาไทยเอียงแล้วอ่านยากขึ้น ไม่ได้เน้นขึ้น
 */
const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sarabun',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Paw Soft — ระบบจัดการคลินิกรักษาสัตว์',
  description: 'ระบบจัดการคลินิกรักษาสัตว์',
}

/** เป็น server component — provider ทั้งหมดถูกแยกไว้ที่ `components/providers.tsx` */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={sarabun.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
