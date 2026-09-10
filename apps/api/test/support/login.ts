import { app } from '../../src/app.ts'
import { SESSION_COOKIE } from '../../src/kit/actor.ts'
import { seed } from '../../src/kit/seed.ts'

/**
 * ล็อกอินเป็น `admin` (บทบาทระบบ — ถือทุก permission) แล้วคืน header `Cookie`
 * ให้ api test ทุกไฟล์ยืมใช้แนบไปกับ request ที่ต้องผ่าน guard
 *
 * เรียก `seed()` ก่อนเสมอ — `app.ts` ไม่ทำให้ (ดูคอมเมนต์บนหัวไฟล์นั้น) และ api test
 * ยิงผ่าน `app.handle()` ตรง ๆ ไม่ผ่าน `index.ts` ที่ปกติเป็นคนเรียก · `seed()` เช็คว่า
 * มีอยู่แล้วก่อนสร้าง เรียกซ้ำได้จากหลายไฟล์เทสโดยไม่พัง
 */
export async function loginAsAdmin(): Promise<string> {
  await seed()

  const res = await app.handle(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: process.env['SEED_ADMIN_PASSWORD'],
      }),
    }),
  )

  if (res.status !== 200) {
    throw new Error(`เข้าสู่ระบบทดสอบไม่สำเร็จ (${res.status}): ${await res.text()}`)
  }

  const setCookie = res.headers.get('set-cookie') ?? ''
  const match = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(setCookie)
  if (!match) throw new Error('ไม่พบ session cookie ใน response ของ /api/auth/login')

  return `${SESSION_COOKIE}=${match[1]}`
}
