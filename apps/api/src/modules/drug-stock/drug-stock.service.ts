import { invalid, notFound } from '../../kit/app-error.ts'
import { writeAudit } from '../../kit/audit.ts'
import { db, inTx, type Db, type Tx } from '../../kit/db.ts'
import { cleanOptional, literal } from '../../kit/text.ts'
import { Prisma, type DrugStockMovement } from '../../../prisma/generated/client.ts'

/**
 * สต็อกยา
 *
 * ยอดคงเหลือของยาแต่ละตัว**ไม่ได้เก็บเป็นตัวเลขแยกไว้ที่ `Drug`** — คือผลรวม `quantity`
 * ของ `DrugStockMovement` ทุกแถวที่ `drugId` ตรงกัน (ดู `///` บนหัวโมเดลในสคีมา) ·
 * เก็บแยกไว้จะกลายเป็นข้อมูลชุดเดียวกันสองสำเนาที่ต้องคอยเทียบว่าตรงกันไหม
 */

const MODULE = 'drug-stock'
const REASON_MAX = 500

export type DrugStockBalance = {
  drugId: bigint
  name: string
  code: string | null
  unit: string | null
  isActive: boolean
  quantity: Prisma.Decimal
  /** วันหมดอายุที่ใกล้ที่สุดในบรรดาล็อตที่เคยรับเข้า — `null` ถ้าไม่เคยระบุไว้เลย */
  nearestExpiry: Date | null
}

export type ListDrugStockBalancesInput = { q?: string | undefined }

/**
 * ยอดคงเหลือของยาทุกตัว — ไม่แบ่งหน้า (ผู้ใช้ตัดสิน 2026-09-08)
 *
 * **ยาที่เลิกใช้แล้ว (`isActive = false`) โผล่เฉพาะตอนยังมีสต็อกค้าง** — เลิกใช้แล้วและ
 * สต็อกหมดพอดีไม่มีประโยชน์ให้เห็นในหน้าคลังยาอีก แต่ถ้ายังมีของค้างต้องยังตามได้ว่าเหลือ
 * เท่าไหร่ (ผู้ใช้ตัดสิน 2026-09-08)
 */
export async function listDrugStockBalances(
  input: ListDrugStockBalancesInput = {},
  tx?: Tx,
): Promise<DrugStockBalance[]> {
  const at = tx ?? db
  const q = input.q?.trim()

  const drugs = await at.drug.findMany({
    where: {
      deletedAt: null,
      ...(q ? { name: { contains: literal(q) } } : {}),
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true, code: true, unit: true, isActive: true },
  })

  if (drugs.length === 0) return []

  const sums = await at.drugStockMovement.groupBy({
    by: ['drugId'],
    where: { drugId: { in: drugs.map((d) => d.id) } },
    _sum: { quantity: true },
  })

  // ล็อตที่ใกล้หมดอายุที่สุด — เอาเฉพาะ `RECEIVE` ที่ระบุวันหมดอายุไว้ (ไม่ใช่ทุก movement)
  const expiries = await at.drugStockMovement.groupBy({
    by: ['drugId'],
    where: { drugId: { in: drugs.map((d) => d.id) }, type: 'RECEIVE', expiresOn: { not: null } },
    _min: { expiresOn: true },
  })

  const balanceByDrugId = new Map(sums.map((s) => [s.drugId, s._sum.quantity ?? new Prisma.Decimal(0)]))
  const expiryByDrugId = new Map(expiries.map((e) => [e.drugId, e._min.expiresOn ?? null]))

  return drugs
    .map((d) => ({
      drugId: d.id,
      name: d.name,
      code: d.code,
      unit: d.unit,
      isActive: d.isActive,
      quantity: balanceByDrugId.get(d.id) ?? new Prisma.Decimal(0),
      nearestExpiry: expiryByDrugId.get(d.id) ?? null,
    }))
    .filter((d) => d.isActive || !d.quantity.isZero())
}

export type DrugStockMovementRow = {
  id: bigint
  type: DrugStockMovement['type']
  quantity: Prisma.Decimal
  reason: string | null
  visitDrugId: bigint | null
  /** วันหมดอายุของล็อตนี้ — มีค่าเฉพาะแถว `RECEIVE` ที่ตอนบันทึกระบุไว้ */
  expiresOn: Date | null
  createdAt: Date
  /** ชื่อเต็มของพนักงาน ถ้าบัญชีนั้นผูกกับพนักงาน · ไม่งั้นใช้ username แทน */
  createdByName: string
}

export type ListDrugStockMovementsInput = { drugId: bigint }

