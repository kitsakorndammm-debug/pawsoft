import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { checkRateLimit, clientIpOf } from './kit/rate-limit.ts'
import { toErrorResponse, validationFailed } from './kit/response.ts'
import { auditLogRoutes } from './modules/audit-log/audit-log.routes.ts'
import { authRoutes } from './modules/auth/auth.routes.ts'
import { ownerAuthRoutes } from './modules/owner-auth/owner-auth.routes.ts'
import { userRoutes } from './modules/user/user.routes.ts'
import { permissionRoutes, roleRoutes } from './modules/role/role.routes.ts'
import { departmentRoutes } from './modules/department/department.routes.ts'
import { positionRoutes } from './modules/position/position.routes.ts'
import { employeeRoutes } from './modules/employee/employee.routes.ts'
import { drugCategoryRoutes } from './modules/drug-category/drug-category.routes.ts'
import { drugRoutes } from './modules/drug/drug.routes.ts'
import { drugStockRoutes } from './modules/drug-stock/drug-stock.routes.ts'
import { warehouseStockRoutes } from './modules/warehouse-stock/warehouse-stock.routes.ts'
import { serviceCategoryRoutes } from './modules/service-category/service-category.routes.ts'
import { serviceItemRoutes } from './modules/service-item/service-item.routes.ts'
import { ownerRoutes } from './modules/owner/owner.routes.ts'
import { petRoutes } from './modules/pet/pet.routes.ts'
import { speciesRoutes } from './modules/species/species.routes.ts'
import { breedRoutes } from './modules/breed/breed.routes.ts'
import {
  appointmentRoutes,
  myAppointmentRoutes,
  myProfileRoutes,
} from './modules/appointment/appointment.routes.ts'
import { visitRoutes } from './modules/visit/visit.routes.ts'
import { invoiceRoutes, myInvoiceRoutes, promptPayRoutes } from './modules/payment/payment.routes.ts'
import { historyRoutes } from './modules/history/history.routes.ts'

/**
 * ตัวแอป — ไม่ผูกพอร์ต
 *
 * แยกจาก `index.ts` เพราะไฟล์เทสทุกไฟล์ import ตัวนี้แล้วยิงผ่าน `app.handle()`
 * ไม่ต้องเปิดพอร์ตจริง · ของที่ต้องทำครั้งเดียวตอนบูต (seed, ตัวจับเวลา) อยู่ที่นั่น
 */

/**
 * หน้าเว็บที่ยิงเข้ามาได้
 *
 * **`*` ใช้ไม่ได้เมื่อส่ง cookie ด้วย** — เบราว์เซอร์ปฏิเสธ `credentials: 'include'`
 * ที่คู่กับ origin เป็น wildcard และไม่บอกว่าเพราะอะไร
 */
const allowedOrigins = (process.env['WEB_ORIGIN'] ?? 'http://localhost:3200,http://localhost:3210')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

/**
 * เพดานกลาง กันการยิงถี่พื้นฐาน (basic DoS) — ต่อ IP หนึ่งตัว
 *
 * เส้นที่มีความเสี่ยงสูงกว่านี้ (เช่น login) มีเพดานที่เข้มกว่านี้ของตัวเองซ้อนอยู่อีกชั้น
 * ดู `checkRateLimit` ที่ `auth.routes.ts`
 */
const GLOBAL_RATE_LIMIT = { limit: 120, windowMs: 60_000 }

export const app = new Elysia()
  .use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      // `PATCH` ต้องอยู่ในลิสต์ — ขาดไปหน้าจอที่แก้ข้อมูลจะพังทั้งหน้าโดยที่ curl ยังเขียว
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['content-type'],
    }),
  )

  // เฉพาะ `/api/*` — `/health` เป็นของที่ Railway ยิงตรวจสถานะถี่ ๆ ไม่ควรไปนับรวม
  .onRequest(({ request }) => {
    const { pathname } = new URL(request.url)
    if (!pathname.startsWith('/api')) return

    checkRateLimit(`global:${clientIpOf(request)}`, GLOBAL_RATE_LIMIT)
  })

  /**
   * ทางออกเดียวของ error ทั้งระบบ
   *
   * `VALIDATION` ของ Elysia คือค่าที่ส่งมาผิดรูป · `NOT_FOUND` คือไม่มี route นั้น ·
   * ที่เหลือส่งต่อให้ `toErrorResponse` ซึ่งแยกเองว่าเป็นการปฏิเสธที่ตั้งใจหรือเป็นบั๊ก
   */
  .onError(({ code, error, set }) => {
    if (code === 'VALIDATION') {
      set.status = 400

      return validationFailed('ข้อมูลที่ส่งมาไม่ถูกต้อง')
    }

    if (code === 'NOT_FOUND') {
      set.status = 404

      return { ok: false as const, error: { code: 'NOT_FOUND', message: 'ไม่พบเส้นทางนี้' } }
    }

    const { status, body } = toErrorResponse(error)
    set.status = status

    return body
  })

  .get('/health', () => ({ ok: true, data: { status: 'up' } }))

  .use(authRoutes)
  .use(ownerAuthRoutes)
  .use(userRoutes)
  .use(roleRoutes)
  .use(permissionRoutes)
  .use(departmentRoutes)
  .use(positionRoutes)
  .use(employeeRoutes)
  .use(drugCategoryRoutes)
  .use(drugRoutes)
  .use(drugStockRoutes)
  .use(warehouseStockRoutes)
  .use(serviceCategoryRoutes)
  .use(serviceItemRoutes)
  .use(auditLogRoutes)

  // หน้างาน — ลูกค้า สัตว์ การจอง และคิว
  .use(ownerRoutes)
  .use(petRoutes)
  .use(speciesRoutes)
  .use(breedRoutes)
  .use(appointmentRoutes)
  .use(visitRoutes)

  // การเงิน — ใบเสร็จ รับเงิน และ recheck ของบัญชี
  .use(invoiceRoutes)
  .use(promptPayRoutes)

  // ประวัติ — เปิดให้พนักงานทุกคนดูย้อนหลังได้ ไม่ต้องมีสิทธิ์เฉพาะ
  .use(historyRoutes)

  /**
   * ฝั่งลูกค้า — **ประกาศหลังของพนักงานทั้งหมด**
   *
   * `/api/my/*` ไม่ชนกับเส้นไหน แต่วางไว้ท้ายสุดเพื่อให้อ่านไฟล์นี้แล้วเห็นชัดว่า
   * เส้นกลุ่มนี้เป็นคนละโลกกับข้างบน: ไม่มี permission key และกรองด้วยเซสชันของลูกค้า
   */
  .use(myAppointmentRoutes)
  .use(myProfileRoutes)
  .use(myInvoiceRoutes)

export type App = typeof app
