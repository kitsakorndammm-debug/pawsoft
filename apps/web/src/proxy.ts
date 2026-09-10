import { NextResponse, type NextRequest } from 'next/server'
import { ROUTE_CHANGE_PASSWORD, ROUTE_LOGIN, ROUTE_OWNER_LOGIN } from '@/lib/routes'

/**
 * ด่านแรก — **ความสะดวก ไม่ใช่ความปลอดภัย**
 *
 * ดูแค่ว่า cookie **มีอยู่** ไม่ได้ดูว่ามันยังใช้ได้จริงไหม (ตรวจจริงต้องถามฐาน ซึ่ง
 * middleware ทำไม่ได้) · มีไว้กันไม่ให้หน้าจอกะพริบขึ้นมาแล้วค่อยเด้งออก · ด่านจริง
 * คือ `SessionGuard` ที่ถาม API และ BE ที่ปฏิเสธเอง
 */

/** **ต้องตรงกับ `SESSION_COOKIE` ใน `apps/api/src/kit/actor.ts` เป๊ะ ๆ** */
const STAFF_COOKIE = 'pawsoft_session'
const OWNER_COOKIE = 'pawsoft_owner'

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // ชั่วคราวสำหรับ demo ผ่าน tunnel — `/api/*` ถูกพร็อกซีมาที่ API ผ่าน next.config.ts
  // rewrite แล้ว ด่านนี้เช็คแค่ cookie การมีอยู่เพื่อความสะดวกของหน้าจอ ไม่ใช่ด่านความ
  // ปลอดภัยจริง (BE ตรวจเองอยู่แล้ว) — ปล่อยผ่านไม่งั้น POST /api/auth/login ครั้งแรก
  // ที่ยังไม่มี cookie จะโดนเด้งไปหน้า login ก่อนถึง API เสียอีก (ลบทิ้งได้หลัง demo)
  if (pathname.startsWith('/api/')) return NextResponse.next()

  /**
   * ---- ฝั่งเจ้าของสัตว์ ----
   *
   * **`/owner` กับ `/owner/...` เท่านั้น ไม่ใช่ `startsWith('/owner')` เปล่า ๆ**
   *
   * `startsWith` กิน `/owners` (ทะเบียนเจ้าของสัตว์ของพนักงาน) ไปด้วย แล้วพนักงานที่
   * กดเมนูนั้นจะถูกเด้งไปหน้าล็อกอินของ**ลูกค้า** ทั้งที่เขาล็อกอินหลังบ้านอยู่ ·
   * เจอตอนวัดจริง 2026-09-01 — หน้าอื่นทั้งสามหน้าได้ 200 มีหน้านี้หน้าเดียวที่ 307
   */
  if (pathname === '/owner' || pathname.startsWith('/owner/')) {
    if (pathname === ROUTE_OWNER_LOGIN) return NextResponse.next()

    if (!request.cookies.has(OWNER_COOKIE)) {
      return NextResponse.redirect(new URL(ROUTE_OWNER_LOGIN, request.url))
    }

    return NextResponse.next()
  }

  // ---- ฝั่งหลังบ้าน ----
  //
  // **หน้าล็อกอินเปิดได้เสมอ แม้จะมี cookie อยู่** · เด้งคนที่ถือ cookie กลับหน้าแรก
  // เมื่อไหร่ จะเกิดวงวน: cookie ที่หมดอายุผ่านด่านนี้ได้ · `SessionGuard` ได้ 401
  // แล้วส่งไปหน้าล็อกอิน · ด่านนี้เห็น cookie แล้วส่งกลับ · วนแบบนั้นไปไม่จบ
  if (pathname === ROUTE_LOGIN) return NextResponse.next()

  // หน้าเปลี่ยนรหัสต้องเข้าได้ด้วยเซสชันที่ยังติดธง — แต่ยังต้องมี cookie
  if (!request.cookies.has(STAFF_COOKIE)) {
    const url = new URL(ROUTE_LOGIN, request.url)

    if (pathname !== ROUTE_CHANGE_PASSWORD) {
      url.searchParams.set('next', `${pathname}${search}`)
    }

    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  /**
   * **`\\.` ต้องเป็นแบ็กสแลชสองตัว** — ตัวเดียวทำให้ทั้ง middleware ถูกปิดเงียบ ๆ
   * โดยไม่มี error ให้เห็น
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
