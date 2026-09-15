import { forbidden, invalid, notFound } from '../../kit/app-error.ts'
import { writeAudit } from '../../kit/audit.ts'
import { db, inTx, type Db, type Tx } from '../../kit/db.ts'
import { duplicateIndexOf } from '../../kit/duplicate.ts'
import { cleanOptional } from '../../kit/text.ts'
import { getVisitBill } from '../visit/visit-item.service.ts'
import { getPromptPaySettings } from './promptpay.config.ts'
import { buildPromptPayPayload, makePromptPayRef } from './promptpay.ts'
import { hashSlip, isSlipTypeAllowed, removeSlip, SLIP_MAX_SIZE, storeSlip } from './payment.storage.ts'
import { Prisma, type Invoice, type Payment, type PaymentMethod } from '../../../prisma/generated/client.ts'

/**
 * การชำระเงิน — **เคาน์เตอร์เก็บ แล้วบัญชียืนยัน**
 *
 * (ผู้ใช้กำหนด 2026-09-01 · ดู `///` บนหัว `payment.prisma`)
 *
 * เส้นทางของใบหนึ่งใบ:
 *
 *   `issueInvoice`   ออกใบจากคิวที่ตรวจเสร็จ — คัดลอกยอด ณ วินาทีนั้น
 *   `addPayment`     รับเงิน **ครั้งเดียวเต็มยอด** (สด · โอน · พร้อมเพย์) · แนบสลิปได้
 *   `submitInvoice`  เคาน์เตอร์ส่งยอด — **ล็อกไม่ให้แก้**
 *   `verifyInvoice`  บัญชียืนยัน — **ต้องไม่ใช่คนที่ส่ง**
 *
 * **ทุกกฎสำคัญบังคับที่ฐานด้วย** ไม่ใช่แค่ที่นี่ — เส้นนำเข้าข้อมูลในอนาคตจะไม่ผ่าน
 * ไฟล์นี้ · ที่นี่มีไว้ให้ error อ่านรู้เรื่อง ไม่ใช่เพื่อเป็นด่านเดียว
 */

const MODULE = 'payment'

const NOTE_MAX = 1_000
const PAYMENT_NOTE_MAX = 500
const REFERENCE_MAX = 100
const REJECT_REASON_MAX = 500

/** เงินรับเข้ามาเป็น**ข้อความ** เสมอ — เหตุผลเดียวกับราคายา */
function cleanMoney(raw: string, field: string, label: string): string {
  const value = raw.trim()

  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw invalid(`${label}ต้องเป็นตัวเลข ทศนิยมไม่เกินสองตำแหน่ง`, { field, value })
  }

  return value
}

const dec = (v: string) => new Prisma.Decimal(v)

export async function findInvoice(id: bigint, tx?: Tx): Promise<Invoice> {
  const row = await (tx ?? db).invoice.findFirst({ where: { id, deletedAt: null } })
  if (!row) throw notFound('ไม่พบใบเสร็จนี้', { id: String(id) })

  return row
}

/**
 * เลขที่ใบเสร็จถัดไป — `INV-20260901-0001`
 *
 * **นับจากเลขสูงสุดของวัน ไม่ใช่จำนวนแถว** · ใบที่ยกเลิกไปแล้วยังกินเลขอยู่ และต้อง
 * กินต่อไป — เลขที่ใบเสร็จไปอยู่ในบัญชีของลูกค้าแล้ว เอากลับมาใช้ซ้ำไม่ได้
 *
 * ชนกันได้ถ้าสองเคาน์เตอร์กดพร้อมกัน — unique index เป็นคนตัดสิน ส่วน `issueInvoice`
 * ลองใหม่ (รูปเดียวกับ `nextQueueNumber`)
 */
