'use client'

import Link from 'next/link'
import { Banknote, CalendarClock, ChevronRight, LogOut, ShieldCheck, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { SessionGuard } from '@/components/session-guard'
import { useCan, useLogout, useMe } from '@/features/auth/hooks'
import { useInvoices } from '@/features/payment/hooks'
import { useQueue } from '@/features/visit/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { BILLING_READ, HR_READ, RECEPTION_READ } from '@/lib/permissions'
import { ROUTE_BILLING, ROUTE_LOGIN, ROUTE_QUEUE, ROUTE_ROLES, ROUTE_USERS } from '@/lib/routes'

/** หน้าแรกหลังเข้าสู่ระบบของพนักงาน */
function Home() {
  const { data: me } = useMe()
  const logout = useLogout()
  const router = useRouter()

  const canHr = useCan(HR_READ)
  const canReception = useCan(RECEPTION_READ)
  const canBilling = useCan(BILLING_READ)

  const hasAnyCard = canHr || canReception || canBilling

  const onLogout = () =>
    logout.mutate(undefined, {
      onSuccess: () => router.replace(ROUTE_LOGIN),
      onError: (err) => toast.error(toErrorMessage(err)),
    })

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-lg font-semibold sm:text-xl">Paw Soft</h1>
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            สวัสดี {me?.username}
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary-strong">
              {me?.role.name}
            </span>
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={onLogout} disabled={logout.isPending}>
          <LogOut className="size-4" />
          ออกจากระบบ
        </Button>
      </header>

      {/* **ซ่อนเมนูที่กดไม่ได้ ไม่ใช่ทำให้จาง** — ปุ่มที่กดแล้วโดนปฏิเสธคือปุ่มที่
          ไม่ควรอยู่ตรงนั้น · BE ปฏิเสธอยู่แล้วอีกชั้น */}
      {hasAnyCard ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {canHr && (
            <>
              <NavCard
                href={ROUTE_USERS}
                icon={Users}
                title="บัญชีผู้ใช้"
                desc="เพิ่ม แก้ไข ระงับบัญชีพนักงาน"
              />
              <NavCard
                href={ROUTE_ROLES}
                icon={ShieldCheck}
                title="บทบาทและสิทธิ์"
                desc="กำหนดว่าใครทำอะไรได้"
              />
            </>
          )}

          {canReception && <QueueCard />}
          {canBilling && <PendingInvoiceCard />}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">ยังไม่มีเมนูที่คุณเข้าถึงได้</p>
      )}
    </main>
  )
}

function NavCard({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string
  icon: typeof Users
  title: string
  desc: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border bg-card p-4 transition-colors hover:bg-accent"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Icon className="size-5 text-primary" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{desc}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}

/**
 * โครงร่วมของการ์ดสถิติ — ไอคอนวงกลม · ตัวเลขใหญ่ · ลิสต์ตัวอย่างสามอันแรก
 *
 * `QueueCard` กับ `PendingInvoiceCard` ใช้โครงเดียวกัน ต่างกันแค่แหล่งข้อมูล
 * (ผู้ใช้ทักท้วง 2026-09-08: "ดูโล่งไป")
 */
function StatCard({
  href,
  icon: Icon,
  title,
  loading,
  error,
  empty,
  emptyText,
  count,
  countLabel,
  preview,
}: {
  href: string
  icon: typeof Banknote
  title: string
  loading: boolean
  error: unknown
  empty: boolean
  emptyText: string
  count: number
  countLabel: string
  /** สามอันแรกที่จะโชว์ใต้ตัวเลข — ไม่บังคับ (บิลรอยืนยันไม่มีลิสต์ชื่อ) */
  preview?: string[]
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-3 rounded-2xl border bg-card p-4 transition-colors hover:bg-accent"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-medium">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Icon className="size-4 text-primary" />
          </span>
          {title}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </div>

      {loading ? (
        <span className="text-sm text-muted-foreground">กำลังโหลด...</span>
      ) : error ? (
        <span className="text-sm text-destructive">{toErrorMessage(error)}</span>
      ) : empty ? (
        <span className="text-sm text-muted-foreground">{emptyText}</span>
      ) : (
        <>
          <span className="flex items-baseline gap-1">
            <span className="text-3xl font-semibold tabular-nums">{count}</span>
            <span className="text-sm text-muted-foreground">{countLabel}</span>
          </span>
          {preview && preview.length > 0 ? (
            <ul className="flex flex-col gap-0.5 border-t pt-2 text-xs text-muted-foreground">
              {preview.map((line, i) => (
                <li key={i} className="truncate">
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </Link>
  )
}

/**
 * คิววันนี้ — จำนวน + สามคิวแรกที่ยังไม่เสร็จ
 *
 * ใช้ `useQueue` ตัวเดียวกับจอคิว (รีเฟรชเอง 15 วินาที) เพื่อให้เลขที่เห็นตรงกับ
 * ที่หน้าคิวจริงเป๊ะ ไม่ใช่คำนวณเองอีกชุด
 */
function QueueCard() {
  const queue = useQueue(null)
  const rows = queue.data ?? []

  return (
    <StatCard
      href={ROUTE_QUEUE}
      icon={CalendarClock}
      title="คิววันนี้"
      loading={queue.isPending}
      error={queue.isError ? queue.error : null}
      empty={rows.length === 0}
      emptyText="ไม่มีคิววันนี้"
      count={rows.length}
      countLabel="คน"
      preview={rows.slice(0, 3).map((r) => r.displayName)}
    />
  )
}

/**
 * บิลที่รอบัญชียืนยันยอด — จำนวน + สามใบแรก (รหัสใบ + ยอด)
 *
 * ต่างจากคิวตรงที่นี่คือคิวงานของบัญชีเอง (ยืนยันแล้วแก้ไม่ได้อีก) ไม่ใช่จอที่ต้อง
 * ตามความเคลื่อนไหวแบบเรียลไทม์ — ไม่ต้องรีเฟรชถี่เท่าคิวหน้าเคาน์เตอร์
 *
 * **ไม่รวมยอดเงินเป็นตัวเลขเดียว** — หน้านี้ดึงมาแค่หน้าแรก (50 ใบ) รวมยอดจากแค่
 * หน้าที่โหลดมาแล้วโชว์เป็นยอดรวมทั้งหมด จะเป็นตัวเลขที่ผิดวันที่มีมากกว่า 50 ใบค้าง
 */
function PendingInvoiceCard() {
  const invoices = useInvoices({ status: 'AWAITING_VERIFY', date: null, page: 1 })
  const rows = invoices.data?.rows ?? []
  const total = invoices.data?.page.total ?? 0

  return (
    <StatCard
      href={`${ROUTE_BILLING}?status=AWAITING_VERIFY`}
      icon={Banknote}
      title="บิลรอยืนยันยอด"
      loading={invoices.isPending}
      error={invoices.isError ? invoices.error : null}
      empty={total === 0}
      emptyText="ไม่มีบิลรอยืนยัน"
      count={total}
      countLabel="ใบ"
      preview={rows.slice(0, 3).map((r) => `${r.code} · ${r.total} บาท`)}
    />
  )
}

export default function HomePage() {
  return (
    <SessionGuard>
      <Home />
    </SessionGuard>
  )
}
