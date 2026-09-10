import { expect, test, type Page } from '@playwright/test'

import { loginOwner, uniq } from '../support'

/**
 * สัตว์เลี้ยงฝั่งลูกค้า — **แก้ · ลบ · หน้าที่เหลือเปิดได้**
 *
 * (ผู้ใช้ทักท้วง 2026-09-01: "หน้าสัตว์เลี้ยงของ owner ทำไมไม่มีปุ่มลบหรือแก้ไขหล่ะ")
 */

/** สมัครลูกค้าใหม่ให้เสร็จ — คืน `page` ที่พร้อมใช้งานทุกหน้า */
async function signUpComplete(page: Page): Promise<void> {
  const res = await page.request.post('http://localhost:3211/api/owner-auth/test-login', {
    data: { sub: `e2e-${uniq()}`, name: 'ลูกค้าเทส' },
  })
  expect(res.ok()).toBeTruthy()

  const body = (await res.json()) as { data: { token: string } }
  await loginOwner(page, body.data.token)

  await page.goto('/owner')
  const welcome = page.getByRole('dialog')
  await welcome.locator('#wphone').fill('08' + uniq())
  await welcome.getByRole('button', { name: 'เริ่มใช้งาน' }).click()
  await expect(welcome).toBeHidden({ timeout: 15_000 })
}

/** เพิ่มสัตว์หนึ่งตัวผ่านหน้าจอ — คืนชื่อที่ใช้ */
async function addPet(page: Page): Promise<string> {
  const name = `สัตว์ ${uniq()}`

  await page.goto('/owner/pets')

  const addButton = page.getByRole('button', { name: 'เพิ่ม' })
  await expect(addButton).toBeEnabled({ timeout: 15_000 })
  await addButton.click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await dialog.locator('#pname').fill(name)
  await dialog.getByRole('combobox', { name: 'เลือกชนิด' }).click()
  await page.getByRole('option').first().click()
  await dialog.getByRole('button', { name: 'เพิ่มสัตว์เลี้ยง' }).click()

  await expect(dialog).toBeHidden({ timeout: 15_000 })
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 })

  return name
}

test.describe('สัตว์เลี้ยงฝั่งลูกค้า', () => {
  test('แก้ชื่อสัตว์ของตัวเองได้', async ({ page }) => {
    await signUpComplete(page)
    const name = await addPet(page)
    const renamed = `${name} ใหม่`

    await page.getByRole('button', { name: `แก้ไข ${name}` }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    // โหมดแก้ไขต้องเติมชื่อเดิมไว้ให้ ไม่ใช่ช่องว่าง
    await expect(dialog.locator('#pname')).toHaveValue(name)

    await dialog.locator('#pname').fill(renamed)
    await dialog.getByRole('button', { name: 'บันทึก' }).click()

    await expect(dialog).toBeHidden({ timeout: 15_000 })
    await expect(page.getByText(renamed).first()).toBeVisible({ timeout: 15_000 })
  })

  test('อัปรูปสัตว์ผ่านหน้าจอได้', async ({ page }) => {
    await signUpComplete(page)
    const name = await addPet(page)

    await page.getByRole('button', { name: `แก้ไข ${name}` }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 15_000 })

    /**
     * **เส้นอัปรูปใช้ `api.post` เหมือนเส้นแนบสลิป**
     *
     * บั๊ก `JSON.stringify(FormData)` ทำให้ทั้งสามเส้นที่อัปไฟล์พังพร้อมกัน ·
     * เทสนี้กันเส้นที่สามไม่ให้ย้อนกลับ
     */
    await dialog.locator('input[type="file"]').first().setInputFiles({
      name: 'pet.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8z8Dwn4GBgYEJRIAAAwAWpQMBu1n1gAAAAABJRU5ErkJggg==',
        'base64',
      ),
    })

    await expect(dialog.getByText('pet.png')).toBeVisible({ timeout: 15_000 })

    // รอ response ของการอัปรูป — กดแล้วเช็คทันทีคือการแข่งกับเน็ต
    const uploaded = page.waitForResponse(
      (r) => r.url().includes('/photo') && r.request().method() === 'POST',
      { timeout: 30_000 },
    )
    await dialog.getByRole('button', { name: 'บันทึก' }).click()

    const res = await uploaded
    const detail = await res.text().catch(() => '')
    expect(res.status(), `อัปรูปต้องสำเร็จ — BE ตอบ: ${detail}`).toBe(200)

    await expect(dialog).toBeHidden({ timeout: 15_000 })
  })

  test('ลบสัตว์ที่ยังไม่เคยรักษาได้', async ({ page }) => {
    await signUpComplete(page)
    const name = await addPet(page)

    await page.getByRole('button', { name: `ลบ ${name}` }).click()

    const confirm = page.getByRole('alertdialog')
    await confirm.getByRole('button', { name: 'ลบ', exact: true }).click()

    await expect(page.getByText(name).first()).toBeHidden({ timeout: 15_000 })
  })

  test('หน้าใบเสร็จกับประวัติเปิดได้ และบอกว่ายังไม่มีข้อมูล', async ({ page }) => {
    await signUpComplete(page)

    /**
     * ลูกค้าใหม่ยังไม่มีทั้งสองอย่าง — **ต้องบอกว่ายังไม่มี ไม่ใช่หน้าว่างเปล่า**
     * หน้าว่างทำให้คนคิดว่าโหลดไม่ขึ้น แล้วกด refresh ซ้ำ ๆ
     */
    await page.goto('/owner/invoices')
    await expect(page.getByText(/ยังไม่มีใบเสร็จ/)).toBeVisible({ timeout: 15_000 })

    await page.goto('/owner/history')
    await expect(page.getByText(/ยังไม่มีประวัติ/)).toBeVisible({ timeout: 15_000 })
  })

  test('ยังไม่กรอกข้อมูลติดต่อ — เพิ่มสัตว์ไม่ได้', async ({ page }) => {
    const res = await page.request.post('http://localhost:3211/api/owner-auth/test-login', {
      data: { sub: `e2e-${uniq()}`, name: 'ยังไม่กรอก' },
    })
    const body = (await res.json()) as { data: { token: string } }
    await loginOwner(page, body.data.token)

    await page.goto('/owner')
    await page.getByRole('dialog').getByRole('button', { name: 'ไว้ทีหลัง' }).click()

    /**
     * **ปุ่มเพิ่มต้องกดไม่ได้** — บัญชียังไม่ผูกกับแถวลูกค้า จึงยังไม่มี `ownerId`
     * ให้ผูกสัตว์ · ปล่อยให้กดได้จะได้ 401 ที่อธิบายไม่ได้
     */
    await page.goto('/owner/pets')
    await expect(page.getByRole('button', { name: 'เพิ่ม' })).toBeDisabled({ timeout: 15_000 })
    await expect(page.getByText(/กรอกข้อมูลติดต่อที่หน้าแรกก่อน/)).toBeVisible()
  })
})
