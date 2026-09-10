import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

import { USERS, loginOwner, loginStaff, logoutStaff, uniq } from '../support'

/**
 * ใบเสร็จรายใบฝั่งลูกค้า — **หน้าสุดท้ายที่ยังไม่มีเทสแตะ**
 *
 * หน้านี้เข้าถึงยากที่สุดในระบบ เพราะต้องมีบิลค้างจริงถึงจะเปิดได้ · ต้องเดินทั้ง
 * เส้นก่อน: เจ้าของ → สัตว์ → คิว → ตรวจเสร็จ → ออกใบ แล้วค่อยกลับมาดูฝั่งลูกค้า
 *
 * สิ่งที่ต้องพิสูจน์คือของที่ผู้ใช้สั่งไว้:
 * "สแกน QR อัปโหลดหลักฐานเองได้ โหลดรูป QR ได้เพื่อเอาไปจ่ายในแอปธนาคาร"
 */

/** เบอร์ที่ยังไม่มีใครใช้ — ใช้จับคู่บัญชี Google กับแถวลูกค้าที่พนักงานสร้าง */
const newPhone = () => '08' + uniq()

/**
 * พนักงานสร้างลูกค้า + สัตว์ + คิวที่ตรวจเสร็จ แล้วออกใบเสร็จค้างไว้
 *
 * ทำผ่านหน้าจอทั้งหมด ไม่ยิง API ตรง — เทสที่ปูข้อมูลด้วย API แล้วตรวจ UI
 * จะไม่จับบั๊กที่อยู่ระหว่างสองฝั่ง ซึ่งเป็นที่ที่บั๊กของโปรเจคนี้ชอบอยู่
 */
async function staffCreatesUnpaidInvoice(page: Page, phone: string): Promise<string> {
  const ownerName = `ลูกค้าบิล ${uniq()}`
  const petName = `สัตว์บิล ${uniq()}`

  // ---- เคาน์เตอร์: สร้างเจ้าของ ----
  await loginStaff(page, USERS.counter)
  await page.goto('/owners')
  await expect(page.locator('table')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: /เพิ่ม/ }).first().click()
  const ownerDialog = page.getByRole('dialog')
  await ownerDialog.getByRole('textbox').first().fill(ownerName)
  await ownerDialog.getByLabel(/เบอร์โทร/).first().fill(phone)
  await ownerDialog.getByRole('button', { name: /บันทึก|เพิ่ม/ }).last().click()
  await expect(ownerDialog).toBeHidden({ timeout: 15_000 })

  // ---- สัตว์ของเขา ----
  await page.goto('/pets')
  await expect(page.locator('table')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: /เพิ่ม/ }).first().click()
  const petDialog = page.getByRole('dialog')
  await petDialog.getByRole('button', { name: /เลือกเจ้าของ|เจ้าของ/ }).first().click()

  const picker = page.getByRole('dialog').last()
  await picker.getByRole('textbox').first().fill(ownerName)
  await picker.getByText(ownerName).first().click()

  await petDialog.getByLabel(/ชื่อสัตว์/).first().fill(petName)
  await petDialog.locator('[data-field-name="speciesId"]').click()
  await page.getByRole('option').first().click()
  await petDialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(petDialog).toBeHidden({ timeout: 15_000 })

  // ---- เปิดคิวให้สัตว์ตัวนั้น ----
  await page.goto('/queue')
  await page.getByRole('button', { name: /ลงทะเบียนหน้างาน/ }).click()

  const queueDialog = page.getByRole('dialog')
  await expect(queueDialog).toBeVisible({ timeout: 15_000 })
  await queueDialog.getByRole('button', { name: 'เลือกลูกค้าและสัตว์' }).click()

  const queuePicker = page.getByRole('dialog').last()
  await queuePicker.getByRole('textbox').first().fill(ownerName)
  await queuePicker.getByText(ownerName).first().click()
  // เลือกสัตว์ต่อในกล่องเดียวกัน
  await page.getByText(petName).first().click()

  await queueDialog.getByRole('button', { name: 'เปิดคิว' }).click()
  await expect(queueDialog).toBeHidden({ timeout: 15_000 })
  await logoutStaff(page)

  // ---- หมอ: เรียกแล้วปิดการตรวจ ----
  await loginStaff(page, USERS.vet)
  await page.goto('/queue')

  const card = page.locator('tr', { hasText: petName }).first()
  await expect(card).toBeVisible({ timeout: 15_000 })
  await card.getByRole('button', { name: 'เรียก' }).click()
  await expect(card.getByRole('button', { name: 'บันทึก' })).toBeVisible({ timeout: 15_000 })
  await card.getByRole('button', { name: 'บันทึก' }).click()

  const exam = page.getByRole('dialog')
  await expect(exam).toBeVisible({ timeout: 15_000 })

  /**
   * **ต้องมีค่ารักษาก่อน ไม่งั้นยอดเป็น 0**
   *
   * ใบยอด 0 ถือว่าจ่ายครบตั้งแต่ออก · กล่อง QR ไม่ขึ้น เพราะไม่มีอะไรให้จ่าย ·
   * เทสที่ไม่ใส่รายการจะไปค้างรอ QR ที่ไม่มีวันมา
   */
  await exam.getByRole('combobox', { name: 'เลือกรายการรักษา' }).click()
  await page.getByRole('option').first().click()
  await exam.getByRole('button', { name: 'เพิ่ม' }).first().click()

  /**
   * รอให้ยอดรวมเปลี่ยนจาก 0 ก่อนปิดการตรวจ — ปิดเร็วไปรายการอาจยังไม่ถูกบันทึก
   *
   * **ยอดรวมต้องไม่ใช่ `0.00` เป๊ะ ๆ** — เทียบทั้งก้อน ไม่ใช่ regex ลงท้าย
   * เพราะ `450.00` ก็ลงท้ายด้วย `0.00` เหมือนกัน (พลาดมาแล้วรอบนึง)
   */
  await expect(
    exam.getByText(/^ยอดรวม/).locator('..'),
    'ต้องมีค่ารักษาแล้ว ยอดถึงจะไม่เป็นศูนย์',
  ).not.toHaveText('ยอดรวม0.00', { timeout: 15_000 })

  await exam.getByRole('button', { name: 'ตรวจเสร็จ' }).click()
  await expect(exam).toBeHidden({ timeout: 15_000 })
  await logoutStaff(page)

  // ---- เคาน์เตอร์: ออกใบ แล้ว**ไม่รับเงิน** ให้ค้างไว้ให้ลูกค้าจ่ายเอง ----
  await loginStaff(page, USERS.counter)
  await page.goto('/queue')

  const payCard = page.locator('tr', { hasText: petName }).first()
  await expect(payCard.getByRole('button', { name: 'เก็บเงิน' })).toBeVisible({ timeout: 15_000 })
  await payCard.getByRole('button', { name: 'เก็บเงิน' }).click()

  const pay = page.getByRole('dialog')
  await expect(pay).toBeVisible({ timeout: 15_000 })
  await pay.getByRole('button', { name: /ออกใบเสร็จแล้วรับเงิน/ }).click()
  await expect(pay.getByRole('button', { name: 'ส่งให้บัญชีตรวจ' })).toBeVisible({
    timeout: 15_000,
  })

  await page.keyboard.press('Escape')
  await logoutStaff(page)

  return petName
}

