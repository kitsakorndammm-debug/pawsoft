'use client'

import {
  CalendarPlus,
  ChevronRight,
  Clock,
  PawPrint,
  Receipt,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { SLOT_LABEL, type AppointmentRow } from '@/features/appointment/api'
import { useMyAppointments } from '@/features/appointment/hooks'
import { useMyInvoices } from '@/features/payment/my-hooks'
import { useMyPets, useMyProfile, useOwnerMe } from '@/features/owner-auth/hooks'
import { WelcomeDialog } from '@/features/owner-auth/welcome-dialog'
import {
  ROUTE_OWNER_BOOKING,
  ROUTE_OWNER_BOOKINGS,
  ROUTE_OWNER_HISTORY,
  ROUTE_OWNER_INVOICES,
  ROUTE_OWNER_LOGIN,
  ROUTE_OWNER_PETS,
} from '@/lib/routes'
import { cn } from '@/lib/utils'

/**
 * หน้าแรกของลูกค้า — **hub บนมือถือ: การ์ดนัด + เมนูวงกลม**
 *
 * (ผู้ใช้กำหนด 2026-09-01: "ส่วนมากลูกค้าใช้ในมือถือ ทำไมไม่ทำหน้าแรกเป็น menu
 * bubble ให้แยกเป็นเมนู ๆ แล้วพวกคิวการจองก็มาแสดงในหน้าแรกด้วย")
 *
 * เรียงตามสิ่งที่ลูกค้าเปิดมาหา:
 *
 *   1. **ยอดค้าง**    มีกำหนดเวลา ต้องเห็นก่อน
 *   2. **นัดของฉัน**  คำถามที่คนเปิดแอปถามบ่อยที่สุด — โชว์บนหน้าแรกเลย ไม่ต้องกดเข้าไป
 *   3. **เมนูวงกลม**  ทางไปหน้าอื่น — แตะง่ายด้วยนิ้วโป้ง
 *
 * **เมนูเป็นวงกลมสี่ช่องต่อแถว** — ขนาด 64px คือขนาดที่นิ้วโป้งแตะไม่พลาด (ต่ำกว่า
 * 44px คือขนาดที่ Apple/Google บอกว่าเล็กเกินไปสำหรับการแตะ) · ไอคอนกับสีทำให้หา
 * เมนูเจอโดยไม่ต้องอ่านคำ ซึ่งเร็วกว่าลิสต์ข้อความล้วน
 */
export default function OwnerHomePage() {
  const { data: session, isLoading } = useOwnerMe()
  const router = useRouter()

  const profile = useMyProfile()
  const linked = profile.data?.owner != null
  const pets = useMyPets(linked)
  const appointments = useMyAppointments(1)
  const invoices = useMyInvoices(1)

  const [welcomeDismissed, setWelcomeDismissed] = useState(false)

  useEffect(() => {
    if (!isLoading && !session) router.replace(ROUTE_OWNER_LOGIN)
  }, [session, isLoading, router])

  if (isLoading || !session) {
    return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
  }

  const upcoming = (appointments.data?.rows ?? []).filter(
    (a) => a.status === 'PENDING' || a.status === 'BOOKED',
  )
  const unpaid = (invoices.data?.rows ?? []).filter((r) => Number(r.outstanding) > 0)
  const owed = unpaid.reduce((sum, r) => sum + Number(r.outstanding), 0)

  const firstName = (profile.data?.owner?.name ?? session.displayName).split(' ')[0]

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">สวัสดี {firstName}</h1>

      {!linked ? (
        /*
          ยังไม่ได้กรอกข้อมูล — **ชวนให้กรอก ไม่ใช่ไล่ไปติดต่อคลินิก**
          (ผู้ใช้ทักท้วง 2026-09-01: "ไม่ใช่ลูกค้าทุกคนที่จะเคยมาคลินิกนะ")
        */
        <section className="rounded-2xl border border-primary/40 bg-primary/5 p-5">
          <h2 className="font-medium">ยังไม่ได้กรอกข้อมูลติดต่อ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            กรอกครั้งเดียว แล้วเพิ่มสัตว์เลี้ยงกับจองคิวได้เลย
          </p>

          <Button className="mt-3" onClick={() => setWelcomeDismissed(false)}>
            กรอกข้อมูลติดต่อ
          </Button>

          <p className="mt-4 text-xs text-muted-foreground">
            เคยมารักษาที่คลินิกแล้ว? กรอกเบอร์เดิมที่เคยให้ไว้ — ระบบจะดึงประวัติมาให้อัตโนมัติ
          </p>
        </section>
      ) : (
        <>
          {/* ---- ยอดค้าง — บนสุดเพราะเป็นสิ่งเดียวที่มีกำหนดเวลา ---- */}
          {owed > 0 ? (
            <Link
              href={ROUTE_OWNER_INVOICES}
              className="flex cursor-pointer items-center gap-3 rounded-2xl border border-destructive/30 bg-card px-4 py-3.5 shadow-sm transition-colors hover:bg-destructive/5"
            >
              <Receipt className="size-5 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">ค้างชำระ {owed.toFixed(2)} บาท</p>
                <p className="text-xs text-muted-foreground">{unpaid.length} ใบ — แตะเพื่อจ่าย</p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ) : null}

          {/* ---- นัดของฉัน — โชว์ในหน้าแรกตามที่ผู้ใช้สั่ง ---- */}
          <section className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium">นัดของฉัน</h2>
              {upcoming.length > 0 ? (
                <Link
                  href={ROUTE_OWNER_BOOKINGS}
                  className="cursor-pointer text-xs text-primary-strong hover:underline"
                >
                  ดูทั้งหมด
                </Link>
              ) : null}
            </div>

            {appointments.isPending ? (
              <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
            ) : upcoming.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-4 py-6">
                <p className="text-sm text-muted-foreground">ยังไม่มีนัด</p>
                <Button size="sm" nativeButton={false} render={<Link href={ROUTE_OWNER_BOOKING} />}>
                  <CalendarPlus className="size-4" />
                  จองคิว
                </Button>
              </div>
            ) : (
              /*
                โชว์มากสุดสองใบ — ใบที่สามขึ้นไปไปดูที่หน้าการจอง
                หน้าแรกที่ยาวลงไปเรื่อย ๆ คือหน้าที่กลับไปเป็นแบบเดิม
              */
              upcoming.slice(0, 2).map((a) => <NextVisitCard key={a.id} row={a} />)
            )}
          </section>

          {/* ---- เมนูวงกลม ---- */}
          <section className="flex flex-col gap-3">
            <h2 className="font-medium">เมนู</h2>

            <div className="grid grid-cols-4 gap-2">
              <BubbleLink
                href={ROUTE_OWNER_BOOKING}
                icon={CalendarPlus}
                label="จองคิว"
                tone="text-primary-strong"
              />
              <BubbleLink
                href={ROUTE_OWNER_PETS}
                icon={PawPrint}
                label="สัตว์เลี้ยง"
                tone="text-amber-600"
                badge={(pets.data ?? []).length}
              />
              <BubbleLink
                href={ROUTE_OWNER_HISTORY}
                icon={Stethoscope}
                label="ประวัติ"
                tone="text-emerald-600"
              />
              <BubbleLink
                href={ROUTE_OWNER_INVOICES}
                icon={Receipt}
                label="ใบเสร็จ"
                tone="text-sky-600"
                badge={unpaid.length}
                badgeTone="bg-destructive text-destructive-foreground"
              />
            </div>
          </section>
        </>
      )}

      {/*
        ทักทายคนที่ยังไม่มีตัวตนในระบบ — เด้งเองครั้งแรก แล้วกดปิดได้
        เงื่อนไขรอ `profile` โหลดเสร็จก่อน ไม่งั้นมันแวบขึ้นมาให้คนที่สมัครแล้ว
      */}
      {profile.isSuccess && !linked ? (
        <WelcomeDialog
          open={!welcomeDismissed}
          onOpenChange={(v) => setWelcomeDismissed(!v)}
          defaultName={session.displayName}
        />
      ) : null}
    </div>
  )
}

