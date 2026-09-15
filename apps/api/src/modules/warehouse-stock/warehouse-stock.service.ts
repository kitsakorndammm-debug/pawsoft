import { invalid, notFound } from '../../kit/app-error.ts'
import { writeAudit } from '../../kit/audit.ts'
import { db, inTx, type Db, type Tx } from '../../kit/db.ts'
import { cleanOptional, literal } from '../../kit/text.ts'
import { createDrugStockMovement } from '../drug-stock/drug-stock.service.ts'
import { Prisma, type WarehouseStockMovement } from '../../../prisma/generated/client.ts'

/**
 * คลังยา
 *
 * ยอดคงเหลือของยาแต่ละตัว**ไม่ได้เก็บเป็นตัวเลขแยกไว้ที่ `Drug`** — คือผลรวม `quantity`
 * ของ `WarehouseStockMovement` ทุกแถวที่ `drugId` ตรงกัน (โครงเดียวกับ `drug-stock`
 * ดู `///` บนหัวโมเดลในสคีมา) เก็บแยกไว้จะกลายเป็นข้อมูลชุดเดียวกันสองสำเนาที่ต้องคอยเทียบ
 *
 * **คนละยอดกับ `DrugStockMovement`** — คลังยาคือของที่ซื้อเข้ามาเก็บไว้ ส่วน
 * `DrugStockMovement` คือของที่พร้อมให้หมอจ่ายจริง เชื่อมกันด้วย `withdrawFromWarehouse`
 * เท่านั้น (ผู้ใช้ตัดสิน 2026-09-15)
 */

const MODULE = 'warehouse-stock'
const REASON_MAX = 500

export type WarehouseStockBalance = {
  drugId: bigint
  name: string
  code: string | null
  unit: string | null
  isActive: boolean
  quantity: Prisma.Decimal
}

export type ListWarehouseStockBalancesInput = { q?: string | undefined }

/**
 * ยอดคงเหลือของยาทุกตัวในคลัง — ไม่แบ่งหน้า (โครงเดียวกับ `listDrugStockBalances`)
 *
 * **ยาที่เลิกใช้แล้ว (`isActive = false`) โผล่เฉพาะตอนยังมีของค้างในคลัง** — เหตุผลผล
 * เดียวกับหน้าสต็อกที่หมอใช้
 */
export async function listWarehouseStockBalances(
  input: ListWarehouseStockBalancesInput = {},
  tx?: Tx,
): Promise<WarehouseStockBalance[]> {
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

  const sums = await at.warehouseStockMovement.groupBy({
    by: ['drugId'],
    where: { drugId: { in: drugs.map((d) => d.id) } },
    _sum: { quantity: true },
  })

  const balanceByDrugId = new Map(sums.map((s) => [s.drugId, s._sum.quantity ?? new Prisma.Decimal(0)]))

  return drugs
    .map((d) => ({
      drugId: d.id,
      name: d.name,
      code: d.code,
      unit: d.unit,
      isActive: d.isActive,
      quantity: balanceByDrugId.get(d.id) ?? new Prisma.Decimal(0),
    }))
    .filter((d) => d.isActive || !d.quantity.isZero())
}

export type WarehouseStockMovementRow = {
  id: bigint
  type: WarehouseStockMovement['type']
  quantity: Prisma.Decimal
  reason: string | null
  createdAt: Date
  /** ชื่อเต็มของพนักงาน ถ้าบัญชีนั้นผูกกับพนักงาน · ไม่งั้นใช้ username แทน */
  createdByName: string
}

export type ListWarehouseStockMovementsInput = { drugId: bigint }

/** ประวัติการเคลื่อนไหวของยาตัวเดียวในคลัง — ไม่แบ่งหน้า เรียงล่าสุดก่อน (โครงเดียวกับ `drug-stock`) */
export async function listWarehouseStockMovements(
  input: ListWarehouseStockMovementsInput,
  tx?: Tx,
): Promise<WarehouseStockMovementRow[]> {
  const at = tx ?? db

  const drug = await at.drug.count({ where: { id: input.drugId, deletedAt: null } })
  if (drug === 0) throw notFound('ไม่พบยาที่เลือก', { field: 'drugId' })

  const movements = await at.warehouseStockMovement.findMany({
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
    createdAt: m.createdAt,
    createdByName: nameByUserId.get(m.createdBy) ?? 'ไม่ทราบ',
  }))
}

async function currentBalance(at: Db | Tx, drugId: bigint): Promise<Prisma.Decimal> {
  const sum = await at.warehouseStockMovement.aggregate({
    where: { drugId },
    _sum: { quantity: true },
  })

  return sum._sum.quantity ?? new Prisma.Decimal(0)
}

export type CreateWarehouseStockMovementInput = {
  drugId: bigint
  /** **แค่สองแบบนี้** — `WITHDRAW` เป็นของที่ `withdrawFromWarehouse` สร้างเองเท่านั้น */
  type: 'RECEIVE' | 'ADJUST'
  quantity: string
  reason?: string | null | undefined
}

/**
 * บันทึกซื้อเข้า/ปรับยอดคลัง — โครงเดียวกับ `createDrugStockMovement` ทุกกฎ
 *
 * **`RECEIVE` ต้องเป็นบวก** · **`ADJUST` บังคับกรอกเหตุผล** ·
 * **ห้ามทำให้ยอดคงเหลือติดลบ** — ตรวจยอดปัจจุบันในทรานแซกชันเดียวกับการ insert
 */