/**
 * ประวัติการเคลื่อนไหวของยาตัวเดียว — ไม่แบ่งหน้า (ผู้ใช้ตัดสิน 2026-09-08) เรียงล่าสุดก่อน
 *
 * **ต้อง join `User` เอง ไม่ใช้ Prisma relation** — `DrugStockMovement.createdBy` เป็น
 * `BigInt` ธรรมดาแบบเดียวกับ audit block ทุกตารางในระบบนี้ (ไม่มี relation ไปที่ `user`)
 * จึงต้องดึงยาก่อน เก็บ `createdBy` ที่ไม่ซ้ำกัน แล้วค่อยถาม `user` อีกรอบ
 */
export async function listDrugStockMovements(
  input: ListDrugStockMovementsInput,
  tx?: Tx,
): Promise<DrugStockMovementRow[]> {
  const at = tx ?? db

  const drug = await at.drug.count({ where: { id: input.drugId, deletedAt: null } })
  if (drug === 0) throw notFound('ไม่พบยาที่เลือก', { field: 'drugId' })

  const movements = await at.drugStockMovement.findMany({
    where: { drugId: input.drugId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })

  if (movements.length === 0) return []

  const userIds = [...new Set(movements.map((m) => m.createdBy))]
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

  return movements.map((m) => ({
    id: m.id,
    type: m.type,
    quantity: m.quantity,
    reason: m.reason,
    visitDrugId: m.visitDrugId,
    expiresOn: m.expiresOn,
    createdAt: m.createdAt,
    createdByName: nameByUserId.get(m.createdBy) ?? 'ไม่ทราบ',
  }))
}

async function currentBalance(at: Db | Tx, drugId: bigint): Promise<Prisma.Decimal> {
  const sum = await at.drugStockMovement.aggregate({
    where: { drugId },
    _sum: { quantity: true },
  })

  return sum._sum.quantity ?? new Prisma.Decimal(0)
}

/** วันที่รับเข้ามาเป็น `YYYY-MM-DD` — เก็บเป็น `@db.Date` ไม่มีเวลา ไม่มี timezone */
function cleanExpiresOn(raw: string | null | undefined): Date | null {
  if (raw === null || raw === undefined) return null

  const value = raw.trim()
  if (value.length === 0) return null

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw invalid('วันหมดอายุต้องเป็นวันที่ในรูป YYYY-MM-DD', { field: 'expiresOn', value })
  }

  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) {
    throw invalid('วันหมดอายุไม่ใช่วันที่ที่มีอยู่จริง', { field: 'expiresOn', value })
  }

  return date
}

export type CreateDrugStockMovementInput = {
  drugId: bigint
  /** **แค่สองแบบนี้** — `DISPENSE`/`DISPENSE_REVERSED` เป็นของที่ระบบสร้างเองตอนจ่าย/ลบ
   * รายการจ่ายยาเท่านั้น (ผู้ใช้ตัดสิน 2026-09-08) จึงไม่เปิดให้ตั้งค่าตรงนี้ */
  type: 'RECEIVE' | 'ADJUST'
  quantity: string
  reason?: string | null | undefined
  /** วันหมดอายุของล็อตนี้ — ใส่ได้เฉพาะตอน `type = RECEIVE` (บังคับที่ฐานด้วย CHECK) */
  expiresOn?: string | null | undefined
}

/**
 * บันทึกรับเข้า/ปรับยอดสต็อก
 *
 * **`RECEIVE` ต้องเป็นบวก** — รับเข้าติดลบไม่มีความหมาย ต่างจาก `ADJUST` ที่ปรับขึ้นหรือ
 * ลงก็ได้ · **`ADJUST` บังคับกรอกเหตุผล** (ซ้ำกับ CHECK ที่ฐาน แต่ตรวจที่นี่ด้วยเพื่อให้ได้
 * ข้อความปฏิเสธที่อ่านรู้เรื่อง ไม่ใช่ constraint error ดิบจากฐาน)
 *
 * **ห้ามทำให้ยอดคงเหลือติดลบ** (ผู้ใช้ตัดสิน 2026-09-08) — ตรวจยอดปัจจุบันในทรานแซกชัน
 * เดียวกับการ insert กันสองคนบันทึกพร้อมกันแล้วยอดหลุดติดลบ
 */