async function nextInvoiceCode(now: Date, at: Tx | Db): Promise<string> {
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}`
  const prefix = `INV-${stamp}-`

  const top = await at.invoice.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  })

  const last = top === null ? 0 : Number(top.code.slice(prefix.length))

  return `${prefix}${String(last + 1).padStart(4, '0')}`
}

/**
 * ออกใบเสร็จจากคิว — **คัดลอกยอด ณ วินาทีนี้**
 *
 * ต้องเป็นคิวที่ตรวจเสร็จแล้ว (`AWAITING_PAYMENT`) · ออกใบให้คิวที่ยังตรวจอยู่แปลว่า
 * ยอดจะเปลี่ยนอีก เพราะหมอยังเพิ่มยาได้
 *
 * **ออกซ้ำไม่ได้** — `visitId` เป็น `@unique` ที่ฐาน · อยากแก้ยอดให้ลบใบเดิม (ตอนที่
 * ยังเป็น `DRAFT`) แล้วออกใหม่
 */
export async function issueInvoice(
  visitId: bigint,
  input: { discount?: string | null; note?: string | null },
  actorId: bigint,
  outerTx?: Tx,
): Promise<Invoice> {
  const at = outerTx ?? db

  const visit = await at.visit.findFirst({
    where: { id: visitId, deletedAt: null },
    select: { id: true, status: true, queueNumber: true },
  })
  if (!visit) throw notFound('ไม่พบคิวนี้', { field: 'visitId' })

  if (visit.status !== 'AWAITING_PAYMENT') {
    throw invalid('ออกใบเสร็จได้เฉพาะคิวที่ตรวจเสร็จแล้ว', {
      field: 'visitId',
      status: visit.status,
    })
  }

  const bill = await getVisitBill(visitId, outerTx)
  const subtotal = dec(bill.total)
  const discount = dec(input.discount ? cleanMoney(input.discount, 'discount', 'ส่วนลด') : '0')

  if (discount.gt(subtotal)) {
    throw invalid('ส่วนลดมากกว่ายอดรวม', { field: 'discount' })
  }

  const note = cleanOptional(input.note, { field: 'note', label: 'บันทึก', max: NOTE_MAX })
  const now = new Date()

  // ลองใหม่เมื่อเลขที่ใบชน — สองเคาน์เตอร์กดพร้อมกันอ่านเลขสูงสุดตัวเดียวกัน
  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await inTx(outerTx, async (tx) => {
        const created = await tx.invoice.create({
          data: {
            code: await nextInvoiceCode(now, tx),
            visitId,
            subtotal,
            discount,
            total: subtotal.sub(discount),
            note,
            createdBy: actorId,
            updatedBy: actorId,
          },
        })

        await writeAudit(tx, {
          action: `${MODULE}.issue`,
          module: MODULE,
          recordId: created.id,
          after: {
            code: created.code,
            visitId: Number(visitId),
            total: created.total.toString(),
          },
          userId: actorId,
        })

        return created
      })
    } catch (e) {
      const index = duplicateIndexOf(e)
      // ชื่อ index เปลี่ยนตอนทำเป็น partial unique — ดู `07-payment.sql`
      if (index === 'invoice_visit_live_key') {
        throw invalid('คิวนี้ออกใบเสร็จไปแล้ว', { field: 'visitId' })
      }
      if (index !== 'invoice_code_key') throw e
      lastError = e
    }
  }

  throw lastError
}

/** ใบเสร็จต้องยังแก้ได้ — `DRAFT` หรือ `REJECTED` เท่านั้น */
function requireEditable(inv: Invoice): void {
  if (inv.status === 'DRAFT' || inv.status === 'REJECTED') return

  throw invalid(
    inv.status === 'AWAITING_VERIFY'
      ? 'ใบนี้ส่งให้บัญชีตรวจแล้ว แก้ไม่ได้จนกว่าจะถูกตีกลับ'
      : 'ใบนี้ปิดไปแล้ว',
    { field: 'status', status: inv.status },
  )
}

/**
 * ใครเป็นคนบันทึกการจ่าย — **พนักงาน หรือ ลูกค้า**
 *
 * (ผู้ใช้กำหนด 2026-09-01: "ลูกค้ากดที่หน้าจอตัวเองด้วย ... อัปโหลดหลักฐานเองได้")
 */
export type PaymentActor =
  | { kind: 'staff'; userId: bigint }
  | { kind: 'owner'; accountId: bigint }

export type AddPaymentInput = {
  invoiceId: bigint
  method: PaymentMethod
  /** ข้อความ — ดู `cleanMoney` */
  amount: string
  receivedAt?: Date | undefined
  reference?: string | null
  promptpayRef?: string | null
  note?: string | null
  /** สลิป — ไบต์กับ mime ที่ผู้เรียกอ่านมาแล้ว */
  slip?: { mimeType: string; bytes: Uint8Array } | undefined
}

/**
 * รับเงิน — **ครั้งเดียวเต็มยอด ไม่แบ่งจ่าย**
 *
 * **เขียนไฟล์ก่อนเข้าทรานแซกชัน แล้วลบทิ้งถ้าฐานไม่ผ่าน** · เขียนไฟล์ในทรานแซกชัน
 * ไม่ได้เพราะ rollback ของฐานไม่ย้อนไฟล์ให้ · ผลคือไฟล์กำพร้าจะเหลืออยู่ถ้าโปรเซส
 * ตายกลางคัน ซึ่งรับได้ (กินที่ ไม่ทำข้อมูลผิด) และงานกวาดทีหลังเก็บได้
 *
 * **ลูกค้าจ่ายสดไม่ได้** — เงินสดต้องมีคนรับจริง · ฐานบังคับด้วย
 * `payment_owner_method_check` อีกชั้น
 */
export async function addPayment(
  input: AddPaymentInput,
  actor: PaymentActor,
  outerTx?: Tx,
): Promise<Payment> {
  const at = outerTx ?? db
  const inv = await findInvoice(input.invoiceId, outerTx)
  requireEditable(inv)

  /**
   * **หนึ่งใบรับได้ครั้งเดียว** (ผู้ใช้ตัดสิน 2026-09-01: "รับเงินให้รับทางเดียว
   * ยอดเดียว แบ่งไม่ได้")
   *
   * ตาราง `payment` ยังรองรับหลายแถวไว้ — กฎอยู่ที่นี่กับหน้าจอ ไม่ได้อยู่ที่ฐาน ·
   * วันที่คลินิกอยากให้แบ่งจ่ายได้ จะเอาเงื่อนไขนี้ออกโดยไม่ต้อง migrate
   *
   * **แก้ยอดคือลบแถวเดิมแล้วใส่ใหม่** — `removePayment` ทำให้ได้ตราบที่ใบยังไม่ส่ง
   */
  const already = await at.payment.count({ where: { invoiceId: input.invoiceId } })
  if (already > 0) {
    throw invalid('ใบนี้รับเงินไปแล้ว — ต้องการแก้ยอด ให้เอารายการเดิมออกก่อน', {
      field: 'invoiceId',
    })
  }

  if (actor.kind === 'owner' && input.method !== 'PROMPTPAY' && input.method !== 'TRANSFER') {
    throw forbidden('ลูกค้าบันทึกได้เฉพาะการโอนหรือพร้อมเพย์', { field: 'method' })
  }

  const amount = cleanMoney(input.amount, 'amount', 'จำนวนเงิน')
  if (dec(amount).lte(0)) throw invalid('จำนวนเงินต้องมากกว่า 0', { field: 'amount' })

  // เงินสดแนบสลิปไม่ได้ — ฐานบังคับอยู่แล้ว ปฏิเสธที่นี่เพื่อให้ข้อความอ่านรู้เรื่อง
  if (input.method === 'CASH' && input.slip !== undefined) {
    throw invalid('การจ่ายเงินสดแนบสลิปไม่ได้', { field: 'slip' })
  }
  if (input.promptpayRef && input.method !== 'PROMPTPAY') {
    throw invalid('รหัสอ้างอิงพร้อมเพย์ใช้ได้เฉพาะการจ่ายแบบพร้อมเพย์', { field: 'promptpayRef' })
  }

  let stored: { path: string; hash: string } | null = null

  if (input.slip !== undefined) {
    const { mimeType, bytes } = input.slip

    if (bytes.length === 0) throw invalid('ไฟล์สลิปว่างเปล่า', { field: 'slip' })
    if (bytes.length > SLIP_MAX_SIZE) {
      throw invalid(`สลิปใหญ่เกิน ${Math.floor(SLIP_MAX_SIZE / 1024 / 1024)} MB`, { field: 'slip' })
    }
    if (!isSlipTypeAllowed(mimeType, bytes)) {
      throw invalid('รับเฉพาะรูป PNG · JPG · WebP หรือไฟล์ PDF', { field: 'slip' })
    }

    /**
     * ตรวจซ้ำก่อนเขียนไฟล์ — **ประหยัดการเขียนที่รู้ว่าจะโดนปฏิเสธ**
     *
     * unique index ที่ฐานเป็นคนตัดสินจริง (ตรวจก่อนเขียนมีช่องแข่งเสมอ) · ที่นี่แค่
     * ไม่ให้เขียนไฟล์ทิ้งไว้บนดิสก์ในกรณีที่รู้ผลอยู่แล้ว
     */
    const hash = hashSlip(bytes)
    const dup = await at.payment.findFirst({
      where: { slipHash: hash },
      select: { invoice: { select: { code: true } } },
    })
    if (dup) {
      throw invalid(`สลิปนี้ถูกใช้กับใบเสร็จ ${dup.invoice.code} ไปแล้ว`, { field: 'slip' })
    }

    stored = await storeSlip(mimeType, bytes)
  }

  try {
    return await inTx(outerTx, async (tx) => {
      const created = await tx.payment.create({
        data: {
          invoiceId: input.invoiceId,
          method: input.method,
          amount: dec(amount),
          receivedAt: input.receivedAt ?? new Date(),
          reference: cleanOptional(input.reference, {
            field: 'reference',
            label: 'เลขอ้างอิง',
            max: REFERENCE_MAX,
          }),
          promptpayRef: input.promptpayRef ?? null,
          slipPath: stored?.path ?? null,
          slipHash: stored?.hash ?? null,
          note: cleanOptional(input.note, {
            field: 'note',
            label: 'บันทึก',
            max: PAYMENT_NOTE_MAX,
          }),
          ...(actor.kind === 'staff'
            ? { createdBy: actor.userId, updatedBy: actor.userId }
            : { createdByOwnerAccountId: actor.accountId }),
        },
      })

      await recalcPaid(input.invoiceId, tx)

      // ลูกค้าแนบเองไม่มี `user.id` — เหตุผลเดียวกับ `createAppointment`
      if (actor.kind === 'staff') {
        await writeAudit(tx, {
          action: `${MODULE}.add`,
          module: MODULE,
          recordId: created.id,
          after: {
            invoiceId: Number(input.invoiceId),
            method: created.method,
            amount: created.amount.toString(),
          },
          userId: actor.userId,
        })
      }

      return created
    })
  } catch (e) {
    // ฐานไม่ผ่าน — ไฟล์ที่เพิ่งเขียนไม่มีใครอ้างถึงแล้ว
    if (stored !== null) await removeSlip(stored.path)

    if (duplicateIndexOf(e) === 'payment_slip_hash_key') {
      throw invalid('สลิปนี้ถูกใช้กับใบเสร็จอื่นไปแล้ว', { field: 'slip' })
    }

    throw e
  }
}

/**
 * คิด `paid` ใหม่จากการจ่ายทุกแถว — **ไม่บวกเพิ่มทีละครั้ง**
 *
 * บวกเพิ่มเร็วกว่า แต่ผิดสะสม: แถวที่ถูกลบ ทรานแซกชันที่ rollback ครึ่งทาง หรือ
 * การแก้ข้อมูลตรงฐาน จะทำให้ `paid` ค่อย ๆ ห่างจากความจริงโดยไม่มีใครรู้ · รวมใหม่
 * ทุกครั้งแปลว่ามันตรงเสมอตามนิยาม
 */
async function recalcPaid(invoiceId: bigint, tx: Tx): Promise<void> {
  const rows = await tx.payment.findMany({ where: { invoiceId }, select: { amount: true } })
  const paid = rows.reduce((sum, r) => sum.add(r.amount), new Prisma.Decimal(0))

  await tx.invoice.update({ where: { id: invoiceId }, data: { paid } })
}

/** เอาการจ่ายออก — ลบไฟล์สลิปตามไปด้วย */
export async function removePayment(
  paymentId: bigint,
  actorId: bigint,
  outerTx?: Tx,
): Promise<void> {
  const at = outerTx ?? db
  const row = await at.payment.findUnique({ where: { id: paymentId } })
  if (!row) throw notFound('ไม่พบรายการจ่ายนี้', { id: String(paymentId) })

  const inv = await findInvoice(row.invoiceId, outerTx)
  requireEditable(inv)

  await inTx(outerTx, async (tx) => {
    /**
     * **ลบจริง ไม่ใช่ soft delete** — เหตุผลเดียวกับ `removeVisitDrug`
     *
     * รายการที่บันทึกผิดแล้วเอาออก ไม่เคยไปอยู่บนใบที่ส่งให้บัญชี (`requireEditable`
     * กันไว้) · เก็บไว้แปลว่าทุกที่ที่รวมยอดต้องจำใส่ `deletedAt: null` เอง
     */
    await tx.payment.delete({ where: { id: paymentId } })
    await recalcPaid(row.invoiceId, tx)

    await writeAudit(tx, {
      action: `${MODULE}.remove`,
      module: MODULE,
      recordId: paymentId,
      before: { invoiceId: Number(row.invoiceId), amount: row.amount.toString() },
      after: null,
      userId: actorId,
    })
  })

  // ลบไฟล์หลัง commit — ลบก่อนแล้วทรานแซกชันล้ม จะได้แถวที่ชี้ไฟล์ที่ไม่มีอยู่
  if (row.slipPath !== null) await removeSlip(row.slipPath)
}

/**
 * เคาน์เตอร์ส่งยอดให้บัญชีตรวจ
 *
 * **ต้องเก็บครบก่อน** — ส่งใบที่ยังขาดอยู่แปลว่าบัญชีต้องเดาว่าจะตามเก็บเองหรือรอ
 */
export async function submitInvoice(
  id: bigint,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Invoice> {
  const inv = await findInvoice(id, outerTx)
  requireEditable(inv)

  if (inv.paid.lt(inv.total)) {
    throw invalid(
      `ยังเก็บไม่ครบ — รับมา ${inv.paid.toFixed(2)} จาก ${inv.total.toFixed(2)}`,
      { field: 'paid' },
    )
  }

  return inTx(outerTx, async (tx) => {
    const updated = await tx.invoice.update({
      where: { id },
      data: {
        status: 'AWAITING_VERIFY',
        submittedAt: new Date(),
        submittedBy: actorId,
        // ส่งใหม่หลังถูกตีกลับ — ล้างเหตุผลเก่าทิ้ง ไม่งั้น CHECK ไม่ผ่าน
        rejectReason: null,
        updatedBy: actorId,
      },
    })

    await writeAudit(tx, {
      action: `${MODULE}.submit`,
      module: MODULE,
      recordId: id,
      before: { status: inv.status },
      after: { status: 'AWAITING_VERIFY', total: updated.total.toString() },
      userId: actorId,
    })

    return updated
  })
}

/**
 * บัญชียืนยันยอด — **จุดที่ใบถูกปิดถาวร**
 *
 * **คนยืนยันต้องไม่ใช่คนส่ง** (ผู้ใช้กำหนด 2026-09-01) · ฐานบังคับด้วย
 * `invoice_verifier_not_submitter_check` · ปฏิเสธที่นี่ด้วยเพื่อให้ข้อความบอกว่า
 * ทำไม แทน error ของ constraint ที่อ่านไม่รู้เรื่อง
 */
export async function verifyInvoice(
  id: bigint,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Invoice> {
  const inv = await findInvoice(id, outerTx)

  if (inv.status !== 'AWAITING_VERIFY') {
    throw invalid('ยืนยันได้เฉพาะใบที่เคาน์เตอร์ส่งมาแล้ว', {
      field: 'status',
      status: inv.status,
    })
  }

  if (inv.submittedBy === actorId) {
    throw forbidden('คนที่ส่งยอดยืนยันเองไม่ได้ — ต้องให้อีกคนตรวจ', { field: 'verifiedBy' })
  }

  if (inv.paid.lt(inv.total)) {
    throw invalid('ยอดที่รับมายังไม่ครบ ยืนยันไม่ได้', { field: 'paid' })
  }

  return inTx(outerTx, async (tx) => {
    const updated = await tx.invoice.update({
      where: { id },
      data: { status: 'VERIFIED', verifiedAt: new Date(), verifiedBy: actorId, updatedBy: actorId },
    })

    /**
     * ปิดคิวไปด้วย — **ใบเสร็จปิดแปลว่างานของคิวนั้นจบ**
     *
     * ทำในทรานแซกชันเดียวกัน ไม่งั้นจะมีช่วงที่ใบปิดแล้วแต่คิวยังค้างอยู่บนจอ
     */
    const visit = await tx.visit.findUnique({
      where: { id: inv.visitId },
      select: { status: true },
    })
    if (visit?.status === 'AWAITING_PAYMENT') {
      await tx.visit.update({
        where: { id: inv.visitId },
        data: { status: 'DONE', doneAt: new Date(), updatedBy: actorId },
      })
    }

    await writeAudit(tx, {
      action: `${MODULE}.verify`,
      module: MODULE,
      recordId: id,
      before: { status: inv.status, submittedBy: Number(inv.submittedBy) },
      after: { status: 'VERIFIED', total: updated.total.toString() },
      userId: actorId,
    })

    return updated
  })
}

/** บัญชีตีกลับ — ใบกลับไปแก้ได้ */
export async function rejectInvoice(
  id: bigint,
  reason: string,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Invoice> {
  const inv = await findInvoice(id, outerTx)

  if (inv.status !== 'AWAITING_VERIFY') {
    throw invalid('ตีกลับได้เฉพาะใบที่รอตรวจอยู่', { field: 'status', status: inv.status })
  }

  const value = cleanOptional(reason, {
    field: 'rejectReason',
    label: 'เหตุผลที่ตีกลับ',
    max: REJECT_REASON_MAX,
  })
  if (value === null) throw invalid('ระบุเหตุผลที่ตีกลับ', { field: 'rejectReason' })

  return inTx(outerTx, async (tx) => {
    const updated = await tx.invoice.update({
      where: { id },
      data: { status: 'REJECTED', rejectReason: value, updatedBy: actorId },
    })

    await writeAudit(tx, {
      action: `${MODULE}.reject`,
      module: MODULE,
      recordId: id,
      before: { status: inv.status },
      after: { status: 'REJECTED', rejectReason: value },
      userId: actorId,
    })

    return updated
  })
}

/** ยกเลิกใบ — ออกผิด หรือคิวถูกยกเลิก · **ใบที่ยืนยันแล้วยกเลิกไม่ได้** */
export async function voidInvoice(
  id: bigint,
  actorId: bigint,
  outerTx?: Tx,
): Promise<Invoice> {
  const inv = await findInvoice(id, outerTx)

  if (inv.status === 'VERIFIED') {
    throw invalid('ใบที่ยืนยันแล้วยกเลิกไม่ได้ — ต้องออกใบลดหนี้', { field: 'status' })
  }

  return inTx(outerTx, async (tx) => {
    const updated = await tx.invoice.update({
      where: { id },
      data: { status: 'VOID', rejectReason: null, updatedBy: actorId },
    })

    await writeAudit(tx, {
      action: `${MODULE}.void`,
      module: MODULE,
      recordId: id,
      before: { status: inv.status },
      after: { status: 'VOID' },
      userId: actorId,
    })

    return updated
  })
}

// ============================================================================
// พร้อมเพย์
// ============================================================================

export type PromptPayQr = {
  /** ข้อความที่เอาไปวาด QR — ฝั่งเว็บวาดเอง */
  payload: string
  /** รหัสอ้างอิงของครั้งนี้ — เอาไปใส่ตอนบันทึกการจ่าย */
  ref: string
  amount: string
}

/**
 * สร้าง QR สำหรับใบเสร็จใบหนึ่ง — **ตามยอดที่ยังค้าง ไม่ใช่ยอดเต็ม**
 *
 * ลูกค้าจ่ายสดไปครึ่งหนึ่งแล้วขอโอนที่เหลือ เป็นเรื่องปกติ · ออก QR เป็นยอดเต็มแปลว่า
 * เขาจะจ่ายเกิน
 */
export async function makeInvoiceQr(id: bigint, tx?: Tx): Promise<PromptPayQr> {
  const inv = await findInvoice(id, tx)

  // บัญชีปลายทางมาจาก `.env` — ดู `///` บน `promptpay.config.ts`
  const config = getPromptPaySettings()

  const outstanding = inv.total.sub(inv.paid)
  if (outstanding.lte(0)) throw invalid('ใบนี้เก็บครบแล้ว', { field: 'paid' })

  const amount = outstanding.toFixed(2)

  return {
    payload: buildPromptPayPayload({
      target: config.target,
      targetKind: config.targetKind,
      amount,
    }),
    ref: makePromptPayRef(inv.code, amount),
    amount,
  }
}

