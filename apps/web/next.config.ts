import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,

  /**
   * **ปิดตราบอกสถานะของ Next ตอน dev** — มันลอยทับมุมซ้ายล่าง
   *
   * ฝั่งลูกค้ามีแถบเมนูอยู่ขอบล่าง และตรานี้ทับแท็บซ้ายสุด ("หน้าแรก") พอดี ·
   * บนเครื่อง dev คือกดแท็บนั้นไม่ติด และใน Playwright คือเทสค้างรอ element
   * ที่ "ไม่ stable" จนหมดเวลา โดยไม่มีอะไรบอกว่าเพราะอะไร (เจอตอนเขียน e2e
   * 2026-09-01) · build production ไม่มีตรานี้อยู่แล้ว
   */
  devIndicators: false,

  typescript: {
    // typecheck เป็นด่านแยก (`bun run typecheck:web`) — ตราบใดที่ด่านนั้นถูกรันจริง
    ignoreBuildErrors: true,
  },

  experimental: {
    // Next เรียก compiler API ของ TypeScript 6 ซึ่ง TS 7 ไม่มีให้แล้ว — ไม่ตั้งค่านี้
    // จะพังตั้งแต่ตอนเริ่ม
    useTypeScriptCli: true,
  },

  // Next เขียน `AGENTS.md` กับ `CLAUDE.md` ของตัวเองลง `apps/web` ถ้าไม่ปิด ·
  // ไฟล์คำสั่งของโปรเจคนี้อยู่ที่ราก ไม่ใช่กระจายอยู่ในแต่ละแอป
  agentRules: false,

  /**
   * พร็อกซี `/api/*` ไปที่ API จริง — ทำให้เบราว์เซอร์เห็นเป็น origin เดียวกับหน้าเว็บ
   * เสมอ ไม่ว่า API จะ deploy อยู่ที่ไหน · กัน CORS และปัญหา cookie ข้าม origin
   * (session cookie ของฝั่งพนักงาน/ลูกค้าตั้ง `secure:false, sameSite:'lax'` ซึ่งใช้ไม่ได้
   * ถ้าเบราว์เซอร์มองว่าเป็นคนละ origin กัน)
   *
   * **`API_ORIGIN` ต้องตั้งใน env ของที่ deploy จริง** — ไม่ใส่ค่า fallback ไป
   * localhost เพราะ deploy จริงที่ลืมตั้งค่านี้ ควรพังให้เห็นทันที ไม่ใช่เงียบ ๆ
   * ไปเรียก localhost ที่ไม่มีจริงบนเซิร์ฟเวอร์นั้น
   */
  async rewrites() {
    const apiOrigin = process.env['API_ORIGIN'] ?? 'http://localhost:3201'

    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }]
  },
}

export default config
