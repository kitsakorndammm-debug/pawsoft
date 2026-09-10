'use client'

import { CheckCircle2, Receipt, Undo2, UserRound, Wallet } from 'lucide-react'
import { useQueryState } from 'nuqs'
import { Suspense, useState } from 'react'
import { toast } from 'sonner'

import { AppDatePicker } from '@/components/common/app-date-picker'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DataTable, type DataTableColumn } from '@/components/common/data-table'
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
import {
  INVOICE_PAGE_SIZE,
  useInvoices,
  useRejectInvoice,
  useVerifyInvoice,
} from '@/features/payment/hooks'
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_STYLE,
  PAYMENT_METHOD_LABEL,
  slipUrl,
  type Invoice,
  type InvoiceStatus,
} from '@/features/payment/api'
import { toErrorMessage } from '@/lib/api-client'
import { BILLING_VERIFY } from '@/lib/permissions'
import { cn } from '@/lib/utils'

/**
 * หน้าของ**บัญชี** — ตรวจยอดที่เคาน์เตอร์ส่งมา
 *
 * (ผู้ใช้กำหนด 2026-09-01: "จะมีบัญชีมายืนยันยอดอีกทีนึงหลังจากที่เคาน์เตอร์ส่งยอดแล้ว
 * เป็นระบบ recheck ของคลินิก")
 *
 * **แยกจากหน้าคิวโดยตั้งใจ** — คนที่ทำงานตรงนี้ไม่ได้ยุ่งกับคิว และคนที่ยุ่งกับคิว
 * ไม่ควรเห็นปุ่มยืนยัน · ตั้งต้นที่ตัวกรอง "รอตรวจ" เพราะนั่นคืองานค้างของเขา
 */
