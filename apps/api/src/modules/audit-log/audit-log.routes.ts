import { Elysia, t } from 'elysia'
import { invalid } from '../../kit/app-error.ts'
import { ok, paged } from '../../kit/response.ts'
import { guardAuditLogRead, parseIdFilter, refuseUnknownQuery } from '../../kit/route-guard.ts'
import { listAuditLogActors, listAuditLogModules, listAuditLogs, type AuditLogRow } from './audit-log.service.ts'

/**
 * ประวัติการใช้งาน (audit log) — **อ่านอย่างเดียว**
 *
 * ไม่มี `POST`/`PATCH`/`DELETE` — แถวถูกเขียนโดยโมดูลอื่นผ่าน `writeAudit()` เท่านั้น
 * เส้นนี้มีแค่ `list` กับ `modules` (ตัวเลือกให้ dropdown กรอง)
 */

const toWire = (r: AuditLogRow) => ({
  id: Number(r.id),
  action: r.action,
  module: r.module,
  recordId: r.recordId !== null ? Number(r.recordId) : null,
  before: r.before,
  after: r.after,
  source: r.source,
  createdAt: r.createdAt.toISOString(),
  userId: Number(r.userId),
  userName: r.userName,
  subject: r.subject,
  risk: r.risk,
})

const LIST_QUERY_KEYS = new Set(['module', 'userId', 'date', 'page', 'pageSize'])

function parseCount(raw: string | undefined, field: string): number | undefined {
  if (raw === undefined) return undefined
  if (!/^\d+$/.test(raw)) throw invalid(`${field} ต้องเป็นตัวเลข`, { [field]: raw })

  return Number(raw)
}

export const auditLogRoutes = new Elysia({ prefix: '/api/audit-logs' })
  .get(
    '/',
    async ({ query, request }) => {
      refuseUnknownQuery(request.url, LIST_QUERY_KEYS)

      const result = await listAuditLogs({
        module: query.module,
        userId: parseIdFilter(query.userId, 'userId'),
        date: query.date,
        page: parseCount(query.page, 'page'),
        pageSize: parseCount(query.pageSize, 'pageSize'),
      })

      return paged(result.rows.map(toWire), {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      })
    },
    {
      beforeHandle: guardAuditLogRead,
      query: t.Object({
        module: t.Optional(t.String()),
        userId: t.Optional(t.String()),
        date: t.Optional(t.String()),
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
      }),
    },
  )

  .get('/modules', async () => ok(await listAuditLogModules()), {
    beforeHandle: guardAuditLogRead,
  })

  .get('/actors', async () => ok(await listAuditLogActors()), {
    beforeHandle: guardAuditLogRead,
  })
