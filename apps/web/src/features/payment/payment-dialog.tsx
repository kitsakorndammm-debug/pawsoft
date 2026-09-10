'use client'

import {
  Ban,
  Banknote,
  CreditCard,
  FileText,
  Paperclip,
  Pill,
  QrCode,
  Receipt,
  Send,
  Stethoscope,
  Trash2,
  UserRound,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { FileDrop } from '@/components/common/file-drop'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCan } from '@/features/auth/hooks'
import { useVisitBill } from '@/features/visit/hooks'
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_STYLE,
  PAYMENT_METHOD_LABEL,
  slipUrl,
  type Invoice,
  type InvoiceLine,
  type PaymentMethod,
} from './api'
import {
  useAddPayment,
  useAddPaymentWithSlip,
  useInvoiceByVisit,
  useInvoiceQr,
  useIssueInvoice,
  usePromptPayStatus,
  useRemovePayment,
  useSubmitInvoice,
  useVoidInvoice,
} from './hooks'
import { PromptPayQrView } from './promptpay-qr'
import { toErrorMessage } from '@/lib/api-client'
import { BILLING_COLLECT } from '@/lib/permissions'
import { cn } from '@/lib/utils'

/**
 * เก็บเงินที่เคาน์เตอร์ — **เปิดจากบัตรคิวที่ตรวจเสร็จแล้ว**
 *
 * สองสถานะที่หน้านี้รับมือ:
 *
 *   ยังไม่ออกใบ   ปุ่มเดียว "ออกใบเสร็จ" — ยอดมาจากรายการที่หมอบันทึกไว้
 *   ออกใบแล้ว     รับเงินทีละครั้ง (สด · โอน · QR) แล้วกดส่งให้บัญชี
 *
 * **ไม่มีปุ่มยืนยันที่นี่** — นั่นเป็นของบัญชี ซึ่งอยู่คนละหน้า · เคาน์เตอร์ที่เห็น
 * ปุ่มยืนยันจะกดมัน แล้ว recheck ก็ไม่มีความหมาย
 */
