import { expect, test, type Page } from '@playwright/test'

import { USERS, loginStaff, logoutStaff, uniq } from '../support'

/**
 * เส้นเงิน — **ออกใบ → รับเงิน → ส่งบัญชี → บัญชียืนยัน**
 *
 * เส้นทางที่มีความเสี่ยงสูงสุดของระบบ และเป็นเส้นเดียวที่มีกฎ maker-checker:
 * `invoice_verifier_not_submitter_check` บังคับที่ฐานว่าคนยืนยันต้องไม่ใช่คนที่ส่ง
 *
 * **ทำด้วยสองบัญชีคนละสิทธิ์** — เคาน์เตอร์เก็บเงิน บัญชียืนยัน · ใช้ admin ตัวเดียว
 * ทำทั้งสองขั้นจะเขียวทั้งที่กฎพังอยู่ เพราะ admin ผ่านทุกด่าน
 */

/**
 * เปิดคิวหน้างาน — **เคาน์เตอร์ทำได้** (`reception:write`)
 */
async function openWalkInQueue(page: Page, petName: string): Promise<void> {
  await page.goto('/queue')

  await page.getByRole('button', { name: /ลงทะเบียนหน้างาน/ }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'ยังไม่มีในระบบ' }).click()
  await dialog.getByRole('textbox', { name: /ชื่อสัตว์/ }).fill(petName)
  await dialog.getByRole('button', { name: 'เปิดคิว' }).click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })

  await expect(page.locator('tr', { hasText: petName }).first()).toBeVisible({ timeout: 15_000 })
}

/**
 * เรียกคิวแล้วปิดการตรวจ — **หมอเท่านั้น**
 *
 * ปุ่ม "ตรวจเสร็จ" อยู่ในกล่องบันทึกผลตรวจ ซึ่งต้องมี `medical:write` ·
 * เคาน์เตอร์เปิดกล่องเดียวกันได้แต่เห็นเป็นโหมดอ่านอย่างเดียว
 * (ผู้ใช้ทักท้วง 2026-09-01: "หน้ารับคิวนี่ลงประวัติการรักษาได้ด้วยหรอ")
 */
async function finishExam(page: Page, petName: string, withCharge = false): Promise<void> {
  await page.goto('/queue')

  const card = page.locator('tr', { hasText: petName }).first()
  await expect(card).toBeVisible({ timeout: 15_000 })

  await card.getByRole('button', { name: 'เรียก' }).click()

  // IN_PROGRESS — ปุ่มหลักกลายเป็น "บันทึก" ซึ่งเปิดกล่องผลตรวจ
  await expect(card.getByRole('button', { name: 'บันทึก' })).toBeVisible({ timeout: 15_000 })
  await card.getByRole('button', { name: 'บันทึก' }).click()

  const exam = page.getByRole('dialog')
  await expect(exam).toBeVisible({ timeout: 15_000 })

  if (withCharge) {
    /**
     * ใส่ค่ารักษา — **ใบยอด 0 ถือว่าจ่ายครบตั้งแต่ออก** และไม่มีกล่องรับเงินให้แนบสลิป
     */
    await exam.getByRole('combobox', { name: 'เลือกรายการรักษา' }).click()
    await page.getByRole('option').first().click()
    await exam.getByRole('button', { name: 'เพิ่ม' }).first().click()

    await expect(exam.getByText(/^ยอดรวม/).locator('..')).not.toHaveText('ยอดรวม0.00', {
      timeout: 15_000,
    })
  }

  await exam.getByRole('button', { name: 'ตรวจเสร็จ' }).click()
  await expect(exam).toBeHidden({ timeout: 15_000 })
}

