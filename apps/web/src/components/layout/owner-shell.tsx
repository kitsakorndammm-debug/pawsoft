'use client'

import { CalendarDays, Home, LogOut, PawPrint, Receipt, Stethoscope, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { toast } from 'sonner'

import { OwnerNotificationBell } from '@/components/layout/owner-notification-bell'
import { Button } from '@/components/ui/button'
import { useOwnerLogout, useOwnerMe } from '@/features/owner-auth/hooks'
import { toErrorMessage } from '@/lib/api-client'
import {
  ROUTE_OWNER_BOOKINGS,
  ROUTE_OWNER_HISTORY,
  ROUTE_OWNER_HOME,
  ROUTE_OWNER_INVOICES,
  ROUTE_OWNER_LOGIN,
  ROUTE_OWNER_PETS,
} from '@/lib/routes'
import { cn } from '@/lib/utils'

/**
 * โครงของหน้าฝั่งลูกค้า — header บน · เนื้อหา · แถบเมนูล่าง
 *
 * (ผู้ใช้ทักท้วง 2026-09-01: "ทำไมรวมทุกอย่างในหน้าเดียวแบบนี้อ่ะ ข้อมูลเยอะจะไม่แน่นเอาหรอ")
 *
 * เดิมหน้าแรกยัดสัตว์ · ปุ่มไปหน้าอื่น · การจองที่กำลังจะถึง · ประวัติการจอง ไว้ในหน้า
 * เดียว · ลูกค้าที่มีสัตว์สี่ตัวกับจองห้าใบต้องเลื่อนยาวกว่าจะเจอสิ่งที่มาหา · และทุกหน้า
 * ย่อยก็เขียน header กับปุ่มย้อนกลับของตัวเองซ้ำกันไปมา
 *
 * **แถบเมนูอยู่ล่าง ไม่ใช่บน** — ต่างจากฝั่งพนักงานที่ใช้บนจอคอม · ลูกค้าเปิดจากมือถือ
 * เป็นหลัก และนิ้วโป้งเอื้อมถึงขอบล่างได้โดยไม่ต้องขยับมือ
 *
 * **`ROUTE_OWNER_LOGIN` ไม่ได้ครอบด้วย shell นี้** — หน้าล็อกอินยังไม่มีเซสชัน
 * เมนูที่กดแล้วเด้งกลับมาที่เดิมคือเมนูที่ไม่ควรมี
 */

interface OwnerNavItem {
  label: string
  icon: LucideIcon
  href: string
  /** path ที่ขึ้นต้นด้วยตัวนี้ถือว่าอยู่ในแท็บนี้ — ใบเสร็จรายใบยังนับเป็นแท็บใบเสร็จ */
  activePrefix: string
}

const NAV_ITEMS: OwnerNavItem[] = [
  { label: 'หน้าแรก', icon: Home, href: ROUTE_OWNER_HOME, activePrefix: ROUTE_OWNER_HOME },
  { label: 'สัตว์เลี้ยง', icon: PawPrint, href: ROUTE_OWNER_PETS, activePrefix: ROUTE_OWNER_PETS },
  { label: 'การจอง', icon: CalendarDays, href: ROUTE_OWNER_BOOKINGS, activePrefix: ROUTE_OWNER_BOOKINGS },
  { label: 'ประวัติ', icon: Stethoscope, href: ROUTE_OWNER_HISTORY, activePrefix: ROUTE_OWNER_HISTORY },
  { label: 'ใบเสร็จ', icon: Receipt, href: ROUTE_OWNER_INVOICES, activePrefix: ROUTE_OWNER_INVOICES },
]

export function OwnerShell({ children }: { children: ReactNode }) {
  const { data: session } = useOwnerMe()
  const logout = useOwnerLogout()
  const router = useRouter()
  const pathname = usePathname() ?? ''

  const onLogout = () =>
    logout.mutate(undefined, {
      onSuccess: () => router.replace(ROUTE_OWNER_LOGIN),
      onError: (err) => toast.error(toErrorMessage(err)),
    })

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
        <Link href={ROUTE_OWNER_HOME} className="flex min-w-0 items-center gap-2">
          <PawPrint className="size-5 shrink-0 text-primary" />
          <span className="truncate font-semibold">Paw Soft</span>
        </Link>

        <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">
          {session?.displayName ?? ''}
        </span>

        <OwnerNotificationBell />

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="ออกจากระบบ"
          onClick={onLogout}
          disabled={logout.isPending}
          className="shrink-0 text-muted-foreground"
        >
          <LogOut className="size-4" />
        </Button>
      </header>

      {/*
        `pb-20` เผื่อที่ให้แถบเมนูล่าง — ไม่เผื่อ เนื้อหาบรรทัดสุดท้ายจะถูกแถบทับ
        และคนที่เลื่อนสุดแล้วจะคิดว่าหน้ามีแค่นั้น
      */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5 pb-20">{children}</main>

      {/*
        `pb-[env(safe-area-inset-bottom)]` — iPhone ที่ไม่มีปุ่มโฮมมีแถบลากขึ้นอยู่ขอบล่าง
        ไม่เผื่อไว้ แท็บแถวล่างจะโดนแถบนั้นทับครึ่งนึง
      */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex items-stretch justify-around border-t bg-background pb-[env(safe-area-inset-bottom)]">
        {NAV_ITEMS.map((item) => (
          <OwnerNavTab key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>
    </div>
  )
}

function OwnerNavTab({ item, pathname }: { item: OwnerNavItem; pathname: string }) {
  /**
   * **หน้าแรกต้องตรงเป๊ะ ไม่ใช่ `startsWith`**
   *
   * `ROUTE_OWNER_HOME` คือ `/owner` ซึ่งเป็นคำนำหน้าของทุก path ในกลุ่มนี้ ·
   * ใช้ `startsWith` แท็บหน้าแรกจะสว่างค้างอยู่ทุกหน้า
   */
  const isActive =
    item.href === ROUTE_OWNER_HOME ? pathname === item.href : pathname.startsWith(item.activePrefix)

  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex h-16 flex-1 cursor-pointer flex-col items-center justify-center gap-1 text-[11px] transition-colors',
        isActive ? 'font-semibold text-primary' : 'text-muted-foreground hover:text-primary-strong',
      )}
    >
      <item.icon className={cn('size-5', isActive && 'stroke-[2.5]')} />
      {item.label}
    </Link>
  )
}
