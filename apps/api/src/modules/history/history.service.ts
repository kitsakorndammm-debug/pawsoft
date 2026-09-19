import { db, type Tx } from '../../kit/db.ts'
import { Prisma, type DrugStockMovement } from '../../../prisma/generated/client.ts'

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
