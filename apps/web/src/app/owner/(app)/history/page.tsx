'use client'

import { ChevronRight, PawPrint, Stethoscope } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { useMyVisits, useOwnerMe } from '@/features/owner-auth/hooks'
import type { MyVisit } from '@/features/owner-auth/api'
import { ROUTE_OWNER_LOGIN, routeOwnerHistory } from '@/lib/routes'
import { cn } from '@/lib/utils'

/**
 * ประวัติการรักษาของลูกค้า
 *
 * (ผู้ใช้กำหนด 2026-09-01: "3. ดูประวัติรักษา")
 *
 * **เห็นเฉพาะครั้งที่ตรวจจบแล้ว** — BE กรองให้ (`listMyVisits`) · คิวที่หมอยังตรวจ
 * ไม่เสร็จมีผลวินิจฉัยที่เขียนค้างไว้ครึ่งทาง ซึ่งลูกค้าอ่านแล้วเข้าใจผิดได้
 */
export default function MyHistoryPage() {
  const { data: session, isLoading } = useOwnerMe()
  const router = useRouter()
  const visits = useMyVisits(1)

  useEffect(() => {
    if (!isLoading && !session) router.replace(ROUTE_OWNER_LOGIN)
  }, [session, isLoading, router])

  if (isLoading || !session) {
    return (
      <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
    )
  }

  const rows = visits.data?.rows ?? []

  return (
    <div className="flex flex-col gap-5">
      <h1 className="flex items-center gap-2 text-lg font-semibold">
        <Stethoscope className="size-5 text-primary" />
        ประวัติการรักษา
      </h1>

      {visits.isPending ? (
        <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-8 text-center">
          <Stethoscope className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            ยังไม่มีประวัติการรักษา — จะขึ้นหลังพาสัตว์มาตรวจและหมอบันทึกผลแล้ว
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((v) => (
            <VisitCard key={v.id} row={v} />
          ))}
        </div>
      )}
    </div>
  )
}

/** วันที่แบบเต็ม — อ่านง่ายกว่า `2026-09-08` ตอนกวาดตาหาในลิสต์ */
function formatVisitDate(queueDate: string): string {
  return new Date(`${queueDate}T00:00:00`).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** กดเข้าไปดูรายการรักษาและยาของครั้งนี้ได้ (ผู้ใช้ขอ 2026-09-08) */
function VisitCard({ row }: { row: MyVisit }) {
  const diagnosed = row.diagnosis !== null

  return (
    <Link
      href={routeOwnerHistory(row.id)}
      className="flex items-start gap-3 rounded-2xl border bg-card p-4 transition-colors hover:bg-accent"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <PawPrint className="size-5 text-primary" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="truncate font-medium">{row.petName ?? 'สัตว์เลี้ยง'}</h2>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatVisitDate(row.queueDate)}
          </span>
        </div>

        {row.symptom !== null ? (
          <p className="mt-1 truncate text-sm text-muted-foreground">
            อาการที่มา: {row.symptom}
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
              diagnosed
                ? 'bg-emerald-500/10 text-emerald-700'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {diagnosed ? 'วินิจฉัยแล้ว' : 'รอผลตรวจ'}
          </span>

          {row.vetName !== null ? (
            <span className="truncate text-xs text-muted-foreground">{row.vetName}</span>
          ) : null}
        </div>
      </div>

      <ChevronRight className="mt-2.5 size-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}
