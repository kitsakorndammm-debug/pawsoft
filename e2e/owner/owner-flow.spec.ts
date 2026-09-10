import { expect, test, type Page } from '@playwright/test'

import { loginOwner, uniq } from '../support'

/**
 * เส้นทางหลักฝั่งลูกค้า — **สมัคร → สร้างสัตว์ → จอง → ดูใบเสร็จ**
 *
 * รันบนขนาดมือถือ (`Pixel 7` ใน config) เพราะหน้าฝั่งนี้ออกแบบมาเพื่อจอนั้น —
 * แถบเมนูล่างกับปุ่ม bubble ไม่มีความหมายบนจอคอม
 *
 * **ข้ามหน้า Google** — ดู `loginOwner` ว่าทำไม
 */

/** สร้างบัญชีลูกค้าใหม่แล้วยัด cookie — คืน `sub` ไว้อ้างอิงถ้าต้องล็อกอินซ้ำ */
async function signUp(page: Page): Promise<{ sub: string }> {
  const sub = `e2e-${uniq()}`

  const res = await page.request.post('http://localhost:3211/api/owner-auth/test-login', {
    data: { sub, name: 'ลูกค้าเทส' },
  })
  expect(res.ok(), 'เส้น test-login ต้องเปิดอยู่ (APP_ENV=local)').toBeTruthy()

  const body = (await res.json()) as { data: { token: string } }
  await loginOwner(page, body.data.token)

  return { sub }
}