// ============================================================================
// อ่าน
// ============================================================================

/**
 * ใบเสร็จพร้อม**รายการที่คิดเงิน** ไม่ใช่แค่ยอดรวม
 *
 * (ผู้ใช้ทักท้วง 2026-09-01: "ไม่มีบอกรายละเอียดอะไรเลย จะไปแจ้งลูกค้ายังไง")
 *
 * ยอดรวมอย่างเดียวคือตัวเลขที่พนักงานเอาไปบอกลูกค้าไม่ได้ · ลูกค้าถามว่า "ค่าอะไรบ้าง"
 * แล้วคนที่หน้าจอต้องเปิดอีกหน้าไปดู ซึ่งแปลว่าหน้านี้ทำงานไม่ครบ
 *
 * **อ่านจาก `visit_service` / `visit_drug` ของคิว ไม่ได้เก็บซ้ำในใบ** — รายการล็อก
 * ไปแล้วตอนคิวปิด (`requireOpenVisit` กันไว้) จึงไม่มีทางเปลี่ยนหลังออกใบ
 */
export type InvoiceLine = {
  kind: 'service' | 'drug'
  name: string
  /** ข้อความ — ยาจ่ายเป็น 2.5 มล. ได้ */
  quantity: string
  unit: string | null
  unitPrice: string
  amount: string
  /** วิธีใช้ที่หมอสั่ง — เฉพาะยา */
  dosage: string | null
}

