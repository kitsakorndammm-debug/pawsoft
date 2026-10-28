'use client'

import Link from 'next/link'
import { ArrowLeft, Wallet } from 'lucide-react'
import { useQueryState } from 'nuqs'
import { Suspense } from 'react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '@/features/payment/api'
import { useBillingSummary } from '@/features/payment/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { ROUTE_BILLING } from '@/lib/routes'

const METHODS: PaymentMethod[] = ['CASH', 'PROMPTPAY', 'TRANSFER']

const MONTH_LABEL = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
]

const now = new Date()
const CURRENT_YEAR = now.getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)

/**
 * สรุปยอดบัญชี — **ของบัญชีเท่านั้น** (ผู้ใช้ขอ 2026-10-29: "ให้มันตรงกับยอดที่เจ้าของ
 * ได้รับ ... ถ้าได้รับไม่ถูกต้องจะต้องให้บัญชีจัดการแก้ปัญหา")
 *
 * **โชว์ยอดรวมอย่างเดียว ไม่เทียบ/ไม่เตือนอะไรเอง** (ผู้ใช้ยืนยัน 2026-10-29) — บัญชี
 * เอาเลขนี้ไปเทียบกับ bank statement (พร้อมเพย์/โอน) หรือเงินสดในมือ (เงินสด) เองนอก
 * ระบบ ไม่มี logic พิเศษแยกตามวิธีจ่าย
 *
 * ตัดรอบด้วยเวลาที่เงินเข้าจริง (`payment.receivedAt`) ไม่ใช่เวลาที่บัญชียืนยัน — ดู
 * `getBillingSummary` ฝั่ง service
 */
function BillingSummaryBoard() {
  const [year, setYear] = useQueryState('year', {
    defaultValue: String(CURRENT_YEAR),
    clearOnDefault: true,
  })
  const [month, setMonth] = useQueryState('month', {
    defaultValue: String(now.getMonth() + 1),
    clearOnDefault: true,
  })

  const yearNum = Number(year) || CURRENT_YEAR
  const monthNum = month === '' ? null : Number(month) || null

  const { data, isPending, isError, error } = useBillingSummary({ year: yearNum, month: monthNum })

  const rowOf = (m: PaymentMethod) =>
    data?.byMethod.find((row) => row.method === m) ?? { method: m, count: 0, total: '0.00' }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="กลับไปหน้าการเงิน"
          title="กลับไปหน้าการเงิน"
          nativeButton={false}
          render={<Link href={ROUTE_BILLING} />}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Wallet className="size-5 text-primary-strong" />
          สรุปยอดบัญชี
        </h1>

        <div className="ml-auto flex items-center gap-2">
          <Select value={month || 'ALL'} onValueChange={(v) => void setMonth(v === 'ALL' ? '' : v)}>
            <SelectTrigger className="w-36" aria-label="เดือน">
              {/* `Select.Value` ไม่ดึงป้ายของ item ที่เลือกมาเองให้ — ต้องแม็ปเอง
                  (ดู `SelectValue.d.ts`: ไม่ใส่ children ฟังก์ชัน จะโชว์ค่าดิบ "10"
                  หรือ "ALL" แทนป้ายภาษาไทย) */}
              <SelectValue>
                {(v: string) => (v === 'ALL' ? 'ทั้งปี' : (MONTH_LABEL[Number(v) - 1] ?? v))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">ทั้งปี</SelectItem>
              {MONTH_LABEL.map((label, i) => (
                <SelectItem key={label} value={String(i + 1)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={year} onValueChange={(v) => void setYear(v)}>
            <SelectTrigger className="w-24" aria-label="ปี">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
      ) : isError ? (
        <p className="text-sm text-destructive">{toErrorMessage(error)}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <dl className="flex flex-col gap-1 rounded-md border bg-card p-4 text-sm">
            <div className="flex justify-between text-base font-medium text-foreground">
              <dt>ยอดรวมที่ยืนยันแล้ว</dt>
              <dd className="tabular-nums">{data.totalAmount} บาท</dd>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <dt>จำนวนใบเสร็จ</dt>
              <dd className="tabular-nums">{data.totalCount} ใบ</dd>
            </div>
          </dl>

          <div className="divide-y rounded-md border">
            {METHODS.map((m) => {
              const row = rowOf(m)
              return (
                <div key={m} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span>{PAYMENT_METHOD_LABEL[m]}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{row.count} ใบ</span>
                    <span className="w-28 text-right font-medium tabular-nums">{row.total} บาท</span>
                  </span>
                </div>
              )
            })}
          </div>

          {data.totalCount === 0 ? (
            <p className="text-sm text-muted-foreground">ไม่มีใบเสร็จที่ยืนยันแล้วในช่วงที่เลือก</p>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default function BillingSummaryPage() {
  // `useQueryState` อ่าน URL — ไม่ห่อ `Suspense` แล้ว `next build` พังทั้งหน้า
  return (
    <Suspense fallback={null}>
      <BillingSummaryBoard />
    </Suspense>
  )
}
