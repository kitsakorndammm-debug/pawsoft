'use client'

import { ArrowLeft, ClipboardList, Pill, Stethoscope } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { useMyVisit, useOwnerMe } from '@/features/owner-auth/hooks'
import type { MyVisitDrug, MyVisitService } from '@/features/owner-auth/api'
import { ROUTE_OWNER_HISTORY, ROUTE_OWNER_LOGIN } from '@/lib/routes'
import { cn } from '@/lib/utils'

/**
 * ประวัติการรักษาครั้งเดียว — **วันที่ รักษาอะไรไปบ้าง**
 *
 * (ผู้ใช้ขอ 2026-09-08: "กดเข้าไปดูได้ว่าวันที่เท่าไหร่ รักษาอะไรไปบ้าง" · หน้าตา
 * ปรับให้สมกับหน้าอื่นในแอปอีกที 2026-09-08)
 *
 * รูปหน้าเหมือนใบเสร็จรายใบ (`/owner/invoices/[id]`) แต่คนละข้อมูล — ที่นี่ตอบว่า
 * "รักษาอะไร" ใบเสร็จตอบว่า "จ่ายเท่าไหร่" · ครั้งที่ยังไม่ออกใบเสร็จก็ดูรายการ
 * รักษาที่นี่ได้อยู่แล้ว เพราะ BE ดึงจากคิว ไม่ใช่จากใบเสร็จ
 */
export default function MyVisitDetailPage() {
  const params = useParams<{ id: string }>()
  const id = Number(params.id)
  const router = useRouter()

  const { data: session, isLoading } = useOwnerMe()
  const visit = useMyVisit(Number.isFinite(id) ? id : null)

  useEffect(() => {
    if (!isLoading && !session) router.replace(ROUTE_OWNER_LOGIN)
  }, [session, isLoading, router])

  if (isLoading || !session || visit.isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
      </main>
    )
  }

  if (visit.isError || !visit.data) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 p-6">
        <BackButton />
        <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
          ไม่พบประวัติการรักษานี้
        </p>
      </main>
    )
  }

  const row = visit.data
  const diagnosed = row.diagnosis !== null
  const hasItems = row.services.length > 0 || row.drugs.length > 0

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 p-6">
      <header className="flex items-center gap-3 border-b pb-4">
        <BackButton icon />

        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Stethoscope className="size-5 text-primary" />
        </span>

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{row.petName ?? 'สัตว์เลี้ยง'}</h1>
          <p className="text-xs text-muted-foreground">{formatVisitDate(row.queueDate)}</p>
        </div>

        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
            diagnosed ? 'bg-emerald-500/10 text-emerald-700' : 'bg-muted text-muted-foreground',
          )}
        >
          {diagnosed ? 'วินิจฉัยแล้ว' : 'รอผลตรวจ'}
        </span>
      </header>

      {/* ---- การตรวจ ---- */}
      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
        {row.symptom !== null ? (
          <div className="border-l-2 border-muted pl-3">
            <span className="text-xs font-medium text-muted-foreground">อาการที่มา</span>
            <p className="text-sm">{row.symptom}</p>
          </div>
        ) : null}

        <div className={cn(row.symptom !== null && 'border-l-2 border-primary/30 pl-3')}>
          <span className="text-xs font-medium text-muted-foreground">ผลวินิจฉัย</span>
          {/* ยังไม่มีผลวินิจฉัยก็บอกตรง ๆ — ปล่อยว่างไว้ลูกค้าจะคิดว่าหน้าโหลดไม่ครบ */}
          <p className={cn('text-sm', !diagnosed && 'text-muted-foreground')}>
            {row.diagnosis ?? 'ยังไม่ได้บันทึก — สอบถามที่คลินิกได้'}
          </p>
        </div>

        {row.vetName !== null ? (
          <p className="text-xs text-muted-foreground">สัตวแพทย์ผู้ตรวจ: {row.vetName}</p>
        ) : null}
      </section>

      {/* ---- รายการรักษาและยา ---- */}
      {!hasItems ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-8 text-center">
          <ClipboardList className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">ยังไม่มีรายการรักษาหรือยาสำหรับครั้งนี้</p>
        </div>
      ) : (
        <>
          {row.services.length > 0 ? (
            <section className="flex flex-col gap-2">
              <SectionHeading label="รายการรักษา" count={row.services.length} />
              <div className="overflow-hidden rounded-2xl border bg-card">
                {row.services.map((s) => (
                  <ServiceRow key={s.id} row={s} />
                ))}
              </div>
            </section>
          ) : null}

          {row.drugs.length > 0 ? (
            <section className="flex flex-col gap-2">
              <SectionHeading label="ยาที่ได้รับ" count={row.drugs.length} />
              <div className="overflow-hidden rounded-2xl border bg-card">
                {row.drugs.map((d) => (
                  <DrugRow key={d.id} row={d} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </main>
  )
}

/** วันที่แบบเต็ม — ตัวเดียวกับที่ใช้ในลิสต์ (`history/page.tsx`) */
function formatVisitDate(queueDate: string): string {
  return new Date(`${queueDate}T00:00:00`).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function BackButton({ icon }: { icon?: boolean }) {
  if (icon) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="กลับไปหน้าประวัติการรักษา"
        nativeButton={false}
        render={<Link href={ROUTE_OWNER_HISTORY} />}
      >
        <ArrowLeft className="size-4" />
      </Button>
    )
  }

  return (
    <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={ROUTE_OWNER_HISTORY} />}>
      <ArrowLeft className="size-4" />
      กลับ
    </Button>
  )
}

/** หัวข้อหมวด พร้อมจำนวนรายการ — บอกก่อนว่าล่างนี้มีกี่อย่างโดยไม่ต้องนับเอง */
function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <h2 className="flex items-center gap-2 px-1 text-sm font-medium text-muted-foreground">
      {label}
      <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs">{count}</span>
    </h2>
  )
}

function ServiceRow({ row }: { row: MyVisitService }) {
  return (
    <div className="flex items-center gap-3 border-b p-3 last:border-b-0">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
        <Stethoscope className="size-4 text-primary-strong" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{row.name}</p>
        <p className="text-xs text-muted-foreground">{row.quantity} รายการ</p>
      </div>
    </div>
  )
}

function DrugRow({ row }: { row: MyVisitDrug }) {
  return (
    <div className="flex items-start gap-3 border-b p-3 last:border-b-0">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
        <Pill className="size-4 text-primary-strong" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{row.name}</p>
        <p className="text-xs text-muted-foreground">
          {row.quantity}
          {row.unit ? ` ${row.unit}` : ''}
        </p>
        {row.dosage !== null ? (
          <p className="mt-1 inline-block rounded-md bg-muted px-2 py-1 text-xs text-foreground">
            วิธีใช้: {row.dosage}
          </p>
        ) : null}
      </div>
    </div>
  )
}