test.describe('ใบเสร็จรายใบฝั่งลูกค้า', () => {
  test('ลูกค้าเปิดใบเสร็จของตัวเอง เห็นรายการและ QR', async ({ page }) => {
    const phone = newPhone()
    await staffCreatesUnpaidInvoice(page, phone)

    /**
     * ---- ลูกค้าล็อกอินแล้วกรอกเบอร์เดิม ----
     *
     * **เบอร์ตรงกับที่พนักงานกรอกไว้ = เชื่อมประวัติให้เอง**
     * (ผู้ใช้กำหนด 2026-09-01: "ใส่เบอร์ตรงก็จะเชื่อมข้อมูลให้เองเลย")
     */
    const res = await page.request.post('http://localhost:3211/api/owner-auth/test-login', {
      data: { sub: `e2e-${uniq()}`, name: 'ลูกค้าจ่ายเอง' },
    })
    const body = (await res.json()) as { data: { token: string } }
    await loginOwner(page, body.data.token)

    await page.goto('/owner')
    const welcome = page.getByRole('dialog')
    await welcome.locator('#wphone').fill(phone)
    await welcome.getByRole('button', { name: 'เริ่มใช้งาน' }).click()
    await expect(welcome).toBeHidden({ timeout: 15_000 })

    // ---- ใบเสร็จต้องโผล่ในรายการ ----
    await page.goto('/owner/invoices')
    const invoiceLink = page.locator('a[href*="/owner/invoices/"]').first()
    await expect(invoiceLink, 'ลูกค้าต้องเห็นใบที่ค้างอยู่').toBeVisible({ timeout: 15_000 })

    await invoiceLink.click()
    await expect(page).toHaveURL(/\/owner\/invoices\/\d+$/, { timeout: 15_000 })

    /**
     * **หน้านี้ต้องบอกรายละเอียดได้** (ผู้ใช้ทักท้วง 2026-09-01: "ไม่มีบอกรายละเอียด
     * อะไรเลย จะไปแจ้งลูกค้ายังไง")
     */
    await expect(page.getByText('ยอดที่ต้องจ่าย')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: /INV-/ })).toBeVisible()

    // ---- QR ต้องขึ้นเอง ไม่ต้องกดอะไรก่อน ----
    await expect(page.getByText('ชำระเงิน')).toBeVisible({ timeout: 15_000 })
    await expect(
      page.locator('canvas'),
      'QR ต้องวาดเองตอนเปิดหน้า (ผู้ใช้กำหนด: "เปิดมาก็ generate QR ให้เลย")',
    ).toBeVisible({ timeout: 15_000 })

    await expect(page.getByRole('button', { name: /บันทึกรูป QR/ })).toBeVisible()

    // ---- ช่องแนบสลิป ----
    await expect(page.getByText(/ลากไฟล์มาวาง/)).toBeVisible()
    await expect(
      page.getByRole('button', { name: /ส่งหลักฐานการโอน/ }),
      'ยังไม่แนบไฟล์ — ปุ่มส่งต้องกดไม่ได้',
    ).toBeDisabled()
  })

  test('ลูกค้าแนบสลิปแล้วยอดค้างหายไป', async ({ page }) => {
    const phone = newPhone()
    await staffCreatesUnpaidInvoice(page, phone)

    const res = await page.request.post('http://localhost:3211/api/owner-auth/test-login', {
      data: { sub: `e2e-${uniq()}`, name: 'ลูกค้าแนบสลิป' },
    })
    const body = (await res.json()) as { data: { token: string } }
    await loginOwner(page, body.data.token)

    await page.goto('/owner')
    const welcome = page.getByRole('dialog')
    await welcome.locator('#wphone').fill(phone)
    await welcome.getByRole('button', { name: 'เริ่มใช้งาน' }).click()
    await expect(welcome).toBeHidden({ timeout: 15_000 })

    await page.goto('/owner/invoices')
    await page.locator('a[href*="/owner/invoices/"]').first().click()
    await expect(page.getByText('ชำระเงิน')).toBeVisible({ timeout: 15_000 })

    /**
     * แนบ PNG จริง — **BE ตรวจ magic byte ไม่เชื่อ `File.type`**
     *
     * **ไฟล์ต้องไม่ซ้ำกับเทสอื่น** · BE กันสลิปซ้ำด้วย sha256 (`payment_slip_hash_key`)
     * เพื่อกันคนเอาสลิปใบเดียวไปใช้กับหลายบิล · ใช้ไฟล์เดียวกันทุกเทสจะผ่านตอนรัน
     * เดี่ยว แต่ล้มตอนรันทั้งชุด ซึ่งเป็นความล้มเหลวที่หาสาเหตุยากที่สุด
     *
     * เติมไบต์สุ่มท้ายไฟล์ — PNG ยังอ่านได้ (ตัว decoder หยุดที่ IEND) แต่ hash ต่างกัน
     */
    const png = Buffer.concat([
      await readFile('e2e/fixtures/slip.png'),
      Buffer.from(uniq()),
    ])

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'slip.png',
      mimeType: 'image/png',
      buffer: png,
    })

    const send = page.getByRole('button', { name: /ส่งหลักฐานการโอน/ })
    await expect(send, 'แนบไฟล์แล้วปุ่มต้องกดได้').toBeEnabled({ timeout: 15_000 })

    /**
     * **รอ response ของการอัปโหลด** — กดแล้วไปเช็คหน้าจอทันทีคือการแข่งกับเน็ต ·
     * ไฟล์ต้องเดินทางไปถึง BE และ BE ต้องตรวจ magic byte ก่อนตอบ
     */
    const uploaded = page.waitForResponse(
      (r) => r.url().includes('/payments/slip') && r.request().method() === 'POST',
      { timeout: 30_000 },
    )
    await send.click()

    const response = await uploaded

    // อ่านข้อความจาก BE ออกมาด้วย — `400` เฉย ๆ ไม่บอกว่าติดกฎข้อไหน
    const detail = await response.text().catch(() => '(อ่าน body ไม่ได้)')
    expect(response.status(), `อัปสลิปต้องสำเร็จ — BE ตอบ: ${detail}`).toBe(201)

    /**
     * จ่ายครบแล้ว — กล่อง QR ต้องหายไป และขึ้นสถานะรอบัญชีตรวจแทน
     * (ผู้ใช้กำหนด: "แนบสลิปแล้วยังไม่จบ บัญชีต้องตรวจอีกที")
     */
    await expect(page.getByText(/รอเจ้าหน้าที่บัญชีตรวจยอด|ชำระครบแล้ว/).first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.locator('canvas')).toBeHidden({ timeout: 15_000 })
  })
})