function BillingBoard() {
  const canVerify = useCan(BILLING_VERIFY)

  const [status, setStatus] = useQueryState('status', {
    defaultValue: 'AWAITING_VERIFY',
    clearOnDefault: true,
  })
  const [date, setDate] = useQueryState('date', { defaultValue: '', clearOnDefault: true })
  const [page, setPage] = useQueryState('page', {
    defaultValue: 1,
    clearOnDefault: true,
    parse: (v) => Math.max(Number(v) || 1, 1),
    serialize: String,
  })

  const { data, isPending, isFetching, isError, error } = useInvoices({
    status: (status || null) as InvoiceStatus | null,
    date: date || null,
    page,
  })

  const verify = useVerifyInvoice()

  const [detail, setDetail] = useState<Invoice | null>(null)
  const [pendingVerify, setPendingVerify] = useState<Invoice | null>(null)
  const [rejecting, setRejecting] = useState<Invoice | null>(null)

  const rows = data?.rows ?? []

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn()
      toast.success(done)
    } catch (e) {
      toast.error(toErrorMessage(e))
    }
  }

  const FILTERS: { value: string; label: string }[] = [
    { value: 'AWAITING_VERIFY', label: 'รอตรวจ' },
    { value: 'VERIFIED', label: 'ยืนยันแล้ว' },
    { value: 'REJECTED', label: 'ตีกลับ' },
    { value: '', label: 'ทั้งหมด' },
  ]

  const columns: DataTableColumn<Invoice>[] = [
    { key: 'code', title: 'เลขที่', width: 160, dataIndex: 'code' },
    {
      key: 'total',
      title: 'ยอด',
      width: 110,
      align: 'right',
      /* เงินเป็นข้อความจาก BE — แสดงตรง ๆ */
      render: (row) => <span className="font-medium tabular-nums">{row.total}</span>,
    },
    {
      key: 'paid',
      title: 'รับมา',
      width: 110,
      align: 'right',
      render: (row) => <span className="tabular-nums">{row.paid}</span>,
    },
    {
      key: 'methods',
      title: 'วิธีจ่าย',
      truncate: true,
      render: (row) => (
        <span className="flex flex-wrap items-center gap-1 text-xs">
          {row.payments.map((p) => (
            <span key={p.id} className="rounded bg-muted px-1.5 py-0.5">
              {PAYMENT_METHOD_LABEL[p.method]}
              {p.hasSlip ? ' 📎' : ''}
            </span>
          ))}
          {/* ลูกค้าแนบเอง — สิ่งที่บัญชีต้องดูให้ละเอียดกว่าปกติ */}
          {row.payments.some((p) => p.byOwner) ? (
            <span className="flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-primary-strong">
              <UserRound className="size-3" />
              ลูกค้าแนบ
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'status',
      title: 'สถานะ',
      width: 150,
      align: 'center',
      render: (row) => {
        /**
         * เก็บครบแล้วแต่ยังไม่ถูกส่ง — ป้ายเดิม "กำลังเก็บเงิน" อ่านเหมือนยังไม่มีอะไร
         * เกิดขึ้น ทั้งที่ลูกค้าโอนมาครบแล้ว รอแค่เคาน์เตอร์กด "ส่งให้บัญชีตรวจ" ที่หน้าคิว
         * (ผู้ใช้ทักท้วง 2026-09-08: "อันนี้ควรอยู่ตำแหน่งรอตรวจรึเปล่า")
         */
        const fullyPaidDraft = row.status === 'DRAFT' && Number(row.outstanding) <= 0

        return (
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-xs',
              fullyPaidDraft
                ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300'
                : INVOICE_STATUS_STYLE[row.status],
            )}
          >
            {fullyPaidDraft ? 'ชำระครบ · รอส่งบัญชี' : INVOICE_STATUS_LABEL[row.status]}
          </span>
        )
      },
    },
    {
      key: 'createdAt',
      title: 'ออกใบเมื่อ',
      width: 150,
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.createdAt).toLocaleString('th-TH')}
        </span>
      ),
    },
    {
      key: 'submittedAt',
      title: 'ส่งเมื่อ',
      width: 150,
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.submittedAt === null ? '—' : new Date(row.submittedAt).toLocaleString('th-TH')}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '',
      width: 190,
      align: 'right',
      fixed: 'right',
      render: (row) => (
        <div
          className="flex items-center justify-end gap-1"
          onClick={(e) => e.stopPropagation()}
          role="presentation"
        >
          {canVerify && row.status === 'AWAITING_VERIFY' ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="success"
                onClick={() => setPendingVerify(row)}
                disabled={verify.isPending}
              >
                <CheckCircle2 className="size-3.5" />
                ยืนยัน
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={() => setRejecting(row)}
              >
                <Undo2 className="size-3.5" />
                ตีกลับ
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => setDetail(row)}>
              ดู
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Wallet className="size-5 text-primary-strong" />
          การเงิน
        </h1>

        <div className="flex gap-1 rounded-md bg-muted p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => {
                void setStatus(f.value)
                void setPage(1)
              }}
              className={cn(
                'rounded px-2.5 py-1 text-xs transition-colors',
                status === f.value
                  ? 'bg-background font-medium shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <AppDatePicker
            value={date}
            onChange={(v) => void setDate(v ?? '')}
            className="w-40"
            aria-label="ดูใบเสร็จของวันที่"
          />
          {date ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => void setDate('')}>
              ทุกวัน
            </Button>
          ) : null}
        </div>
      </div>

      <DataTable<Invoice>
        className="min-h-0 flex-1"
        columns={columns}
        data={rows}
        loading={isPending}
        fetching={isFetching}
        onRowClick={setDetail}
        rowClassName={(row) =>
          row.status === 'AWAITING_VERIFY' ||
          (row.status === 'DRAFT' && Number(row.outstanding) <= 0)
            ? 'bg-amber-50/40'
            : undefined
        }
        emptyText={
          isError
            ? toErrorMessage(error)
            : status === 'AWAITING_VERIFY'
              ? 'ไม่มีใบที่รอตรวจ'
              : 'ไม่มีใบเสร็จ'
        }
        pagination={{
          page: data?.page.page ?? page,
          limit: data?.page.pageSize ?? INVOICE_PAGE_SIZE,
          total: data?.page.total ?? 0,
          onPageChange: setPage,
        }}
      />

      <InvoiceDetailDialog
        invoice={detail}
        open={detail !== null}
        onOpenChange={(next) => !next && setDetail(null)}
      />

      <ConfirmDialog
        open={pendingVerify !== null}
        onOpenChange={(next) => !next && setPendingVerify(null)}
        title="ยืนยันยอด"
        description={`ยืนยันว่ายอด ${pendingVerify?.total ?? ''} บาทของ ${pendingVerify?.code ?? ''} ถูกต้องและรับเงินครบแล้ว — หลังจากนี้แก้ไม่ได้อีก`}
        actionText="ยืนยันยอด"
        onAction={async () => {
          if (!pendingVerify) return
          await run(() => verify.mutateAsync(pendingVerify.id), `ยืนยัน ${pendingVerify.code} แล้ว`)
          setPendingVerify(null)
        }}
        pending={verify.isPending}
      />

      <RejectDialog
        invoice={rejecting}
        open={rejecting !== null}
        onOpenChange={(next) => !next && setRejecting(null)}
        onDone={() => setRejecting(null)}
      />
    </div>
  )
}

