'use client'

import { Pill, Stethoscope, UserRound, Wallet } from 'lucide-react'
import { useQueryState } from 'nuqs'
import { Suspense, useState } from 'react'

import { AppDatePicker } from '@/components/common/app-date-picker'
import { DataTable, type DataTableColumn } from '@/components/common/data-table'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_STYLE,
  PAYMENT_METHOD_LABEL,
  slipUrl,
  type Invoice,
  type InvoiceLine,
  type InvoiceStatus,
} from '@/features/payment/api'
import { HISTORY_PAGE_SIZE, usePaymentHistory, usePaymentHistoryDetail } from '@/features/history/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * ประวัติการเงิน — ใบเสร็จ/การชำระเงินทั้งหมด (ผู้ใช้ตัดสิน 2026-09-18)
 *
 * **อ่านอย่างเดียว** — ไม่มีปุ่มยืนยัน/ตีกลับเหมือนหน้า "การเงิน" ของบัญชี (ต้องมีสิทธิ์
 * `main:billing:verify` เฉพาะ) หน้านี้เปิดให้พนักงานทุกคนดูย้อนหลังได้อย่างเดียว
 */
const FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'AWAITING_VERIFY', label: 'รอตรวจ' },
  { value: 'VERIFIED', label: 'ยืนยันแล้ว' },
  { value: 'REJECTED', label: 'ตีกลับ' },
  { value: 'VOID', label: 'ยกเลิก' },
]

function PaymentHistoryBoard() {
  const [status, setStatus] = useQueryState('status', { defaultValue: '', clearOnDefault: true })
  const [date, setDate] = useQueryState('date', { defaultValue: '', clearOnDefault: true })
  const [page, setPage] = useQueryState('page', {
    defaultValue: 1,
    clearOnDefault: true,
    parse: (v) => Math.max(Number(v) || 1, 1),
    serialize: String,
  })

  const { data, isPending, isFetching, isError, error } = usePaymentHistory({
    status: (status || null) as InvoiceStatus | null,
    date: date || null,
    page,
  })

  const [detailId, setDetailId] = useState<number | null>(null)
  const rows = data?.rows ?? []

  const columns: DataTableColumn<Invoice>[] = [
    { key: 'code', title: 'เลขที่', width: 160, dataIndex: 'code' },
    {
      key: 'customer',
      title: 'ลูกค้า',
      truncate: true,
      render: (row) => (
        <span className="flex flex-col">
          <span className="truncate">{row.visit.ownerName ?? '—'}</span>
          <span className="truncate text-xs text-muted-foreground">
            {row.visit.petName ?? 'ไม่ระบุสัตว์'}
          </span>
        </span>
      ),
    },
    {
      key: 'total',
      title: 'ยอด',
      width: 110,
      align: 'right',
      render: (row) => <span className="font-medium tabular-nums">{row.total}</span>,
    },
    {
      key: 'status',
      title: 'สถานะ',
      width: 130,
      align: 'center',
      render: (row) => (
        <span className={cn('rounded px-1.5 py-0.5 text-xs', INVOICE_STATUS_STYLE[row.status])}>
          {INVOICE_STATUS_LABEL[row.status]}
        </span>
      ),
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
  ]

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Wallet className="size-5 text-primary-strong" />
          ประวัติการเงิน
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

        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
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
        onRowClick={(row) => setDetailId(row.id)}
        emptyText={isError ? toErrorMessage(error) : 'ยังไม่มีใบเสร็จ'}
        pagination={{
          page: data?.page.page ?? page,
          limit: data?.page.pageSize ?? HISTORY_PAGE_SIZE,
          total: data?.page.total ?? 0,
          onPageChange: setPage,
        }}
      />

      <PaymentDetailDialog
        invoiceId={detailId}
        open={detailId !== null}
        onOpenChange={(next) => !next && setDetailId(null)}
      />
    </div>
  )
}

function InvoiceLineRow({ line }: { line: InvoiceLine }) {
  return (
    <div className="flex items-start gap-2 border-b px-3 py-2 text-sm last:border-b-0">
      {line.kind === 'drug' ? (
        <Pill className="mt-0.5 size-3.5 shrink-0 text-primary-strong" />
      ) : (
        <Stethoscope className="mt-0.5 size-3.5 shrink-0 text-primary-strong" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium">{line.name}</p>
        <p className="text-xs text-muted-foreground">
          {line.quantity}
          {line.unit ? ` ${line.unit}` : ''} × {line.unitPrice}
          {line.dosage ? ` · ${line.dosage}` : ''}
        </p>
      </div>
      <span className="shrink-0 tabular-nums">{line.amount}</span>
    </div>
  )
}

/** กล่องดูรายละเอียด — อ่านอย่างเดียว ไม่มีปุ่มยืนยัน/ตีกลับ */
function PaymentDetailDialog({
  invoiceId,
  open,
  onOpenChange,
}: {
  invoiceId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: invoice, isPending, isError, error } = usePaymentHistoryDetail(open ? invoiceId : null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="size-5 text-primary-strong" />
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

        {isPending ? (
          <p className="py-4 text-center text-sm text-muted-foreground">กำลังโหลด…</p>
        ) : isError ? (
          <p className="text-sm text-destructive">{toErrorMessage(error)}</p>
        ) : invoice ? (
          <div className="flex flex-col gap-3 text-left">
            <div className="flex items-center gap-2 rounded-md border bg-card p-3 text-sm">
              <UserRound className="size-4 shrink-0 text-primary-strong" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">
                  {invoice.visit.ownerName ?? 'ไม่ระบุเจ้าของ'}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {invoice.visit.petName ?? 'ไม่ระบุสัตว์'}
                  {invoice.visit.ownerPhone ? ` · ${invoice.visit.ownerPhone}` : ''} · คิว{' '}
                  {invoice.visit.queueNumber} · {formatDate(invoice.visit.queueDate)}
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-md border">
              {invoice.lines.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">ไม่มีรายการ</p>
              ) : (
                invoice.lines.map((line, i) => <InvoiceLineRow key={i} line={line} />)
              )}
            </div>

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
              <div className="flex justify-between font-medium text-foreground">
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

export default function PaymentHistoryPage() {
  return (
    <Suspense fallback={null}>
      <PaymentHistoryBoard />
    </Suspense>
  )
}
