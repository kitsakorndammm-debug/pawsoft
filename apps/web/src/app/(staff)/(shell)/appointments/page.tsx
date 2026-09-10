'use client'

import { CalendarDays, CalendarPlus } from 'lucide-react'
import { useQueryState } from 'nuqs'
import { Suspense, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { AppDatePicker } from '@/components/common/app-date-picker'
import { Button } from '@/components/ui/button'
import {
  APPOINTMENT_STATUS_LABEL,
  APPOINTMENT_STATUS_STYLE,
  SLOT_LABEL,
  type AppointmentRow,
  type AppointmentSlot,
} from '@/features/appointment/api'
import {
  useAppointments,
  useCancelAppointment,
  useConfirmAppointment,
  useMarkNoShow,
  useSlots,
} from '@/features/appointment/hooks'
import { useCan } from '@/features/auth/hooks'
import { useCheckIn } from '@/features/visit/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { RECEPTION_WRITE } from '@/lib/permissions'
import { cn } from '@/lib/utils'

import { AppointmentDialog } from './appointment-dialog'

const SLOTS: AppointmentSlot[] = ['MORNING_1', 'MORNING_2', 'AFTERNOON_1', 'AFTERNOON_2']

/**
 * ตารางจองรายวัน — **แบ่งตามช่วงเวลา ไม่ใช่ตารางแถวเดียว**
 *
 * คำถามที่หน้านี้ตอบคือ "เช้านี้มีกี่ราย" ไม่ใช่ "ใบจองใบที่ 47 คือใคร" · ตารางที่
 * เรียงเป็นแถวยาวตอบคำถามแรกไม่ได้โดยไม่ต้องนับเอง
 *
 * **ปุ่มหลักของแต่ละใบคือ "มาถึงแล้ว"** ซึ่งเรียก `check-in` — จุดที่การจองกลายเป็นคิว
 */
function AppointmentBoard() {
  const canWrite = useCan(RECEPTION_WRITE)
  const slots = useSlots()

  const [date, setDate] = useQueryState('date', { defaultValue: '', clearOnDefault: true })
  const activeDate = date || slots.data?.today || null
  /**
   * กำลังดูวันที่ยังไม่ถึง — **ซ่อนปุ่ม "มาถึงแล้ว" แทนที่จะให้กดแล้วโดนปฏิเสธ**
   * (ผู้ใช้ตัดสิน 2026-09-09) เช็คอินใบจองล่วงหน้าไม่ได้อยู่แล้วที่ฝั่ง service —
   * ปุ่มที่กดแล้วเจอ error ทุกครั้งไม่ควรมีให้กดตั้งแต่แรก
   */
  const isFutureView = Boolean(
    activeDate && slots.data?.today && activeDate > slots.data.today,
  )

  const { data, isPending, isError, error } = useAppointments({
    bookedOn: activeDate,
    status: null,
    page: 1,
  })

  const checkIn = useCheckIn()
  const cancel = useCancelAppointment()
  const noShow = useMarkNoShow()
  const confirmAppt = useConfirmAppointment()

  const [createOpen, setCreateOpen] = useState(false)
  const [pendingCancel, setPendingCancel] = useState<AppointmentRow | null>(null)

  const rows = data?.rows ?? []

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn()
      toast.success(done)
    } catch (e) {
      toast.error(toErrorMessage(e))
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarDays className="size-5 text-primary-strong" />
          ตารางจอง
        </h1>

        <div className="ml-auto flex items-center gap-2">
          {/* รูปเดียวกับช่องวันที่ทั้งระบบ — ไม่ใช่ `<input type="date">` ของเบราว์เซอร์ */}
          <AppDatePicker
            value={activeDate ?? ''}
            onChange={(v) => void setDate(v ?? '')}
            className="w-44"
            aria-label="ดูตารางจองของวันที่"
          />

          {canWrite ? (
            <Button type="button" variant="success" onClick={() => setCreateOpen(true)}>
              <CalendarPlus className="size-4" />
              รับจองทางโทรศัพท์
            </Button>
          ) : null}
        </div>
      </div>

      {isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {toErrorMessage(error)}
        </div>
      ) : null}

      <div className="grid gap-3 overflow-y-auto sm:grid-cols-2 xl:grid-cols-4">
        {SLOTS.map((slot) => {
          const inSlot = rows.filter((r) => r.slot === slot)

          return (
            <section
              key={slot}
              /* สูงตามเนื้อหา ไม่ยืดเต็มจอ — คอลัมน์ว่างสูง 600px คือพื้นที่ที่เสียเปล่า */
              className="flex flex-col gap-2 self-start rounded-lg border bg-card p-2"
            >
              <header className="flex items-center justify-between px-1">
                <h2 className="text-sm font-medium text-primary-strong">{SLOT_LABEL[slot]}</h2>
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-xs',
                    inSlot.length > 0
                      ? 'bg-primary/10 text-primary-strong'
                      : 'text-muted-foreground',
                  )}
                >
                  {inSlot.length} ราย
                </span>
              </header>

              {isPending ? (
                <p className="px-1 text-sm text-muted-foreground">กำลังโหลด…</p>
              ) : inSlot.length === 0 ? (
                <p className="px-1 text-sm text-muted-foreground">ว่าง</p>
              ) : (
                inSlot.map((row) => (
                  <AppointmentCard
                    key={row.id}
                    row={row}
                    canWrite={canWrite}
                    canArrive={!isFutureView}
                    pending={checkIn.isPending || noShow.isPending || confirmAppt.isPending}
                    onArrive={() =>
                      void run(
                        () => checkIn.mutateAsync({
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
                        'เปิดคิวแล้ว — ดูที่หน้าคิว',
                      )
                    }
                    onNoShow={() => void run(() => noShow.mutateAsync(row.id), 'บันทึกว่าไม่มา')}
                    onCancel={() => setPendingCancel(row)}
                    onConfirm={() =>
                      void run(() => confirmAppt.mutateAsync(row.id), 'ยืนยันคิวแล้ว')
                    }
                  />
                ))
              )}
            </section>
          )
        })}
      </div>

      <AppointmentDialog open={createOpen} onOpenChange={setCreateOpen} />

      <ConfirmDialog
        open={pendingCancel !== null}
        onOpenChange={(open) => !open && setPendingCancel(null)}
        title="ยกเลิกใบจอง"
        description="ใบจองนี้จะถูกยกเลิก — ระบบบันทึกว่า &ldquo;คลินิกยกเลิก&rdquo;"
        actionText="ยกเลิกใบจอง"
        onAction={async () => {
          if (!pendingCancel) return
          await run(
            () => cancel.mutateAsync({ id: pendingCancel.id, reason: 'คลินิกยกเลิก' }),
            'ยกเลิกแล้ว',
          )
          setPendingCancel(null)
        }}
        pending={cancel.isPending}
      />
    </div>
  )
}

