'use client'

import { CalendarPlus } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { MyBookingCard } from '@/features/appointment/my-booking-card'
import { useCancelMyAppointment, useMyAppointments } from '@/features/appointment/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { ROUTE_OWNER_BOOKING } from '@/lib/routes'

/**
 * การจองของลูกค้า — **แยกที่กำลังจะถึงกับที่ผ่านไปแล้ว**
 *
 * แยกออกจากหน้าแรกตอนซอยหน้า (ผู้ใช้ทักท้วง 2026-09-01: "ข้อมูลเยอะจะไม่แน่นเอาหรอ")
 *
 * ใบที่ยังไม่เกิดขึ้นอยู่บนสุดเสมอ · คนเปิดหน้านี้ถามว่า "ต้องไปวันไหน" ไม่ใช่
 * "ปีที่แล้วไปกี่ครั้ง"
 */
export default function MyBookingsPage() {
  const appointments = useMyAppointments(1)
  const cancel = useCancelMyAppointment()

  const rows = appointments.data?.rows ?? []
  const upcoming = rows.filter((a) => a.status === 'PENDING' || a.status === 'BOOKED')
  const past = rows.filter((a) => a.status !== 'PENDING' && a.status !== 'BOOKED')

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">การจอง</h1>
        <Button size="sm" nativeButton={false} render={<Link href={ROUTE_OWNER_BOOKING} />}>
          <CalendarPlus className="size-4" />
          จองคิว
        </Button>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">กำลังจะถึง</h2>

        {appointments.isPending ? (
          <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
        ) : upcoming.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            ยังไม่มีการจอง — กด &ldquo;จองคิว&rdquo; เพื่อเริ่ม
          </p>
        ) : (
          upcoming.map((a) => (
            <MyBookingCard
              key={a.id}
              row={a}
              pending={cancel.isPending}
              onCancel={() =>
                cancel.mutate(
                  { id: a.id, reason: 'ลูกค้ายกเลิกเอง' },
                  {
                    onSuccess: () => toast.success('ยกเลิกการจองแล้ว'),
                    onError: (e) => toast.error(toErrorMessage(e)),
                  },
                )
              }
            />
          ))
        )}
      </section>

      {past.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">ที่ผ่านมา</h2>
          {past.map((a) => (
            <MyBookingCard key={a.id} row={a} />
          ))}
        </section>
      ) : null}
    </div>
  )
}
