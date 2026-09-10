'use client'

import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Owner } from '@/features/owner/api'
import { useLinkOwnerAccount, useUnlinkedAccounts } from '@/features/owner/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { cn } from '@/lib/utils'

/**
 * เชื่อมบัญชี Google กับข้อมูลลูกค้า — **งานของพนักงาน**
 *
 * (ผู้ใช้กำหนด 2026-09-01: "พนักงานจะสามารถจับคู่ภายหลังได้ เผื่อกรณีครั้งแรกลูกค้ามา
 * หน้างานแล้วไปสมัครทีหลัง")
 *
 * **ไม่จับคู่อัตโนมัติด้วยอีเมล** ทั้งที่ทำได้ — คนในบ้านเดียวกันใช้อีเมลเดียวกันพา
 * สัตว์คนละตัวมา และผลของการเดาผิดคือคนแปลกหน้าเห็นประวัติสัตว์ของคนอื่น ·
 * ให้คนที่คุยกับลูกค้าอยู่ตรงหน้าเป็นคนยืนยัน
 *
 * **ค้นเจอเฉพาะบัญชีที่ยังว่าง** — บัญชีที่ผูกกับคนอื่นแล้วไม่โผล่ในผลค้น เพราะ
 * มันคือตัวเลือกที่กดแล้วโดนปฏิเสธเสมอ
 */
export function LinkAccountDialog({
  row,
  open,
  onOpenChange,
}: {
  row: Owner | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const link = useLinkOwnerAccount()

  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<number | null>(null)
  const accounts = useUnlinkedAccounts(q)

  function close(next: boolean) {
    if (!next) {
      setQ('')
      setPicked(null)
    }
    onOpenChange(next)
  }

  const linked = row?.petOwnerAccountId !== null && row?.petOwnerAccountId !== undefined

  async function submit(value: number | null) {
    if (!row) return

    try {
      await link.mutateAsync({ id: row.id, petOwnerAccountId: value })
      toast.success(value === null ? 'ถอนการเชื่อมแล้ว' : 'เชื่อมบัญชีแล้ว')
      close(false)
    } catch (e) {
      toast.error(toErrorMessage(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>เชื่อมบัญชี Google — {row?.name}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {linked ? (
            <div className="rounded-md bg-emerald-50 p-3 text-sm">
              เชื่อมกับบัญชีหมายเลข{' '}
              <span className="font-medium">{row?.petOwnerAccountId}</span> อยู่แล้ว
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              ค้นด้วยอีเมลหรือชื่อที่ลูกค้าใช้ล็อกอิน Google · ลูกค้าดูเลขบัญชีของตัวเองได้
              ที่หน้าแรกหลังล็อกอิน
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="acct-q">ค้นบัญชี</Label>
            <Input
              id="acct-q"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPicked(null)
              }}
              placeholder="อีเมลหรือชื่อ"
              autoFocus
            />
          </div>

          {q.trim().length > 0 ? (
            <div className="max-h-40 overflow-y-auto rounded-md border">
              {accounts.isPending ? (
                <p className="p-2 text-sm text-muted-foreground">กำลังค้น…</p>
              ) : (accounts.data ?? []).length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">
                  ไม่พบบัญชีที่ยังว่าง — ลูกค้าต้องล็อกอิน Google อย่างน้อยหนึ่งครั้งก่อน
                </p>
              ) : (
                (accounts.data ?? []).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setPicked(a.id)}
                    className={cn(
                      'flex w-full flex-col gap-0.5 px-2 py-1.5 text-left hover:bg-muted',
                      picked === a.id && 'bg-primary/10',
                    )}
                  >
                    <span className="text-sm font-medium">{a.displayName}</span>
                    <span className="text-xs text-muted-foreground">
                      {a.email} · เลขบัญชี {a.id}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            ยกเลิก
          </Button>

          {linked ? (
            <Button
              type="button"
              variant="outline"
              className="text-destructive"
              onClick={() => void submit(null)}
              disabled={link.isPending}
            >
              ถอนการเชื่อม
            </Button>
          ) : null}

          <Button
            type="button"
            onClick={() => void submit(picked)}
            disabled={picked === null || link.isPending}
          >
            เชื่อมบัญชี
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
