import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright — **ยิงของจริงทั้งกอง** เว็บ · API · ฐาน
 *
 * บั๊กที่เจ็บที่สุดของโปรเจคนี้ทุกตัวรอด typecheck กับ unit test มาได้:
 * เส้น `/api/appointments/slots` การ์ดผิดฝั่งจนหน้าจองกดไม่ได้ · `status` ที่ route
 * ส่งไปแล้ว service ไม่หยิบไปใช้ · index ที่ `IF NOT EXISTS` ข้ามการแก้เงื่อนไข ·
 * ทั้งสามตัวเห็นได้ต่อเมื่อกดปุ่มจริงบนหน้าจริง
 *
 * **ฐานคนละตัวกับ dev** (`pawsoft_e2e`) — เทสสร้างและลบข้อมูลตลอดเวลา · ใช้ฐาน
 * เดียวกับที่กำลังเปิดหน้าจอดูอยู่แปลว่าข้อมูลที่กำลังดูหายไปกลางคัน
 */

const WEB = 'http://localhost:3210'
const API = 'http://localhost:3211'

/** URL ของฐาน e2e — แปลงจากของ dev เหมือน `push-test-db.ts` */
const e2eDatabaseUrl = () => {
  const dev = process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/pawsoft'

  return dev.replace(/\/[^/?]+(\?|$)/, '/pawsoft_e2e$1')
}

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.output',

  /**
   * **`fullyParallel: false`** — เทสใช้ฐานร่วมกันและหลายตัวสร้างคิวของ "วันนี้"
   * ซึ่งชนกันที่ `visit_queue_number_per_day_key` · รันขนานกันจะล้มแบบสุ่ม
   * ซึ่งเป็นความล้มเหลวที่แย่ที่สุด: ไม่ซ้ำ และไม่ได้บอกอะไรเกี่ยวกับโค้ด
   */
  fullyParallel: false,
  workers: 1,

  /** CI ห้ามมี `test.only` หลุด — ชุดที่รันแค่เทสเดียวแล้วเขียวคือชุดที่โกหก */
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,

  reporter: [['list'], ['html', { outputFolder: 'e2e/.report', open: 'never' }]],

  use: {
    baseURL: WEB,
    /** เก็บร่องรอยเฉพาะตอนล้ม — เก็บทุกครั้งจะได้ไฟล์เป็นกิกะไบต์โดยไม่มีใครเปิดดู */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
  },

  projects: [
    {
      name: 'staff',
      testMatch: /staff\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      /** ฝั่งลูกค้าเป็นมือถือ — เมนูล่างกับ bubble ออกแบบมาเพื่อจอนี้ */
      name: 'owner',
      testMatch: /owner\/.*\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
  ],

  /**
   * **Playwright เปิดเซิร์ฟเวอร์เอง** — ไม่ต้องจำว่าต้องรันอะไรก่อน
   *
   * `reuseExistingServer` ปิดใน CI เพราะถ้ามีอะไรค้างพอร์ตอยู่ เทสจะยิงใส่ของเก่า
   * แล้วเขียวทั้งที่โค้ดใหม่ยังไม่ได้ถูกรัน (เคยเจอตอนวัดด้วยมือ 2026-09-01)
   */
  webServer: [
    {
      command: 'bun --filter @pawsoft/api dev',
      url: `${API}/health`,
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        DATABASE_URL: e2eDatabaseUrl(),
        PORT: '3211',
        APP_ENV: 'local',
        WEB_ORIGIN: WEB,
        OWNER_WEB_URL: WEB,
        /** ที่เก็บไฟล์ของเทส — แยกจาก `uploads/` ของ dev */
        UPLOAD_DIR: './e2e/.uploads',

        /**
         * **พร้อมเพย์ต้องตั้งที่นี่ด้วย** — `env` ของ `webServer` **แทนที่**
         * ตัวแปรทั้งชุด ไม่ได้ผสมกับ `.env` · ไม่ตั้งไว้ `isPromptPayConfigured()`
         * จะเป็นเท็จ แล้ว QR ไม่ขึ้นบนหน้าจ่ายเงินโดยไม่มี error อะไรเลย
         */
        PROMPTPAY_TARGET: '0812345678',
        PROMPTPAY_NAME: 'Paw Soft E2E',
      },
    },
    {
      command: 'bun --filter @pawsoft/web dev -- -p 3210',
      url: WEB,
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NEXT_PUBLIC_API_URL: API,
        PORT: '3210',
      },
    },
  ],
})
