import { expect, type Page } from '@playwright/test'

/**
 * ตัวช่วยที่ใช้ร่วมกันทุกเทส
 *
 * **ไม่มี fixture ที่ล็อกอินให้อัตโนมัติ** — เทสส่วนใหญ่ต้องสลับผู้ใช้กลางทาง
 * (เคาน์เตอร์ส่งยอด แล้วบัญชียืนยัน) · fixture ที่ล็อกอินให้ตัวเดียวจะบังคับให้
 * เทสพวกนั้นล็อกเอาต์เองอยู่ดี ซึ่งอ่านยากกว่าเรียกเองตรง ๆ
 */

export const E2E_PASSWORD = 'e2e-pass-1234'

export const USERS = {
  counter: 'e2e_counter',
  vet: 'e2e_vet',
  accountant: 'e2e_account',
  admin: 'admin',
} as const

export const ADMIN_PASSWORD = '1234'

/** ล็อกอินฝั่งพนักงาน — รอจนออกจากหน้าล็อกอินจริง ไม่ใช่แค่กดปุ่มแล้วไปต่อ */
export async function loginStaff(
  page: Page,
  username: string,
  password = E2E_PASSWORD,
): Promise<void> {
  await page.goto('/login')
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()

  /**
   * **รอ URL เปลี่ยน ไม่ใช่รอ element**
   *
   * หน้าล็อกอินกับหน้าแรกมีคำว่า "Paw Soft" เหมือนกัน · รอ element จะผ่านทันที
   * ตั้งแต่ยังไม่ได้ล็อกอิน แล้วเทสไปล้มที่ขั้นถัดไปด้วยเหตุผลที่ไม่เกี่ยวกัน
   */
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
}

/**
 * ออกจากระบบ — **มีกล่องยืนยันคั่น**
 *
 * ปุ่มบน header เปิด `alertdialog` ที่มีปุ่มชื่อเดียวกัน · กดปุ่มแรกแล้วรอ URL เปลี่ยน
 * จะค้างอยู่ตรงนั้นตลอด เพราะยังไม่ได้ยืนยัน
 */
export async function logoutStaff(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'ออกจากระบบ' }).click()

  const confirm = page.getByRole('alertdialog')
  await confirm.getByRole('button', { name: 'ออกจากระบบ' }).click()

  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
}

/**
 * ล็อกอินฝั่งลูกค้าโดย**ข้าม Google** — ยิง API สร้างเซสชันแล้วยัด cookie เอง
 *
 * เทสที่ต้องผ่านหน้าเลือกบัญชีของ Google จริงคือเทสที่รันไม่ได้ใน CI (ต้องมีบัญชี
 * จริง · ต้องผ่าน 2FA · Google บล็อกเบราว์เซอร์อัตโนมัติ) · สิ่งที่เทสฝั่งนี้ต้อง
 * พิสูจน์คือหน้าจอหลังล็อกอิน ไม่ใช่ว่า OAuth ของ Google ทำงานไหม
 */
export async function loginOwner(page: Page, token: string): Promise<void> {
  await page.context().addCookies([
    {
      name: 'pawsoft_owner',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
}

/** เลขสุ่มท้ายชื่อ — เทสรันซ้ำได้โดยไม่ชนกฎ unique (เบอร์โทร · ชื่อ) */
export const uniq = () => String(Date.now()).slice(-8) + String(Math.floor(Math.random() * 90) + 10)
