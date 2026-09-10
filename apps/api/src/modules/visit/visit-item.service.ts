import { invalid, notFound } from '../../kit/app-error.ts'
import { writeAudit } from '../../kit/audit.ts'
import { db, inTx, type Db, type Tx } from '../../kit/db.ts'
import { cleanOptional } from '../../kit/text.ts'
import { recordDispenseStockMovement } from '../drug-stock/drug-stock.service.ts'
import { findVisit } from './visit.service.ts'
import { Prisma, type VisitDrug, type VisitService } from '../../../prisma/generated/client.ts'

/**
 * รายการยาและการรักษาในคิวหนึ่งใบ
 *
 * **ราคาคัดลอกมา ไม่ได้ชี้ไปที่ตารางตั้งต้น** — และนี่คือกฎที่ห้ามผ่อนปรน
 *
 * ราคาใน `drug` / `service_item` คือราคา**วันนี้** · ใบเสร็จของเดือนที่แล้วต้องอ่านได้
 * เป็นเงินที่เก็บจริงตอนนั้น · ชี้ไปที่ต้นทางแปลว่าวันที่ขึ้นราคา ใบเสร็จเก่าทุกใบ
 * เปลี่ยนยอดตาม และงบที่ปิดไปแล้วจะไม่ตรงกับตัวเอง
 */

const MODULE = 'visitItem'

const NOTE_MAX = 500
const DOSAGE_MAX = 500

/** จำนวนและราคาเป็นข้อความ — เหตุผลเดียวกับ `drug.service.ts` */
function cleanAmount(raw: string, field: string, label: string): string {
  const value = raw.trim()

  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw invalid(`${label}ต้องเป็นตัวเลข ทศนิยมไม่เกินสองตำแหน่ง`, { field, value })
  }
  if (Number(value) <= 0) throw invalid(`${label}ต้องมากกว่า 0`, { field, value })

  return value
}

/**
 * คิวต้องยังแก้ได้ — **ปิดแล้วห้ามเพิ่มรายการ**
 *
 * ใบที่ปิดไปแล้วคือใบที่ลูกค้าจ่ายเงินตามยอดนั้นไปแล้ว · เพิ่มรายการทีหลังแปลว่ายอด
 * ในระบบกับเงินที่รับมาจริงไม่ตรงกัน โดยไม่มีอะไรบอกว่าต่างกันตรงไหน
 */
async function requireOpenVisit(visitId: bigint, at: Tx | Db): Promise<void> {
  const visit = await at.visit.findFirst({
    where: { id: visitId, deletedAt: null },
    select: { status: true },
  })
  if (!visit) throw notFound('ไม่พบคิวนี้', { field: 'visitId' })

  if (visit.status === 'DONE' || visit.status === 'CANCELLED') {
    throw invalid('คิวนี้ปิดไปแล้ว เพิ่มหรือแก้รายการไม่ได้', {
      field: 'visitId',
      status: visit.status,
    })
  }
}

// ============================================================================
// รายการรักษา
// ============================================================================

export type AddVisitServiceInput = {
  visitId: bigint
  serviceItemId: bigint
  /** จำนวน — จำนวนเต็ม เพราะไม่มีใครทำหัตถการครึ่งครั้ง */
  quantity?: number | undefined
  /** ราคาต่อหน่วย — ไม่ส่ง = ใช้ราคาตั้งต้นของรายการนั้น */
  unitPrice?: string | null
  note?: string | null
}