/**
 * ปุ่มวงกลมหนึ่งช่อง
 *
 * **ป้ายอยู่นอกวงกลม ไม่ใช่ในวง** — คำไทยอย่าง "สัตว์เลี้ยง" ยาวเกินกว่าจะใส่ในวง
 * 64px ได้โดยไม่ต้องย่อจนอ่านไม่ออก
 */
function BubbleLink({
  href,
  icon: Icon,
  label,
  tone,
  badge,
  badgeTone = 'bg-primary text-primary-foreground',
}: {
  href: string
  icon: LucideIcon
  label: string
  /** สีของ**ไอคอน** ไม่ใช่สีพื้น — พื้นเป็นขาวเสมอ */
  tone: string
  /** ตัวเลขมุมขวาบน — `0` กับ `undefined` ไม่วาด */
  badge?: number
  badgeTone?: string
}) {
  return (
    <Link href={href} className="flex cursor-pointer flex-col items-center gap-1.5">
      {/*
        **พื้นขาว ขอบเทา ไอคอนเป็นสี** (ผู้ใช้กำหนด 2026-09-01: "ขอ icon เป็นแบบสีขาว
        พื้น ขอบเทา แล้วให้ icon เป็นสี ฉันไม่ชอบสีที่หวือหวา")

        พื้นสีทึบสี่ช่องเรียงกันดึงสายตาแรงกว่าเนื้อหาที่อยู่เหนือมัน · เหลือสีไว้ที่
        ไอคอนอย่างเดียวยังแยกเมนูออกจากกันได้ แต่ไม่แย่งความสนใจจากนัดกับยอดค้าง
      */}
      <span className="relative flex size-16 items-center justify-center rounded-2xl border bg-card shadow-sm transition-transform active:scale-95">
        <Icon className={cn('size-6', tone)} />

        {badge !== undefined && badge > 0 ? (
          <span
            className={cn(
              'absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold shadow-sm',
              badgeTone,
            )}
          >
            {badge}
          </span>
        ) : null}
      </span>

      <span className="text-center text-xs leading-tight">{label}</span>
    </Link>
  )
}

