import { api } from '@/lib/api-client'

/**
 * สัญญากับ `/api/audit-logs` — **อ่านอย่างเดียว** ไม่มี create/update/delete
 *
 * แถวถูกเขียนโดยโมดูลอื่นผ่าน `writeAudit()` ตอนเปลี่ยนข้อมูล หน้านี้มีหน้าที่แค่เปิดดู
 */

export type AuditLogRow = {
  id: number
  /** `<โมดูล>.<การกระทำ>` เช่น `user.change-password` */
  action: string
  module: string
  /** แถวไหนที่ถูกแก้ · `null` เมื่อการกระทำไม่ได้ผูกกับแถวเดียว */
  recordId: number | null
  before: unknown
  after: unknown
  source: string
  createdAt: string
  userId: number
  /** ชื่อเต็มพนักงาน ถ้าผูกกับบัญชีนั้น ไม่งั้นเป็น username */
  userName: string
  /** "เกี่ยวกับใคร/อะไร" อ่านง่าย เช่น "INV000123 — สมชาย ใจดี" — `null` ถ้ายังไม่มีตัวแปล */
  subject: string | null
  /** true = การกระทำที่ผู้ประกอบการควรสังเกตเห็น (ลบ/ระงับบัญชี/ตีกลับเงิน ฯลฯ) */
  risk: boolean
}

export type AuditLogActor = { id: number; name: string }

export type ListAuditLogsInput = {
  module: string | null
  userId: number | null
  date: string | null
  page: number
  pageSize: number
}

export const auditLogApi = {
  list: (input: ListAuditLogsInput) => {
    const search = new URLSearchParams({
      page: String(input.page),
      pageSize: String(input.pageSize),
    })
    if (input.module) search.set('module', input.module)
    if (input.userId !== null) search.set('userId', String(input.userId))
    if (input.date) search.set('date', input.date)

    return api.getPaged<AuditLogRow>(`/api/audit-logs?${search.toString()}`)
  },

  /** รายชื่อ module ที่มีแถวอยู่จริง — ให้หน้าจอวาด dropdown กรอง */
  modules: () => api.get<string[]>('/api/audit-logs/modules'),

  /** รายชื่อคนที่เคยทำอะไรในระบบจริง — ให้หน้าจอวาด dropdown กรอง "ใครทำ" */
  actors: () => api.get<AuditLogActor[]>('/api/audit-logs/actors'),
}
