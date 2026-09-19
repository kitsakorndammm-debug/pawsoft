'use client'

import Link from 'next/link'
import { Pill, Stethoscope, Wallet } from 'lucide-react'

import { ROUTE_HISTORY_DRUGS, ROUTE_HISTORY_PAYMENTS, ROUTE_HISTORY_TREATMENTS } from '@/lib/routes'

/**
 * หน้าแรกของ "ประวัติ" — ทางลัดไปสามหน้าย่อย
 *
 * **เปิดให้พนักงานทุกคนดูได้ ไม่มี permission กั้นเลย** (ผู้ใช้ตัดสิน 2026-09-18:
 * "เข้าระบบได้ก็ดูได้เลย") ต่างจากหน้าทำงานเดิม (สต็อกยา/การเงิน/คิว) ที่ยังต้องมีสิทธิ์
 * เฉพาะเหมือนเดิมทุกอย่าง — หน้านี้แค่ให้ดูย้อนหลัง ไม่มีปุ่มแก้ไข/บันทึกอะไรเลย
 */
const CARDS = [
  {
    label: 'ประวัติยา',
    hint: 'รับเข้า/เบิกจ่าย/ปรับยอด ทุกตัวยา พร้อมผู้ป่วยที่เกี่ยวข้อง',
    href: ROUTE_HISTORY_DRUGS,
    icon: Pill,
  },
  {
    label: 'ประวัติการเงิน',
    hint: 'ใบเสร็จและการชำระเงินทั้งหมด',
    href: ROUTE_HISTORY_PAYMENTS,
    icon: Wallet,
  },
  {
    label: 'ประวัติการรักษา',
    hint: 'ค้นสัตว์เลี้ยงแล้วดูการมาแต่ละครั้ง',
    href: ROUTE_HISTORY_TREATMENTS,
    icon: Stethoscope,
  },
] as const

export default function HistoryIndexPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">ประวัติ</h1>
        <p className="text-xs text-muted-foreground">ดูข้อมูลย้อนหลัง — พนักงานทุกคนดูได้</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
          >
            <card.icon className="mt-0.5 size-5 shrink-0 text-primary" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{card.label}</span>
              <span className="text-xs text-muted-foreground">{card.hint}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
