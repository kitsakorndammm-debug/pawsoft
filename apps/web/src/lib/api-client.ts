/**
 * สิ่งเดียวในหน้าเว็บที่คุยกับ API
 *
 * หน้าจอเรียก hooks · hooks เรียก `features/<โดเมน>/api.ts` · ไฟล์นั้นเรียกที่นี่ ·
 * **ไม่มีหน้าจอไหนเรียก `fetch` เอง**
 */

const BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3201'

export class ApiError extends Error {
  readonly code: string
  readonly httpStatus: number
  readonly detail: Record<string, unknown> | undefined

  constructor(
    code: string,
    message: string,
    httpStatus: number,
    detail?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.httpStatus = httpStatus
    this.detail = detail
  }
}

type Envelope<T> =
  | { ok: true; data: T; page?: PageMeta }
  | { ok: false; error: { code: string; message: string; detail?: Record<string, unknown> } }

export type PageMeta = { page: number; pageSize: number; total: number }

/**
 * คืนเฉพาะฝั่งที่สำเร็จ — ฝั่งที่ล้มเหลวถูกโยนเป็น `ApiError` ไปแล้ว
 *
 * ชนิดที่คืนจึงเป็น `{ ok: true }` ไม่ใช่ `Envelope` ทั้งก้อน · ไม่งั้นผู้เรียกทุกคน
 * ต้องเช็ก `ok` ซ้ำอีกรอบทั้งที่มันเป็นจริงเสมอ ณ จุดนั้น
 */
async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<Extract<Envelope<T>, { ok: true }>> {
  let res: Response

  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      // **ต้องมี** ไม่งั้น cookie ที่เป็น httpOnly ไม่ถูกส่งไปด้วย และทุกอย่างตอบ 401
      credentials: 'include',
      headers: {
        // FormData ต้องไม่ตั้ง content-type เอง — เบราว์เซอร์ต้องเติม boundary ให้
        ...(init?.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
        ...init?.headers,
      },
    })
  } catch {
    // เน็ตขาด หรือ API ไม่ได้เปิด — ต้องแยกจาก error ที่ API ตอบมาจริง
    throw new ApiError('NETWORK', 'ติดต่อระบบไม่ได้ กรุณาลองใหม่', 0)
  }

  const body = (await res.json().catch(() => null)) as Envelope<T> | null

  if (!body) throw new ApiError('INTERNAL', 'ระบบขัดข้อง กรุณาลองใหม่', res.status)

  if (!body.ok) {
    throw new ApiError(body.error.code, body.error.message, res.status, body.error.detail)
  }

  return body
}

/**
 * ทำ body ให้พร้อมส่ง — **`FormData` ต้องผ่านไปทั้งก้อน ห้าม stringify**
 *
 * `JSON.stringify(formData)` ได้ `"{}"` เพราะ `FormData` ไม่มี property ให้ serialize ·
 * ไฟล์หายทั้งหมด และ BE เห็นเป็น body ว่าง แล้วตอบ "ต้องแนบไฟล์มาด้วย" ทั้งที่
 * ผู้ใช้แนบมาแล้วจริง (เจอตอนเขียน e2e 2026-09-01 — typecheck ไม่เห็นเพราะ
 * `JSON.stringify` รับ `unknown` ได้หมด)
 */
const toBody = (body: unknown): BodyInit =>
  body instanceof FormData ? body : JSON.stringify(body)

export const api = {
  get: async <T>(path: string): Promise<T> => (await request<T>(path)).data as T,

  /**
   * ลิสต์ที่แบ่งหน้า — คืน `page` มาด้วย
   *
   * **`api.get()` จะทิ้ง `page` ไปเงียบ ๆ** เพราะมันคืนแค่ `data` · เส้นที่แบ่งหน้า
   * ต้องใช้ตัวนี้ ไม่งั้นหน้าจอวาดปุ่มเลขหน้าไม่ได้และไม่มีอะไรเตือน
   *
   * **คืนเป็น `rows` ไม่ใช่ `data`** — ชื่อที่ต่างจากตัวไม่แบ่งหน้าโดยตั้งใจ · ผลคือ
   * เผลอสลับ `get` กับ `getPaged` แล้ว typecheck จับได้ทันที แทนที่จะได้ `undefined`
   * ตอนรัน
   */
  getPaged: async <T>(path: string): Promise<{ rows: T[]; page: PageMeta }> => {
    const res = (await request<T[]>(path)) as { ok: true; data: T[]; page: PageMeta }

    return { rows: res.data, page: res.page }
  },

  post: async <T>(path: string, body?: unknown): Promise<T> =>
    (await request<T>(path, { method: 'POST', ...(body ? { body: toBody(body) } : {}) })).data as T,

  patch: async <T>(path: string, body?: unknown): Promise<T> =>
    (await request<T>(path, { method: 'PATCH', ...(body ? { body: toBody(body) } : {}) })).data as T,

  delete: async <T>(path: string, body?: unknown): Promise<T> =>
    (await request<T>(path, { method: 'DELETE', ...(body ? { body: toBody(body) } : {}) }))
      .data as T,
}

/**
 * ข้อความที่เอาไปแสดงได้
 *
 * **อ่าน `err.code` เวลาจะตัดสินใจ ไม่ใช่อ่านข้อความ** — ข้อความเขียนไว้ให้คนอ่าน
 * และถูกแก้ถ้อยคำได้ตลอด
 */
export function toErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message

  return 'เกิดข้อผิดพลาด กรุณาลองใหม่'
}
