import { api } from '@/lib/api-client'

/**
 * สัญญากับ `/api/drug-stock`
 *
 * ตารางนี้เป็น log — ไม่มี `update`/`delete` ทั้งฝั่ง BE และฝั่งนี้
 */

/** ยอดคงเหลือหนึ่งแถวต่อยาหนึ่งตัว */
export type DrugStockBalance = {
  id: number
  name: string
  code: string | null
  unit: string | null
  isActive: boolean
  /** มีเครื่องหมาย — string เพราะเป็นเลขทศนิยม ห้ามแปลงเป็น number */
  quantity: string
}

/**
 * `DISPENSE`/`DISPENSE_REVERSED` ไม่มีในนี้ — เป็นของที่ BE สร้างเองตอนจ่าย/ลบรายการ
 * จ่ายยาในคิว ไม่มีเส้นให้เรียกตรงจากหน้านี้
 */
export type DrugStockMovementType = 'RECEIVE' | 'ADJUST'

export type CreateDrugStockMovementInput = {
  drugId: number
  type: DrugStockMovementType
  quantity: string
  reason: string | null
}

export type DrugStockMovement = {
  id: number
  drugId: number
  type: string
  quantity: string
  reason: string | null
  createdAt: string
}

/** ทุกแบบที่ประวัติจะเจอ — ต่างจาก `DrugStockMovementType` ที่ใช้ตอนกรอกฟอร์ม */
export type DrugStockMovementRowType = 'RECEIVE' | 'DISPENSE' | 'DISPENSE_REVERSED' | 'ADJUST'

export const DRUG_STOCK_MOVEMENT_TYPE_LABEL: Record<DrugStockMovementRowType, string> = {
  RECEIVE: 'รับเข้า',
  DISPENSE: 'จ่ายยา',
  DISPENSE_REVERSED: 'คืนสต็อก',
  ADJUST: 'ปรับยอด',
}

/** หนึ่งแถวประวัติ — พก**ชื่อคนบันทึก**มาด้วย ไม่ต้องยิงถามทีละแถว */
export type DrugStockMovementRow = {
  id: number
  type: DrugStockMovementRowType
  quantity: string
  reason: string | null
  visitDrugId: number | null
  createdAt: string
  createdByName: string
}

export const drugStockApi = {
  // ไม่แบ่งหน้า — BE คืนทั้งหมด (ยอดคงเหลือของยาทั้งคลินิก ไม่ใช่ตารางที่ยาวเป็นพัน)
  list: (q: string) => {
    const query = q ? `?q=${encodeURIComponent(q)}` : ''
    return api.get<DrugStockBalance[]>(`/api/drug-stock${query}`)
  },

  create: (input: CreateDrugStockMovementInput) =>
    api.post<DrugStockMovement>('/api/drug-stock', input),

  // ไม่แบ่งหน้า — ประวัติของยาตัวเดียว (ผู้ใช้ตัดสิน 2026-09-08)
  movements: (drugId: number) =>
    api.get<DrugStockMovementRow[]>(`/api/drug-stock/${drugId}/movements`),
}
