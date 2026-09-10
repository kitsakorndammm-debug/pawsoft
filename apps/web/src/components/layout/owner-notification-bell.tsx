'use client'

import { Bell } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SLOT_LABEL } from '@/features/appointment/api'
import { useMyAppointments, useMySlots } from '@/features/appointment/hooks'
import { type MyInvoice } from '@/features/payment/my-api'
import { useMyInvoices } from '@/features/payment/my-hooks'
import { formatDate } from '@/lib/format'
import { ROUTE_OWNER_BOOKINGS, ROUTE_OWNER_INVOICES } from '@/lib/routes'

const POLL_MS = 30_000

/**
 * กระดิ่งแจ้งเตือนฝั่งลูกค้า — อยู่ในแถบบนของ `OwnerShell` (ผู้ใช้ตัดสิน 2026-09-09)
 *
 * **คนละเรื่องกับกระดิ่งฝั่งพนักงาน** — ที่นั่นแจ้งว่า "มีงานให้ทำ" ที่นี่แจ้งแค่
 * "สถานะของคุณเปลี่ยน" สองเรื่อง:
 *
 *   นัดที่ยืนยันแล้ว รอวันมา — เตือนไว้ก่อนถึงวันนัด ไม่ต้องเปิดแอปมาเช็คเอง
 *   ใบเสร็จที่ยังไม่จ่าย — ยอดค้างจริง (`DRAFT`) หรือสลิปที่ถูกตีกลับ (`REJECTED`)
 *
 * **ไม่มีปุ่มกดจบในตัวเหมือนฝั่งพนักงาน** — จ่ายเงินต้องเลือกวิธีจ่ายและอาจต้องแนบสลิป
 * ยัดฟอร์มทั้งชุดลงกล่องเล็ก ๆ นี้ไม่ไหว จึงพาไปหน้าใบเสร็จแทน
 */
export function OwnerNotificationBell() {
  const slots = useMySlots()
  const appointments = useMyAppointments(1, { refetchInterval: POLL_MS })
  const invoices = useMyInvoices(1, { refetchInterval: POLL_MS })

  const today = slots.data?.today ?? ''

  // นัดที่ยืนยันแล้วและยังไม่ถึงวัน หรือถึงวันนี้พอดี — ยืนยันแล้วแต่เลยวันมาไม่แจ้งอีก
  const upcoming = (appointments.data?.rows ?? []).filter(
    (a) => a.status === 'BOOKED' && today !== '' && a.bookedOn >= today,
  )

  // ยอดค้างจริง — เก็บเงินอยู่ (DRAFT) หรือสลิปโดนตีกลับ (REJECTED) เท่านั้นที่ต้องจ่าย
  const unpaid = (invoices.data?.rows ?? []).filter(
    (inv) => (inv.status === 'DRAFT' || inv.status === 'REJECTED') && Number(inv.outstanding) > 0,
  )

  const count = upcoming.length + unpaid.length

  if (!slots.data && !appointments.data && !invoices.data) return null

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="relative shrink-0 text-muted-foreground"
            aria-label={count > 0 ? `การแจ้งเตือน ${count} รายการ` : 'การแจ้งเตือน'}
            title="การแจ้งเตือน"
          >
            <Bell className="size-4" />
            {count > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
                {count > 9 ? '9+' : count}
              </span>
            ) : null}
          </Button>
        }
      />

      <PopoverContent align="end" className="flex w-72 max-w-[85vw] flex-col gap-3">
        {count === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">ไม่มีการแจ้งเตือน</p>
        ) : (
          <>
            {unpaid.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>ใบเสร็จที่ยังไม่จ่าย</span>
                  <span>{unpaid.length} รายการ</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {unpaid.map((inv) => (
                    <InvoiceRow key={inv.id} invoice={inv} />
                  ))}
                </div>
              </div>
            ) : null}

            {upcoming.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>นัดที่ยืนยันแล้ว</span>
                  <span>{upcoming.length} รายการ</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {upcoming.map((a) => (
                    <Link
                      key={a.id}
                      href={ROUTE_OWNER_BOOKINGS}
                      className="rounded-md border p-2 text-sm hover:bg-muted"
                    >
                      <p className="font-medium">{a.displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(a.bookedOn)} · {SLOT_LABEL[a.slot]}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

function InvoiceRow({ invoice }: { invoice: MyInvoice }) {
  return (
    <Link
      href={`${ROUTE_OWNER_INVOICES}/${invoice.id}`}
      className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50/60 p-2 text-sm hover:bg-amber-50"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {invoice.visit.petName ?? `คิว ${invoice.visit.queueNumber}`}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDate(invoice.visit.queueDate)} · ค้าง {invoice.outstanding} บาท
        </p>
      </div>
      <span className="shrink-0 text-xs font-medium text-amber-800">จ่ายเลย</span>
    </Link>
  )
}
