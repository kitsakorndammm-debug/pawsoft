'use client'

import { CalendarDays, Pill, Stethoscope } from 'lucide-react'
import { useState } from 'react'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Pet } from '@/features/pet/api'
import { TRIAGE_LABEL, TRIAGE_STYLE, VISIT_STATUS_LABEL } from '@/features/visit/api'
import { useVisitBill, useVisits } from '@/features/visit/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { cn } from '@/lib/utils'

/**
 * ประวัติการรักษาของสัตว์ตัวหนึ่ง — **กล่องบนหน้าสัตว์ ไม่ใช่เมนูแยก**
 *
 * (ผู้ใช้ตัดสิน 2026-09-01)
 *
 * คนที่อยากรู้ว่า "ตัวนี้เคยมากี่ครั้ง" กำลังมองสัตว์ตัวนั้นอยู่แล้ว · เมนูแยกแปลว่า
 * ต้องออกจากหน้านี้แล้วไปค้นชื่อเดิมอีกรอบ
 *
 * `GET /api/visits?petId=` มีมาตั้งแต่ stage 3 แต่ไม่มีหน้าไหนเรียก — ตัวนี้คือหน้าที่
 * ทำให้มันมีคนใช้
 */
export function PetHistoryDialog({
  pet,
  open,
  onOpenChange,
}: {
  pet: Pet | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [expanded, setExpanded] = useState<number | null>(null)

  const { data, isPending, isError, error } = useVisits({
    petId: pet?.id ?? null,
    ownerId: null,
    page: 1,
  })

  const rows = data?.rows ?? []

  function close(next: boolean) {
    if (!next) setExpanded(null)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stethoscope className="size-5 text-primary-strong" />
            ประวัติการรักษา — {pet?.name ?? ''}
            <span className="text-sm font-normal text-muted-foreground">{pet?.code}</span>
          </DialogTitle>
        </DialogHeader>

        {/* ประวัติแพ้ยาอยู่บนสุด — เป็นข้อมูลที่ต้องเห็นก่อนอ่านอย่างอื่น */}
        {pet?.allergyNote ? (
          <div className="rounded-md border border-red-300 bg-red-50 p-2.5 text-sm text-red-900">
            <span className="font-medium">แพ้ยา:</span> {pet.allergyNote}
          </div>
        ) : null}

        {isPending ? (
          <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
        ) : isError ? (
          <p className="text-sm text-destructive">{toErrorMessage(error)}</p>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            ยังไม่เคยมาคลินิก
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">มาแล้ว {data?.page.total ?? 0} ครั้ง</p>

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
                    <span className="block truncate text-xs text-muted-foreground">
                      {v.diagnosis ?? v.symptom ?? 'ไม่มีบันทึก'}
                    </span>
                  </span>

                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs">
                    {VISIT_STATUS_LABEL[v.status]}
                  </span>
                </button>

                {/* กางดูรายละเอียดในที่เดิม — ไม่เปิดกล่องซ้อนกล่อง */}
                {expanded === v.id ? <VisitDetail visitId={v.id} weightKg={v.weightKg} /> : null}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * รายละเอียดของการมาครั้งหนึ่ง
 *
 * **ยิงบิลเฉพาะตอนกางดู** — คิวสามสิบใบที่ยิงบิลทุกใบตอนเปิดกล่อง คือสามสิบ request
 * ที่ส่วนใหญ่ไม่มีใครอ่าน
 */
function VisitDetail({ visitId, weightKg }: { visitId: number; weightKg: string | null }) {
  const bill = useVisitBill(visitId)

  return (
    <div className="border-t bg-muted/30 p-3 text-sm">
      {weightKg ? (
        <p className="mb-2 text-xs text-muted-foreground">น้ำหนักครั้งนั้น {weightKg} กก.</p>
      ) : null}

      {bill.isPending ? (
        <p className="text-xs text-muted-foreground">กำลังโหลด…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {(bill.data?.services ?? []).length > 0 ? (
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium">
                <Stethoscope className="size-3.5 text-primary-strong" />
                รายการรักษา
              </p>
              {(bill.data?.services ?? []).map((s) => (
                <div key={s.id} className="flex gap-2 py-0.5 text-xs">
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="text-muted-foreground">x{s.quantity}</span>
                  <span className="w-16 text-right tabular-nums">{s.unitPrice}</span>
                </div>
              ))}
            </div>
          ) : null}

          {(bill.data?.drugs ?? []).length > 0 ? (
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium">
                <Pill className="size-3.5 text-primary-strong" />
                ยา
              </p>
              {(bill.data?.drugs ?? []).map((d) => (
                <div key={d.id} className="flex gap-2 py-0.5 text-xs">
                  <span className="min-w-0 flex-1 truncate">
                    {d.name}
                    {d.dosage ? (
                      <span className="text-muted-foreground"> · {d.dosage}</span>
                    ) : null}
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

          {(bill.data?.services ?? []).length === 0 && (bill.data?.drugs ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">ไม่มีรายการที่คิดเงิน</p>
          ) : (
            <div className="flex justify-between border-t pt-1.5 text-xs font-medium">
              <span>ยอดรวม</span>
              {/* เงินเป็นข้อความจาก BE — ห้าม `Number()` */}
              <span className="tabular-nums">{bill.data?.total ?? '0.00'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
