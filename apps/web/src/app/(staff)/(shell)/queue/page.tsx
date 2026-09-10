'use client'

import { CalendarClock, ListOrdered, MoreHorizontal, Plus, RefreshCw } from 'lucide-react'
import { useQueryState } from 'nuqs'
import { Suspense, useState } from 'react'
import { toast } from 'sonner'

import { AppDatePicker } from '@/components/common/app-date-picker'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DataTable, type DataTableColumn } from '@/components/common/data-table'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SLOT_LABEL, type AppointmentRow } from '@/features/appointment/api'
import { useAppointments, useSlots } from '@/features/appointment/hooks'
import { useCan } from '@/features/auth/hooks'
import {
  TRIAGE_LABEL,
  TRIAGE_STYLE,
  VISIT_STATUS_LABEL,
  type QueueRow,
  type TriageLevel,
} from '@/features/visit/api'
import {
  useAbandonVisit,
  useCallVisit,
  useCheckIn,
  useQueue,
  useSetTriage,
} from '@/features/visit/hooks'
import { PaymentDialog } from '@/features/payment/payment-dialog'
import { toErrorMessage } from '@/lib/api-client'
import { RECEPTION_WRITE } from '@/lib/permissions'
import { cn } from '@/lib/utils'

import { CheckInDialog } from './check-in-dialog'
import { LinkVisitDialog } from './link-visit-dialog'
import { VisitDetailDialog } from './visit-detail-dialog'

/**
 * จอคิว — **หน้าที่เปิดค้างไว้ทั้งวัน**
 *
 * **เป็นตาราง ไม่ใช่การ์ด** (ผู้ใช้ตัดสิน 2026-09-01) · การ์ดที่มีปุ่มครบทุกใบกิน
 * พื้นที่จนเห็นได้ราว 9 คิวบนจอ 1080p ทั้งที่คลินิกมีวันละ 30-40 · คำถามที่จอนี้
 * ต้องตอบคือ "ตอนนี้ใครรออยู่บ้าง" ซึ่งตอบไม่ได้ถ้าต้องเลื่อน
 *
 * **เรียงตามลำดับเรียก ไม่ใช่ตามเลขคิว** และ BE เรียงมาให้แล้ว · ห้ามเรียงใหม่ที่นี่
 * ไม่งั้นสองที่จะตัดสินลำดับ แล้ววันหนึ่งจะไม่ตรงกัน
 *
 * เลขคิวบนบัตรของลูกค้าไม่เปลี่ยน แต่ตำแหน่งในแถวเปลี่ยนได้ — เคสแดงแทรกขึ้นหัว
 */