/**
 * นัดหนึ่งใบบนหน้าแรก — **เน้นวันกับช่วงเวลา ไม่ใช่เลขใบ**
 *
 * `PENDING` ต้องอ่านออกว่ายังไม่จบ · ลูกค้าที่คิดว่าจองเสร็จแล้วจะไม่รับสายที่คลินิก
 * โทรไปยืนยัน แล้วนัดนั้นก็ค้าง
 */
function NextVisitCard({ row }: { row: AppointmentRow }) {
  const waiting = row.status === 'PENDING'

  return (
    <Link
      href={ROUTE_OWNER_BOOKINGS}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/40',
        waiting && 'border-amber-300/70',
      )}
    >
      <span
        className={cn(
          'flex size-11 shrink-0 flex-col items-center justify-center rounded-xl leading-none',
          waiting ? 'border border-amber-300/70 text-amber-700' : 'border text-primary-strong',
        )}
      >
        {/* วันที่แบบปฏิทิน — อ่านเร็วกว่า `2026-09-01` เต็ม ๆ */}
        <span className="text-base font-semibold">{row.bookedOn.slice(8, 10)}</span>
        <span className="text-[10px]">{MONTH_SHORT[Number(row.bookedOn.slice(5, 7)) - 1]}</span>
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{row.displayName}</p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3" />
          {SLOT_LABEL[row.slot]}
        </p>
      </div>

      <span
        className={cn(
          'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium',
          waiting
            ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-300'
            : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300',
        )}
      >
        {waiting ? 'รอยืนยัน' : 'ยืนยันแล้ว'}
      </span>
    </Link>
  )
}

const MONTH_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]
