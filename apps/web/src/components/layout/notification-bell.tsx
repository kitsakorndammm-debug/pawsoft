'use client'

import { Bell } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SLOT_LABEL, type AppointmentRow } from '@/features/appointment/api'
import { useAppointments, useConfirmAppointment } from '@/features/appointment/hooks'
import { useCan } from '@/features/auth/hooks'
import { type DrugStockBalance } from '@/features/drug-stock/api'
import { useDrugStockBalances } from '@/features/drug-stock/hooks'
import { type Invoice } from '@/features/payment/api'
import { useInvoices, useVerifyInvoice } from '@/features/payment/hooks'
import { type QueueRow } from '@/features/visit/api'
import { useCallVisit, useQueue } from '@/features/visit/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { formatDate } from '@/lib/format'
import { BILLING_VERIFY, DRUG_STOCK_READ, MEDICAL_WRITE, RECEPTION_WRITE } from '@/lib/permissions'
import { ROUTE_APPOINTMENTS, ROUTE_BILLING, ROUTE_DRUG_STOCK, ROUTE_QUEUE } from '@/lib/routes'

const POLL_MS = 20_000

/**
 * กระดิ่งแจ้งเตือน — อยู่ข้าง ๆ ปุ่มออกจากระบบ (ผู้ใช้ตัดสิน 2026-09-09)
 *
 * **คนละเรื่องคนละสิทธิ์ ต้องมีของตัวเอง ไม่ใช่กระดิ่งเดียวแจ้งทุกอย่างให้ทุกคน**
 * เคาน์เตอร์ต้องยืนยันใบจอง · บัญชีต้องตรวจยอด · หมอต้องรู้ว่ามีเคสฉุกเฉินรอ ·
 * คนดูคลังยาต้องรู้ว่ายาหมด — สี่เรื่องนี้ไม่มีใครอยากเห็นของอีกฝ่าย และคนที่ไม่มีสิทธิ์
 * ทำอะไรกับมันไม่ควรเห็น ปุ่มที่กดแล้วโดนปฏิเสธ (403) จึงกรองแต่ละส่วนด้วย permission
 * ของ action นั้นเอง ไม่ใช่ permission ของการ "ดู" เฉย ๆ (ยกเว้นสต็อกยาที่เป็นข้อมูลอ่าน
 * ล้วน ๆ จึงกรองด้วย `main:drug-stock:read`)
 *
 * **poll ทุก 20 วิ ไม่ใช่ websocket** — เหตุผลเดียวกับจอคิว (`useQueue`) ไม่มี
 * โครงสร้าง realtime ในระบบนี้ และของแบบนี้ไม่จำเป็นต้องไวระดับวินาที
 */
export function NotificationBell() {
  const canConfirmAppointments = useCan(RECEPTION_WRITE)
  const canVerifyBilling = useCan(BILLING_VERIFY)
  const canTreat = useCan(MEDICAL_WRITE)
  const canSeeStock = useCan(DRUG_STOCK_READ)

  // ไม่มีสิทธิ์แม้แต่ข้อเดียว = ไม่มีกระดิ่งให้เห็นเลย ไม่ใช่กระดิ่งว่างเปล่า
  if (!canConfirmAppointments && !canVerifyBilling && !canTreat && !canSeeStock) return null

  return (
    <NotificationBellContent
      canConfirmAppointments={canConfirmAppointments}
      canVerifyBilling={canVerifyBilling}
      canTreat={canTreat}
      canSeeStock={canSeeStock}
    />
  )
}

