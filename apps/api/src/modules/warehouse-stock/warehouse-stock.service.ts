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
  /** วันหมดอายุของล็อตนี้ — มีค่าเฉพาะแถว `RECEIVE` */
  expiresOn: Date | null
  /** วันที่ซื้อเข้าจริง — มีค่าเฉพาะแถว `RECEIVE` */
  receivedOn: Date | null
  /** ล็อตต้นทางที่เบิกมา — มีค่าเฉพาะแถว `WITHDRAW` */
  lotId: bigint | null
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
    expiresOn: m.expiresOn,
    receivedOn: m.receivedOn,
    lotId: m.lotId,
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

/** วันที่-only เป็น `YYYY-MM-DD` — ใช้ร่วมกันทั้ง `expiresOn` และ `receivedOn` */
function cleanDateOnly(
  raw: string | null | undefined,
  field: 'expiresOn' | 'receivedOn',
  label: string,
): Date | null {
  if (raw === null || raw === undefined) return null

  const value = raw.trim()
  if (value.length === 0) return null

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw invalid(`${label}ต้องเป็นวันที่ในรูป YYYY-MM-DD`, { field, value })
  }

  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) {
    throw invalid(`${label}ไม่ใช่วันที่ที่มีอยู่จริง`, { field, value })
  }

  return date
}

/** ยอดที่เหลือของล็อตหนึ่ง — quantity ตอนซื้อเข้า ลบผลรวมที่เบิกออกไปแล้ว (มีเครื่องหมายลบอยู่แล้ว) */
async function lotRemaining(at: Db | Tx, lot: WarehouseStockMovement): Promise<Prisma.Decimal> {
  const withdrawn = await at.warehouseStockMovement.aggregate({
    where: { lotId: lot.id, type: 'WITHDRAW' },
    _sum: { quantity: true },
  })

  return lot.quantity.add(withdrawn._sum.quantity ?? new Prisma.Decimal(0))
}

export type WarehouseStockLot = {
  id: bigint
  quantityReceived: Prisma.Decimal
  remaining: Prisma.Decimal
  expiresOn: Date | null
  receivedOn: Date | null
  createdAt: Date
}

/**
 * ล็อตที่ยังเหลือของยาตัวเดียว — ใช้เลือกตอน "เบิกจากคลัง" (FEFO: ใกล้หมดอายุก่อนไปก่อน)
 *
 * **หนึ่งแถว `RECEIVE` = หนึ่งล็อต** ยอดคงเหลือคำนวณสดจากผลรวม `WITHDRAW` ที่ชี้กลับมา
 * ไม่ใช่ตัวนับที่เก็บแยก (โครงเดียวกับยอดคงเหลือรวม — ดู `///` บนหัวโมเดลในสคีมา)
 *
 * **เรียงใกล้หมดอายุก่อน · ไม่มีวันหมดอายุไปท้ายสุด** — ล็อตที่ไม่รู้วันหมดอายุไม่มีอะไร
 * บอกว่าควรรีบใช้ก่อน จึงไม่ควรถูกแนะนำให้ใช้ก่อนล็อตที่รู้วันแน่ชัด
 */