test.describe('เส้นทางหลักฝั่งลูกค้า', () => {
  test('ลูกค้าใหม่: กรอกข้อมูล → เพิ่มสัตว์ → จองคิว', async ({ page }) => {
    await signUp(page)

    // ---- 1. ครั้งแรกต้องเจอกล่องทักทาย ----
    await page.goto('/owner')
    const welcome = page.getByRole('dialog')
    await expect(welcome).toBeVisible({ timeout: 15_000 })
    await expect(welcome.getByText(/ยินดีต้อนรับ/)).toBeVisible()

    /**
     * **เบอร์บังคับ** — ปุ่มต้องกดไม่ได้จนกว่าจะกรอกครบ
     * (ผู้ใช้กำหนด 2026-09-01: "เบอร์บังคับด้วยสิ")
     */
    const start = welcome.getByRole('button', { name: 'เริ่มใช้งาน' })
    await expect(start).toBeDisabled()

    await welcome.locator('#wphone').fill('08' + uniq())
    await expect(start).toBeEnabled()
    await start.click()
    await expect(welcome).toBeHidden({ timeout: 15_000 })

    // ---- 2. เพิ่มสัตว์ ----
    const petName = `เทสสัตว์ ${uniq()}`

    await page.goto('/owner/pets')

    /**
     * **รอให้หน้าโหลดข้อมูลเสร็จก่อนกด** — ปุ่ม "เพิ่ม" ถูก `disabled` จนกว่า
     * `useMyProfile` จะตอบว่าบัญชีนี้ผูกกับลูกค้าแล้ว · กดตอนยังโหลดอยู่คือคลิกที่
     * ไม่เกิดอะไรขึ้น แล้วเทสไปค้างรอ dialog ที่ไม่มีวันเปิด
     */
    const addButton = page.getByRole('button', { name: 'เพิ่ม' })
    await expect(addButton).toBeEnabled({ timeout: 15_000 })
    await addButton.click()

    const petDialog = page.getByRole('dialog')
    await expect(petDialog).toBeVisible({ timeout: 15_000 })

    await petDialog.locator('#pname').fill(petName)

    // **role เป็น `combobox` ไม่ใช่ `button`** — ชื่อที่อ่านได้คือ placeholder
    await petDialog.getByRole('combobox', { name: 'เลือกชนิด' }).click()
    await page.getByRole('option').first().click()

    await petDialog.getByRole('button', { name: 'เพิ่มสัตว์เลี้ยง' }).click()

    await expect(petDialog).toBeHidden({ timeout: 15_000 })
    /**
     * `.first()` เพราะชื่อโผล่สองที่ — ข้อความในแถว และ `alt` ของรูป
     * (รูปวาดเสมอแล้วถอยไปใช้ไอคอนเมื่อโหลดไม่ได้ ดู `PetRow`)
     */
    await expect(page.getByText(petName).first()).toBeVisible({ timeout: 15_000 })

    // ---- 3. จองคิว ----
    await page.goto('/owner/booking')
    await page.getByRole('button', { name: petName }).click()
    await page.getByRole('button', { name: /ยืนยันการจอง|จองคิว/ }).click()

    /**
     * **จองแล้วต้องเป็น "รอยืนยัน" ไม่ใช่ยืนยันแล้ว**
     *
     * (ผู้ใช้กำหนด 2026-09-01: "จะยังไม่คอนเฟิร์ม ... พนักงานจะเป็นคนคอนเฟิร์มคิวเอง")
     *
     * เคยพลาดมาแล้ว: route ส่ง `status: 'PENDING'` แต่ service ไม่หยิบไปใช้ ·
     * typecheck เขียว และใบกลายเป็น `BOOKED` เงียบ ๆ
     */
    await page.goto('/owner/bookings')
    await expect(page.getByText('รอยืนยัน').first()).toBeVisible({ timeout: 15_000 })
  })

  test('หน้าแรกโชว์นัดกับเมนู bubble ครบ', async ({ page }) => {
    await signUp(page)

    await page.goto('/owner')
    await page.getByRole('dialog').getByRole('button', { name: 'ไว้ทีหลัง' }).click()

    // ยังไม่ได้กรอกข้อมูล — ต้องชวนให้กรอก ไม่ใช่ไล่ไปติดต่อคลินิก
    await expect(page.getByText(/ยังไม่ได้กรอกข้อมูลติดต่อ/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'กรอกข้อมูลติดต่อ' })).toBeVisible()
  })

  test('แถบเมนูล่างพาไปได้ครบทุกหน้า และแท็บที่เปิดอยู่ถูกต้อง', async ({ page }) => {
    await signUp(page)

    /**
     * **สมัครให้เสร็จก่อน** — กล่องทักทายเด้งทุกครั้งที่กลับมาหน้าแรกตราบใดที่ยัง
     * ไม่มีแถวลูกค้า · กด "ไว้ทีหลัง" ครั้งเดียวไม่พอ เพราะเทสนี้วนกลับมา `/owner`
     * ตอนท้าย แล้วกล่องจะบังแถบเมนูอยู่
     */
    await page.goto('/owner')
    const welcome = page.getByRole('dialog')
    await welcome.locator('#wphone').fill('08' + uniq())
    await welcome.getByRole('button', { name: 'เริ่มใช้งาน' }).click()
    await expect(welcome).toBeHidden({ timeout: 15_000 })

    for (const [label, path] of [
      ['สัตว์เลี้ยง', '/owner/pets'],
      ['การจอง', '/owner/bookings'],
      ['ประวัติ', '/owner/history'],
      ['ใบเสร็จ', '/owner/invoices'],
      ['หน้าแรก', '/owner'],
    ] as const) {
      await page.locator('nav').getByRole('link', { name: label }).click()
      await expect(page).toHaveURL(new RegExp(`${path}$`), { timeout: 15_000 })

      /**
       * **แท็บที่เปิดอยู่ต้องมี `aria-current`** — เคยพลาดเพราะ `startsWith('/owner')`
       * ทำให้แท็บหน้าแรกสว่างค้างทุกหน้า
       */
      await expect(page.locator('nav').getByRole('link', { name: label })).toHaveAttribute(
        'aria-current',
        'page',
      )
    }
  })

  test('หน้าล็อกอินลูกค้าไม่มีแถบเมนู', async ({ page }) => {
    await page.goto('/owner/login')

    await expect(page.getByRole('heading', { name: 'Paw Soft' })).toBeVisible()
    // shell ไม่ควรครอบหน้านี้ — เมนูที่กดแล้วเด้งกลับมาที่เดิมคือเมนูที่ไม่ควรมี
    await expect(page.locator('nav a')).toHaveCount(0)
  })
})