function NotificationBellContent({
  canConfirmAppointments,
  canVerifyBilling,
  canTreat,
  canSeeStock,
}: {
  canConfirmAppointments: boolean
  canVerifyBilling: boolean
  canTreat: boolean
  canSeeStock: boolean
}) {
  /**
   * เรียก hook ทุกตัวเสมอ (กฎ hook) แต่ query จริงเฉพาะตอนมีสิทธิ์ — `enabled` ปิดไว้
   * เมื่อไม่มีสิทธิ์ กันยิง request ที่รู้อยู่แล้วว่าโดน 403
   */
  const appointments = useAppointments(
    { bookedOn: null, status: 'PENDING', page: 1 },
    { refetchInterval: canConfirmAppointments ? POLL_MS : undefined },
  )
  const invoices = useInvoices(
    { status: 'AWAITING_VERIFY', date: null, page: 1 },
    { refetchInterval: canVerifyBilling ? POLL_MS : undefined },
  )
  // `useQueue` poll ทุก 15 วิให้เองอยู่แล้ว (ดูคอมเมนต์บนตัวมันเอง)
  const queue = useQueue(null)
  const stock = useDrugStockBalances('', { refetchInterval: canSeeStock ? POLL_MS : undefined })

  const confirm = useConfirmAppointment()
  const verify = useVerifyInvoice()
  const call = useCallVisit()

  const appointmentRows = canConfirmAppointments
    ? [...(appointments.data?.rows ?? [])].sort((a, b) => a.id - b.id)
    : []
  const appointmentCount = canConfirmAppointments ? (appointments.data?.page.total ?? 0) : 0

  const invoiceRows = canVerifyBilling ? (invoices.data?.rows ?? []) : []
  const invoiceCount = canVerifyBilling ? (invoices.data?.page.total ?? 0) : 0

  /** เฉพาะที่ยังรอเรียก — ตัวที่กำลังตรวจอยู่แล้วไม่ใช่งานค้างของหมออีกคน */
  const emergencyRows = canTreat
    ? (queue.data ?? []).filter((r) => r.status === 'WAITING' && r.triage === 'EMERGENCY')
    : []

  /** ยาที่ยอดคงเหลือหมดหรือติดลบ — สัญญาณว่าต้องไปบันทึกรับเข้าจริง (ดูหน้าคลังยา) */
  const lowStockRows = canSeeStock
    ? (stock.data ?? []).filter((d) => Number(d.quantity) <= 0)
    : []

  const totalCount = appointmentCount + invoiceCount + emergencyRows.length + lowStockRows.length

  async function handleConfirm(id: number, name: string) {
    try {
      await confirm.mutateAsync(id)
      toast.success(`ยืนยันคิวของ ${name} แล้ว`)
    } catch (e) {
      toast.error(toErrorMessage(e))
    }
  }

  async function handleVerify(id: number, code: string) {
    try {
      await verify.mutateAsync(id)
      toast.success(`ยืนยัน ${code} แล้ว`)
    } catch (e) {
      toast.error(toErrorMessage(e))
    }
  }

  async function handleCall(id: number, name: string) {
    try {
      await call.mutateAsync({ id, vetEmployeeId: null })
      toast.success(`เรียกคิว ${name} แล้ว`)
    } catch (e) {
      toast.error(toErrorMessage(e))
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative size-9 shrink-0 rounded-full"
            aria-label={totalCount > 0 ? `มีการแจ้งเตือน ${totalCount} รายการ` : 'การแจ้งเตือน'}
            title="การแจ้งเตือน"
          >
            <Bell className="size-4" />
            {totalCount > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
                {totalCount > 9 ? '9+' : totalCount}
              </span>
            ) : null}
          </Button>
        }
      />

      <PopoverContent align="end" className="flex w-80 flex-col gap-3">
        {totalCount === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">ไม่มีการแจ้งเตือน</p>
        ) : (
          <>
            {canTreat && emergencyRows.length > 0 ? (
              <EmergencySection rows={emergencyRows} pending={call.isPending} onCall={handleCall} />
            ) : null}

            {canConfirmAppointments && appointmentRows.length > 0 ? (
              <AppointmentSection
                rows={appointmentRows}
                pending={confirm.isPending}
                onConfirm={handleConfirm}
              />
            ) : null}

            {canVerifyBilling && invoiceRows.length > 0 ? (
              <InvoiceSection rows={invoiceRows} pending={verify.isPending} onVerify={handleVerify} />
            ) : null}

            {canSeeStock && lowStockRows.length > 0 ? <StockSection rows={lowStockRows} /> : null}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <span>{count} รายการ</span>
    </div>
  )
}

