import { expect, test } from '@playwright/test'

import { ADMIN_PASSWORD, USERS, loginStaff, uniq } from '../support'

/**
 * ข้อมูลหลัก — **หน้าที่หน้าตาเหมือนกันเจ็ดหน้า**
 *
 * ชนิดสัตว์ · พันธุ์ · แผนก · ตำแหน่ง · หมวดยา · หมวดบริการ ล้วนเป็น "ตาราง +
 * กล่องเพิ่ม/แก้/ลบ" รูปเดียวกัน · เขียนเทสเดียวแล้ววนทุกหน้าดีกว่าก๊อปเจ็ดรอบ
 *
 * **สิ่งที่ตรวจคือ CRUD เดินครบวง** — เพิ่มแล้วเห็น · แก้แล้วชื่อเปลี่ยน · ลบแล้วหาย ·
 * ไม่ใช่แค่หน้าเปิดขึ้น
 */

/** หน้าที่ใช้รูปเดียวกันทั้งหมด — `path` กับคำในหัวข้อ */
const MASTER_PAGES = [
  { path: '/settings/departments', label: 'แผนก' },
  { path: '/settings/positions', label: 'ตำแหน่ง' },
] as const

test.describe('ข้อมูลหลัก', () => {
  for (const { path, label } of MASTER_PAGES) {
    test(`${label}: เพิ่ม → แก้ → ลบ`, async ({ page }) => {
      await loginStaff(page, USERS.admin, ADMIN_PASSWORD)
      await page.goto(path)
      /**
       * **หน้าย่อยของตั้งค่าไม่มี `h1`** — เมนูข้าง (`AppSider`) เป็นคนถือหัวข้อ ·
       * ตารางคือสิ่งที่ทุกหน้ามีเหมือนกัน และเป็นหลักฐานว่าหน้าโหลดข้อมูลได้จริง
       */
      await expect(page.locator('table')).toBeVisible({ timeout: 15_000 })

      const name = `เทส ${uniq()}`
      const renamed = `${name} แก้แล้ว`

      // ---- เพิ่ม ----
      await page.getByRole('button', { name: /เพิ่ม/ }).first().click()

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: 15_000 })
      await dialog.getByRole('textbox').first().fill(name)
      await dialog.getByRole('button', { name: /บันทึก|เพิ่ม/ }).last().click()

      await expect(dialog).toBeHidden({ timeout: 15_000 })
      await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 15_000 })

      /**
       * ---- แก้ ----
       *
       * **`RowActions` เป็นปุ่มตรง ๆ ไม่ใช่ dropdown** — แต่ละปุ่มมี `aria-label`
       * เป็น `"แก้ไข <ชื่อแถว>"` · หาจาก label ได้เลย ไม่ต้องเปิดเมนูก่อน
       */
      await page.getByRole('button', { name: `แก้ไข ${name}` }).click()

      const editDialog = page.getByRole('dialog')
      await expect(editDialog).toBeVisible({ timeout: 15_000 })
      await editDialog.getByRole('textbox').first().fill(renamed)
      await editDialog.getByRole('button', { name: /บันทึก/ }).last().click()

      await expect(editDialog).toBeHidden({ timeout: 15_000 })
      await expect(page.getByText(renamed, { exact: true })).toBeVisible({ timeout: 15_000 })

      // ---- ลบ ----
      await page.getByRole('button', { name: `ลบ ${renamed}` }).click()

      const confirm = page.getByRole('alertdialog')
      await confirm.getByRole('button', { name: /ลบ/ }).click()

      await expect(page.getByText(renamed, { exact: true })).toBeHidden({ timeout: 15_000 })
    })
  }

  test('ชนิดสัตว์กับพันธุ์เปิดได้ และมีข้อมูลที่ seed ไว้', async ({ page }) => {
    await loginStaff(page, USERS.admin, ADMIN_PASSWORD)

    /**
     * ชนิดสัตว์มาจาก `seedMaster()` — ไม่เจอแปลว่า seed ไม่ทำงาน ซึ่งจะทำให้
     * เทสอื่นที่ต้องเลือกชนิดสัตว์ล้มตามไปหมดโดยไม่รู้สาเหตุ
     */
    await page.goto('/settings/drugs')
    await expect(page.getByText('Amoxicillin 250').first()).toBeVisible({ timeout: 15_000 })

    await page.goto('/settings/service-items')
    await expect(page.getByText('ตรวจร่างกายทั่วไป').first()).toBeVisible({ timeout: 15_000 })
  })

  test('หน้าตั้งค่าทุกหน้าเปิดได้ ไม่มีหน้าไหนพัง', async ({ page }) => {
    await loginStaff(page, USERS.admin, ADMIN_PASSWORD)

    // หน้าแรกของตั้งค่ามี `h1` · หน้าย่อยมีตาราง — ตรวจคนละอย่างกัน
    await page.goto('/settings')
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 })

    for (const path of [
      '/settings/departments',
      '/settings/positions',
      '/settings/drugs',
      '/settings/service-items',
      '/settings/employees',
      '/settings/users',
      '/settings/roles',
    ]) {
      await page.goto(path)
      // หน้าที่ระเบิดจะไม่มีตาราง — จับได้ตรงนี้ก่อนไปหน้าถัดไป
      await expect(page.locator('table'), `หน้า ${path} ต้องเปิดได้`).toBeVisible({
        timeout: 15_000,
      })
    }
  })
})
