import { api } from '@/lib/api-client'

/**
 * สัญญากับ `/api/warehouse-stock`
 *
 * ตารางนี้เป็น log — ไม่มี `update`/`delete` ทั้งฝั่ง BE และฝั่งนี้ (เหมือน `drug-stock`)
 *
 * **คนละยอดกับ `drug-stock`** — คลังยาคือของที่ซื้อเข้ามาเก็บไว้ สต็อกที่หมอใช้จ่ายคนไข้
 * คือของที่เบิกออกจากคลังมาแล้ว เชื่อมกันด้วย `withdraw` เท่านั้น
 */

/** ยอดคงเหลือหนึ่งแถวต่อยาหนึ่งตัว */
export type WarehouseStockBalance = {
  id: number
  name: string
  code: string | null
  unit: string | null
  isActive: boolean
  /** มีเครื่องหมาย — string เพราะเป็นเลขทศนิยม ห้ามแปลงเป็น number */
  quantity: string
}

/**
 * `WITHDRAW` ไม่มีในนี้ — เป็นของที่ BE สร้างเองตอนเบิกจากคลัง ไม่มีเส้นให้เรียกตรง
 * จากฟอร์มนี้ (ใช้ `withdraw()` แยกต่างหาก)
 */
export type WarehouseStockMovementType = 'RECEIVE' | 'ADJUST'

export type CreateWarehouseStockMovementInput = {
  drugId: number
  type: WarehouseStockMovementType
  quantity: string
  reason: string | null
  /** ใส่ได้เฉพาะตอน `type = 'RECEIVE'` — ล็อตนี้หมดอายุวันไหน */
  expiresOn?: string | null
  /** ใส่ได้เฉพาะตอน `type = 'RECEIVE'` — ซื้อเข้าจริงวันไหน กรอกย้อนหลังได้ */
  receivedOn?: string | null
}

export type WithdrawFromWarehouseInput = {
  drugId: number
  quantity: string
  reason: string | null
  /**
   * ล็อตที่เลือกเบิก — ไม่บังคับ (ยาที่ไม่เคยมีล็อตให้เลือกก็เบิกได้ ไม่มีวันหมดอายุติดไปด้วย)
   * เลือกแล้ววันหมดอายุมาจากล็อตนั้นเสมอ ไม่ใช่จาก `expiresOn` ที่ส่งมา
   */
  lotId?: number | null
  /** ใช้เฉพาะตอนไม่ได้เลือกล็อต */
  expiresOn: string | null
}

export type WarehouseStockMovement = {
  id: number
  drugId: number
  type: string
  quantity: string
  reason: string | null
  expiresOn: string | null
  receivedOn: string | null
  lotId: number | null
  createdAt: string
}

/** ทุกแบบที่ประวัติจะเจอ — ต่างจาก `WarehouseStockMovementType` ที่ใช้ตอนกรอกฟอร์ม */
export type WarehouseStockMovementRowType = 'RECEIVE' | 'WITHDRAW' | 'ADJUST'

export const WAREHOUSE_STOCK_MOVEMENT_TYPE_LABEL: Record<WarehouseStockMovementRowType, string> = {
  RECEIVE: 'ซื้อเข้า',
  WITHDRAW: 'เบิกออก',
  ADJUST: 'ปรับยอด',
}

/** หนึ่งแถวประวัติ — พก**ชื่อคนบันทึก**มาด้วย ไม่ต้องยิงถามทีละแถว */
export type WarehouseStockMovementRow = {
  id: number
  type: WarehouseStockMovementRowType
  quantity: string
  reason: string | null
  expiresOn: string | null
  receivedOn: string | null
  lotId: number | null
  createdAt: string
  createdByName: string
}

/** หนึ่งล็อตที่ยังเหลือ — ใช้เลือกตอน "เบิกจากคลัง" เรียงใกล้หมดอายุก่อนมาจาก BE แล้ว */
export type WarehouseStockLot = {
  id: number
  /** จำนวนที่ซื้อเข้าตอนสร้างล็อตนี้ — เอาไว้โชว์เทียบกับ `remaining` */
  quantityReceived: string
  remaining: string
  expiresOn: string | null
  receivedOn: string | null
}

export const warehouseStockApi = {
  // ไม่แบ่งหน้า — BE คืนทั้งหมด (ยอดคงเหลือของยาทั้งคลินิก ไม่ใช่ตารางที่ยาวเป็นพัน)
  list: (q: string) => {
    const query = q ? `?q=${encodeURIComponent(q)}` : ''
    return api.get<WarehouseStockBalance[]>(`/api/warehouse-stock${query}`)
  },

  create: (input: CreateWarehouseStockMovementInput) =>
    api.post<WarehouseStockMovement>('/api/warehouse-stock', input),

  withdraw: (input: WithdrawFromWarehouseInput) =>
    api.post<WarehouseStockMovement>('/api/warehouse-stock/withdraw', input),

  // ไม่แบ่งหน้า — ประวัติของยาตัวเดียว (โครงเดียวกับ `drug-stock`)
  movements: (drugId: number) =>
    api.get<WarehouseStockMovementRow[]>(`/api/warehouse-stock/${drugId}/movements`),

  // ไม่แบ่งหน้า — ล็อตที่ยังเหลือของยาตัวเดียว เรียงใกล้หมดอายุก่อน
  lots: (drugId: number) => api.get<WarehouseStockLot[]>(`/api/warehouse-stock/${drugId}/lots`),
}