export async function addVisitService(
  input: AddVisitServiceInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<VisitService> {
  const at = outerTx ?? db
  await requireOpenVisit(input.visitId, at)

  const item = await at.serviceItem.findFirst({
    where: { id: input.serviceItemId, deletedAt: null },
    select: { id: true, name: true, price: true, isActive: true },
  })
  if (!item) throw notFound('ไม่พบรายการรักษาที่เลือก', { field: 'serviceItemId' })

  const quantity = Math.floor(input.quantity ?? 1)
  if (quantity <= 0) throw invalid('จำนวนต้องมากกว่า 0', { field: 'quantity' })

  /**
   * ราคาที่ส่งมาชนะราคาตั้งต้น — หมอลดราคาให้ได้ที่หน้างาน
   *
   * **ไม่ส่งมาแล้วรายการยังไม่ตั้งราคา = ปฏิเสธ** · `null` ในตารางตั้งต้นแปลว่า
   * "ยังไม่ตั้งราคา" ซึ่งไม่ใช่ราคา · ปล่อยผ่านเป็น 0 แปลว่าแจกฟรีโดยไม่มีใครตั้งใจ
   */
  const unitPrice =
    input.unitPrice === null || input.unitPrice === undefined
      ? item.price === null
        ? null
        : item.price.toString()
      : cleanAmount(input.unitPrice, 'unitPrice', 'ราคา')

  if (unitPrice === null) {
    throw invalid(`"${item.name}" ยังไม่ได้ตั้งราคา — กรอกราคาที่จะคิดครั้งนี้`, {
      field: 'unitPrice',
    })
  }

  return inTx(outerTx, async (tx) => {
    const created = await tx.visitService.create({
      data: {
        visitId: input.visitId,
        serviceItemId: item.id,
        // คัดลอกชื่อ ณ ตอนนั้นด้วย — รายการที่ถูกเปลี่ยนชื่อทีหลังไม่ทำให้ใบเก่าอ่านต่างไป
        nameSnapshot: item.name,
        quantity,
        unitPrice,
        note: cleanOptional(input.note, { field: 'note', label: 'บันทึก', max: NOTE_MAX }),
        createdBy: actorId,
        updatedBy: actorId,
      },
    })

    await writeAudit(tx, {
      action: `${MODULE}.add-service`,
      module: MODULE,
      recordId: created.id,
      after: { visitId: Number(input.visitId), name: created.nameSnapshot, quantity, unitPrice },
      userId: actorId,
    })

    return created
  })
}

export async function removeVisitService(
  id: bigint,
  actorId: bigint,
  outerTx?: Tx,
): Promise<void> {
  const at = outerTx ?? db
  const existing = await at.visitService.findUnique({ where: { id } })
  if (!existing) throw notFound('ไม่พบรายการนี้', { id: String(id) })

  await requireOpenVisit(existing.visitId, at)

  await inTx(outerTx, async (tx) => {
    /**
     * **ลบจริง ไม่ใช่ soft delete** — ต่างจากทะเบียนอื่นทั้งระบบ
     *
     * รายการที่หยิบผิดแล้วเอาออก ไม่ใช่ประวัติที่ต้องเก็บ · มันไม่เคยไปอยู่บนใบเสร็จ
     * เพราะใบยังไม่ปิด (`requireOpenVisit` กันไว้) · เก็บไว้แปลว่าทุกคิวรีที่รวมยอด
     * ต้องจำใส่ `deletedAt: null` เอง แล้ววันที่ลืมครั้งเดียวยอดจะบวกของที่เอาออกไปแล้ว
     */
    await tx.visitService.delete({ where: { id } })

    await writeAudit(tx, {
      action: `${MODULE}.remove-service`,
      module: MODULE,
      recordId: id,
      before: { visitId: Number(existing.visitId), name: existing.nameSnapshot },
      after: null,
      userId: actorId,
    })
  })
}

// ============================================================================
// ยา
// ============================================================================

export type AddVisitDrugInput = {
  visitId: bigint
  drugId: bigint
  /** จำนวน — ทศนิยมได้ เพราะยาน้ำจ่ายเป็น 2.5 มล. ได้ ต่างจากรายการรักษา */
  quantity: string
  unitPrice?: string | null
  /** ขนาดที่หมอสั่งให้สัตว์ตัวนี้ครั้งนี้ — พิมพ์ลงซองยา */
  dosage?: string | null
}

export async function addVisitDrug(
  input: AddVisitDrugInput,
  actorId: bigint,
  outerTx?: Tx,
): Promise<VisitDrug> {
  const at = outerTx ?? db
  await requireOpenVisit(input.visitId, at)

  const drug = await at.drug.findFirst({
    where: { id: input.drugId, deletedAt: null },
    select: { id: true, name: true, unit: true, price: true },
  })
  if (!drug) throw notFound('ไม่พบยาที่เลือก', { field: 'drugId' })

  const quantity = cleanAmount(input.quantity, 'quantity', 'จำนวน')

  const unitPrice =
    input.unitPrice === null || input.unitPrice === undefined
      ? drug.price === null
        ? null
        : drug.price.toString()
      : cleanAmount(input.unitPrice, 'unitPrice', 'ราคา')

  if (unitPrice === null) {
    throw invalid(`"${drug.name}" ยังไม่ได้ตั้งราคา — กรอกราคาที่จะคิดครั้งนี้`, {
      field: 'unitPrice',
    })
  }

  return inTx(outerTx, async (tx) => {
    const created = await tx.visitDrug.create({
      data: {
        visitId: input.visitId,
        drugId: drug.id,
        nameSnapshot: drug.name,
        // หน่วยคัดลอกมาด้วย — "2 เม็ด" อ่านไม่ออกถ้าหน่วยหายไปตอนยาถูกแก้ทีหลัง
        unitSnapshot: drug.unit,
        quantity,
        unitPrice,
        dosage: cleanOptional(input.dosage, { field: 'dosage', label: 'วิธีใช้', max: DOSAGE_MAX }),
        createdBy: actorId,
        updatedBy: actorId,
      },
    })

    await writeAudit(tx, {
      action: `${MODULE}.add-drug`,
      module: MODULE,
      recordId: created.id,
      after: { visitId: Number(input.visitId), name: created.nameSnapshot, quantity, unitPrice },
      userId: actorId,
    })

    // ตัดสต็อกอัตโนมัติ — ในทรานแซกชันเดียวกัน ไม่งั้นแถวยาสำเร็จแต่ตัดสต็อกล้มเหลวได้
    await recordDispenseStockMovement(
      { drugId: drug.id, visitDrugId: created.id, type: 'DISPENSE', quantity },
      actorId,
      tx,
    )

    return created
  })
}

export async function removeVisitDrug(id: bigint, actorId: bigint, outerTx?: Tx): Promise<void> {
  const at = outerTx ?? db
  const existing = await at.visitDrug.findUnique({ where: { id } })
  if (!existing) throw notFound('ไม่พบรายการนี้', { id: String(id) })

  await requireOpenVisit(existing.visitId, at)

  await inTx(outerTx, async (tx) => {
    // คืนสต็อกก่อนลบแถว — `visitDrugId` เป็น FK ที่ตรวจทันที (ไม่ใช่ deferred) ต้องมี
    // แถวแม่อยู่ตอน insert · ลบไปก่อนแล้วค่อยเขียนประวัติจะชี้ไปหาแถวที่หายไปแล้วไม่ได้
    await recordDispenseStockMovement(
      {
        drugId: existing.drugId,
        visitDrugId: existing.id,
        type: 'DISPENSE_REVERSED',
        quantity: existing.quantity.toString(),
      },
      actorId,
      tx,
    )

    // ลบจริง — เหตุผลเดียวกับ `removeVisitService`
    await tx.visitDrug.delete({ where: { id } })

    await writeAudit(tx, {
      action: `${MODULE}.remove-drug`,
      module: MODULE,
      recordId: id,
      before: { visitId: Number(existing.visitId), name: existing.nameSnapshot },
      after: null,
      userId: actorId,
    })
  })
}

// ============================================================================
// ยอดรวม
// ============================================================================

export type VisitBill = {
  services: VisitService[]
  drugs: VisitDrug[]
  /** ยอดรวม — **ข้อความ** เพราะเงินไม่เดินทางเป็น `number` */
  total: string
}

/**
 * รายการทั้งหมดของคิวหนึ่งใบ พร้อมยอดรวม
 *
 * **รวมด้วย `Decimal` ของ Prisma ไม่ใช่ `+` ของ JavaScript** · `0.1 + 0.2 !== 0.3`
 * และใบเสร็จที่บวกไม่ลงคือใบที่ลูกค้าเถียงได้
 */
export async function getVisitBill(visitId: bigint, tx?: Tx): Promise<VisitBill> {
  const at = tx ?? db
  await findVisit(visitId, tx)

  const [services, drugs] = await Promise.all([
    at.visitService.findMany({ where: { visitId }, orderBy: { id: 'asc' } }),
    at.visitDrug.findMany({ where: { visitId }, orderBy: { id: 'asc' } }),
  ])

  /**
   * `Decimal.mul` แล้ว `.add` — ไม่ผ่าน `number` สักขั้น
   *
   * ตั้งต้นด้วย `new Decimal(0)` ไม่ใช่เลข `0` เพราะ `0 + Decimal` จะบังคับให้
   * JavaScript แปลงกลับเป็นทศนิยมฐานสอง แล้วเศษสตางค์หายตั้งแต่บรรทัดแรก
   */
  const total = [...services, ...drugs].reduce(
    (sum, row) => sum.add(row.unitPrice.mul(row.quantity)),
    new Prisma.Decimal(0),
  )

  return { services, drugs, total: total.toFixed(2) }
}