/**
 * สรุปคิวของใบเสร็จ — **ชื่อจริงถ้าลงทะเบียนแล้ว ไม่งั้นใช้ชื่อที่กรอกหน้างาน**
 *
 * (ผู้ใช้ขอ 2026-09-15: "ควรบอกชื่อของผู้ใช้ด้วย") — บัญชีที่กดยืนยันยอดต้องรู้ว่า
 * "ของใคร" ก่อนกดยืนยัน ไม่ใช่แค่เลขที่ใบกับยอดเงิน
 */
export type InvoiceVisitSummary = {
  queueNumber: number
  queueDate: Date
  ownerName: string | null
  ownerPhone: string | null
  petName: string | null
}

export type InvoiceWithPayments = Invoice & {
  payments: Payment[]
  lines: InvoiceLine[]
  visit: InvoiceVisitSummary
}

const VISIT_SUMMARY_SELECT = {
  queueNumber: true,
  queueDate: true,
  walkInOwnerName: true,
  walkInPetName: true,
  owner: { select: { name: true, phone: true } },
  pet: { select: { name: true } },
} as const

function visitSummaryOf(visit: {
  queueNumber: number
  queueDate: Date
  walkInOwnerName: string | null
  walkInPetName: string | null
  owner: { name: string; phone: string | null } | null
  pet: { name: string } | null
}): InvoiceVisitSummary {
  return {
    queueNumber: visit.queueNumber,
    queueDate: visit.queueDate,
    ownerName: visit.owner?.name ?? visit.walkInOwnerName,
    ownerPhone: visit.owner?.phone ?? null,
    petName: visit.pet?.name ?? visit.walkInPetName,
  }
}

