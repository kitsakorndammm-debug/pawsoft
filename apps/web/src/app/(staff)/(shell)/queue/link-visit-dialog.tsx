'use client'

import { Link2, PawPrint, UserRound, X } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { OwnerPickerDialog } from '@/features/owner/owner-picker-dialog'
import type { QueueRow } from '@/features/visit/api'
import { useLinkVisit } from '@/features/visit/hooks'
import { toErrorMessage } from '@/lib/api-client'

/**
 * ผูกคิวเข้ากับสัตว์ที่รู้ทีหลัง — **เคสฉุกเฉิน**
 *
 * (ผู้ใช้กำหนด 2026-09-01: "สามารถเชื่อมงานกับสัตว์และผู้ใช้ในระบบได้ภายหลัง")
 *
 * **ประวัติที่บันทึกไปแล้วไม่ต้องย้าย** — รายการยาและการรักษาชี้ `visit.id` ไม่ใช่
 * `pet.id` · ที่นี่แค่เติมว่าคิวนี้เป็นของสัตว์ตัวไหน
 *
 * ชื่อที่เขียนหน้างานไม่ถูกลบ — มันคือสิ่งที่พนักงานเห็นตอนนั้น และเป็นหลักฐานว่า
 * คิวนี้เคยเป็นเคสที่ไม่รู้ตัวตน
 */
export function LinkVisitDialog({
  row,
  open,
  onOpenChange,
}: {
  row: QueueRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const link = useLinkVisit()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [picked, setPicked] = useState<{
    ownerId: number
    ownerName: string
    ownerCode: string
    petId: number | null
    petName: string | null
  } | null>(null)

  function close(next: boolean) {
    if (!next) setPicked(null)
    onOpenChange(next)
  }

  async function submit() {
    if (!row || picked?.petId == null) return

    try {
      await link.mutateAsync({ id: row.id, petId: picked.petId })
      toast.success(`ผูกคิว ${row.queueNumber} กับ "${picked.petName}" แล้ว`)
      close(false)
    } catch (e) {
      toast.error(toErrorMessage(e))
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="size-5 text-primary-strong" />
              ผูกคิว {row?.queueNumber} กับสัตว์ในระบบ
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="rounded-md bg-muted p-2.5 text-sm">
              <span className="text-muted-foreground">ชื่อที่เขียนหน้างาน: </span>
              <span className="font-medium">{row?.walkInPetName ?? '—'}</span>
              {row?.walkInOwnerPhone ? (
                <span className="text-muted-foreground"> · {row.walkInOwnerPhone}</span>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>สัตว์ในระบบ</Label>

              {picked?.petId != null ? (
                <div className="flex items-center gap-2.5 rounded-md border bg-card p-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <PawPrint className="size-4 text-primary-strong" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{picked.petName}</span>
                    <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <UserRound className="size-3" />
                      {picked.ownerName} · {picked.ownerCode}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="เลือกใหม่"
                    onClick={() => setPicked(null)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="justify-start"
                  onClick={() => setPickerOpen(true)}
                >
                  <UserRound className="size-4" />
                  ค้นและเลือกสัตว์
                </Button>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              ยกเลิก
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={picked?.petId == null || link.isPending}
            >
              {link.isPending ? 'กำลังผูก…' : 'ผูกกับสัตว์นี้'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OwnerPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        mode="owner-pet"
        title="ค้นสัตว์ที่จะผูกกับคิวนี้"
        onPick={setPicked}
      />
    </>
  )
}
