'use client'

import { History } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { WAREHOUSE_STOCK_MOVEMENT_TYPE_LABEL } from '@/features/warehouse-stock/api'
import { useWarehouseStockMovements } from '@/features/warehouse-stock/hooks'
import { toErrorMessage } from '@/lib/api-client'

/** ดูประวัติการเคลื่อนไหวของยาตัวเดียวในคลัง — อ่านอย่างเดียว ไม่มีแก้/ลบ เพราะเป็น log */
export function WarehouseStockHistoryDialog({
  drugId,
  drugName,
  open,
  onOpenChange,
}: {
  drugId: number | null
  drugName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const movements = useWarehouseStockMovements(open ? drugId : null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5 text-primary-strong" />
            ประวัติคลังยา — {drugName}
          </DialogTitle>
        </DialogHeader>

        {movements.isPending ? (
          <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
        ) : movements.isError ? (
          <p className="text-sm text-destructive">{toErrorMessage(movements.error)}</p>
        ) : movements.data && movements.data.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            ยาตัวนี้ยังไม่เคยมีการเคลื่อนไหวในคลัง
          </p>
        ) : (
          <div className="divide-y rounded-md border">
            {movements.data?.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-24 shrink-0 font-medium">
                  {WAREHOUSE_STOCK_MOVEMENT_TYPE_LABEL[m.type]}
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
                <span className="shrink-0 text-xs text-muted-foreground">{m.createdByName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(m.createdAt).toLocaleString('th-TH', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
