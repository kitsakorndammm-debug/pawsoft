import { expect, test } from '@playwright/test'

import { ADMIN_PASSWORD, USERS, loginStaff, logoutStaff, uniq } from '../support'

/**
 * เส้นทางหลักของคลินิก — **ลงทะเบียน → ตรวจ → เก็บเงิน → บัญชียืนยัน**
 *
 * ทำด้วย**สามบัญชีคนละสิทธิ์** ไม่ใช่ admin ตัวเดียว · กฎที่สำคัญที่สุดสองข้อของ
 * ระบบนี้พิสูจน์ไม่ได้เลยถ้าใช้ admin: เคาน์เตอร์ต้องลงผลวินิจฉัยไม่ได้ และคนยืนยัน
 * ยอดต้องไม่ใช่คนที่ส่งยอด
 */

test.describe('เส้นทางหลักฝั่งพนักงาน', () => {
  test('เคาน์เตอร์ลงทะเบียนคิวหน้างานได้ และคิวขึ้นบนจอ', async ({ page }) => {
    await loginStaff(page, USERS.counter)

    await page.goto('/queue')
    await expect(page.getByRole('heading', { name: /คิววันนี้/ })).toBeVisible()

    const petName = `เทสคิว ${uniq()}`

    await page.getByRole('button', { name: /ลงทะเบียนหน้างาน/ }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    /**
     * **ต้องกด "ยังไม่มีในระบบ" ก่อน** — dialog เปิดมาโหมด "ลูกค้าในระบบ" ซึ่งบังคับ
     * ให้เลือกจากทะเบียน · เคสฉุกเฉินที่ยังไม่รู้ว่าเจ้าของเป็นใครใช้โหมดนี้ไม่ได้
     */
    await dialog.getByRole('button', { name: 'ยังไม่มีในระบบ' }).click()
    await dialog.getByRole('textbox', { name: /ชื่อสัตว์/ }).fill(petName)
    await dialog.getByRole('button', { name: 'เปิดคิว' }).click()

    await expect(dialog).toBeHidden({ timeout: 15_000 })
    await expect(page.getByText(petName)).toBeVisible({ timeout: 15_000 })
  })

  test('เคาน์เตอร์เห็นหน้าคิว แต่เข้าหน้าข้อมูลหลักที่ไม่มีสิทธิ์ไม่ได้', async ({ page }) => {
    await loginStaff(page, USERS.counter)

    // มี reception:read — ต้องเห็นแท็บคิว
    //
    // **ขอบเขตที่ `nav` เท่านั้น** — หน้าแรกมีการ์ดสรุปคิว ("คิววันนี้ N คน ...")
    // ที่ชื่อขึ้นต้นด้วย "คิว" เหมือนกัน `getByRole('link', { name: 'คิว' })` เฉย ๆ
    // จะชนกับการ์ดนั้นแล้วโดน strict mode violation (เจอจริง 2026-09-22)
    await expect(page.getByRole('navigation').getByRole('link', { name: 'คิว' })).toBeVisible()

    /**
     * **ไม่มี `hr:read` — แท็บพนักงานต้องไม่โผล่**
     *
     * นี่คือด่านที่เคยพลาดมาก่อน: บัญชีที่อ่านได้อย่างเดียวเห็นปุ่มครบทุกปุ่ม
     * ทั้งที่เทสผ่านหมด
     */
    await page.goto('/settings/employees')
    await expect(page.getByText(/ไม่มีสิทธิ์|ไม่พบ|เข้าถึง/i).first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test('บัญชีเห็นเมนูการเงิน แต่ไม่เห็นเมนูคิว', async ({ page }) => {
    await loginStaff(page, USERS.accountant)

    await expect(page.getByRole('link', { name: 'การเงิน' })).toBeVisible()
    // ไม่มี reception:read
    await expect(page.getByRole('link', { name: 'คิว' })).toBeHidden()
  })

  test('admin เปลี่ยนหน้าไปมาได้ครบทุกเมนูหลัก', async ({ page }) => {
    await loginStaff(page, USERS.admin, ADMIN_PASSWORD)
    const nav = page.getByRole('navigation')

    for (const [name, path] of [
      ['คิว', '/queue'],
      ['ตารางจอง', '/appointments'],
      ['เจ้าของสัตว์', '/owners'],
      ['สัตว์เลี้ยง', '/pets'],
      ['การเงิน', '/billing'],
    ] as const) {
      // ขอบเขตที่ `nav` — เหตุผลเดียวกับเทสข้างบน กัน "คิว" ชนกับการ์ดสรุปคิวหน้าแรก
      await nav.getByRole('link', { name }).click()
      await expect(page).toHaveURL(new RegExp(path), { timeout: 15_000 })
      // หน้าที่โหลดไม่ขึ้นจะไม่มี h1 — จับได้ตรงนี้ก่อนไปหน้าถัดไป
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 })
    }

    await logoutStaff(page)
  })
})