/** กล่องดูรายละเอียด — อ่านอย่างเดียว */
function InvoiceDetailDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: Invoice | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="size-5 text-primary-strong" />
            {invoice?.code}
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

        {invoice ? (
          <div className="flex flex-col gap-3">
            <dl className="flex flex-col gap-1 rounded-md border bg-card p-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">ยอดรายการ</dt>
                <dd className="tabular-nums">{invoice.subtotal}</dd>
              </div>
              {Number(invoice.discount) > 0 ? (
                <div className="flex justify-between text-emerald-700">
                  <dt>ส่วนลด</dt>
                  <dd className="tabular-nums">-{invoice.discount}</dd>
                </div>
              ) : null}
              <div className="flex justify-between font-medium">
                <dt>ยอดที่ต้องจ่าย</dt>
                <dd className="tabular-nums">{invoice.total}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">รับมาแล้ว</dt>
                <dd className="tabular-nums">{invoice.paid}</dd>
              </div>
            </dl>

            {invoice.rejectReason ? (
              <div className="rounded-md border border-red-300 bg-red-50 p-2.5 text-sm text-red-900">
                <span className="font-medium">เหตุผลที่ตีกลับ:</span> {invoice.rejectReason}
              </div>
            ) : null}

            {/* เวลาทุกขั้น — ผู้ใช้ขอ 2026-09-08: "ควรขึ้นเวลาบอกทุกอย่าง" */}
            <dl className="flex flex-col gap-1 text-xs text-muted-foreground">
              <div className="flex justify-between gap-2">
                <dt>ออกใบเมื่อ</dt>
                <dd>{new Date(invoice.createdAt).toLocaleString('th-TH')}</dd>
              </div>
              {invoice.submittedAt ? (
                <div className="flex justify-between gap-2">
                  <dt>ส่งให้บัญชีตรวจเมื่อ</dt>
                  <dd>{new Date(invoice.submittedAt).toLocaleString('th-TH')}</dd>
                </div>
              ) : null}
              {invoice.verifiedAt ? (
                <div className="flex justify-between gap-2">
                  <dt>ยืนยันยอดเมื่อ</dt>
                  <dd>{new Date(invoice.verifiedAt).toLocaleString('th-TH')}</dd>
                </div>
              ) : null}
            </dl>

            <div className="divide-y rounded-md border">
              {invoice.payments.map((p) => (
                <div key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {PAYMENT_METHOD_LABEL[p.method]}
                      {p.byOwner ? (
                        <span className="rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary-strong">
                          ลูกค้าแนบเอง
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {new Date(p.receivedAt).toLocaleString('th-TH')}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </span>
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

                  <span className="w-20 text-right tabular-nums">{p.amount}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** ตีกลับ — **ต้องบอกเหตุผล** ฐานบังคับไว้ */
function RejectDialog({
  invoice,
  open,
  onOpenChange,
  onDone,
}: {
  invoice: Invoice | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const reject = useRejectInvoice()
  const [reason, setReason] = useState('')

  function close(next: boolean) {
    if (!next) setReason('')
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ตีกลับ {invoice?.code}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reject-reason">เหตุผล</Label>
          <Input
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เช่น สลิปอ่านไม่ออก · ยอดไม่ตรง"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            เคาน์เตอร์จะเห็นข้อความนี้แล้วแก้ใบก่อนส่งใหม่
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            ยกเลิก
          </Button>
          <Button
            type="button"
            className="text-destructive"
            variant="outline"
            disabled={reason.trim() === '' || reject.isPending}
            onClick={async () => {
              if (!invoice) return
              try {
                await reject.mutateAsync({ id: invoice.id, reason: reason.trim() })
                toast.success(`ตีกลับ ${invoice.code} แล้ว`)
                close(false)
                onDone()
              } catch (e) {
                toast.error(toErrorMessage(e))
              }
            }}
          >
            ตีกลับ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function BillingPage() {
  // `useQueryState` อ่าน URL — ไม่ห่อ `Suspense` แล้ว `next build` พังทั้งหน้า
  return (
    <Suspense fallback={null}>
      <BillingBoard />
    </Suspense>
  )
}
