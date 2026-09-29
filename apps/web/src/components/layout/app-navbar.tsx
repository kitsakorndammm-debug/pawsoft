'use client'

import {
  CalendarDays,
  Cog,
  History,
  ListOrdered,
  Menu,
  PawPrint,
  Wallet,
  Users,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { SETTINGS_PERMISSION_KEYS } from '@/components/layout/app-sider'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCanAny } from '@/features/auth/hooks'
import { BILLING_READ, RECEPTION_READ } from '@/lib/permissions'
import {
  ROUTE_APPOINTMENTS,
  ROUTE_BILLING,
  ROUTE_HISTORY,
  ROUTE_OWNERS,
  ROUTE_PETS,
  ROUTE_QUEUE,
  ROUTE_SETTINGS,
} from '@/lib/routes'
import { cn } from '@/lib/utils'

/**
 * เมนูหลักของพนักงาน — **อยู่ในแถบเดียวกับ header** ไม่ใช่แถบแยกอีกชั้น (ผู้ใช้
 * ตัดสิน 2026-09-29: เดิมมีสองแถบซ้อนกันกินที่แนวตั้งไปเปล่าๆ)
 *
 * จอกว้าง (sm ขึ้นไป) — โชว์เป็นแท็บเรียงแนวนอนในแถบเดียวกับโลโก้/ผู้ใช้
 * จอแคบ (มือถือ) — ยุบเหลือปุ่มสามขีด กดแล้วค่อยกางเมนูออกมา ไม่งั้นแท็บเจ็ดอัน
 * ไม่มีทางพอความกว้างจอ
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
  /**
   * ไม่มีสิทธิ์สักตัวในกลุ่มนี้ = ไม่เห็นแท็บ
   *
   * **`undefined` แปลว่าเห็นได้ทุกคนที่ล็อกอินอยู่ ไม่ต้องมีสิทธิ์เฉพาะ** — ใช้กับ
   * "ประวัติ" (ผู้ใช้ตัดสิน 2026-09-18: "เข้าระบบได้ก็ดูได้เลย")
   */
  requiredAny?: readonly string[] | undefined
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
    label: 'ประวัติ',
    icon: History,
    href: ROUTE_HISTORY,
    activePrefix: ROUTE_HISTORY,
    // ไม่มี requiredAny โดยตั้งใจ — ทุกคนที่ล็อกอินได้เห็นแท็บนี้
  },
  {
    label: 'ข้อมูลหลัก',
    icon: Cog,
    href: ROUTE_SETTINGS,
    activePrefix: ROUTE_SETTINGS,
    requiredAny: SETTINGS_PERMISSION_KEYS,
  },
]

/** ใช้ร่วมกันทั้งแท็บแนวนอน (จอกว้าง) และแถวในเมนูสามขีด (มือถือ) */
function useAllowed(item: NavItem): boolean {
  // เรียก hook เสมอ (สม่ำเสมอทุก render) แล้วค่อยตัดสินใจว่าจะใช้ผลมันหรือไม่ —
  // `requiredAny: undefined` แปลว่าเห็นได้ทุกคน ไม่ต้องพึ่งผลของ `useCanAny` เลย
  const anyGranted = useCanAny(item.requiredAny ?? [])

  return item.requiredAny === undefined ? true : anyGranted
}

function DesktopNavTab({ item, pathname }: { item: NavItem; pathname: string }) {
  const allowed = useAllowed(item)
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
        'relative flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm transition-all',
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

/** แท็บแนวนอนในแถบเดียวกับโลโก้ — **ซ่อนบนจอแคบ** สลับไปที่ `MobileNavMenu` แทน */
export function DesktopNavTabs() {
  const pathname = usePathname() ?? ''

  return (
    <div className="hidden items-center gap-1 overflow-x-auto sm:flex">
      {NAV_ITEMS.map((item) => (
        <DesktopNavTab key={item.href} item={item} pathname={pathname} />
      ))}
    </div>
  )
}

function MobileNavRow({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem
  pathname: string
  onNavigate: () => void
}) {
  const allowed = useAllowed(item)
  if (!allowed) return null

  const isActive = pathname.startsWith(item.activePrefix)

  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors',
        isActive
          ? 'bg-primary font-semibold text-primary-foreground'
          : 'text-foreground hover:bg-muted',
      )}
    >
      <item.icon className="size-4.5" />
      {item.label}
    </Link>
  )
}

/**
 * ปุ่มสามขีด — **เฉพาะจอแคบ** (ผู้ใช้สั่ง 2026-09-29: "ถ้าเปิดในโทรศัพท์ ทำเป็น
 * สามขีดที่กดแล้วขึ้นเมนู")
 *
 * `open` คุมเอง ไม่ปล่อยให้ popover จัดการตัวเอง — เพราะต้องปิดเองตอนกดลิงก์
 * (เปลี่ยนหน้าแบบ client-side ไม่ทำให้ popover unmount ให้เอง)
 */
export function MobileNavMenu() {
  const pathname = usePathname() ?? ''
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 sm:hidden"
            aria-label="เมนู"
          >
            <Menu className="size-5" />
          </Button>
        }
      />

      <PopoverContent align="start" className="w-64">
        <div className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <MobileNavRow
              key={item.href}
              item={item}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
