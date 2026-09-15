import { getActor, requirePermission, type ActorContext } from './actor.ts'
import { invalid } from './app-error.ts'
import {
  BILLING_PERMISSION,
  DRUG_STOCK_PERMISSION,
  DRUG_WAREHOUSE_PERMISSION,
  HR_PERMISSION,
  MASTER_PERMISSION,
  MEDICAL_PERMISSION,
  RECEPTION_PERMISSION,
} from './permissions.ts'

/**
 * ของที่ทุก route ยืมไปใช้ — ไม่มีตัวไหนรู้จัก endpoint ไหนเลย
 *
 * สิทธิ์ของแต่ละเมนู · การอ่าน id จาก path · และการปฏิเสธคีย์ที่ไม่ได้ประกาศ
 */

/**
 * ห่อการ์ดให้ **ไม่คืนค่าอะไรเลย**
 *
 * **`beforeHandle` ที่คืนค่า truthy กลายเป็น response ทันที** — Elysia ถือว่านั่นคือ
 * คำตอบของ route แล้ว handler จริงไม่ถูกเรียกเลย · การ์ดของเราคืน `Actor` ซึ่งมี
 * `userId` เป็น BigInt อยู่ข้างใน ผลคือ `TypeError: JSON.stringify cannot serialize
 * BigInt` และทุก endpoint ที่ใช้ `beforeHandle` ตอบ 500 พร้อมกัน (เจอเมื่อ 2026-08-31)
 *
 * อาการหลอกตรงที่มันไม่ได้ดูเหมือนปัญหาของการ์ด — endpoint ที่ไม่มีการ์ดยังเขียวอยู่
 * และ error พูดถึง BigInt ซึ่งชวนให้ไปไล่หาที่ `toWire`
 *
 * route ที่ต้องใช้ `Actor` เรียกการ์ดเองใน handler แล้วรับค่ากลับมา — ดู `user.routes`
 */
const silent =
  (guard: (ctx: ActorContext) => Promise<unknown>) =>
  async (ctx: ActorContext): Promise<void> => {
    await guard(ctx)
  }

export const guardRead = silent((ctx) => requirePermission(ctx, MASTER_PERMISSION.read))
export const guardWrite = silent((ctx) => requirePermission(ctx, MASTER_PERMISSION.write))

export const guardHrRead = silent((ctx) => requirePermission(ctx, HR_PERMISSION.read))
export const guardHrWrite = silent((ctx) => requirePermission(ctx, HR_PERMISSION.write))

/** เคาน์เตอร์ — เปิดคิว รับจอง ลงทะเบียนลูกค้าและสัตว์ */
export const guardReceptionRead = silent((ctx) =>
  requirePermission(ctx, RECEPTION_PERMISSION.read),
)
export const guardReceptionWrite = silent((ctx) =>
  requirePermission(ctx, RECEPTION_PERMISSION.write),
)

/**
 * สัตวแพทย์ — **เขียนผลวินิจฉัยและจ่ายยา**
 *
 * ใช้กับเส้นที่แก้ข้อมูลทางการแพทย์เท่านั้น (`/finish` · `/drugs` · `/services`) ·
 * เส้นที่แค่ขยับคิว (`/call` · `/abandon`) ใช้ `guardReceptionWrite` เพราะเป็นงาน
 * ของเคาน์เตอร์
 */
export const guardMedicalWrite = silent((ctx) =>
  requirePermission(ctx, MEDICAL_PERMISSION.write),
)

/**
 * การเงิน — **maker-checker** ดู `///` บน `BILLING_PERMISSION`
 *
 * ทุกเส้นของ `payment.routes.ts` ใช้การ์ดกลุ่มนี้
 */