export async function listWarehouseStockLots(drugId: bigint, tx?: Tx): Promise<WarehouseStockLot[]> {
  const at = tx ?? db

  const drug = await at.drug.count({ where: { id: drugId, deletedAt: null } })
  if (drug === 0) throw notFound('ไม่พบยาที่เลือก', { field: 'drugId' })

  const receives = await at.warehouseStockMovement.findMany({
    where: { drugId, type: 'RECEIVE' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })

  if (receives.length === 0) return []

  const withdrawals = await at.warehouseStockMovement.groupBy({
    by: ['lotId'],
    where: { lotId: { in: receives.map((r) => r.id) }, type: 'WITHDRAW' },
    _sum: { quantity: true },
  })
  const withdrawnByLotId = new Map(withdrawals.map((w) => [w.lotId, w._sum.quantity ?? new Prisma.Decimal(0)]))

  return receives
    .map((r) => ({
      id: r.id,
      quantityReceived: r.quantity,
      // `withdrawnByLotId` เก็บผลรวมที่มีเครื่องหมายลบอยู่แล้ว — บวกตรง ๆ คือยอดที่เหลือ
      remaining: r.quantity.add(withdrawnByLotId.get(r.id) ?? new Prisma.Decimal(0)),
      expiresOn: r.expiresOn,
      receivedOn: r.receivedOn,
      createdAt: r.createdAt,
    }))
    // `isPositive()` ของ decimal.js นับ 0 เป็นบวกด้วย (เครื่องหมาย +) — ต้องเทียบตรง ๆ
    .filter((lot) => lot.remaining.greaterThan(0))
    .sort((a, b) => {
      if (a.expiresOn === null && b.expiresOn === null) return 0
      if (a.expiresOn === null) return 1
      if (b.expiresOn === null) return -1

      return a.expiresOn.getTime() - b.expiresOn.getTime()
    })
}

export type CreateWarehouseStockMovementInput = {
  drugId: bigint
  /** **แค่สองแบบนี้** — `WITHDRAW` เป็นของที่ `withdrawFromWarehouse` สร้างเองเท่านั้น */
  type: 'RECEIVE' | 'ADJUST'
  quantity: string
  reason?: string | null | undefined
  /** วันหมดอายุของล็อตนี้ — ใส่ได้เฉพาะตอน `type = RECEIVE` (บังคับที่ฐานด้วย CHECK) */
  expiresOn?: string | null | undefined
  /** วันที่ซื้อเข้าจริง — ใส่ได้เฉพาะตอน `type = RECEIVE` (บังคับที่ฐานด้วย CHECK) */
  receivedOn?: string | null | undefined
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

  const expiresOn = cleanDateOnly(input.expiresOn, 'expiresOn', 'วันหมดอายุ')
  const receivedOn = cleanDateOnly(input.receivedOn, 'receivedOn', 'วันที่ซื้อเข้า')
  if (input.type !== 'RECEIVE' && (expiresOn !== null || receivedOn !== null)) {
    throw invalid('ระบุวันหมดอายุ/วันที่ซื้อเข้าได้เฉพาะตอนซื้อเข้า', { field: 'expiresOn' })
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
      data: {
        drugId: input.drugId,
        type: input.type,
        quantity,
        reason,
        expiresOn,
        receivedOn,
        createdBy: actorId,
      },
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
  /**
   * ล็อตที่เลือกเบิก — **ไม่บังคับ** (ยาบางตัวยอดมาจากการปรับยอดล้วน ๆ ไม่เคยมีล็อต)
   * มีค่า → วันหมดอายุมาจากล็อตนี้เสมอ ไม่ใช่จาก `expiresOn` ที่ส่งมา (กันพนักงานพิมพ์
   * วันผิดจากที่ล็อตจริงระบุไว้)
   */
  lotId?: bigint | null | undefined
  /** วันหมดอายุ — ใช้เฉพาะตอน**ไม่ได้เลือกล็อต** (ยาที่ไม่เคยมีล็อตให้เลือก) */
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
 *
 * **เลือกล็อตแล้วต้องเบิกไม่เกินยอดของล็อตนั้น** (ผู้ใช้ตัดสิน 2026-09-23) — เบิกข้ามล็อต
 * ในครั้งเดียวไม่ได้ พนักงานที่ต้องการมากกว่ายอดล็อตแรกให้เบิกสองรอบ (ล็อตแรกจนหมด
 * แล้วเบิกล็อตถัดไปส่วนที่เหลือ) กันไม่ให้ระบบซับซ้อนเกินไปในรอบแรก
 */
export async function withdrawFromWarehouse(
  input: WithdrawFromWarehouseInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<WarehouseStockMovement> {
  const quantity = new Prisma.Decimal(input.quantity).abs()
  if (quantity.isZero()) throw invalid('จำนวนต้องไม่เป็นศูนย์', { field: 'quantity' })

  const reason = cleanOptional(input.reason, { field: 'reason', label: 'เหตุผล', max: REASON_MAX })
  const lotId = input.lotId ?? null

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

    // เลือกล็อต → วันหมดอายุมาจากล็อต ไม่ใช่จากที่พิมพ์เอง · ไม่เลือก → ใช้ที่พิมพ์มาตรง ๆ
    let expiresOn = cleanDateOnly(input.expiresOn, 'expiresOn', 'วันหมดอายุ')

    if (lotId !== null) {
      const lot = await tx.warehouseStockMovement.findFirst({
        where: { id: lotId, drugId: input.drugId, type: 'RECEIVE' },
      })
      if (!lot) throw notFound('ไม่พบล็อตที่เลือก', { field: 'lotId' })

      const remaining = await lotRemaining(tx, lot)
      if (remaining.lessThan(quantity)) {
        throw invalid('เบิกได้ไม่เกินยอดคงเหลือของล็อตนี้', { field: 'quantity' })
      }

      expiresOn = lot.expiresOn
    }

    const created = await tx.warehouseStockMovement.create({
      data: {
        drugId: input.drugId,
        type: 'WITHDRAW',
        quantity: quantity.negated(),
        reason,
        lotId,
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
        lotId: created.lotId === null ? null : created.lotId.toString(),
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
        expiresOn: expiresOn === null ? null : expiresOn.toISOString().slice(0, 10),
      },
      actorId,
      tx,
    )

    return created
  })
}
