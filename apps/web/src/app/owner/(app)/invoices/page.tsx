'use client'

import { Receipt } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { INVOICE_STATUS_LABEL, INVOICE_STATUS_STYLE } from '@/features/payment/api'
import type { MyInvoice } from '@/features/payment/my-api'
import { useMyInvoices } from '@/features/payment/my-hooks'
import { useOwnerMe } from '@/features/owner-auth/hooks'
import { ROUTE_OWNER_LOGIN, routeOwnerInvoice } from '@/lib/routes'
import { cn } from '@/lib/utils'

/**
 * ใบเสร็จของฉัน — **ทางเข้าฝั่งลูกค้าของการชำระเงิน**
 *
 * (ผู้ใช้กำหนด 2026-09-01: "ลูกค้ากดที่หน้าจอตัวเองด้วย")
 *
 * **ใบที่ยังค้างขึ้นก่อนและเน้นสี** — คนที่เปิดหน้านี้เปิดเพราะจะจ่าย ไม่ได้เปิดมาอ่าน
 * ประวัติ · ใบเก่าที่จ่ายครบแล้วอยู่ล่างสุดแบบจาง ๆ
 */
export default function MyInvoicesPage() {
  const { data: session, isLoading } = useOwnerMe()
  const router = useRouter()
  const invoices = useMyInvoices(1)

  useEffect(() => {
    if (!isLoading && !session) router.replace(ROUTE_OWNER_LOGIN)
  }, [session, isLoading, router])

  if (isLoading || !session) {
    return (
      <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
    )
  }

  const rows = invoices.data?.rows ?? []
  const unpaid = rows.filter((r) => Number(r.outstanding) > 0)
  const settled = rows.filter((r) => Number(r.outstanding) <= 0)

  return (
    <div className="flex flex-col gap-5">
      <h1 className="flex items-center gap-2 text-lg font-semibold">
        <Receipt className="size-5 text-primary" />
        ใบเสร็จของฉัน
      </h1>

      {invoices.isPending ? (
        <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          ยังไม่มีใบเสร็จ — จะมีหลังจากพาสัตว์มารักษาและเจ้าหน้าที่ออกใบให้
        </p>
      ) : (
        <>
          {unpaid.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">ยังค้างชำระ</h2>
              {unpaid.map((r) => (
                <InvoiceCard key={r.id} row={r} highlight />
              ))}
            </section>
          ) : null}

          {settled.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">ประวัติ</h2>
              {settled.map((r) => (
                <InvoiceCard key={r.id} row={r} />
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}

function InvoiceCard({ row, highlight }: { row: MyInvoice; highlight?: boolean }) {
  return (
    <Link
      href={routeOwnerInvoice(row.id)}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50',
        highlight ? 'border-primary/40 bg-primary/5' : 'opacity-80',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {row.visit.petName ?? 'สัตว์เลี้ยง'}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {row.visit.queueDate}
          </span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {row.code} · ออกใบเมื่อ {new Date(row.createdAt).toLocaleString('th-TH')}
        </p>
      </div>

      <div className="flex flex-col items-end gap-1">
        <span className="font-semibold tabular-nums">{row.total}</span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-medium',
            INVOICE_STATUS_STYLE[row.status],
          )}
        >
          {Number(row.outstanding) > 0 ? `ค้าง ${row.outstanding}` : INVOICE_STATUS_LABEL[row.status]}
        </span>
      </div>
    </Link>
  )
}
