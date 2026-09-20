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

/**
 * การกระทำที่ผู้ประกอบการควรสังเกตเห็นทันที — ลบข้อมูล/ระงับบัญชี/ตีกลับหรือยกเลิกเงิน
 * (ผู้ใช้ตัดสิน 2026-09-20) **เป็น allowlist ที่เขียนตรง ๆ ไม่ใช่ pattern-match** เช่น
 * ลงท้าย `.delete` เพราะ action ใหม่ที่ยังไม่ได้พิจารณาไม่ควรถูกจัดว่าเสี่ยงไปเองเงียบ ๆ
 */
const RISKY_ACTIONS: ReadonlySet<string> = new Set([
  'employee.delete',
  'employee.work-status',
  'user.suspend',
  'user.unsuspend',
  'user.unlock',
  'user.reset-password',
  'owner.delete',
  'pet.delete',
  'payment.void',
  'payment.reject',
  'appointment.delete',
  'drug.delete',
  'drug-category.delete',
  'service-item.delete',
  'service-category.delete',
  'department.delete',
  'position.delete',
  'species.delete',
  'breed.delete',
  'visit.abandon',
])

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
  /** "เกี่ยวกับใคร/อะไร" อ่านง่าย — `null` เมื่อ module นี้ยังไม่มีตัวแปล หรือแถวต้นทางถูกลบไปแล้ว */
  subject: string | null
  risk: boolean
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

export type AuditLogActor = { id: number; name: string }

/**
 * รายชื่อ "ใครทำ" ที่มีอยู่จริงในประวัติ — ให้หน้าจอวาด dropdown กรอง (ผู้ใช้ขอ
 * 2026-09-20) คนละแบบกับดึงพนักงานทั้งหมด เพราะพนักงานที่ไม่เคยทำอะไรเลยไม่ควรโผล่
 * ในตัวเลือกกรอง — มีแค่คนที่มีแถวใน audit log จริง ๆ
 */