function AppointmentCard({
  row,
  canWrite,
  canArrive,
  pending,
  onArrive,
  onNoShow,
  onCancel,
  onConfirm,
}: {
  row: AppointmentRow
  canWrite: boolean
  /** `false` เมื่อกำลังดูวันที่ยังไม่ถึง — เช็คอินล่วงหน้าไม่ได้ (ฝั่ง service ปฏิเสธอยู่แล้ว) */
  canArrive: boolean
  pending: boolean
  onArrive: () => void
  onNoShow: () => void
  onCancel: () => void
  onConfirm: () => void
}) {
  /**
   * **`PENDING` ยังไม่จบ** — จางได้เฉพาะใบที่เดินจบแล้วจริง ๆ
   *
   * เขียน `!== 'BOOKED'` เฉย ๆ จะทำให้ใบที่รอยืนยันดูเหมือนใบที่ปิดไปแล้ว
   * และปุ่มทั้งแถวหายไป ทั้งที่มันคือใบที่ต้องการคนทำงานมากที่สุด
   */
  const done = row.status === 'ARRIVED' || row.status === 'CANCELLED' || row.status === 'NO_SHOW'
  const pendingConfirm = row.status === 'PENDING'

  return (
    <div className={cn('rounded-md border p-2 text-sm', done && 'opacity-60')}>
      <div className="flex items-start gap-1">
        <span className="min-w-0 flex-1 truncate font-medium">
          {row.displayName}
        </span>
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 text-xs',
            APPOINTMENT_STATUS_STYLE[row.status],
          )}
        >
          {APPOINTMENT_STATUS_LABEL[row.status]}
        </span>
      </div>

      <p className="truncate text-xs text-muted-foreground">
        {row.owner.name}
        {row.owner.phone ? ` · ${row.owner.phone}` : ''}
      </p>
      <p className="text-xs text-muted-foreground/80">
        {row.source === 'ONLINE' ? 'ลูกค้าจองเอง' : 'รับจองทางโทร'}
      </p>

      {row.reason ? <p className="mt-1 line-clamp-2 text-xs">{row.reason}</p> : null}

      {canWrite && pendingConfirm ? (
        /*
          ใบที่ลูกค้าจองเอง — **ยืนยันก่อนถึงจะเปิดคิวได้**
          ไม่มีปุ่ม "มาถึงแล้ว" ตรงนี้เพราะยังไม่มีใครตกลงกับลูกค้าว่าให้มาวันนี้
        */
        <div className="mt-2 flex flex-wrap gap-1">
          <Button type="button" size="sm" onClick={onConfirm} disabled={pending}>
            ยืนยันคิว
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={onCancel}
          >
            ปฏิเสธ
          </Button>
        </div>
      ) : null}

      {canWrite && row.status === 'BOOKED' ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {/* ปุ่มหลัก — จุดที่การจองกลายเป็นคิว · ซ่อนเมื่อยังไม่ถึงวันนัด */}
          {canArrive ? (
            <Button type="button" size="sm" onClick={onArrive} disabled={pending}>
              มาถึงแล้ว
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={onNoShow}
            disabled={pending}
          >
            ไม่มา
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={onCancel}
          >
            ยกเลิก
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export default function AppointmentsPage() {
  return (
    <Suspense fallback={null}>
      <AppointmentBoard />
    </Suspense>
  )
}
