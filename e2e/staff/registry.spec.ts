import { expect, test } from '@playwright/test'

import { ADMIN_PASSWORD, USERS, loginStaff, uniq } from '../support'

/**
 * ทะเบียนเจ้าของสัตว์กับสัตว์เลี้ยง + ตารางจอง
 *
 * สามหน้าที่พนักงานเปิดทุกวันแต่ยังไม่มีเทสแตะเลย
 */

test.describe('ทะเบียน', () => {
  test('เพิ่มเจ้าของสัตว์ แล้วเพิ่มสัตว์ให้เขา', async ({ page }) => {
    await loginStaff(page, USERS.counter)

    const ownerName = `เจ้าของ ${uniq()}`
    const phone = '08' + uniq()

    // ---- เจ้าของ ----
    await page.goto('/owners')
    await expect(page.locator('table')).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: /เพิ่ม/ }).first().click()

    const ownerDialog = page.getByRole('dialog')
    await expect(ownerDialog).toBeVisible({ timeout: 15_000 })
    await ownerDialog.getByRole('textbox').first().fill(ownerName)

    /**
     * **เบอร์ต้องไม่ซ้ำ** — `owner_phone_live_key` เป็น unique · `uniq()` กันชนกัน
     * ระหว่างรันซ้ำ (ผู้ใช้กำหนด 2026-09-01: "เบอร์จะเป็น unique ในระบบ")
     */
    await ownerDialog.getByLabel(/เบอร์โทร/).first().fill(phone)
    await ownerDialog.getByRole('button', { name: /บันทึก|เพิ่ม/ }).last().click()

    await expect(ownerDialog).toBeHidden({ timeout: 15_000 })
    await expect(page.getByText(ownerName).first()).toBeVisible({ timeout: 15_000 })

    // ---- สัตว์ของเจ้าของคนนั้น ----
    const petName = `สัตว์ ${uniq()}`

    await page.goto('/pets')
    await expect(page.locator('table')).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: /เพิ่ม/ }).first().click()

    const petDialog = page.getByRole('dialog')
    await expect(petDialog).toBeVisible({ timeout: 15_000 })

    // เลือกเจ้าของจากกล่องค้นหา — ปุ่มเปิด dialog แยก ไม่ใช่ combobox
    await petDialog.getByRole('button', { name: /เลือกเจ้าของ|เจ้าของ/ }).first().click()

    const picker = page.getByRole('dialog').last()
    await picker.getByRole('textbox').first().fill(ownerName)
    await picker.getByText(ownerName).first().click()

    await petDialog.getByLabel(/ชื่อสัตว์/).first().fill(petName)

    /**
     * **ชนิดสัตว์บังคับ** — ฟอร์มไม่ยอมบันทึกถ้าไม่เลือก
     *
     * หาด้วย `data-field-name` ไม่ใช่ placeholder — placeholder เปลี่ยนเป็นชื่อที่
     * เลือกไว้ทันทีที่มีค่า แล้ว selector จะพังตอนเปิดฟอร์มแก้ไข
     */
    await petDialog.locator('[data-field-name="speciesId"]').click()
    await page.getByRole('option').first().click()

    await petDialog.getByRole('button', { name: 'บันทึก' }).click()

    await expect(petDialog).toBeHidden({ timeout: 15_000 })
    await expect(page.getByText(petName).first()).toBeVisible({ timeout: 15_000 })
  })

  test('ตารางจองเปิดได้ และมีช่วงเวลาครบสี่ช่วง', async ({ page }) => {
    await loginStaff(page, USERS.counter)

    await page.goto('/appointments')
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 })

    /**
     * สี่ช่วงเวลา — **มาจาก BE ไม่ใช่ hardcode ที่หน้าจอ**
     * (ผู้ใช้กำหนด: "จองเป็นช่วงเวลาจริง แบ่งเป็น 2 ช่วงเช้า กับ 2 ช่วงเย็น")
     */
    for (const slot of ['เช้า 09:00', 'เช้า 10:30', 'บ่าย 13:00', 'เย็น 15:00']) {
      await expect(page.getByText(slot).first(), `ต้องมีช่วง ${slot}`).toBeVisible({
        timeout: 15_000,
      })
    }
  })

  test('หน้าเปลี่ยนรหัสผ่านเปิดได้', async ({ page }) => {
    await loginStaff(page, USERS.admin, ADMIN_PASSWORD)

    await page.goto('/change-password')
    await expect(page.getByRole('button', { name: /บันทึก|เปลี่ยน/ }).first()).toBeVisible({
      timeout: 15_000,
    })
  })
})
