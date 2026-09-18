import { invalid } from '../../kit/app-error.ts'
import { db, type Tx } from '../../kit/db.ts'

/**
 * ประวัติการใช้งาน (audit log) — **อ่านอย่างเดียว**
 *
 * แถวถูกเขียนโดย `writeAudit()` (ดู `kit/audit.ts`) จากทุกโมดูลที่เปลี่ยนข้อมูล ·
 * โมดูลนี้มีหน้าที่แค่ "list" ให้คนเปิดดู ไม่มี create/update/delete ของตัวเอง
 */

export const AUDIT_LOG_PAGE_SIZE = 50
export const AUDIT_LOG_PAGE_SIZE_MAX = 200

export type AuditLogRow = {
  id: bigint
  action: string
  module: string
  recordId: bigint | null
  before: unknown
  after: unknown
  source: string
  createdAt: Date
  userId: bigint
  /** ชื่อเต็มของพนักงาน ถ้าบัญชีนั้นผูกกับพนักงาน · ไม่งั้นใช้ username แทน */
  userName: string
}

export type ListAuditLogsInput = {
  module?: string | undefined
  userId?: bigint | undefined
  /** `YYYY-MM-DD` — ดูเฉพาะวันนั้น (เขตเวลาไทย) */
  date?: string | undefined
  page?: number | undefined
  pageSize?: number | undefined
}

export type ListAuditLogsResult = {
  rows: AuditLogRow[]
  page: number
  pageSize: number
  total: number
}

/** รายชื่อ module ที่มีอยู่จริง — ให้หน้าจอวาด dropdown กรองได้โดยไม่ต้องเดา */
export async function listAuditLogModules(tx?: Tx): Promise<string[]> {
  const at = tx ?? db
  const rows = await at.auditLog.findMany({
    distinct: ['module'],
    select: { module: true },
    orderBy: { module: 'asc' },
  })

  return rows.map((r) => r.module)
}

export async function listAuditLogs(
  input: ListAuditLogsInput = {},
  tx?: Tx,
): Promise<ListAuditLogsResult> {
  const page = Math.max(Math.floor(input.page ?? 1), 1)
  const pageSize = Math.min(
    Math.max(Math.floor(input.pageSize ?? AUDIT_LOG_PAGE_SIZE), 1),
    AUDIT_LOG_PAGE_SIZE_MAX,
  )

  const at = tx ?? db

  let createdAt: { gte: Date; lt: Date } | undefined
  if (input.date !== undefined) {
    const value = input.date.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw invalid('วันที่ต้องอยู่ในรูป YYYY-MM-DD', { field: 'date', value })
    }
    // ช่วงหนึ่งวันตามเวลาไทย — เหตุผลเดียวกับ `listInvoices`
    const start = new Date(`${value}T00:00:00+07:00`)
    createdAt = { gte: start, lt: new Date(start.getTime() + 86_400_000) }
  }

  const where = {
    ...(input.module !== undefined ? { module: input.module } : {}),
    ...(input.userId !== undefined ? { userId: input.userId } : {}),
    ...(createdAt ? { createdAt } : {}),
  }

  const [total, rows] = await Promise.all([
    at.auditLog.count({ where }),
    at.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  if (rows.length === 0) return { rows: [], page, pageSize, total }

  const userIds = [...new Set(rows.map((r) => r.userId))]
  const users = await at.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      username: true,
      employee: { select: { firstName: true, lastName: true } },
    },
  })
  const nameByUserId = new Map(
    users.map((u) => [
      u.id,
      u.employee ? `${u.employee.firstName} ${u.employee.lastName}` : u.username,
    ]),
  )

  return {
    rows: rows.map((r) => ({
      id: r.id,
      action: r.action,
      module: r.module,
      recordId: r.recordId,
      before: r.before,
      after: r.after,
      source: r.source,
      createdAt: r.createdAt,
      userId: r.userId,
      userName: nameByUserId.get(r.userId) ?? 'ไม่ทราบ',
    })),
    page,
    pageSize,
    total,
  }
}