function QueueBoard() {
  const canWrite = useCan(RECEPTION_WRITE)

  const [date, setDate] = useQueryState('date', { defaultValue: '', clearOnDefault: true })
  const activeDate = date || null

  /**
   * "วันนี้" มาจาก BE ไม่ใช่ `new Date()` ในเบราว์เซอร์
   *
   * เครื่องที่ตั้งเวลาผิด หรือคนที่เปิดจากคนละเขตเวลา จะเห็นคิวของคนละวันกับที่
   * คลินิกกำลังทำงานอยู่ · `queue_date` ฝั่งฐานก็ตัดวันด้วยเวลาไทยเหมือนกัน
   */
  const slots = useSlots()
  const today = slots.data?.today ?? ''
  // วันที่กำลังดูจริง ๆ — เหมือนค่าที่ `AppDatePicker` โชว์ (ว่าง = วันนี้)
  const viewDate = date || today

  const { data, isPending, isFetching, isError, error, refetch } = useQueue(activeDate)

  /**
   * นัดหมายที่ยืนยันแล้วของวันที่กำลังดู แต่ยังไม่มา — **คนละตารางกับคิวจริงด้านล่าง**
   * (ผู้ใช้ตัดสิน 2026-09-09) เดิมต้องสลับไปหน้า "ตารางจอง" ถึงจะเห็นว่าวันนี้มีใครนัดไว้บ้าง
   * ทั้งที่หน้า "คิว" คือหน้าที่เปิดค้างไว้ทั้งวัน — เอามาโชว์ตรงนี้เลยแทน
   */
  const upcoming = useAppointments({ bookedOn: viewDate || null, status: 'BOOKED', page: 1 })
  const checkIn = useCheckIn()
  // เช็คอินล่วงหน้าไม่ได้อยู่แล้วที่ฝั่ง service — ซ่อนปุ่มไปเลยแทนที่จะให้กดแล้วโดนปฏิเสธ
  const isFutureView = Boolean(viewDate && today && viewDate > today)

  const call = useCallVisit()
  const triage = useSetTriage()
  const abandon = useAbandonVisit()

  const [checkInOpen, setCheckInOpen] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [linkRow, setLinkRow] = useState<QueueRow | null>(null)
  const [payRow, setPayRow] = useState<QueueRow | null>(null)
  const [pendingCancel, setPendingCancel] = useState<QueueRow | null>(null)

  const rows = data ?? []
  const waiting = rows.filter((r) => r.status === 'WAITING').length
  const inProgress = rows.filter((r) => r.status === 'IN_PROGRESS').length
  const paying = rows.filter((r) => r.status === 'AWAITING_PAYMENT').length

  const pending = call.isPending || triage.isPending || abandon.isPending

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn()
      toast.success(done)
    } catch (e) {
      toast.error(toErrorMessage(e))
    }
  }

  const columns: DataTableColumn<QueueRow>[] = [
    {
      key: 'queueNumber',
      title: 'คิว',
      width: 64,
      align: 'center',
      /**
       * เลขคิวเป็นตัวหนา — มันคือสิ่งที่พนักงานเรียกออกไมค์ และสิ่งที่ลูกค้าถืออยู่ในมือ
       */
      render: (row) => (
        <span className="flex items-center justify-center gap-1.5">
          {/*
            แถบสีซ้ายสุด — อ่านออกจากอีกฝั่งห้องโดยไม่ต้องอ่านตัวหนังสือ
            ฟ้า = กำลังตรวจ · แดง = ฉุกเฉิน · เหลือง = ด่วน
          */}
          <span
            aria-hidden
            className={cn(
              'h-7 w-1 rounded-full',
              row.status === 'IN_PROGRESS'
                ? 'bg-primary'
                : row.triage === 'EMERGENCY'
                  ? 'bg-red-500'
                  : row.triage === 'URGENT'
                    ? 'bg-amber-400'
                    : 'bg-transparent',
            )}
          />
          <span className="text-base font-bold tabular-nums">{row.queueNumber}</span>
        </span>
      ),
    },
    {
      key: 'displayName',
      title: 'สัตว์ / เจ้าของ',
      truncate: true,
      render: (row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">{row.displayName}</span>
            {/* คิวที่ยังไม่รู้ว่าเป็นสัตว์ตัวไหน — ต้องเห็นว่ามีงานค้างต้องผูก */}
            {row.petId === null ? (
              <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-800">
                ยังไม่ผูก
              </span>
            ) : null}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {row.owner?.name ?? row.walkInOwnerName ?? 'ยังไม่รู้เจ้าของ'}
            {row.owner?.phone ? ` · ${row.owner.phone}` : ''}
            {row.walkInOwnerPhone && !row.owner ? ` · ${row.walkInOwnerPhone}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'triage',
      title: 'ระดับ',
      width: 88,
      align: 'center',
      render: (row) => (
        <span className={cn('rounded px-1.5 py-0.5 text-xs', TRIAGE_STYLE[row.triage])}>
          {TRIAGE_LABEL[row.triage]}
        </span>
      ),
    },
    {
      key: 'status',
      title: 'สถานะ',
      width: 104,
      align: 'center',
      render: (row) => (
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
          {VISIT_STATUS_LABEL[row.status]}
        </span>
      ),
    },
    {
      key: 'arrivedAt',
      title: 'รอมาแล้ว',
      width: 90,
      align: 'right',
      render: (row) => {
        const mins = minutesSince(row.arrivedAt)

        return (
          /* รอเกินครึ่งชั่วโมงขึ้นสีส้ม — เป็นสัญญาณว่าต้องไปคุยกับเขา */
          <span className={cn('text-xs tabular-nums', mins >= 30 && 'font-medium text-amber-700')}>
            {mins} นาที
          </span>
        )
      },
    },
    {
      key: 'symptom',
      title: 'อาการ',
      truncate: true,
      render: (row) => (
        <span className="text-xs text-muted-foreground">{row.symptom ?? '—'}</span>
      ),
    },
    {
      key: 'actions',
      title: '',
      width: 132,
      align: 'right',
      fixed: 'right',
      render: (row) => (
        <QueueActions
          row={row}
          canWrite={canWrite}
          pending={pending}
          onOpen={() => setDetailId(row.id)}
          onCall={() =>
            void run(
              () => call.mutateAsync({ id: row.id, vetEmployeeId: null }),
              `เรียกคิว ${row.queueNumber}`,
            )
          }
          onTriage={(level) =>
            void run(() => triage.mutateAsync({ id: row.id, triage: level }), 'เปลี่ยนระดับแล้ว')
          }
          onLeft={() =>
            void run(
              () => abandon.mutateAsync({ id: row.id, status: 'LEFT' }),
              'บันทึกว่ากลับก่อน',
            )
          }
          onLink={() => setLinkRow(row)}
          onCancel={() => setPendingCancel(row)}
          onPay={() => setPayRow(row)}
        />
      ),
    },
  ]

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <ListOrdered className="size-5 text-primary-strong" />
          คิววันนี้
        </h1>

        {/* ตัวเลขสรุปอยู่ข้างหัวข้อ — ตอบ "งานเหลือเท่าไหร่" โดยไม่ต้องนับแถวเอง */}
        <div className="flex items-center gap-1.5 text-xs">
          <Stat
            label="รอเรียก"
            value={waiting}
            className="bg-slate-100 text-slate-700 ring-slate-200"
          />
          <Stat
            label="กำลังตรวจ"
            value={inProgress}
            className="bg-primary/12 text-primary-strong ring-primary/25"
          />
          <Stat
            label="รอชำระ"
            value={paying}
            className="bg-amber-100 text-amber-800 ring-amber-200"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/*
            **โชว์วันนี้เสมอ ไม่ปล่อยว่าง** (ผู้ใช้ตัดสิน 2026-09-01) · ช่องที่ขึ้นว่า
            "เลือกวันที่" ทำให้คนอ่านไม่รู้ว่ากำลังดูคิวของวันไหนอยู่ · ค่าใน URL ยัง
            ว่างได้เหมือนเดิม (`?date=` โผล่เฉพาะตอนเลือกวันอื่น) แต่สิ่งที่ตาเห็นคือวันจริง
          */}
          <AppDatePicker
            value={date || today}
            onChange={(v) => void setDate(v === today ? '' : (v ?? ''))}
            className="w-40"
            aria-label="ดูคิวของวันที่"
          />
          {date && date !== today ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => void setDate('')}>
              กลับมาวันนี้
            </Button>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="โหลดใหม่"
            className="text-primary-strong hover:bg-primary/10"
            onClick={() => void refetch()}
          >
            <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
          </Button>

          {canWrite ? (
            <Button type="button" variant="success" onClick={() => setCheckInOpen(true)}>
              <Plus className="size-4" />
              ลงทะเบียนหน้างาน
            </Button>
          ) : null}
        </div>
      </div>

      {(upcoming.data?.rows ?? []).length > 0 ? (
        <UpcomingAppointments
          rows={upcoming.data?.rows ?? []}
          canWrite={canWrite}
          canArrive={!isFutureView}
          pending={checkIn.isPending}
          onArrive={(row) =>
            void run(
              () =>
                checkIn.mutateAsync({
                  appointmentId: row.id,
                  ownerId: null,
                  petId: null,
                  walkInPetName: null,
                  walkInOwnerName: null,
                  walkInOwnerPhone: null,
                  triage: 'NORMAL',
                  symptom: null,
                  weightKg: null,
                }),
              `เปิดคิวให้ ${row.displayName} แล้ว`,
            )
          }
        />
      ) : null}

      <DataTable<QueueRow>
        className="min-h-0 flex-1"
        columns={columns}
        data={rows}
        loading={isPending}
        fetching={isFetching}
        onRowClick={(row) => setDetailId(row.id)}
        /* เคสแดงต้องสะดุดตาจากอีกฝั่งห้อง ไม่ใช่แค่มีป้ายเล็ก ๆ ในคอลัมน์ */
        /**
         * สีของแถว — **สถานะมาก่อนระดับความเร่งด่วน**
         *
         * แถวที่กำลังตรวจอยู่ต้องแยกออกจากแถวที่ยังรอ แม้จะเป็นเคสปกติ · ไม่งั้น
         * หมอที่มองจอจะเห็นคิวที่ตัวเองกำลังตรวจอยู่ปนอยู่กลางกองคนที่ยังรอ
         * (เห็นจากภาพจริง 2026-09-01 — คิว 1 ที่ตรวจอยู่ ไปอยู่ใต้คิวที่ยังรอสองใบ)
         */
        rowClassName={(row) =>
          row.status === 'IN_PROGRESS'
            ? 'bg-primary/[0.07] hover:bg-primary/10'
            : row.triage === 'EMERGENCY'
              ? 'bg-red-50/70 hover:bg-red-50'
              : row.triage === 'URGENT'
                ? 'bg-amber-50/50'
                : undefined
        }
        emptyText={
          isError
            ? toErrorMessage(error)
            : date
              ? 'ไม่มีคิวในวันนี้'
              : 'ยังไม่มีคิว — กดลงทะเบียนหน้างานเพื่อเริ่ม'
        }
      />

      <CheckInDialog open={checkInOpen} onOpenChange={setCheckInOpen} />

      <VisitDetailDialog
        visitId={detailId}
        open={detailId !== null}
        onOpenChange={(open) => !open && setDetailId(null)}
      />

      <LinkVisitDialog
        row={linkRow}
        open={linkRow !== null}
        onOpenChange={(open) => !open && setLinkRow(null)}
      />

      <PaymentDialog
        visitId={payRow?.id ?? null}
        queueNumber={payRow?.queueNumber ?? null}
        open={payRow !== null}
        onOpenChange={(next) => !next && setPayRow(null)}
      />

      <ConfirmDialog
        open={pendingCancel !== null}
        onOpenChange={(open) => !open && setPendingCancel(null)}
        title="ยกเลิกคิว"
        description={`ยกเลิกคิวหมายเลข ${pendingCancel?.queueNumber ?? ''} — ใช้เมื่อลงทะเบียนผิดหรือกดซ้ำ · แถวจะยังอยู่ในประวัติ ไม่ได้ถูกลบ`}
        actionText="ยกเลิกคิว"
        onAction={async () => {
          if (!pendingCancel) return
          await run(
            () => abandon.mutateAsync({ id: pendingCancel.id, status: 'CANCELLED' }),
            `ยกเลิกคิว ${pendingCancel.queueNumber} แล้ว`,
          )
          setPendingCancel(null)
        }}
        pending={abandon.isPending}
      />
    </div>
  )
}

/**
 * นัดหมายที่ยืนยันแล้ว รอมาถึง — **แถบสรุป ไม่ใช่ตาราง** (ต่างจากคิวจริงด้านล่าง)
 *
 * อยู่ในหน้า "คิว" เพื่อให้ไม่ต้องสลับไปหน้า "ตารางจอง" เพื่อรู้ว่าวันนี้มีใครนัดไว้บ้าง
 * (ผู้ใช้ตัดสิน 2026-09-09) · ไม่มีคอลัมน์ ไม่มีสถานะให้อ่าน — มีแค่ชื่อ ช่วงเวลา
 * และปุ่มเดียว เพราะสิ่งที่ต้องทำกับแถวพวกนี้มีแค่อย่างเดียวคือรอกดตอนมาถึง
 */
function UpcomingAppointments({
  rows,
  canWrite,
  canArrive,
  pending,
  onArrive,
}: {
  rows: AppointmentRow[]
  canWrite: boolean
  /** `false` เมื่อกำลังดูวันที่ยังไม่ถึง — เช็คอินล่วงหน้าไม่ได้ (ฝั่ง service ปฏิเสธอยู่แล้ว) */
  canArrive: boolean
  pending: boolean
  onArrive: (row: AppointmentRow) => void
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
        <CalendarClock className="size-3.5" />
        นัดหมายที่ยืนยันแล้ว รอมาถึง ({rows.length})
      </div>

      <div className="flex flex-wrap gap-1.5">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center gap-2 rounded-md border border-emerald-200 bg-card px-2 py-1.5 text-sm"
          >
            <div className="min-w-0">
              <span className="font-medium">{row.displayName}</span>
              <span className="ml-1.5 text-xs text-muted-foreground">
                {SLOT_LABEL[row.slot]}
              </span>
            </div>

            {canWrite && canArrive ? (
              <Button
                type="button"
                size="sm"
                variant="success"
                onClick={() => onArrive(row)}
                disabled={pending}
              >
                มาถึงแล้ว
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  className,
}: {
  label: string
  value: number
  className: string
}) {
  return (
    <span className={cn('rounded-md px-2 py-1 ring-1 ring-inset', className)}>
      {label} <span className="font-semibold tabular-nums">{value}</span>
    </span>
  )
}

/**
 * ปุ่มของแถวหนึ่ง — **ปุ่มหลักหนึ่งปุ่ม ที่เหลืออยู่ในเมนู `⋯`**
 *
 * (ผู้ใช้ตัดสิน 2026-09-01) · ปุ่มห้าปุ่มต่อแถวคือสิ่งที่ทำให้การ์ดเดิมสูงเกินไป และ
 * สี่ในห้าปุ่มนั้นแทบไม่ถูกกด
 *
 * **ปุ่มหลักเปลี่ยนตามสถานะ** — คิวที่รออยู่คือ "เรียก" · ที่ตรวจอยู่คือ "บันทึก" ·
 * ที่รอเงินคือ "ปิดคิว" · ปุ่มที่กดแล้วโดนปฏิเสธคือปุ่มที่ไม่ควรมี
 */
function QueueActions({
  row,
  canWrite,
  pending,
  onOpen,
  onCall,
  onTriage,
  onLeft,
  onLink,
  onCancel,
  onPay,
}: {
  row: QueueRow
  canWrite: boolean
  pending: boolean
  onOpen: () => void
  onCall: () => void
  onTriage: (level: TriageLevel) => void
  onLeft: () => void
  onLink: () => void
  onCancel: () => void
  onPay: () => void
}) {
  if (!canWrite) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={onOpen}>
        ดู
      </Button>
    )
  }

  const primary =
    row.status === 'WAITING'
      ? { label: 'เรียก', onClick: onCall, variant: 'default' as const }
      : row.status === 'IN_PROGRESS'
        ? { label: 'บันทึก', onClick: onOpen, variant: 'outline' as const }
        : row.status === 'AWAITING_PAYMENT'
          ? /*
             * **"เก็บเงิน" ไม่ใช่ "ปิดคิว"** — คิวปิดเองตอนบัญชียืนยันยอด
             * (BE ทำในทรานแซกชันเดียวกับ `verifyInvoice`) · ปุ่มปิดคิวตรง ๆ แปลว่า
             * ปิดได้โดยไม่ผ่านการเงิน แล้วจะมีคิวที่จบแล้วแต่ไม่มีใบเสร็จ
             */
            { label: 'เก็บเงิน', onClick: onPay, variant: 'success' as const }
          : null

  return (
    /* `stopPropagation` — คลิกปุ่มต้องไม่เปิดกล่องรายละเอียดไปด้วย (แถวมี `onRowClick`) */
    <div
      className="flex items-center justify-end gap-1"
      onClick={(e) => e.stopPropagation()}
      role="presentation"
    >
      {primary ? (
        <Button
          type="button"
          size="sm"
          variant={primary.variant}
          onClick={primary.onClick}
          disabled={pending}
        >
          {primary.label}
        </Button>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`ทำอย่างอื่นกับคิว ${row.queueNumber}`}
              className="text-primary-strong hover:bg-primary/10"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onOpen}>เปิดรายละเอียด</DropdownMenuItem>

          {/* ดูใบเสร็จได้แม้คิวปิดแล้ว — คนมาถามทีหลังว่าจ่ายไปเท่าไหร่ */}
          {row.status === 'AWAITING_PAYMENT' || row.status === 'DONE' ? (
            <DropdownMenuItem onClick={onPay}>ใบเสร็จ / เก็บเงิน</DropdownMenuItem>
          ) : null}

          {row.petId === null ? (
            <DropdownMenuItem onClick={onLink}>ผูกกับสัตว์ในระบบ</DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />

          {/* เปลี่ยนระดับได้ตลอดที่คิวยังไม่ปิด — เคสที่ทรุดลงระหว่างรอ */}
          {row.triage !== 'EMERGENCY' ? (
            <DropdownMenuItem className="text-red-700" onClick={() => onTriage('EMERGENCY')}>
              เปลี่ยนเป็นฉุกเฉิน
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => onTriage('NORMAL')}>กลับเป็นปกติ</DropdownMenuItem>
          )}

          {row.status === 'WAITING' ? (
            <DropdownMenuItem onClick={onLeft}>บันทึกว่ากลับก่อน</DropdownMenuItem>
          ) : null}

          {/*
            **ยกเลิกคิว ≠ ลูกค้ากลับก่อน** — อันบนคือลูกค้าเปลี่ยนใจ อันนี้คือคิวที่
            ลงทะเบียนผิด (กดซ้ำ · ผิดคน) · แยกกันเพราะรายงาน "มีคนรอแล้วไม่ได้ตรวจ
            กี่ราย" ต้องนับเฉพาะอันบน
          */}
          {row.status !== 'DONE' && row.status !== 'CANCELLED' ? (
            <DropdownMenuItem className="text-destructive" onClick={onCancel}>
              ยกเลิกคิวนี้
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** นาทีที่รอมาแล้ว — ปัดลง · ค่าติดลบเป็นไปได้ถ้านาฬิกาเครื่องเร็วกว่าเซิร์ฟเวอร์ */
function minutesSince(iso: string): number {
  const diff = Date.now() - new Date(iso).getTime()

  return Math.max(Math.floor(diff / 60_000), 0)
}

export default function QueuePage() {
  // `useQueryState` อ่าน URL — ไม่ห่อ `Suspense` แล้ว `next build` พังทั้งหน้า
  return (
    <Suspense fallback={null}>
      <QueueBoard />
    </Suspense>
  )
}
