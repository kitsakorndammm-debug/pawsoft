/**
 * รูปเดียวกับ `kit/response.ts` — ใช้แค่ให้ api test อ่าน `res.json()` โดยไม่ชน
 * `unknown` ของ `tsc` · ไม่ใช่ contract ที่โค้ดจริงพึ่งพา
 */
export type ApiResponse = {
  ok: boolean
  // biome-ignore lint/suspicious/noExplicitAny: รูปของ data ต่างกันไปตาม endpoint ที่เทสเรียก
  data?: any
  error?: { code: string; message: string; detail?: Record<string, unknown> }
}

export async function readJson(res: Response): Promise<ApiResponse> {
  return (await res.json()) as ApiResponse
}