/** รายการของคิวหนึ่ง แปลงเป็นบรรทัดบนใบเสร็จ */
async function linesOfVisit(visitId: bigint, tx?: Tx): Promise<InvoiceLine[]> {
  const at = tx ?? db

  const [services, drugs] = await Promise.all([
    at.visitService.findMany({ where: { visitId }, orderBy: { id: 'asc' } }),
    at.visitDrug.findMany({ where: { visitId }, orderBy: { id: 'asc' } }),
  ])

  return [
    ...services.map((r) => ({
      kind: 'service' as const,
      name: r.nameSnapshot,
      quantity: String(r.quantity),
      unit: null,
      unitPrice: r.unitPrice.toFixed(2),
      amount: r.unitPrice.mul(r.quantity).toFixed(2),
      dosage: null,
    })),
    ...drugs.map((r) => ({
      kind: 'drug' as const,
      name: r.nameSnapshot,
      quantity: r.quantity.toString(),
      unit: r.unitSnapshot,
      unitPrice: r.unitPrice.toFixed(2),
      amount: r.unitPrice.mul(r.quantity).toFixed(2),
      dosage: r.dosage,
    })),
  ]
}

export async function getInvoiceDetail(id: bigint, tx?: Tx): Promise<InvoiceWithPayments> {
  const row = await (tx ?? db).invoice.findFirst({
    where: { id, deletedAt: null },
    include: {
      payments: { orderBy: { id: 'asc' } },
      visit: { select: VISIT_SUMMARY_SELECT },
    },
  })
  if (!row) throw notFound('ไม่พบใบเสร็จนี้', { id: String(id) })

  return {
    ...row,
    lines: await linesOfVisit(row.visitId, tx),
    visit: visitSummaryOf(row.visit),
  }
}