export async function createDrugStockMovement(
  input: CreateDrugStockMovementInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<DrugStockMovement> {
  if (input.type !== 'RECEIVE' && input.type !== 'ADJUST') {
    throw invalid('บันทึกได้เฉพาะรับเข้าหรือปรับยอด', { type: input.type })
  }

  const quantity = new Prisma.Decimal(input.quantity)
  if (quantity.isZero()) throw invalid('จำนวนต้องไม่เป็นศูนย์', { field: 'quantity' })
  if (input.type === 'RECEIVE' && quantity.isNegative()) {
    throw invalid('รับเข้าต้องเป็นจำนวนบวก', { field: 'quantity' })
  }

  const reason = cleanOptional(input.reason, { field: 'reason', label: 'เหตุผล', max: REASON_MAX })
  if (input.type === 'ADJUST' && !reason) {
    throw invalid('ปรับยอดต้องกรอกเหตุผล', { field: 'reason' })
  }

  const expiresOn = cleanExpiresOn(input.expiresOn)
  if (input.type !== 'RECEIVE' && expiresOn !== null) {
    throw invalid('ระบุวันหมดอายุได้เฉพาะตอนรับเข้า', { field: 'expiresOn' })
  }

  return inTx(outerTx, async (tx) => {
    const drug = await tx.drug.findFirst({
      where: { id: input.drugId, deletedAt: null },
      select: { id: true },
    })
    if (!drug) throw notFound('ไม่พบยาที่เลือก', { field: 'drugId' })

    const balance = await currentBalance(tx, input.drugId)
    if (balance.add(quantity).isNegative()) {
      throw invalid('ทำรายการนี้แล้วยอดคงเหลือจะติดลบ', { field: 'quantity' })
    }

    const created = await tx.drugStockMovement.create({
      data: { drugId: input.drugId, type: input.type, quantity, reason, expiresOn, createdBy: actorId },
    })

    await writeAudit(tx, {
      action: `${MODULE}.create`,
      module: MODULE,
      recordId: created.id,
      after: {
        drugId: created.drugId.toString(),
        type: created.type,
        quantity: created.quantity.toString(),
        reason: created.reason,
        expiresOn: created.expiresOn?.toISOString().slice(0, 10) ?? null,
      },
      userId: actorId,
    })

    return created
  })
}

export type RecordDispenseStockMovementInput = {
  drugId: bigint
  visitDrugId: bigint
  type: 'DISPENSE' | 'DISPENSE_REVERSED'
  /** ค่าที่ตัด/คืน — **บวกเสมอ** ผู้เรียกไม่ต้องคิดเครื่องหมาย ฟังก์ชันนี้จัดการเอง */
  quantity: string
}

/**
 * เขียนประวัติสต็อกจากการจ่าย/คืนยา — **เรียกจาก `visit-item.service` เท่านั้น**
 * ไม่ใช่จุดที่ผู้ใช้เรียกตรง (ต่างจาก `createDrugStockMovement`) จึงไม่มีการกรอง `type`
 * และ**ไม่ตรวจยอดติดลบ** — จ่ายยาต้องทำได้เสมอแม้สต็อกไม่พอ ไม่งั้นจะไปสกัดงานของหมอ
 * (ผู้ใช้ตัดสิน 2026-09-08) ยอดติดลบเป็นสัญญาณให้เคาน์เตอร์ไปตามรับเข้าสต็อกจริง
 * ไม่ใช่เรื่องที่ต้องบล็อกตอนจ่าย
 *
 * **`tx` บังคับ ไม่มี default เป็น `db`** — ต้องรันในทรานแซกชันเดียวกับการสร้าง/ลบ
 * `VisitDrug` เสมอ ไม่งั้นแถวยาสำเร็จแต่ตัดสต็อกล้มเหลวได้ (หรือกลับกัน)
 */
export async function recordDispenseStockMovement(
  input: RecordDispenseStockMovementInput,
  actorId: bigint,
  tx: Tx,
): Promise<DrugStockMovement> {
  const magnitude = new Prisma.Decimal(input.quantity).abs()
  const quantity = input.type === 'DISPENSE' ? magnitude.negated() : magnitude

  const created = await tx.drugStockMovement.create({
    data: {
      drugId: input.drugId,
      visitDrugId: input.visitDrugId,
      type: input.type,
      quantity,
      createdBy: actorId,
    },
  })

  await writeAudit(tx, {
    action: `${MODULE}.${input.type === 'DISPENSE' ? 'dispense' : 'dispense-reversed'}`,
    module: MODULE,
    recordId: created.id,
    after: {
      drugId: created.drugId.toString(),
      visitDrugId: input.visitDrugId.toString(),
      quantity: created.quantity.toString(),
    },
    userId: actorId,
  })

  return created
}
