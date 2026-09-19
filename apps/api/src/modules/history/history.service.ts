import { invalid } from '../../kit/app-error.ts'
import { db, type Tx } from '../../kit/db.ts'
import { Prisma, type DrugStockMovement, type Visit } from '../../../prisma/generated/client.ts'

/**
 * ประวัติยา (การเบิก/จ่าย/รับเข้า/ปรับยอด) ข้ามทุกตัวยา — พร้อมผู้ป่วยที่เกี่ยวข้อง
 *
 * **คนละหน้ากับ `listDrugStockMovements` ของโมดูล `drug-stock`** — อันนั้นดูทีละยา
 * ใช้จากหน้าตั้งค่าที่ต้องมีสิทธิ์ `main:drug-stock:read` · อันนี้ดูรวมทุกยาทั้งคลินิก
 * เปิดให้พนักงานทุกคนดูได้ (ผู้ใช้ตัดสิน 2026-09-18: "เข้าระบบได้ก็ดูได้เลย")
 *
 * **พ่วงผู้ป่วยมาด้วยเมื่อเป็น `DISPENSE`/`DISPENSE_REVERSED` ที่ผูกกับคิวจริง** — เดิน
 * ทาง `DrugStockMovement.visitDrugId → VisitDrug.visitId → Visit` เอาชื่อสัตว์/เจ้าของ
 * มาด้วย · แถว `RECEIVE`/`ADJUST` ไม่มีผู้ป่วยเกี่ยวข้อง จึงเป็น `null`
 */

const PAGE_SIZE = 50
const PAGE_SIZE_MAX = 200

export type DrugHistoryPatient = {
  visitId: number
  queueNumber: number
  queueDate: Date
  petName: string | null
  ownerName: string | null
}

export type DrugHistoryRow = {
  id: bigint
  createdAt: Date
  type: DrugStockMovement['type']
  drugName: string
  drugUnit: string | null
  quantity: Prisma.Decimal
  reason: string | null
  createdByName: string
  patient: DrugHistoryPatient | null
}

export type ListDrugHistoryInput = { page?: number | undefined; pageSize?: number | undefined }
export type ListDrugHistoryResult = {
  rows: DrugHistoryRow[]
  page: number
  pageSize: number
  total: number
}

export async function listDrugHistory(
  input: ListDrugHistoryInput = {},
  tx?: Tx,
): Promise<ListDrugHistoryResult> {
  const at = tx ?? db
  const page = Math.max(Math.floor(input.page ?? 1), 1)
  const pageSize = Math.min(Math.max(Math.floor(input.pageSize ?? PAGE_SIZE), 1), PAGE_SIZE_MAX)

  const [rows, total] = await Promise.all([
    at.drugStockMovement.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        drug: { select: { name: true, unit: true } },
        visitDrug: {
          select: {
            visit: {
              select: {
                id: true,
                queueNumber: true,
                queueDate: true,
                walkInPetName: true,
                walkInOwnerName: true,
                pet: { select: { name: true } },
                owner: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    at.drugStockMovement.count(),
  ])

  if (rows.length === 0) return { rows: [], page, pageSize, total }

  // `createdBy` เป็น BigInt ธรรมดา ไม่ใช่ Prisma relation (เหมือนทุก audit block
  // ในระบบนี้) ต้องดึง user เองแยกอีกรอบ — ดู `listDrugStockMovements` ที่ทำแบบเดียวกัน
  const userIds = [...new Set(rows.map((r) => r.createdBy))]
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
      createdAt: r.createdAt,
      type: r.type,
      drugName: r.drug.name,
      drugUnit: r.drug.unit,
      quantity: r.quantity,
      reason: r.reason,
      createdByName: nameByUserId.get(r.createdBy) ?? 'ไม่ทราบ',
      patient:
        r.visitDrug === null
          ? null
          : {
              visitId: Number(r.visitDrug.visit.id),
              queueNumber: r.visitDrug.visit.queueNumber,
              queueDate: r.visitDrug.visit.queueDate,
              petName: r.visitDrug.visit.pet?.name ?? r.visitDrug.visit.walkInPetName,
              ownerName: r.visitDrug.visit.owner?.name ?? r.visitDrug.visit.walkInOwnerName,
            },
    })),
    page,
    pageSize,
    total,
  }
}

/**
 * ประวัติการรักษา (คิว) — **คนละฟังก์ชันกับ `listVisits` ของโมดูล `visit`**
 *
 * อันนั้นใช้ทั่วระบบ (หน้าสัตว์เลี้ยง/รายงาน ฯลฯ) คืนแถวดิบไม่พ่วงชื่อ · หน้าประวัติ
 * ต้องพ่วงชื่อสัตว์/เจ้าของมาด้วยเสมอ เพราะรองรับการดู "ทุกคิววันนี้" ข้ามผู้ป่วยหลายตัว
 * ไม่ได้ดูทีละตัวจากหน้าสัตว์เลี้ยงเหมือนที่อื่น — เพิ่ม field ตรงนี้ที่เดียว ไม่กระทบ
 * ผู้เรียก `listVisits` เดิม (ผู้ใช้ขอ 2026-09-20: "อยากดูว่ามีการรักษาอะไรบ้างในเดือนนี้
 * เหมือนหน้าประวัติการเงิน")
 */

function cleanHistoryDate(raw: string): Date {
  const value = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw invalid('วันที่ต้องอยู่ในรูป YYYY-MM-DD', { field: 'date', value })
  }
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) throw invalid('วันที่ไม่ถูกต้อง', { field: 'date', value })
  return date
}

export type VisitHistoryRow = Visit & { petName: string | null; ownerName: string | null }

export type ListVisitHistoryInput = {
  petId?: bigint | undefined
  ownerId?: bigint | undefined
  status?: Visit['status'] | undefined
  /** `YYYY-MM-DD` — ดูเฉพาะคิววันนั้น ไม่ระบุ = ทุกวัน */
  date?: string | undefined
  page?: number | undefined
  pageSize?: number | undefined
}

export type ListVisitHistoryResult = {
  rows: VisitHistoryRow[]
  page: number
  pageSize: number
  total: number
}

export async function listVisitHistory(
  input: ListVisitHistoryInput = {},
  tx?: Tx,
): Promise<ListVisitHistoryResult> {
  const at = tx ?? db
  const page = Math.max(Math.floor(input.page ?? 1), 1)
  const pageSize = Math.min(Math.max(Math.floor(input.pageSize ?? PAGE_SIZE), 1), PAGE_SIZE_MAX)

  const where = {
    deletedAt: null,
    ...(input.petId !== undefined ? { petId: input.petId } : {}),
    ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.date !== undefined ? { queueDate: cleanHistoryDate(input.date) } : {}),
  }

  const [rows, total] = await Promise.all([
    at.visit.findMany({
      where,
      orderBy: [{ queueDate: 'desc' }, { arrivedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        pet: { select: { name: true } },
        owner: { select: { name: true } },
      },
    }),
    at.visit.count({ where }),
  ])

  return {
    rows: rows.map((r) => ({
      ...r,
      petName: r.pet?.name ?? r.walkInPetName,
      ownerName: r.owner?.name ?? r.walkInOwnerName,
    })),
    page,
    pageSize,
    total,
  }
}