/** ใบเสร็จของคิวหนึ่ง — `null` เมื่อยังไม่ได้ออกใบ */
export async function findInvoiceByVisit(
  visitId: bigint,
  tx?: Tx,
): Promise<InvoiceWithPayments | null> {
  const row = await (tx ?? db).invoice.findFirst({
    /**
     * **ข้ามใบที่ยกเลิกแล้ว** — คิวที่เคยออกใบผิดต้องกลับไปสถานะ "ยังไม่มีใบ"
     * ไม่ใช่ค้างอยู่กับใบที่ตายแล้ว (แก้ 2026-09-01)
     */
    where: { visitId, deletedAt: null, status: { not: 'VOID' } },
    include: {
      payments: { orderBy: { id: 'asc' } },
      visit: { select: VISIT_SUMMARY_SELECT },
    },
  })
  if (row === null) return null

  return {
    ...row,
    lines: await linesOfVisit(visitId, tx),
    visit: visitSummaryOf(row.visit),
  }
}

export const INVOICE_PAGE_SIZE = 50
export const INVOICE_PAGE_SIZE_MAX = 200

export type ListInvoicesInput = {
  status?: Invoice['status'] | undefined
  /** `YYYY-MM-DD` — ดูเฉพาะใบที่ออกวันนั้น */
  date?: string | undefined
  page?: number | undefined
  pageSize?: number | undefined
}