export function PaymentDialog({
  visitId,
  queueNumber,
  open,
  onOpenChange,
}: {
  visitId: number | null
  queueNumber: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const canCollect = useCan(BILLING_COLLECT)

  const { data: invoice, isPending } = useInvoiceByVisit(open ? visitId : null)

  /**
   * รายการของคิว — **ดึงก่อนออกใบด้วย**
   *
   * (ผู้ใช้ทักท้วง 2026-09-01: "ดูสิไม่มีอะไรเลย")
   *
   * รายการอยู่ที่ `visit_service` / `visit_drug` มาตั้งแต่หมอบันทึก · ไม่ต้องรอออกใบ
   * ถึงจะเห็น · เดิมจอนี้ก่อนออกใบว่างเปล่าทั้งที่ข้อมูลมีอยู่แล้ว
   */
  const visitBill = useVisitBill(open && invoice == null ? visitId : null)
  const promptPay = usePromptPayStatus()

  const issue = useIssueInvoice()
  const submit = useSubmitInvoice()
  const removePayment = useRemovePayment()
  const voidInvoice = useVoidInvoice()

  const [discount, setDiscount] = useState('')
  const [pendingRemove, setPendingRemove] = useState<number | null>(null)
  const [pendingVoid, setPendingVoid] = useState(false)

  function close(next: boolean) {
    if (!next) {
      setDiscount('')
      setPendingRemove(null)
      setPendingVoid(false)
    }
    onOpenChange(next)
  }

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn()
      toast.success(done)
    } catch (e) {
      toast.error(toErrorMessage(e))
    }
  }

  const editable = invoice?.status === 'DRAFT' || invoice?.status === 'REJECTED'
  const settled = invoice !== null && invoice !== undefined && Number(invoice.outstanding) <= 0

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="size-5 text-primary-strong" />
              เก็บเงิน — คิว {queueNumber ?? '—'}
              {invoice ? (
                <span
                  className={cn(
                    'rounded px-2 py-0.5 text-xs font-normal',
                    INVOICE_STATUS_STYLE[invoice.status],
                  )}
                >
                  {INVOICE_STATUS_LABEL[invoice.status]}
                </span>
              ) : null}
            </DialogTitle>
          </DialogHeader>

          {isPending ? (
            <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
          ) : !invoice ? (
            /*
             * ยังไม่ออกใบ — **แต่เห็นรายการและยอดแล้ว**
             *
             * (ผู้ใช้ทักท้วง 2026-09-01: "ทำไมจะต้องมีหน้าส่วนลดคั่น")
             *
             * เดิมเป็นหน้าที่มีแต่ช่องส่วนลดกับปุ่ม ซึ่งไม่ได้ตอบอะไรเลย · ส่วนลดเป็น
             * แค่ช่องหนึ่งบนหน้าเดียวกัน ไม่ใช่ขั้นตอนของตัวเอง
             */
            <div className="flex flex-col gap-4">
              <InvoiceLines
                lines={(visitBill.data
                  ? [
                      ...visitBill.data.services.map((r) => ({
                        kind: 'service' as const,
                        name: r.name,
                        quantity: String(r.quantity),
                        unit: null,
                        unitPrice: r.unitPrice,
                        amount: (Number(r.unitPrice) * r.quantity).toFixed(2),
                        dosage: null,
                      })),
                      ...visitBill.data.drugs.map((r) => ({
                        kind: 'drug' as const,
                        name: r.name,
                        quantity: r.quantity,
                        unit: r.unit,
                        unitPrice: r.unitPrice,
                        amount: (Number(r.unitPrice) * Number(r.quantity)).toFixed(2),
                        dosage: r.dosage,
                      })),
                    ]
                  : []) as InvoiceLine[]}
                loading={visitBill.isPending}
              />

              <div className="rounded-lg border bg-card p-3">
                <dl className="flex flex-col gap-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">ยอดรายการ</dt>
                    <dd className="tabular-nums">{visitBill.data?.total ?? '—'}</dd>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <Label htmlFor="inv-discount" className="text-muted-foreground">
                      ส่วนลด (บาท)
                    </Label>
                    <Input
                      id="inv-discount"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      inputMode="decimal"
                      placeholder="0"
                      className="h-8 w-28 text-right"
                      disabled={!canCollect}
                    />
                  </div>

                  <div className="flex justify-between border-t pt-1.5 font-semibold">
                    <dt>ยอดที่ต้องจ่าย</dt>
                    <dd className="tabular-nums">
                      {visitBill.data
                        ? Math.max(
                            Number(visitBill.data.total) - (Number(discount) || 0),
                            0,
                          ).toFixed(2)
                        : '—'}
                    </dd>
                  </div>
                </dl>
              </div>

              {canCollect ? (
                <Button
                  type="button"
                  onClick={() =>
                    void run(
                      () =>
                        issue.mutateAsync({
                          visitId: visitId!,
                          discount: discount.trim() || null,
                          note: null,
                        }),
                      'ออกใบเสร็จแล้ว — รับเงินได้',
                    )
                  }
                  disabled={issue.isPending || visitId === null}
                >
                  <FileText className="size-4" />
                  ออกใบเสร็จแล้วรับเงิน
                </Button>
              ) : (
                <p className="text-sm text-amber-700">ไม่มีสิทธิ์ออกใบเสร็จ</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* รายการมาก่อนยอด — พนักงานอ่านให้ลูกค้าฟังจากบนลงล่าง */}
              <InvoiceLines lines={invoice.lines} />

              <InvoiceSummary invoice={invoice} />

              {invoice.status === 'REJECTED' && invoice.rejectReason ? (
                <div className="rounded-md border border-red-300 bg-red-50 p-2.5 text-sm text-red-900">
                  <span className="font-medium">บัญชีตีกลับ:</span> {invoice.rejectReason}
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-muted-foreground">รับเงินมาแล้ว</p>
                <PaymentList
                  invoice={invoice}
                  editable={editable && canCollect}
                  onRemove={setPendingRemove}
                />
              </div>

              {editable && canCollect && !settled ? (
                <AddPaymentBox
                  invoice={invoice}
                  promptPayReady={promptPay.data?.configured === true}
                />
              ) : null}

              {invoice.status === 'AWAITING_VERIFY' ? (
                <p className="rounded-md bg-amber-50 p-2.5 text-sm text-amber-900">
                  ส่งให้บัญชีตรวจแล้ว — แก้ไม่ได้จนกว่าจะถูกตีกลับ
                </p>
              ) : null}

              {/*
                **บอกว่าเหลืออะไรต้องทำ** — ปุ่มที่กดไม่ได้โดยไม่บอกเหตุผล คือปุ่มที่
                คนกดแล้วคิดว่าระบบพัง
              */}
              {editable && canCollect ? (
                settled ? (
                  <p className="rounded-md bg-emerald-50 p-2.5 text-sm text-emerald-900">
                    เก็บครบแล้ว · กด &ldquo;ส่งให้บัญชีตรวจ&rdquo; เพื่อปิดงาน —
                    หลังส่งแล้วแก้ไม่ได้
                  </p>
                ) : (
                  <p className="rounded-md bg-muted p-2.5 text-sm text-muted-foreground">
                    ยังขาดอีก{' '}
                    <span className="font-medium tabular-nums text-foreground">
                      {invoice.outstanding}
                    </span>{' '}
                    บาท · ส่งให้บัญชีได้เมื่อเก็บครบ
                  </p>
                )
              ) : null}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              ปิด
            </Button>

            {/* ส่งได้ต่อเมื่อเก็บครบ — BE ปฏิเสธอยู่แล้ว แต่ปุ่มที่กดแล้วโดนปฏิเสธไม่ควรมี */}
            {/*
              **ยกเลิกใบได้ตราบที่ยังไม่ส่ง** (ผู้ใช้ทักท้วง 2026-09-01: "บันทึกแล้วแก้
              ก็ไม่ได้ บังคับส่งบัญชีตรวจอย่างเดียว")
              ออกใบผิดคิว หรือส่วนลดผิด ต้องถอยได้ · ไม่งั้นทางเดียวคือส่งของผิดไปให้
              บัญชีแล้วรอถูกตีกลับ ซึ่งเปลืองเวลาสองฝ่าย
            */}
            {invoice && editable && canCollect ? (
              <Button
                type="button"
                variant="outline"
                className="text-destructive"
                onClick={() => setPendingVoid(true)}
                disabled={voidInvoice.isPending}
              >
                <Ban className="size-4" />
                ยกเลิกใบนี้
              </Button>
            ) : null}

            {/*
              **ชื่อปุ่มคงที่เสมอ ไม่เปลี่ยนเป็นป้ายบอกสถานะ** (ผู้ใช้ทักท้วง 2026-09-01:
              "ทำไมปุ่มบันทึกมีสองที่ อะไรยังไงแน่")

              เดิมปุ่มนี้เขียนว่า "ยังขาด 12.50" ตอนเก็บไม่ครบ ซึ่งอ่านเหมือนตัวเลข
              บอกสถานะ ไม่ใช่ปุ่ม · คนจึงไม่รู้ว่ามันต่างจากปุ่ม "บันทึกการรับเงิน"
              ข้างบนยังไง · เหตุผลที่กดไม่ได้ไปอยู่ในข้อความใต้ปุ่มแทน
            */}
            {invoice && editable && canCollect ? (
              <Button
                type="button"
                disabled={!settled || submit.isPending}
                onClick={() =>
                  void run(async () => {
                    await submit.mutateAsync(invoice.id)
                    close(false)
                  }, 'ส่งยอดให้บัญชีแล้ว')
                }
              >
                <Send className="size-4" />
                ส่งให้บัญชีตรวจ
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingVoid}
        onOpenChange={setPendingVoid}
        title="ยกเลิกใบเสร็จ"
        description="ใบนี้จะถูกยกเลิก แล้วออกใบใหม่ให้คิวนี้ได้ · ใช้เมื่อออกใบผิดหรือส่วนลดผิด"
        actionText="ยกเลิกใบ"
        onAction={async () => {
          if (!invoice) return
          await run(async () => {
            await voidInvoice.mutateAsync(invoice.id)
            close(false)
          }, 'ยกเลิกใบเสร็จแล้ว')
        }}
        pending={voidInvoice.isPending}
      />

      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(next) => !next && setPendingRemove(null)}
        title="เอารายการจ่ายออก"
        description="รายการนี้จะถูกลบออกจากใบเสร็จ และยอดที่รับมาจะถูกคิดใหม่"
        actionText="เอาออก"
        onAction={async () => {
          if (pendingRemove === null) return
          await run(() => removePayment.mutateAsync(pendingRemove), 'เอารายการออกแล้ว')
          setPendingRemove(null)
        }}
        pending={removePayment.isPending}
      />
    </>
  )
}

/**
 * รายการที่คิดเงิน — **สิ่งที่พนักงานอ่านให้ลูกค้าฟัง**
 *
 * (ผู้ใช้ทักท้วง 2026-09-01) · ยอดรวมอย่างเดียวตอบคำถาม "ค่าอะไรบ้าง" ไม่ได้
 */
function InvoiceLines({ lines, loading }: { lines: InvoiceLine[]; loading?: boolean }) {
  if (loading) {
    return (
      <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
        กำลังโหลดรายการ…
      </p>
    )
  }

  if (lines.length === 0) {
    /*
      **บอกว่าทำไมว่าง ไม่ใช่ว่างเฉย ๆ** — คิวที่ยังไม่มีรายการคือคิวที่หมอยังไม่ได้
      บันทึกอะไร · คนที่เปิดมาเจอกล่องเปล่าจะไม่รู้ว่าต้องไปทำอะไรต่อ
    */
    return (
      <div className="rounded-md border border-dashed border-amber-300 bg-amber-50/50 p-3 text-center">
        <p className="text-sm font-medium text-amber-900">ยังไม่มีรายการที่คิดเงิน</p>
        <p className="mt-0.5 text-xs text-amber-800">
          หมอยังไม่ได้บันทึกยาหรือรายการรักษาให้คิวนี้ — ออกใบตอนนี้จะได้ยอด 0 บาท
        </p>
      </div>
    )
  }

  return (
    <div className="divide-y rounded-lg border">
      {lines.map((l, i) => (
        <div key={`${l.kind}-${i}`} className="flex items-start gap-2.5 px-3 py-2 text-sm">
          {l.kind === 'drug' ? (
            <Pill className="mt-0.5 size-4 shrink-0 text-primary-strong" />
          ) : (
            <Stethoscope className="mt-0.5 size-4 shrink-0 text-primary-strong" />
          )}

          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{l.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {l.quantity}
              {l.unit ? ` ${l.unit}` : ''} × {l.unitPrice}
              {l.dosage ? ` · ${l.dosage}` : ''}
            </span>
          </span>

          <span className="w-20 shrink-0 text-right tabular-nums">{l.amount}</span>
        </div>
      ))}
    </div>
  )
}

/** ยอดของใบ — ตัวเลขที่ทุกคนดูก่อนอย่างอื่น */
function InvoiceSummary({ invoice }: { invoice: Invoice }) {
  const settled = Number(invoice.outstanding) <= 0

  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="mb-2 text-xs text-muted-foreground">{invoice.code}</p>

      <dl className="flex flex-col gap-1 text-sm">
        <Row label="ยอดรายการ" value={invoice.subtotal} />
        {Number(invoice.discount) > 0 ? (
          <Row label="ส่วนลด" value={`-${invoice.discount}`} className="text-emerald-700" />
        ) : null}
        <Row label="ยอดที่ต้องจ่าย" value={invoice.total} strong />
        <Row label="รับมาแล้ว" value={invoice.paid} />
        <Row
          label={settled ? 'ครบแล้ว' : 'ยังขาด'}
          value={invoice.outstanding}
          strong
          className={settled ? 'text-emerald-700' : 'text-amber-700'}
        />
      </dl>
    </div>
  )
}

function Row({
  label,
  value,
  strong,
  className,
}: {
  label: string
  value: string
  strong?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex justify-between', className)}>
      <dt className={cn(strong ? 'font-medium' : 'text-muted-foreground')}>{label}</dt>
      {/* เงินเป็นข้อความจาก BE — ห้าม `Number()` ตอนแสดง */}
      <dd className={cn('tabular-nums', strong && 'font-semibold')}>{value}</dd>
    </div>
  )
}

function PaymentList({
  invoice,
  editable,
  onRemove,
}: {
  invoice: Invoice
  editable: boolean
  onRemove: (id: number) => void
}) {
  if (invoice.payments.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
        ยังไม่ได้รับเงิน
      </p>
    )
  }

  const icon = (m: PaymentMethod) =>
    m === 'CASH' ? Banknote : m === 'PROMPTPAY' ? QrCode : m === 'CARD' ? CreditCard : Paperclip

  return (
    <div className="divide-y rounded-md border">
      {invoice.payments.map((p) => {
        const Icon = icon(p.method)

        return (
          <div key={p.id} className="flex items-center gap-2.5 px-3 py-2 text-sm">
            <Icon className="size-4 shrink-0 text-primary-strong" />

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                {PAYMENT_METHOD_LABEL[p.method]}
                {/* ลูกค้าแนบเอง — บัญชีต้องแยกออกจากที่พนักงานบันทึก */}
                {p.byOwner ? (
                  <span className="flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary-strong">
                    <UserRound className="size-2.5" />
                    ลูกค้าแนบเอง
                  </span>
                ) : null}
              </span>
              {p.reference || p.promptpayRef ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {p.reference ?? p.promptpayRef}
                </span>
              ) : null}
            </span>

            {p.hasSlip ? (
              <a
                href={slipUrl(p.id)}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-xs text-primary-strong hover:underline"
              >
                ดูสลิป
              </a>
            ) : null}

            <span className="w-20 shrink-0 text-right tabular-nums">{p.amount}</span>

            {editable ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="เอารายการนี้ออก"
                onClick={() => onRemove(p.id)}
                className="text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/**
 * กล่องรับเงิน — **สลับตามวิธีจ่าย**
 *
 * เงินสดกรอกแค่ยอด · โอนแนบสลิปได้ · พร้อมเพย์โชว์ QR ตามยอดค้างแล้วแนบสลิป
 */
/**
 * กล่องรับเงิน — **QR ขึ้นให้เลยตั้งแต่เปิด**
 *
 * (ผู้ใช้ตัดสิน 2026-09-01: "เปิดมาก็ generate QR ให้เลย จะโอนก็ได้ เงินสดก็แล้วแต่อีกที")
 *
 * พร้อมเพย์เป็นค่าตั้งต้นเมื่อตั้ง `.env` ไว้ — ลูกค้าส่วนใหญ่สแกนจ่าย · คนจ่ายสด
 * กดสลับได้ แต่ไม่ต้องรอให้ใครกดก่อน QR ถึงจะขึ้น
 *
 * **ยอดล็อกเต็มจำนวน** — รับครั้งเดียว ไม่แบ่งจ่าย (ดู `addPayment`)
 */
function AddPaymentBox({
  invoice,
  promptPayReady,
}: {
  invoice: Invoice
  promptPayReady: boolean
}) {
  // พร้อมเพย์ก่อนเสมอถ้าตั้งค่าไว้ — ไม่งั้นเงินสด
  const [method, setMethod] = useState<PaymentMethod>(promptPayReady ? 'PROMPTPAY' : 'CASH')
  const [reference, setReference] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const add = useAddPayment()
  const addWithSlip = useAddPaymentWithSlip()

  // ขอ QR ทันทีที่เปิด ถ้าตั้งค่าไว้ — ไม่ต้องรอให้กดเลือกวิธีจ่าย
  const qr = useInvoiceQr(invoice.id, promptPayReady)

  const pending = add.isPending || addWithSlip.isPending
  /**
   * ไม่มี `TRANSFER` — เคาน์เตอร์รับโอนผ่านพร้อมเพย์อยู่แล้ว (สแกนแล้วจบในตัว)
   * ส่วนเคสที่เจ้าของสัตว์ไม่ได้มาเอง โอนเองจากแอปฝั่งลูกค้าได้โดยตรง ไม่ต้องผ่านเคาน์เตอร์
   * (ผู้ใช้ตัดสิน 2026-09-08)
   */
  const methods: PaymentMethod[] = ['PROMPTPAY', 'CASH', 'CARD']

  async function submitPayment() {
    // ยอดมาจากใบเสมอ — ไม่ใช่จากช่องที่คนพิมพ์
    const value = invoice.outstanding

    try {
      const common = {
        id: invoice.id,
        method,
        amount: value,
        reference: reference.trim() || null,
        promptpayRef: method === 'PROMPTPAY' ? (qr.data?.ref ?? null) : null,
        note: null,
      }

      if (file !== null) await addWithSlip.mutateAsync({ ...common, file })
      else await add.mutateAsync(common)

      toast.success('บันทึกการรับเงินแล้ว')
      setFile(null)
      setReference('')
    } catch (e) {
      toast.error(toErrorMessage(e))
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
      {/* วิธีจ่าย + ยอด อยู่แถวเดียวกัน — ประหยัดที่ และอ่านเป็นประโยคเดียว */}
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label>วิธีจ่าย</Label>
          <div className="grid grid-cols-4 gap-1">
            {methods.map((m) => {
              const disabled = m === 'PROMPTPAY' && !promptPayReady

              return (
                <button
                  key={m}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setMethod(m)
                    if (m === 'CASH') setFile(null)
                  }}
                  className={cn(
                    'rounded-md border px-1.5 py-1.5 text-xs transition-colors',
                    method === m
                      ? 'border-primary bg-primary/10 font-medium'
                      : 'border-input hover:bg-muted',
                    disabled && 'cursor-not-allowed opacity-40',
                  )}
                  title={disabled ? 'ยังไม่ได้ตั้ง PROMPTPAY_TARGET ใน .env' : undefined}
                >
                  {PAYMENT_METHOD_LABEL[m]}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex w-32 shrink-0 flex-col gap-1.5">
          <Label htmlFor="pay-amount">จำนวนเงิน</Label>
          <Input
            id="pay-amount"
            value={invoice.outstanding}
            readOnly
            className="text-right font-medium tabular-nums"
          />
        </div>
      </div>

      {/* QR กับช่องแนบสลิปอยู่ข้างกัน — สแกนแล้วแนบต่อได้เลยโดยไม่ต้องเลื่อน */}
      {method === 'PROMPTPAY' && promptPayReady ? (
        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          {qr.isPending ? (
            <p className="text-sm text-muted-foreground">กำลังสร้าง QR…</p>
          ) : qr.isError ? (
            <p className="text-sm text-destructive">{toErrorMessage(qr.error)}</p>
          ) : qr.data ? (
            <PromptPayQrView
              payload={qr.data.payload}
              amount={qr.data.amount}
              invoiceCode={invoice.code}
            />
          ) : null}

          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-ref">เลขอ้างอิง</Label>
              <Input
                id="pay-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="จากสลิปธนาคาร"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>แนบสลิป</Label>
              <FileDrop value={file} onChange={setFile} disabled={pending} id="pay-slip" />
            </div>
          </div>
        </div>
      ) : method !== 'CASH' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pay-ref">เลขอ้างอิง</Label>
            <Input
              id="pay-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="จากสลิปธนาคาร"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>แนบสลิป</Label>
            <FileDrop value={file} onChange={setFile} disabled={pending} id="pay-slip" />
          </div>
        </div>
      ) : null}

      <Button type="button" onClick={submitPayment} disabled={pending}>
        <Banknote className="size-4" />
        {pending ? 'กำลังบันทึก…' : `รับเงิน ${invoice.outstanding} บาท`}
      </Button>
    </div>
  )
}
