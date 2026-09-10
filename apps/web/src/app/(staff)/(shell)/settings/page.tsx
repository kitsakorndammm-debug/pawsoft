'use client'

import Link from 'next/link'
import { Boxes, Building2, Pill, ShieldCheck, Stethoscope, Users, UserSquare2 } from 'lucide-react'

import { useCan } from '@/features/auth/hooks'
import { DRUG_STOCK_READ, HR_READ, MASTER_READ } from '@/lib/permissions'
import {
  ROUTE_DEPARTMENTS,
  ROUTE_EMPLOYEES,
  ROUTE_POSITIONS,
  ROUTE_DRUGS,
  ROUTE_DRUG_STOCK,
  ROUTE_ROLES,
  ROUTE_SERVICE_ITEMS,
} from '@/lib/routes'

/**
 * หน้าแรกของ "ข้อมูลหลัก"
 *
 * เมนูซ้ายบอกอยู่แล้วว่ามีอะไรบ้าง หน้านี้จึงเป็นทางลัดสำหรับคนที่เพิ่งกดแท็บเข้ามา
 * และยังไม่รู้ว่าจะเริ่มตรงไหน — เรียงตามลำดับที่ต้องกรอกจริง
 */
const CARDS = [
  {
    label: 'แผนก',
    hint: 'กลุ่มงานในคลินิก — ตำแหน่งสังกัดแผนก',
    href: ROUTE_DEPARTMENTS,
    permission: MASTER_READ,
    icon: Building2,
  },
  {
    label: 'ตำแหน่ง',
    hint: 'ตำแหน่งงาน สังกัดแผนกหรือไม่สังกัดก็ได้',
    href: ROUTE_POSITIONS,
    permission: MASTER_READ,
    icon: UserSquare2,
  },
  {
    label: 'พนักงาน',
    hint: 'คนที่ทำงานอยู่ — เปิดบัญชีเข้าระบบให้ได้จากที่นี่',
    href: ROUTE_EMPLOYEES,
    permission: HR_READ,
    icon: Users,
  },
  {
    label: 'บทบาทและสิทธิ์',
    hint: 'ชุดสิทธิ์ที่บัญชีหนึ่งถือ',
    href: ROUTE_ROLES,
    permission: MASTER_READ,
    icon: ShieldCheck,
  },
  {
    label: 'ยาและเวชภัณฑ์',
    hint: 'ยา หมวดยา และราคา — ราคาไม่บังคับ',
    href: ROUTE_DRUGS,
    permission: MASTER_READ,
    icon: Pill,
  },
  {
    label: 'สต็อกยา',
    hint: 'ยอดคงเหลือ — รับเข้าและปรับยอดจากที่นี่',
    href: ROUTE_DRUG_STOCK,
    permission: DRUG_STOCK_READ,
    icon: Boxes,
  },
  {
    label: 'รายการรักษา',
    hint: 'บริการที่คลินิกให้ และค่าบริการ',
    href: ROUTE_SERVICE_ITEMS,
    permission: MASTER_READ,
    icon: Stethoscope,
  },
] as const

function SettingsCard({ card }: { card: (typeof CARDS)[number] }) {
  const allowed = useCan(card.permission)
  if (!allowed) return null

  const Icon = card.icon

  return (
    <Link
      href={card.href}
      className="flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
    >
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">{card.label}</span>
        <span className="text-xs text-muted-foreground">{card.hint}</span>
      </span>
    </Link>
  )
}

export default function SettingsIndexPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">ข้อมูลหลัก</h1>
        <p className="text-xs text-muted-foreground">
          ตั้งค่าโครงสร้างองค์กรและสิทธิ์การเข้าใช้งาน
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card) => (
          <SettingsCard key={card.href} card={card} />
        ))}
      </div>
    </div>
  )
}