export type ListInvoicesResult = {
  rows: InvoiceWithPayments[]
  page: number
  pageSize: number
  total: number
}

export async function listInvoices(
  input: ListInvoicesInput = {},
  tx?: Tx,
): Promise<ListInvoicesResult> {
  const page = Math.max(Math.floor(input.page ?? 1), 1)
  const pageSize = Math.min(
    Math.max(Math.floor(input.pageSize ?? INVOICE_PAGE_SIZE), 1),
    INVOICE_PAGE_SIZE_MAX,
  )

  const at = tx ?? db

  let createdAt: { gte: Date; lt: Date } | undefined
  if (input.date !== undefined) {
    const value = input.date.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw invalid('วันที่ต้องอยู่ในรูป YYYY-MM-DD', { field: 'date', value })
    }
    // ช่วงหนึ่งวันตามเวลาไทย — เหตุผลเดียวกับ `listLoginLogs` เดิม
    const start = new Date(`${value}T00:00:00+07:00`)
    createdAt = { gte: start, lt: new Date(start.getTime() + 86_400_000) }
  }

  const where = {
    deletedAt: null,
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(createdAt ? { createdAt } : {}),
  }

  const [found, total] = await Promise.all([
    at.invoice.findMany({
      where,
      // ใหม่สุดขึ้นก่อน — คนเปิดหน้านี้ถามว่า "เมื่อกี้มีอะไร" ไม่ใช่ "เดือนที่แล้วเป็นไง"
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        payments: { orderBy: { id: 'asc' } },
        visit: { select: VISIT_SUMMARY_SELECT },
      },
    }),
    at.invoice.count({ where }),
  ])

  /**
   * **ลิสต์ไม่ดึงรายการ** — ห้าสิบใบก็ร้อยคิวรี และตารางไม่ได้แสดงมันอยู่แล้ว ·
   * คนที่อยากเห็นรายการกดเปิดใบ ซึ่งไปที่ `getInvoiceDetail`
   *
   * **แต่พ่วงชื่อเจ้าของ/สัตว์มาด้วย** — คนละอย่างกับรายการ นี่คือของที่ตารางลิสต์
   * ต้องโชว์เป็นคอลัมน์ (ผู้ใช้ขอ 2026-09-15) ไม่ใช่ของที่รอเปิดใบถึงจะเห็น
   */
  const rows = found.map((r) => ({
    ...r,
    lines: [] as InvoiceLine[],
    visit: visitSummaryOf(r.visit),
  }))

  return { rows, page, pageSize, total }
}