/** เคสฉุกเฉินที่ยังรอเรียก — ของหมอ (`main:medical:write`) */
function EmergencySection({
  rows,
  pending,
  onCall,
}: {
  rows: QueueRow[]
  pending: boolean
  onCall: (id: number, name: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <SectionHeader label="เคสฉุกเฉินรอเรียก" count={rows.length} />
      <div className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50/60 p-2 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                คิว {row.queueNumber} · {row.displayName}
              </p>
              <p className="text-xs text-muted-foreground">
                {row.owner?.name ?? row.walkInOwnerName ?? 'ยังไม่รู้เจ้าของ'}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="destructiveSolid"
              onClick={() => onCall(row.id, row.displayName)}
              disabled={pending}
            >
              เรียกคิว
            </Button>
          </div>
        ))}
      </div>
      <Link href={ROUTE_QUEUE} className="text-center text-xs text-primary-strong hover:underline">
        ไปที่หน้าคิว
      </Link>
    </div>
  )
}

/** ใบจองที่รอยืนยัน — ของเคาน์เตอร์ (`main:reception:write`) */
function AppointmentSection({
  rows,
  pending,
  onConfirm,
}: {
  rows: AppointmentRow[]
  pending: boolean
  onConfirm: (id: number, name: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <SectionHeader label="ใบจองรอยืนยัน" count={rows.length} />
      <div className="flex max-h-60 flex-col gap-1.5 overflow-y-auto">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{row.displayName}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(row.bookedOn)} · {SLOT_LABEL[row.slot]}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => onConfirm(row.id, row.displayName)}
              disabled={pending}
            >
              ยืนยัน
            </Button>
          </div>
        ))}
      </div>
      <Link
        href={ROUTE_APPOINTMENTS}
        className="text-center text-xs text-primary-strong hover:underline"
      >
        ดูตารางจองทั้งหมด
      </Link>
    </div>
  )
}

/** ใบเสร็จที่รอบัญชีตรวจ — ของบัญชี (`main:billing:verify`) */
function InvoiceSection({
  rows,
  pending,
  onVerify,
}: {
  rows: Invoice[]
  pending: boolean
  onVerify: (id: number, code: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <SectionHeader label="บิลรอตรวจ" count={rows.length} />
      <div className="flex max-h-60 flex-col gap-1.5 overflow-y-auto">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{row.code}</p>
              <p className="text-xs text-muted-foreground">ยอด {row.total} บาท</p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => onVerify(row.id, row.code)}
              disabled={pending}
            >
              ยืนยันยอด
            </Button>
          </div>
        ))}
      </div>
      <Link href={ROUTE_BILLING} className="text-center text-xs text-primary-strong hover:underline">
        ดูบิลทั้งหมด
      </Link>
    </div>
  )
}

/**
 * ยาที่ยอดคงเหลือ ≤ 0 — ของคนดูสต็อกยา (`main:drug-stock:read`)
 *
 * **ไม่มีปุ่มกดจบในตัว** ต่างจากส่วนอื่น — การเติมสต็อกต้องกรอกจำนวน/เหตุผลในฟอร์ม
 * ยัดลงกล่องเล็ก ๆ นี้ไม่ไหว จึงพาไปหน้าคลังยาแทน (เหมือนกระดิ่งฝั่งลูกค้าที่พาไปหน้าใบเสร็จ)
 */
function StockSection({ rows }: { rows: DrugStockBalance[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <SectionHeader label="ยาหมด/ติดลบ" count={rows.length} />
      <div className="flex max-h-60 flex-col gap-1.5 overflow-y-auto">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50/60 p-2 text-sm"
          >
            <p className="truncate font-medium">{row.name}</p>
            <p className="shrink-0 text-xs font-medium text-amber-800">
              คงเหลือ {row.quantity} {row.unit ?? ''}
            </p>
          </div>
        ))}
      </div>
      <Link href={ROUTE_DRUG_STOCK} className="text-center text-xs text-primary-strong hover:underline">
        ไปที่หน้าคลังยา
      </Link>
    </div>
  )
}