export const guardBillingRead = silent((ctx) => requirePermission(ctx, BILLING_PERMISSION.read))
/** เคาน์เตอร์รับเงินและส่งยอด */
export const guardBillingCollect = silent((ctx) =>
  requirePermission(ctx, BILLING_PERMISSION.collect),
)
/** บัญชียืนยันยอด — คนละคนกับที่รับเงิน */
export const guardBillingVerify = silent((ctx) =>
  requirePermission(ctx, BILLING_PERMISSION.verify),
)

/**
 * สต็อกยา — แยกจาก `master` (ผู้ใช้ตัดสิน 2026-09-08) ดู `///` บน `DRUG_STOCK_PERMISSION`
 */
export const guardDrugStockRead = silent((ctx) =>
  requirePermission(ctx, DRUG_STOCK_PERMISSION.read),
)
export const guardDrugStockWrite = silent((ctx) =>
  requirePermission(ctx, DRUG_STOCK_PERMISSION.write),
)

/**
 * คลังยา — แยกจาก `drug-stock` (ผู้ใช้ตัดสิน 2026-09-15) ดู `///` บน `DRUG_WAREHOUSE_PERMISSION`
 */
export const guardDrugWarehouseRead = silent((ctx) =>
  requirePermission(ctx, DRUG_WAREHOUSE_PERMISSION.read),
)
export const guardDrugWarehouseWrite = silent((ctx) =>
  requirePermission(ctx, DRUG_WAREHOUSE_PERMISSION.write),
)


/**
 * แค่ต้องล็อกอิน ไม่ต้องถือ key ไหน
 *
 * **เส้น `/lookup` ของทุกทะเบียนใช้ตัวนี้ ไม่ใช่ `guardRead`** — คนที่กรอกฟอร์มต้อง
 * เลือกจากทะเบียนได้ ทั้งที่เขาไม่มีสิทธิ์เปิดหน้าจัดการทะเบียนนั้น · ใช้ `guardRead`
 * เมื่อไหร่ ฟอร์มจะว่างเปล่าสำหรับคนส่วนใหญ่ และเทสจะจับไม่ได้ถ้ามันล็อกเอาต์อยู่
 */
export const guardSignedIn = silent(getActor)

/**
 * อ่าน id จาก path
 *
 * โยน `400` ถ้าไม่ใช่ตัวเลข — ไม่ใช่ `404` เพราะ `/api/users/abc` ไม่ใช่การถามหาแถวที่
 * ไม่มี แต่เป็นคำถามที่ผิดรูปตั้งแต่ต้น
 */
export function parseId(raw: string): bigint {
  if (!/^\d+$/.test(raw)) throw invalid('รหัสไม่ถูกต้อง')

  return BigInt(raw)
}

/**
 * id ที่มากับ query เป็นตัวกรอง — `?departmentId=`
 *
 * **ไม่ส่งมา กับ ส่งมาแล้วอ่านไม่ออก เป็นคนละเรื่อง** · ไม่ส่งคือไม่กรอง คืน `undefined`
 * ส่วนค่าที่ไม่ใช่ตัวเลขคือคำขอที่ผิดรูป ปฏิเสธไปเลย — ปล่อยผ่านเป็น "ไม่กรอง" เมื่อไหร่
 * คนที่พิมพ์ค่าผิดจะได้ทั้งลิสต์กลับไปพร้อมความเชื่อว่ากรองแล้ว
 */
export function parseIdFilter(raw: string | undefined, field: string): bigint | undefined {
  if (raw === undefined) return undefined
  if (!/^\d+$/.test(raw)) throw invalid(`${field} ต้องเป็นตัวเลข`, { [field]: raw })

  return BigInt(raw)
}

function refuseUnknownKeys(
  got: Iterable<string>,
  allowed: ReadonlySet<string>,
  what: 'พารามิเตอร์' | 'ฟิลด์',
): void {
  for (const key of got) {
    if (!allowed.has(key)) throw invalid(`ไม่รู้จัก${what} "${key}"`, { key })
  }
}