/* ------------------------------------------------------------------ *
 * ฝั่งลูกค้า — ดูและจ่ายใบของตัวเอง
 *
 * (ผู้ใช้กำหนด 2026-09-01: "การชำระมีทั้งแบบลูกค้ากดที่หน้าจอตัวเองด้วย แล้ว
 * สแกน QR อัปโหลดหลักฐานเองได้")
 *
 * **ทุกเส้นฝั่งนี้กรองด้วย `ownerId` จากเซสชัน** — ใบเสร็จผูกกับคิว และคิวผูกกับ
 * เจ้าของ · ไม่กรองเมื่อไหร่ ลูกค้าคนหนึ่งจะอ่านใบของคนอื่นได้ด้วยการเดาเลข
 * ------------------------------------------------------------------ */

/**
 * ใบนี้เป็นของลูกค้าคนนี้จริงหรือเปล่า
 *
 * **โยน 404 ไม่ใช่ 403** — เหตุผลเดียวกับ `requireOwnPet`: `403` ยืนยันว่าเลขนี้
 * มีอยู่จริงแต่เป็นของคนอื่น ซึ่งเป็นข้อมูลที่เขาไม่ควรได้
 */
export async function requireOwnInvoice(
  ownerId: bigint,
  invoiceId: bigint,
  tx?: Tx,
): Promise<void> {
  const found = await (tx ?? db).invoice.count({
    where: { id: invoiceId, deletedAt: null, visit: { ownerId, deletedAt: null } },
  })
  if (found === 0) throw notFound('ไม่พบใบเสร็จนี้')
}

/**
 * เหมือน `InvoiceWithPayments` ทุกอย่าง — ใช้ชื่อแยกไว้เพื่อให้อ่านง่ายที่ฝั่ง route
 * ว่าเป็นแถวของลูกค้า แม้โครงข้อมูลจะเหมือนกัน (`visit` มี `ownerName`/`ownerPhone`
 * ติดมาด้วยเหมือนกัน แต่ `toMyWire` เลือกไม่ส่งสองฟิลด์นั้นออกไป — เป็นตัวเอง
 * ไม่ต้องมีใครบอกชื่อตัวเอง)
 */
export type MyInvoiceRow = InvoiceWithPayments

/**
 * ใบเสร็จของฉัน — **ใบที่ยกเลิกไม่โผล่**
 *
 * ใบ `VOID` คือใบที่ออกผิดแล้วเคาน์เตอร์ถอนทิ้ง · คลินิกเก็บไว้เป็นประวัติ แต่ลูกค้า
 * ที่เห็นมันจะสับสนว่าต้องจ่ายไหม · `listInvoices` ฝั่งพนักงานยังเห็นครบ
 */
export async function listMyInvoices(
  ownerId: bigint,
  input: { page?: number | undefined; pageSize?: number | undefined } = {},
  tx?: Tx,
): Promise<{ rows: MyInvoiceRow[]; page: number; pageSize: number; total: number }> {
  const page = Math.max(Math.floor(input.page ?? 1), 1)
  const pageSize = Math.min(
    Math.max(Math.floor(input.pageSize ?? INVOICE_PAGE_SIZE), 1),
    INVOICE_PAGE_SIZE_MAX,
  )

  const at = tx ?? db
  const where = {
    deletedAt: null,
    status: { not: 'VOID' as const },
    visit: { ownerId, deletedAt: null },
  }

  const [found, total] = await Promise.all([
    at.invoice.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        payments: { orderBy: { id: 'asc' } },
        visit: { select: VISIT_SUMMARY_SELECT },
      },
    }),
    at.invoice.count({ where }),
  ])

  const rows = found.map((r) => ({
    ...r,
    // ลิสต์ไม่ดึงรายการ — เหตุผลเดียวกับ `listInvoices`
    lines: [] as InvoiceLine[],
    visit: visitSummaryOf(r.visit),
  }))

  return { rows, page, pageSize, total }
}

/** ใบรายตัวของฉัน — มีรายการครบเพราะนี่คือหน้าที่ลูกค้าอ่านว่าจ่ายค่าอะไร */
export async function getMyInvoiceDetail(
  ownerId: bigint,
  invoiceId: bigint,
  tx?: Tx,
): Promise<MyInvoiceRow> {
  await requireOwnInvoice(ownerId, invoiceId, tx)

  const at = tx ?? db
  const row = await at.invoice.findFirstOrThrow({
    where: { id: invoiceId, deletedAt: null },
    include: {
      payments: { orderBy: { id: 'asc' } },
      visit: { select: VISIT_SUMMARY_SELECT },
    },
  })

  return {
    ...row,
    lines: await linesOfVisit(row.visitId, tx),
    visit: visitSummaryOf(row.visit),
  }
}
