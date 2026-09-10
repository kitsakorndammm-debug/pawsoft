'use client'

import {
  Boxes,
  Briefcase,
  Building2,
  IdCard,
  Pill,
  ShieldCheck,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { SearchInput } from '@/components/common/search-input'
import { useCan, useCanAny } from '@/features/auth/hooks'
import { DRUG_STOCK_READ, HR_READ, MASTER_READ } from '@/lib/permissions'
import {
  ROUTE_DEPARTMENTS,
  ROUTE_EMPLOYEES,
  ROUTE_POSITIONS,
  ROUTE_DRUGS,
  ROUTE_DRUG_STOCK,
  ROUTE_ROLES,
  ROUTE_SERVICE_ITEMS,
  ROUTE_SETTINGS,
} from '@/lib/routes'
import { cn } from '@/lib/utils'

/**
 * เมนูซ้ายของ "ข้อมูลหลัก"
 *
 * คืน `null` เองเมื่อไม่ได้อยู่ใน path ของมัน — layout จึงไม่ต้องรู้ว่าเมนูไหนคู่กับ
 * path ไหน · เพิ่มเมนูใหม่แล้วไม่ต้องแก้ layout อีก
 */

interface SiderItem {
  label: string
  /** ไอคอนประจำเมนู — หาเจอเร็วกว่าอ่านคำ โดยเฉพาะเมนูที่ชื่อขึ้นต้นเหมือนกัน */
  icon: LucideIcon
  href: string
  permission: string
}

interface SiderGroup {
  label: string
  items: SiderItem[]
}

const SETTINGS_GROUPS: SiderGroup[] = [
  {
    label: 'องค์กร',
    /*
     * **เรียงตามลำดับที่ต้องกรอก ไม่ใช่ตามตัวอักษร** — แผนกมาก่อนตำแหน่ง เพราะตำแหน่ง
     * สังกัดแผนก · พนักงานมาหลังทั้งคู่เพราะต้องเลือกทั้งสองอย่าง · บทบาทมาท้ายสุด
     * เพราะเส้นทางการกรอกจริงคือ รับคนเข้า → เปิดบัญชีให้ → บัญชีต้องมีบทบาท
     */
    items: [
      { label: 'แผนก', icon: Building2, href: ROUTE_DEPARTMENTS, permission: MASTER_READ },
      { label: 'ตำแหน่ง', icon: Briefcase, href: ROUTE_POSITIONS, permission: MASTER_READ },
      { label: 'พนักงาน', icon: IdCard, href: ROUTE_EMPLOYEES, permission: HR_READ },
      /*
       * บทบาทใช้ `MASTER_READ` ไม่ใช่ `HR_READ` — มันเป็นของที่ผู้ดูแลระบบตั้ง
       * ไม่ใช่ข้อมูลของคน · ตรงกับการ์ดฝั่ง BE
       */
      { label: 'บทบาทและสิทธิ์', icon: ShieldCheck, href: ROUTE_ROLES, permission: MASTER_READ },
    ],
  },
  {
    label: 'คลินิก',
    /* หมวดของทั้งคู่จัดการจากในหน้าของมันเอง จึงไม่มีรายการหมวดที่นี่ */
    items: [
      { label: 'ยาและเวชภัณฑ์', icon: Pill, href: ROUTE_DRUGS, permission: MASTER_READ },
      { label: 'สต็อกยา', icon: Boxes, href: ROUTE_DRUG_STOCK, permission: DRUG_STOCK_READ },
      { label: 'รายการรักษา', icon: Stethoscope, href: ROUTE_SERVICE_ITEMS, permission: MASTER_READ },
    ],
  },
]

/**
 * key ทุกตัวที่เมนูนี้ใช้ — navbar เอาไปตัดสินว่าจะโชว์แท็บ "ข้อมูลหลัก" ไหม
 *
 * **มาจากลิสต์เดียวกับที่วาดเมนูจริง** · แยกเป็นสองลิสต์เมื่อไหร่ วันหนึ่งจะมีแท็บ
 * ที่กดเข้าไปแล้วเจอเมนูว่างเปล่า
 */
export const SETTINGS_PERMISSION_KEYS: readonly string[] = [
  ...new Set(SETTINGS_GROUPS.flatMap((g) => g.items.map((i) => i.permission))),
]

function SiderLink({ item, pathname }: { item: SiderItem; pathname: string }) {
  const allowed = useCan(item.permission)
  if (!allowed) return null

  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)

  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
        isActive
          ? 'bg-primary font-medium text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-primary/10 hover:text-primary-strong',
      )}
    >
      <item.icon className="size-4 shrink-0" />
      {item.label}
    </Link>
  )
}

function SiderGroupBlock({
  group,
  pathname,
  term,
}: {
  group: SiderGroup
  pathname: string
  term: string
}) {
  /**
   * **หัวข้อกลุ่มหายไปด้วยเมื่อไม่มีอะไรอยู่ข้างใต้**
   *
   * หัวข้อที่ไม่มีรายการอยู่ข้างล่าง บอกว่า "กลุ่มนี้มีอยู่แต่ว่างเปล่า" ซึ่งไม่ช่วยอะไร
   * คนที่กำลังหาเมนู
   */
  const hasVisibleItem = useCanAny(group.items.map((i) => i.permission))
  if (!hasVisibleItem) return null

  const matched =
    term.length === 0
      ? group.items
      : group.items.filter((item) => item.label.toLowerCase().includes(term))

  if (matched.length === 0) return null

  return (
    <div className="flex flex-col gap-0.5">
      <span className="px-2 pb-0.5 text-xs font-medium text-muted-foreground/70">
        {group.label}
      </span>
      {matched.map((item) => (
        <SiderLink key={item.href} item={item} pathname={pathname} />
      ))}
    </div>
  )
}

export function AppSider() {
  const pathname = usePathname()

  /**
   * **คำค้นเมนูอยู่ใน state ไม่ใช่ใน URL** ต่างจากช่องค้นของหน้ารายการ
   *
   * มันเป็นคำที่ใช้หาทางชั่วคราว ไม่ควรติดไปกับลิงก์ที่คนก๊อปส่งต่อ และไม่ควรไปชนกับ
   * `?q=` ของหน้าปลายทาง · ผลพลอยได้คือไม่ต้องห่อ `Suspense`
   */
  const [term, setTerm] = useState('')

  if (!pathname?.startsWith(ROUTE_SETTINGS)) return null

  const needle = term.trim().toLowerCase()
  const anyVisible = SETTINGS_GROUPS.some((g) =>
    needle.length === 0 ? true : g.items.some((i) => i.label.toLowerCase().includes(needle)),
  )

  return (
    <aside className="flex w-[200px] shrink-0 flex-col gap-3 overflow-y-auto border-r bg-sidebar p-3">
      <div className="flex flex-col gap-2">
        <span className="px-1 text-sm font-semibold">จัดการข้อมูลหลัก</span>
        <SearchInput
          value={term}
          onChange={setTerm}
          placeholder="ค้นเมนู"
          aria-label="ค้นหาเมนูข้อมูลหลัก"
          clearLabel="ล้างคำค้น"
        />
      </div>

      {anyVisible ? (
        <nav className="flex flex-col gap-3">
          {SETTINGS_GROUPS.map((group) => (
            <SiderGroupBlock
              key={group.label}
              group={group}
              pathname={pathname}
              term={needle}
            />
          ))}
        </nav>
      ) : (
        <p className="px-2 text-xs text-muted-foreground">ไม่พบเมนูที่ค้นหา</p>
      )}
    </aside>
  )
}