/**
 * ปฏิเสธพารามิเตอร์ที่ไม่ได้ประกาศไว้
 *
 * **ต้องตรวจเอง** ด้วยเหตุผลเดียวกับ `refuseUnknownFields` ข้างล่าง — คนที่พิมพ์ชื่อ
 * ตัวกรองผิดจะได้ 200 กลับไปพร้อมความเชื่อว่ากรองแล้ว ทั้งที่ได้ผลลัพธ์ทั้งหมดมา
 */
export const refuseUnknownQuery = (url: string, allowed: ReadonlySet<string>) =>
  refuseUnknownKeys(new URL(url).searchParams.keys(), allowed, 'พารามิเตอร์')

/**
 * ปฏิเสธฟิลด์ที่ไม่ได้ประกาศไว้
 *
 * **Elysia ไม่บังคับ `additionalProperties: false` ให้เลย** ไม่ว่าจะ query หรือ body ·
 * คีย์ที่ไม่รู้จักถูกตัดทิ้งเงียบ ๆ แล้ว handler ตอบ 200/201 กลับไป · ผลคือคนที่พิมพ์
 * ชื่อฟิลด์ผิดได้รับแจ้งว่าสำเร็จ ทั้งที่ไม่มีอะไรถูกบันทึก
 *
 * **ต้องอยู่ใน `transform` เท่านั้น** — พอถึง handler คีย์พวกนั้นหายไปแล้ว และ
 * `request.clone().json()` จะโยน `Unexpected end of JSON input` เพราะ body ถูกอ่านไปแล้ว ·
 * `transform` ทำงานก่อน validation และเห็น body ดิบ
 */
export const refuseUnknownFields =
  (allowed: ReadonlySet<string>) =>
  (ctx: { body?: unknown }): void => {
    const body = ctx.body
    if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
      return
    }

    refuseUnknownKeys(Object.keys(body as Record<string, unknown>), allowed, 'ฟิลด์')
  }

/**
 * การ์ดสิทธิ์ + ปฏิเสธฟิลด์แปลกปลอม ในฟังก์ชันเดียว
 *
 * **ลำดับสำคัญ: ตรวจสิทธิ์ก่อนตรวจรูปของ body เสมอ** · สลับกันเมื่อไหร่ คนที่ไม่ได้
 * ล็อกอินจะได้ `400 ไม่รู้จักฟิลด์ "x"` ซึ่งบอกใบ้ว่าฟิลด์ไหนมีอยู่จริง ก่อนจะได้ `401`
 *
 * รวมเป็นตัวเดียวเพราะ `transform` ของ Elysia รับอาเรย์ของฟังก์ชันที่ชนิดต่างกันไม่ได้ —
 * มันคาดว่าทุกตัวในอาเรย์รับ context เต็มรูปแบบเดียวกัน ส่วนการ์ดของเรารับแค่บางส่วน
 */
export function guardBody(
  guard: (ctx: ActorContext) => Promise<unknown>,
  allowed: ReadonlySet<string>,
) {
  const refuse = refuseUnknownFields(allowed)

  return async (ctx: ActorContext & { body?: unknown }) => {
    await guard(ctx)
    refuse(ctx)
  }
}

/**
 * ส่งต่อของที่ route ยืมไปใช้บ่อย — จะได้ import จากที่เดียว
 *
 * `getActor` มาจาก `actor.ts` ส่วนค่าคงที่ของสิทธิ์มาจาก `permissions.ts` ·
 * route ที่ต้องใช้ทั้งสามอย่างจะได้ไม่ต้องเขียน import สามบรรทัด
 */
export { getActor }
export {
  BILLING_PERMISSION,
  DRUG_STOCK_PERMISSION,
  DRUG_WAREHOUSE_PERMISSION,
  HR_PERMISSION,
  MASTER_PERMISSION,
  MEDICAL_PERMISSION,
  RECEPTION_PERMISSION,
}