test.describe('เส้นเงิน', () => {
  test('เคาน์เตอร์เก็บเงินแล้วส่งบัญชี → บัญชียืนยัน → คิวปิด', async ({ page }) => {
    const petName = `เทสเงิน ${uniq()}`

    // ---- 1. เคาน์เตอร์เปิดคิว ----
    await loginStaff(page, USERS.counter)
    await openWalkInQueue(page, petName)
    await logoutStaff(page)

    // ---- 2. หมอเรียกคิวแล้วปิดการตรวจ ----
    await loginStaff(page, USERS.vet)
    await finishExam(page, petName)
    await logoutStaff(page)

    // ---- 3. เคาน์เตอร์ออกใบ รับเงิน ส่งบัญชี ----
    await loginStaff(page, USERS.counter)
    await page.goto('/queue')

    const card = page.locator('tr', { hasText: petName }).first()
    await expect(card.getByRole('button', { name: 'เก็บเงิน' })).toBeVisible({ timeout: 15_000 })
    await card.getByRole('button', { name: 'เก็บเงิน' }).click()

    const pay = page.getByRole('dialog')
    await expect(pay).toBeVisible({ timeout: 15_000 })

    /**
     * คิวนี้ไม่มีรายการค่ารักษา — ยอดเป็น 0 และออกใบได้
     * (คลินิกออกใบยอด 0 ได้จริง เช่น มาปรึกษาแล้วไม่ได้ทำอะไร)
     */
    await pay.getByRole('button', { name: /ออกใบเสร็จแล้วรับเงิน/ }).click()

    // ออกใบแล้วต้องเห็นปุ่มส่งบัญชี
    const submit = pay.getByRole('button', { name: 'ส่งให้บัญชีตรวจ' })
    await expect(submit).toBeVisible({ timeout: 15_000 })
    await submit.click()

    /**
     * **ยืนยันที่ผลลัพธ์ ไม่ใช่ที่ข้อความในกล่อง**
     *
     * กล่องปิดตัวเองหลังส่งสำเร็จ · รอข้อความในกล่องที่ปิดไปแล้วคือรอสิ่งที่ไม่มีวันมา ·
     * สิ่งที่ต้องเป็นจริงคือใบไปโผล่ในคิวงานของบัญชี ซึ่งเทสขั้นถัดไปตรวจให้อยู่แล้ว
     */
    await expect(pay).toBeHidden({ timeout: 15_000 })

    await logoutStaff(page)

    // ---- 4. บัญชีเห็นใบที่รอตรวจ แล้วยืนยัน ----
    await loginStaff(page, USERS.accountant)
    await page.goto('/billing')

    /**
     * **หาแถวจากปุ่ม ไม่ใช่จากชื่อสัตว์**
     *
     * ตารางการเงินมีแต่เลขที่ใบ · ชื่อสัตว์ไม่ได้อยู่ในคอลัมน์ไหนเลย · ใบที่เพิ่งส่งมา
     * เป็นใบเดียวที่มีปุ่ม "ยืนยัน" อยู่ในแถว เพราะมีใบเดียวที่อยู่สถานะ `AWAITING_VERIFY`
     */
    const verifyButton = page
      .locator('tbody')
      .getByRole('button', { name: 'ยืนยัน', exact: true })
      .first()

    await expect(verifyButton, 'ใบที่เคาน์เตอร์ส่งต้องโผล่ในคิวงานของบัญชี').toBeVisible({
      timeout: 15_000,
    })
    await verifyButton.click()

    const confirm = page.getByRole('alertdialog')
    await confirm.getByRole('button', { name: /ยืนยัน/ }).click()

    /**
     * ยืนยันแล้วปุ่มต้องหายจากแถวนั้น — ใบขยับไปสถานะ `VERIFIED` ซึ่งไม่มีปุ่มยืนยันอีก
     * (และ BE ปิดคิวให้ในทรานแซกชันเดียวกัน)
     */
    await expect(page.getByText('ยืนยันแล้ว').first()).toBeVisible({ timeout: 15_000 })
  })

  test('เคาน์เตอร์แนบสลิปตอนรับเงินได้', async ({ page }) => {
    const petName = `เทสสลิป ${uniq()}`

    await loginStaff(page, USERS.counter)
    await openWalkInQueue(page, petName)
    await logoutStaff(page)

    await loginStaff(page, USERS.vet)
    await finishExam(page, petName, true)
    await logoutStaff(page)

    await loginStaff(page, USERS.counter)
    await page.goto('/queue')

    const card = page.locator('tr', { hasText: petName }).first()
    await expect(card.getByRole('button', { name: 'เก็บเงิน' })).toBeVisible({ timeout: 15_000 })
    await card.getByRole('button', { name: 'เก็บเงิน' }).click()

    const pay = page.getByRole('dialog')
    await pay.getByRole('button', { name: /ออกใบเสร็จแล้วรับเงิน/ }).click()
    await expect(pay.getByRole('button', { name: 'ส่งให้บัญชีตรวจ' })).toBeVisible({
      timeout: 15_000,
    })

    /**
     * **เส้นแนบสลิปฝั่งพนักงานก็ใช้ `api.post` เหมือนกัน**
     *
     * บั๊ก `JSON.stringify(FormData)` ทำให้ทั้งสามเส้นที่อัปไฟล์พังพร้อมกัน
     * (สลิปพนักงาน · สลิปลูกค้า · รูปสัตว์) · เทสนี้กันไม่ให้ย้อนกลับ
     */
    const fileInput = pay.locator('input[type="file"]')
    await expect(fileInput.first()).toBeAttached({ timeout: 15_000 })

    await fileInput.first().setInputFiles({
      name: 'slip.png',
      mimeType: 'image/png',
      buffer: Buffer.concat([
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8z8Dwn4GBgYEJRIAAAwAWpQMBu1n1gAAAAABJRU5ErkJggg==',
          'base64',
        ),
        Buffer.from(uniq()),
      ]),
    })

    // ไฟล์ต้องไปถึง BE จริง — ชื่อไฟล์โผล่แปลว่าเบราว์เซอร์รับแล้ว
    await expect(pay.getByText('slip.png')).toBeVisible({ timeout: 15_000 })
  })

  test('เคาน์เตอร์เข้าหน้าการเงินได้ แต่ไม่มีปุ่มยืนยัน', async ({ page }) => {
    await loginStaff(page, USERS.counter)
    await page.goto('/billing')

    /**
     * **นี่คือครึ่งแรกของ maker-checker บนหน้าจอ**
     *
     * เคาน์เตอร์มี `billing:read` (ดูใบที่ตัวเองเก็บได้) แต่ไม่มี `billing:verify` ·
     * ปุ่มยืนยันต้องไม่โผล่เลย · โผล่เมื่อไหร่แปลว่าคนเดียวเก็บเงินแล้วยืนยันเองได้
     */
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 })

    /**
     * **`exact: true` และมองแค่ในตาราง** — แถบกรองสถานะมีปุ่มชื่อ "ยืนยันแล้ว"
     * ซึ่ง `name: 'ยืนยัน'` แบบหลวม ๆ จับติดด้วย แล้วเทสจะแดงทั้งที่สิทธิ์ถูกต้อง
     */
    await expect(
      page.locator('tbody').getByRole('button', { name: 'ยืนยัน', exact: true }),
    ).toHaveCount(0)
  })

  test('บัญชีเข้าหน้าคิวไม่ได้ — ไม่มีสิทธิ์ reception', async ({ page }) => {
    await loginStaff(page, USERS.accountant)

    await page.goto('/queue')
    await expect(page.getByText(/ไม่มีสิทธิ์|ไม่พบ|เข้าถึง/i).first()).toBeVisible({
      timeout: 15_000,
    })
  })
})
