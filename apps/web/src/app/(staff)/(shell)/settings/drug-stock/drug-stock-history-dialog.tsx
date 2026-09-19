'use client'

import { History, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DRUG_STOCK_MOVEMENT_TYPE_LABEL, type DrugStockMovementRow } from '@/features/drug-stock/api'
import { useDrugStockMovements, useReverseDrugStockMovement } from '@/features/drug-stock/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { formatDate } from '@/lib/format'

/**
 * ดูประวัติการเคลื่อนไหวของยาตัวเดียว
 *
 * **แก้ไข/ลบรายการเก่าไม่ได้ตรง ๆ — มีแต่ "ย้อนรายการ" แทน** (ผู้ใช้ตัดสิน 2026-09-20)
 * ยอดคงเหลือคือผลรวมของทุกแถว แก้แถวเก่าได้จะทำให้ยอดวันนี้เปลี่ยนแบบไม่มีร่องรอย ·
 * ย้อนรายการคือสร้างรายการปรับยอดตรงข้ามให้ใหม่ ของเดิมยังอยู่ครบ ตรวจสอบย้อนหลังได้
 *
 * **ย้อนได้เฉพาะ `RECEIVE`/`ADJUST`** — สองประเภทที่พนักงานกรอกเอง `DISPENSE`/
 * `DISPENSE_REVERSED` มาจากหน้าคิว ต้องแก้ที่นั่น ปุ่มย้อนจึงไม่โผล่ให้กดสองแบบนี้
 */
export function DrugStockHistoryDialog({
  drugId,
  drugName,
  canWrite,
  open,
  onOpenChange,
}: {
  drugId: number | null
  drugName: string
  canWrite: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const movements = useDrugStockMovements(open ? drugId : null)
  const reverse = useReverseDrugStockMovement()
  const [pendingReverse, setPendingReverse] = useState<DrugStockMovementRow | null>(null)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-5 text-primary-strong" />
              ประวัติสต็อก — {drugName}
            </DialogTitle>
          </DialogHeader>

          {movements.isPending ? (
            <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
          ) : movements.isError ? (
            <p className="text-sm text-destructive">{toErrorMessage(movements.error)}</p>
          ) : movements.data && movements.data.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              ยาตัวนี้ยังไม่เคยมีการเคลื่อนไหว
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {movements.data?.map((m) => {
                const canReverse = canWrite && (m.type === 'RECEIVE' || m.type === 'ADJUST')

                return (
                  <div key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-24 shrink-0 font-medium">
                      {DRUG_STOCK_MOVEMENT_TYPE_LABEL[m.type]}
                    </span>
                    <span
                      className={`w-20 shrink-0 text-right tabular-nums ${
                        Number(m.quantity) < 0 ? 'text-destructive' : ''
                      }`}
                    >
                      {Number(m.quantity) > 0 ? `+${m.quantity}` : m.quantity}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {m.reason ?? '—'}
                    </span>
                    {m.expiresOn ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        หมดอายุ {formatDate(m.expiresOn)}
                      </span>
                    ) : null}
                    <span className="shrink-0 text-xs text-muted-foreground">{m.createdByName}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(m.createdAt).toLocaleString('th-TH', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>

                    {canReverse ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="shrink-0 text-muted-foreground"
                              aria-label={`ย้อนรายการ ${DRUG_STOCK_MOVEMENT_TYPE_LABEL[m.type]} ${m.quantity}`}
                              onClick={() => setPendingReverse(m)}
                            >
                              <Undo2 className="size-3.5" />
                            </Button>
                          }
                        />
                        <TooltipContent>ย้อนรายการนี้ (บันทึกผิด)</TooltipContent>
                      </Tooltip>
                    ) : (
                      // จองที่ปุ่มไว้เท่าเดิม — แถวที่ย้อนไม่ได้ (DISPENSE) ไม่ขยับซ้ายขวา
                      <span className="size-7 shrink-0" aria-hidden />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ปิด
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingReverse !== null}
        onOpenChange={(next) => !next && setPendingReverse(null)}
        title="ย้อนรายการนี้"
        description={
          pendingReverse
            ? `จะสร้างรายการปรับยอดตรงข้ามให้ใหม่ (${
                Number(pendingReverse.quantity) > 0 ? '-' : '+'
              }${Math.abs(Number(pendingReverse.quantity))}) รายการเดิมยังอยู่ในประวัติเหมือนเดิม ไม่ถูกลบ`
            : ''
        }
        actionText="ย้อนรายการ"
        pending={reverse.isPending}
        onAction={async () => {
          if (!pendingReverse) return
          try {
            await reverse.mutateAsync(pendingReverse.id)
            toast.success('ย้อนรายการแล้ว')
            setPendingReverse(null)
          } catch (e) {
            toast.error(toErrorMessage(e))
          }
        }}
      />
    </>
  )
}
