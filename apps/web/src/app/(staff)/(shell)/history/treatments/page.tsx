'use client'

import { ArrowLeft, CalendarDays, Pill, Stethoscope, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { AppDatePicker } from '@/components/common/app-date-picker'
import { SearchInput } from '@/components/common/search-input'
import { Button } from '@/components/ui/button'
import { TRIAGE_LABEL, TRIAGE_STYLE, VISIT_STATUS_LABEL } from '@/features/visit/api'
import { useVisitBillHistory, useVisitHistory } from '@/features/history/hooks'
import { useOwnerSearch } from '@/features/owner/hooks'
import { usePetOptions } from '@/features/pet/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { ROUTE_HISTORY } from '@/lib/routes'
import { useDebounce } from '@/lib/use-debounce'
import { cn } from '@/lib/utils'

/**
 * ประวัติการรักษา — ค้นเจ้าของสัตว์ → เลือกสัตว์ → ดูการมาแต่ละครั้ง (ผู้ใช้ตัดสิน
 * 2026-09-18)
 *
 * **อ่านอย่างเดียว เปิดให้พนักงานทุกคนดูได้** — คนละหน้ากับกล่อง "ประวัติการรักษา"
 * ที่เปิดจากหน้าสัตว์เลี้ยงเดิม (ต้องมีสิทธิ์ `main:reception:read`) หน้านี้ไม่มีสิทธิ์
 * กั้นเลย ใครล็อกอินได้ก็ค้นดูได้
 */
function OwnerPicker({
  ownerId,
  onSelect,
}: {
  ownerId: number | null
  onSelect: (id: number, name: string) => void
}) {
  const [term, setTerm] = useState('')
  const debounced = useDebounce(term, 300)
  const owners = useOwnerSearch(debounced)

  return (
    <div className="flex flex-col gap-2">
      <SearchInput
        value={term}
        onChange={setTerm}
        placeholder="ค้นชื่อหรือเบอร์เจ้าของสัตว์"
        aria-label="ค้นเจ้าของสัตว์"
        clearLabel="ล้างคำค้น"
      />

      {debounced.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-md border bg-card">
          {owners.isPending ? (
            <p className="p-3 text-sm text-muted-foreground">กำลังค้นหา…</p>
          ) : (owners.data ?? []).length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">ไม่พบเจ้าของสัตว์ที่ค้น</p>
          ) : (
            (owners.data ?? []).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => onSelect(o.id, o.name)}
                className={cn(
                  'flex items-center gap-2 border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/50',
                  ownerId === o.id && 'bg-primary/10',
                )}
              >
                <UserRound className="size-4 shrink-0 text-primary-strong" />
                <span className="min-w-0 flex-1 truncate">{o.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{o.phone ?? '—'}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

function PetPicker({
  ownerId,
  petId,
  onSelect,
}: {
  ownerId: number
  petId: number | null
  onSelect: (id: number) => void
}) {
  const pets = usePetOptions(ownerId)

  if (pets.isPending) return <p className="text-sm text-muted-foreground">กำลังโหลดสัตว์เลี้ยง…</p>
  if ((pets.data ?? []).length === 0) {
    return <p className="text-sm text-muted-foreground">เจ้าของคนนี้ยังไม่มีสัตว์เลี้ยงในระบบ</p>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {(pets.data ?? []).map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSelect(p.id)}
          className={cn(
            'rounded-full border px-3 py-1 text-sm transition-colors',
            petId === p.id
              ? 'border-primary bg-primary/10 font-medium text-primary-strong'
              : 'hover:bg-muted',
          )}
        >
          {p.name}
        </button>
      ))}
    </div>
  )
}

function VisitBillDetail({ visitId }: { visitId: number }) {
  const bill = useVisitBillHistory(visitId)

  if (bill.isPending) return <p className="p-3 text-xs text-muted-foreground">กำลังโหลด…</p>

  const services = bill.data?.services ?? []
  const drugs = bill.data?.drugs ?? []

  return (
    <div className="border-t bg-muted/30 p-3 text-sm">
      <div className="flex flex-col gap-2">
        {services.length > 0 ? (
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium">
              <Stethoscope className="size-3.5 text-primary-strong" />
              รายการรักษา
            </p>
            {services.map((s) => (
              <div key={s.id} className="flex gap-2 py-0.5 text-xs">
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="text-muted-foreground">x{s.quantity}</span>
                <span className="w-16 text-right tabular-nums">{s.unitPrice}</span>
              </div>
            ))}
          </div>
        ) : null}

        {drugs.length > 0 ? (
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium">
              <Pill className="size-3.5 text-primary-strong" />
              ยา
            </p>
            {drugs.map((d) => (
              <div key={d.id} className="flex gap-2 py-0.5 text-xs">
                <span className="min-w-0 flex-1 truncate">
                  {d.name}
                  {d.dosage ? <span className="text-muted-foreground"> · {d.dosage}</span> : null}
                </span>
                <span className="text-muted-foreground">
                  {d.quantity}
                  {d.unit ? ` ${d.unit}` : ''}
                </span>
                <span className="w-16 text-right tabular-nums">{d.unitPrice}</span>
              </div>
            ))}
          </div>
        ) : null}

        {services.length === 0 && drugs.length === 0 ? (
          <p className="text-xs text-muted-foreground">ไม่มีรายการที่คิดเงิน</p>
        ) : (
          <div className="flex justify-between border-t pt-1.5 text-xs font-medium">
            <span>ยอดรวม</span>
            <span className="tabular-nums">{bill.data?.total ?? '0.00'}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * `petId` กับ `date` เลือกอย่างใดอย่างหนึ่ง — `petId` = ประวัติสัตว์ตัวเดียวทุกวัน ·
 * `date` = ทุกคิววันนั้นข้ามผู้ป่วย (ผู้ใช้ขอ 2026-09-20: "อยากดูว่ามีการรักษาอะไรบ้าง
 * ในเดือนนี้ เหมือนหน้าประวัติการเงิน") — โหมดหลังต้องโชว์ชื่อผู้ป่วยในแถว เพราะแต่ละ
 * แถวเป็นคนละตัวกัน ไม่เหมือนโหมด `petId` ที่รู้อยู่แล้วว่าเป็นสัตว์ตัวไหน
 */
function VisitList({ petId, date }: { petId: number | null; date: string | null }) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const { data, isPending, isError, error } = useVisitHistory(petId, date, 1)
  const rows = data?.rows ?? []
  const showPatient = petId === null

  if (isPending) return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
  if (isError) return <p className="text-sm text-destructive">{toErrorMessage(error)}</p>
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        {showPatient ? 'วันนี้ไม่มีคิว' : 'ยังไม่เคยมาคลินิก'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {showPatient ? `ทั้งหมด ${data?.page.total ?? 0} คิว` : `มาแล้ว ${data?.page.total ?? 0} ครั้ง`}
      </p>

      {rows.map((v) => (
        <div key={v.id} className="rounded-lg border bg-card">
          <button
            type="button"
            onClick={() => setExpanded(expanded === v.id ? null : v.id)}
            className="flex w-full items-center gap-2.5 p-3 text-left transition-colors hover:bg-muted/50"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <CalendarDays className="size-4 text-primary-strong" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="font-medium">{v.queueDate}</span>
                <span className="text-xs text-muted-foreground">คิว {v.queueNumber}</span>
                {v.triage !== 'NORMAL' ? (
                  <span className={cn('rounded px-1.5 py-0.5 text-xs', TRIAGE_STYLE[v.triage])}>
                    {TRIAGE_LABEL[v.triage]}
                  </span>
                ) : null}
              </span>
              {showPatient ? (
                <span className="block truncate text-xs text-foreground">
                  {v.petName ?? 'ไม่ระบุสัตว์'} · {v.ownerName ?? 'ไม่ระบุเจ้าของ'}
                </span>
              ) : null}
              <span className="block truncate text-xs text-muted-foreground">
                {v.diagnosis ?? v.symptom ?? 'ไม่มีบันทึก'}
              </span>
            </span>

            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs">
              {VISIT_STATUS_LABEL[v.status]}
            </span>
          </button>

          {expanded === v.id ? <VisitBillDetail visitId={v.id} /> : null}
        </div>
      ))}
    </div>
  )
}

export default function TreatmentHistoryPage() {
  const [owner, setOwner] = useState<{ id: number; name: string } | null>(null)
  const [petId, setPetId] = useState<number | null>(null)
  /**
   * เลือกวันที่ = สลับไปโหมด "ทุกคิววันนั้น" แทนการค้นทีละเจ้าของ/สัตว์ (ผู้ใช้ขอ
   * 2026-09-20) — สองโหมดตอบคนละคำถาม จึงไม่ปนกัน: มีวันที่ค้างอยู่ ซ่อนตัวค้นหาเจ้าของ
   */
  const [date, setDate] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="กลับไปหน้าประวัติ"
          title="กลับไปหน้าประวัติ"
          nativeButton={false}
          render={<Link href={ROUTE_HISTORY} />}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Stethoscope className="size-5 text-primary-strong" />
          ประวัติการรักษา
        </h1>

        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          <AppDatePicker
            value={date ?? ''}
            onChange={(v) => setDate(v ?? null)}
            className="w-40"
            aria-label="ดูประวัติการรักษาของวันที่"
          />
          {date ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setDate(null)}>
              ทุกวัน
            </Button>
          ) : null}
        </div>
      </div>

      {date !== null ? (
        <VisitList petId={null} date={date} />
      ) : (
        <>
          <OwnerPicker
            ownerId={owner?.id ?? null}
            onSelect={(id, name) => {
              setOwner({ id, name })
              setPetId(null)
            }}
          />

          {owner ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                สัตว์เลี้ยงของ <span className="font-medium text-foreground">{owner.name}</span>
              </p>
              <PetPicker ownerId={owner.id} petId={petId} onSelect={setPetId} />
            </div>
          ) : null}

          {petId !== null ? <VisitList petId={petId} date={null} /> : null}
        </>
      )}
    </div>
  )
}