export async function createWarehouseStockMovement(
  input: CreateWarehouseStockMovementInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<WarehouseStockMovement> {
  if (input.type !== 'RECEIVE' && input.type !== 'ADJUST') {
    throw invalid('บันทึกได้เฉพาะซื้อเข้าหรือปรับยอด', { type: input.type })
  }

  const quantity = new Prisma.Decimal(input.quantity)
  if (quantity.isZero()) throw invalid('จำนวนต้องไม่เป็นศูนย์', { field: 'quantity' })
  if (input.type === 'RECEIVE' && quantity.isNegative()) {
    throw invalid('ซื้อเข้าต้องเป็นจำนวนบวก', { field: 'quantity' })
  }

  const reason = cleanOptional(input.reason, { field: 'reason', label: 'เหตุผล', max: REASON_MAX })
  if (input.type === 'ADJUST' && !reason) {
    throw invalid('ปรับยอดต้องกรอกเหตุผล', { field: 'reason' })
  }

  return inTx(outerTx, async (tx) => {
    const drug = await tx.drug.findFirst({
      where: { id: input.drugId, deletedAt: null },
      select: { id: true },
    })
    if (!drug) throw notFound('ไม่พบยาที่เลือก', { field: 'drugId' })

    const balance = await currentBalance(tx, input.drugId)
    if (balance.add(quantity).isNegative()) {
      throw invalid('ทำรายการนี้แล้วยอดคงเหลือในคลังจะติดลบ', { field: 'quantity' })
    }

    const created = await tx.warehouseStockMovement.create({
      data: { drugId: input.drugId, type: input.type, quantity, reason, createdBy: actorId },
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
      },
      userId: actorId,
    })

    return created
  })
}

export type WithdrawFromWarehouseInput = {
  drugId: bigint
  /** จำนวนที่เบิก — **บวกเสมอ** ผู้เรียกไม่ต้องคิดเครื่องหมาย ฟังก์ชันนี้จัดการเอง */
  quantity: string
  reason?: string | null | undefined
  /** วันหมดอายุของล็อตที่เบิกมา — ส่งต่อไปเป็น `expiresOn` ของแถว `RECEIVE` ฝั่งสต็อกที่หมอใช้ */
  expiresOn?: string | null | undefined
}

/**
 * เบิกจากคลัง → เติมสต็อกที่หมอใช้จ่ายคนไข้
 *
 * **สร้างสองแถวในทรานแซกชันเดียวกันเสมอ** — `WITHDRAW` ที่ฝั่งคลัง (ลบ) กับ `RECEIVE`
 * ที่ฝั่ง `drug-stock` (บวก) ต้องสำเร็จคู่กันหรือ rollback ทั้งคู่ ไม่งั้นยาจะหายจากคลัง
 * โดยไม่มีใครใช้ได้จริง หรือหมอมีสต็อกให้จ่ายทั้งที่คลังไม่เคยลด
 *
 * **ห้ามเบิกเกินยอดคงเหลือในคลัง** — ต่างจากการจ่ายยาให้คนไข้ (`recordDispenseStockMovement`)
 * ที่ยอมให้ติดลบได้ เพราะการเบิกเป็นการตัดสินใจล่วงหน้าของพนักงาน ไม่ใช่การรักษาฉุกเฉิน
 * ที่ต้องทำได้เสมอ
 */
export async function withdrawFromWarehouse(
  input: WithdrawFromWarehouseInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<WarehouseStockMovement> {
  const quantity = new Prisma.Decimal(input.quantity).abs()
  if (quantity.isZero()) throw invalid('จำนวนต้องไม่เป็นศูนย์', { field: 'quantity' })

  const reason = cleanOptional(input.reason, { field: 'reason', label: 'เหตุผล', max: REASON_MAX })

  return inTx(outerTx, async (tx) => {
    const drug = await tx.drug.findFirst({
      where: { id: input.drugId, deletedAt: null },
      select: { id: true },
    })
    if (!drug) throw notFound('ไม่พบยาที่เลือก', { field: 'drugId' })

    const balance = await currentBalance(tx, input.drugId)
    if (balance.lessThan(quantity)) {
      throw invalid('เบิกได้ไม่เกินยอดคงเหลือในคลัง', { field: 'quantity' })
    }

    const created = await tx.warehouseStockMovement.create({
      data: {
        drugId: input.drugId,
        type: 'WITHDRAW',
        quantity: quantity.negated(),
        reason,
        createdBy: actorId,
      },
    })

    await writeAudit(tx, {
      action: `${MODULE}.withdraw`,
      module: MODULE,
      recordId: created.id,
      after: {
        drugId: created.drugId.toString(),
        quantity: created.quantity.toString(),
        reason: created.reason,
      },
      userId: actorId,
    })

    // เติมสต็อกฝั่งที่หมอใช้ — ยืม service ของ `drug-stock` แทนก๊อปโค้ด (`docs/standards`
    // "service ยืม service ได้ แต่ต้องอยู่ทรานแซกชันเดียวกัน") ส่ง `tx` เดียวกันไปเสมอ
    await createDrugStockMovement(
      {
        drugId: input.drugId,
        type: 'RECEIVE',
        quantity: quantity.toString(),
        expiresOn: input.expiresOn ?? null,
      },
      actorId,
      tx,
    )

    return created
  })
}