export async function listAuditLogActors(tx?: Tx): Promise<AuditLogActor[]> {
  const at = tx ?? db
  const userIds = await at.auditLog.findMany({ distinct: ['userId'], select: { userId: true } })
  if (userIds.length === 0) return []

  const users = await at.user.findMany({
    where: { id: { in: userIds.map((u) => u.userId) } },
    select: { id: true, username: true, employee: { select: { firstName: true, lastName: true } } },
  })

  return users
    .map((u) => ({
      id: Number(u.id),
      name: u.employee ? `${u.employee.firstName} ${u.employee.lastName}` : u.username,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'th'))
}

/**
 * แปล `module` + `recordId` เป็นข้อความ "เกี่ยวกับใคร/อะไร" อ่านง่าย (ผู้ใช้ตัดสิน
 * 2026-09-20: "บิลของใครชื่ออะไร ไม่ใช่แค่แถวที่ 3") — จัดกลุ่มตาม module ก่อนแล้วยิง
 * ทีละโมดูลแบบ batch (ไม่ใช่ query ทีละแถว) เพราะหน้าเดียวมีได้ถึง 200 แถว
 *
 * **โมดูลที่ยังไม่รู้จัก → `subject` เป็น `null`** ไม่ทำให้หน้าจอพัง แค่ไม่มีคำอธิบาย
 * เพิ่ม — เจตนาให้เพิ่มทีละโมดูลได้เรื่อย ๆ โดยไม่ต้องทำให้ครบทีเดียว
 */
async function resolveSubjects(
  rows: { module: string; recordId: bigint | null }[],
  at: Tx | typeof db,
): Promise<Map<string, string>> {
  const idsByModule = new Map<string, Set<bigint>>()
  for (const r of rows) {
    if (r.recordId === null) continue
    const set = idsByModule.get(r.module) ?? new Set<bigint>()
    set.add(r.recordId)
    idsByModule.set(r.module, set)
  }

  const subjectByKey = new Map<string, string>()
  const key = (module: string, id: bigint) => `${module}:${id}`

  const jobs: Promise<void>[] = []

  const ids = (module: string) => [...(idsByModule.get(module) ?? [])]

  if (idsByModule.has('payment')) {
    jobs.push(
      at.invoice
        .findMany({
          where: { id: { in: ids('payment') } },
          select: {
            id: true,
            code: true,
            visit: {
              select: {
                walkInOwnerName: true,
                owner: { select: { name: true } },
              },
            },
          },
        })
        .then((invoices) => {
          for (const inv of invoices) {
            const ownerName = inv.visit.owner?.name ?? inv.visit.walkInOwnerName ?? 'ไม่ระบุเจ้าของ'
            subjectByKey.set(key('payment', inv.id), `${inv.code} — ${ownerName}`)
          }
        }),
    )
  }

  if (idsByModule.has('visit')) {
    jobs.push(
      at.visit
        .findMany({
          where: { id: { in: ids('visit') } },
          select: {
            id: true,
            walkInPetName: true,
            walkInOwnerName: true,
            pet: { select: { name: true } },
            owner: { select: { name: true } },
          },
        })
        .then((visits) => {
          for (const v of visits) {
            const petName = v.pet?.name ?? v.walkInPetName ?? 'ไม่ระบุสัตว์'
            const ownerName = v.owner?.name ?? v.walkInOwnerName ?? 'ไม่ระบุเจ้าของ'
            subjectByKey.set(key('visit', v.id), `${petName} (${ownerName})`)
          }
        }),
    )
  }

  if (idsByModule.has('appointment')) {
    jobs.push(
      at.appointment
        .findMany({
          where: { id: { in: ids('appointment') } },
          select: {
            id: true,
            petNameText: true,
            pet: { select: { name: true } },
            owner: { select: { name: true } },
          },
        })
        .then((appts) => {
          for (const a of appts) {
            const petName = a.pet?.name ?? a.petNameText ?? 'ไม่ระบุสัตว์'
            subjectByKey.set(key('appointment', a.id), `${petName} (${a.owner.name})`)
          }
        }),
    )
  }

  if (idsByModule.has('employee')) {
    jobs.push(
      at.employee
        .findMany({
          where: { id: { in: ids('employee') } },
          select: { id: true, firstName: true, lastName: true },
        })
        .then((rows) => {
          for (const e of rows) {
            subjectByKey.set(key('employee', e.id), `${e.firstName} ${e.lastName}`)
          }
        }),
    )
  }

  if (idsByModule.has('user')) {
    jobs.push(
      at.user
        .findMany({
          where: { id: { in: ids('user') } },
          select: { id: true, username: true, employee: { select: { firstName: true, lastName: true } } },
        })
        .then((rows) => {
          for (const u of rows) {
            const name = u.employee ? `${u.employee.firstName} ${u.employee.lastName}` : u.username
            subjectByKey.set(key('user', u.id), name)
          }
        }),
    )
  }

  if (idsByModule.has('owner')) {
    jobs.push(
      at.owner
        .findMany({ where: { id: { in: ids('owner') } }, select: { id: true, name: true } })
        .then((rows) => {
          for (const o of rows) subjectByKey.set(key('owner', o.id), o.name)
        }),
    )
  }

  if (idsByModule.has('pet')) {
    jobs.push(
      at.pet
        .findMany({
          where: { id: { in: ids('pet') } },
          select: { id: true, name: true, owner: { select: { name: true } } },
        })
        .then((rows) => {
          for (const p of rows) subjectByKey.set(key('pet', p.id), `${p.name} (${p.owner.name})`)
        }),
    )
  }

  if (idsByModule.has('drug-stock')) {
    jobs.push(
      at.drugStockMovement
        .findMany({
          where: { id: { in: ids('drug-stock') } },
          select: { id: true, drug: { select: { name: true } } },
        })
        .then((rows) => {
          for (const m of rows) subjectByKey.set(key('drug-stock', m.id), m.drug.name)
        }),
    )
  }

  if (idsByModule.has('warehouse-stock')) {
    jobs.push(
      at.warehouseStockMovement
        .findMany({
          where: { id: { in: ids('warehouse-stock') } },
          select: { id: true, drug: { select: { name: true } } },
        })
        .then((rows) => {
          for (const m of rows) subjectByKey.set(key('warehouse-stock', m.id), m.drug.name)
        }),
    )
  }

  // ทะเบียนที่มีแค่ id + name — รูปเดียวกันหมด
  const catalog: [string, (where: { id: { in: bigint[] } }) => Promise<{ id: bigint; name: string }[]>][] = [
    ['drug', (w) => at.drug.findMany({ where: w, select: { id: true, name: true } })],
    ['service-item', (w) => at.serviceItem.findMany({ where: w, select: { id: true, name: true } })],
    ['department', (w) => at.department.findMany({ where: w, select: { id: true, name: true } })],
    ['position', (w) => at.position.findMany({ where: w, select: { id: true, name: true } })],
    ['species', (w) => at.species.findMany({ where: w, select: { id: true, name: true } })],
    ['breed', (w) => at.breed.findMany({ where: w, select: { id: true, name: true } })],
    ['drug-category', (w) => at.drugCategory.findMany({ where: w, select: { id: true, name: true } })],
    ['service-category', (w) => at.serviceCategory.findMany({ where: w, select: { id: true, name: true } })],
    ['role', (w) => at.role.findMany({ where: w, select: { id: true, name: true } })],
  ]
  for (const [module, query] of catalog) {
    if (!idsByModule.has(module)) continue
    jobs.push(
      query({ id: { in: ids(module) } }).then((rows) => {
        for (const row of rows) subjectByKey.set(key(module, row.id), row.name)
      }),
    )
  }

  if (idsByModule.has('visitItem')) {
    const visitItemIds = ids('visitItem')
    jobs.push(
      at.visitService
        .findMany({
          where: { id: { in: visitItemIds } },
          select: {
            id: true,
            visit: {
              select: {
                walkInPetName: true,
                walkInOwnerName: true,
                pet: { select: { name: true } },
                owner: { select: { name: true } },
              },
            },
          },
        })
        .then((rows) => {
          for (const r of rows) {
            const petName = r.visit.pet?.name ?? r.visit.walkInPetName ?? 'ไม่ระบุสัตว์'
            const ownerName = r.visit.owner?.name ?? r.visit.walkInOwnerName ?? 'ไม่ระบุเจ้าของ'
            subjectByKey.set(key('visitItem', r.id), `${petName} (${ownerName})`)
          }
        }),
    )
    jobs.push(
      at.visitDrug
        .findMany({
          where: { id: { in: visitItemIds } },
          select: {
            id: true,
            visit: {
              select: {
                walkInPetName: true,
                walkInOwnerName: true,
                pet: { select: { name: true } },
                owner: { select: { name: true } },
              },
            },
          },
        })
        .then((rows) => {
          for (const r of rows) {
            const petName = r.visit.pet?.name ?? r.visit.walkInPetName ?? 'ไม่ระบุสัตว์'
            const ownerName = r.visit.owner?.name ?? r.visit.walkInOwnerName ?? 'ไม่ระบุเจ้าของ'
            subjectByKey.set(key('visitItem', r.id), `${petName} (${ownerName})`)
          }
        }),
    )
  }

  await Promise.all(jobs)

  return subjectByKey
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
  const [users, subjectByKey] = await Promise.all([
    at.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        username: true,
        employee: { select: { firstName: true, lastName: true } },
      },
    }),
    resolveSubjects(rows, at),
  ])
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
      subject: r.recordId === null ? null : (subjectByKey.get(`${r.module}:${r.recordId}`) ?? null),
      risk: RISKY_ACTIONS.has(r.action),
    })),
    page,
    pageSize,
    total,
  }
}
