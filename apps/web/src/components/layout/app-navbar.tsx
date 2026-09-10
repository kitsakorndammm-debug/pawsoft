'use client'

import {
  CalendarDays,
  Cog,
  ListOrdered,
  PawPrint,
  Wallet,
  Users,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { SETTINGS_PERMISSION_KEYS } from '@/components/layout/app-sider'
import { useCanAny } from '@/features/auth/hooks'
import { BILLING_READ, RECEPTION_READ } from '@/lib/permissions'
import {
  ROUTE_APPOINTMENTS,
  ROUTE_BILLING,
  ROUTE_OWNERS,
  ROUTE_PETS,
  ROUTE_QUEUE,
  ROUTE_SETTINGS,
} from '@/lib/routes'
import { cn } from '@/lib/utils'

/**
 * แถบเมนูหลัก ใต้ header
 *
 * **แท็บเพิ่มวันที่หน้าของมันมีจริง** — แท็บที่กดแล้ว 404 แย่กว่าแท็บที่ยังไม่มี
 */

interface NavItem {
  label: string
  /** ไอคอนช่วยให้หาแท็บเจอโดยไม่ต้องอ่าน — คนที่ใช้ทุกวันจำรูปได้ก่อนจำคำ */
  icon: LucideIcon
  href: string
  /** path ที่ขึ้นต้นด้วยตัวนี้ ถือว่าอยู่ในแท็บนี้ */
  activePrefix: string
  /** ไม่มีสิทธิ์สักตัวในกลุ่มนี้ = ไม่เห็นแท็บ */
  requiredAny: readonly string[]
}

const RECEPTION_ANY = [RECEPTION_READ] as const

/**
 * **หน้างานมาก่อนข้อมูลหลัก** — คิวคือสิ่งที่คนเปิดทุกวัน ส่วนตั้งค่าเปิดเดือนละครั้ง ·
 * แท็บซ้ายสุดคือที่ที่มือไปหาโดยไม่ต้องอ่าน
 */
const NAV_ITEMS: NavItem[] = [
  {
    label: 'คิว',
    icon: ListOrdered,
    href: ROUTE_QUEUE,
    activePrefix: ROUTE_QUEUE,
    requiredAny: RECEPTION_ANY,
  },
  {
    label: 'ตารางจอง',
    icon: CalendarDays,
    href: ROUTE_APPOINTMENTS,
    activePrefix: ROUTE_APPOINTMENTS,
    requiredAny: RECEPTION_ANY,
  },
  {
    label: 'เจ้าของสัตว์',
    icon: Users,
    href: ROUTE_OWNERS,
    activePrefix: ROUTE_OWNERS,
    requiredAny: RECEPTION_ANY,
  },
  {
    label: 'สัตว์เลี้ยง',
    icon: PawPrint,
    href: ROUTE_PETS,
    activePrefix: ROUTE_PETS,
    requiredAny: RECEPTION_ANY,
  },
  {
    label: 'การเงิน',
    icon: Wallet,
    href: ROUTE_BILLING,
    activePrefix: ROUTE_BILLING,
    requiredAny: [BILLING_READ],
  },
  {
    label: 'ข้อมูลหลัก',
    icon: Cog,
    href: ROUTE_SETTINGS,
    activePrefix: ROUTE_SETTINGS,
    requiredAny: SETTINGS_PERMISSION_KEYS,
  },
]

function NavTab({ item, pathname }: { item: NavItem; pathname: string }) {
  const allowed = useCanAny(item.requiredAny)
  if (!allowed) return null

  const isActive = pathname.startsWith(item.activePrefix)

  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      /**
       * แท็บที่เปิดอยู่ = **พื้นสีเต็ม ไม่ใช่ขีดใต้บาง ๆ** (ผู้ใช้ตัดสิน 2026-09-01)
       *
       * เดิมเป็นขีดใต้ 2px บนแถบที่พื้นเป็นสีเทาอ่อนอยู่แล้ว — มองผ่าน ๆ ไม่รู้ว่า
       * ตัวเองอยู่หน้าไหน · พื้นสีทึบอ่านออกทันทีจากระยะไกล และไอคอนได้สีตามไปด้วย
       */
      className={cn(
        'relative my-1.5 flex items-center gap-1.5 rounded-lg px-3 text-sm transition-all',
        isActive
          ? 'bg-primary font-semibold text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-primary/10 hover:text-primary-strong',
      )}
    >
      <item.icon className="size-4" />
      {item.label}
    </Link>
  )
}

export function AppNavbar() {
  const pathname = usePathname() ?? ''

  return (
    <nav className="flex h-12 shrink-0 items-stretch justify-center gap-1 border-b bg-background px-2 shadow-sm">
      {NAV_ITEMS.map((item) => (
        <NavTab key={item.href} item={item} pathname={pathname} />
      ))}
    </nav>
  )
}
