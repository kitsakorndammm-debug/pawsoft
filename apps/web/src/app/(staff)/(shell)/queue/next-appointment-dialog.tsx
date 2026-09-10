'use client'

import { CalendarPlus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { AppDatePicker } from '@/components/common/app-date-picker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { SLOT_LABEL, type AppointmentSlot } from '@/features/appointment/api'
import { useSlots } from '@/features/appointment/hooks'
import { useBookNextVisitAppointment } from '@/features/visit/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { cn } from '@/lib/utils'

const SLOTS: AppointmentSlot[] = ['MORNING_1', 'MORNING_2', 'AFTERNOON_1', 'AFTERNOON_2']

/**
 * หมอนัดครั้งถัดไป — กล่องย่อยที่ซ้อนบน `VisitDetailDialog`
 *
 * **owner/pet ไม่ถามในกล่องนี้เลย** — BE ดึงจากคิวเองเสมอ (ต้องผูกเจ้าของแล้วเท่านั้น
 * ปุ่มที่เปิดกล่องนี้จึงซ่อนไว้ล่วงหน้าถ้าคิวยังไม่ผูก ดู `VisitDetailDialog`)
 */
export function NextAppointmentDialog({
  visitId,
  open,
  onOpenChange,
}: {
  visitId: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const slots = useSlots()
  const book = useBookNextVisitAppointment()

  const [bookedOn, setBookedOn] = useState('')
  const [slot, setSlot] = useState<AppointmentSlot>('MORNING_1')

  const today = slots.data?.today ?? ''
  const date = bookedOn || today

  function close(next: boolean) {
    if (!next) {
      setBookedOn('')
      setSlot('MORNING_1')
    }
    onOpenChange(next)
  }

  async function submit() {
    if (date === '') return

    try {
      await book.mutateAsync({ visitId, bookedOn: date, slot })
      toast.success(`นัดครั้งถัดไปวันที่ ${date} ${SLOT_LABEL[slot]} แล้ว`)
      close(false)
    } catch (e) {
      toast.error(toErrorMessage(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      {/* ซ้อนบน VisitDetailDialog — ทับพื้นหลังให้เข้มขึ้นกันสับสนว่ากำลังกรอกกล่องไหน */}
      <DialogContent className="sm:max-w-md" overlayClassName="bg-black/60">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="size-5 text-primary-strong" />
            นัดครั้งถัดไป
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>วันที่</Label>
            <AppDatePicker value={date} onChange={(v) => setBookedOn(v ?? '')} aria-label="วันที่นัด" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>ช่วงเวลา</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {SLOTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSlot(s)}
                  className={cn(
                    'rounded-md border px-2 py-2 text-xs transition-colors',
                    slot === s
                      ? 'border-primary bg-primary/10 font-medium'
                      : 'border-input hover:bg-muted',
                  )}
                >
                  {SLOT_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            ยกเลิก
          </Button>
          <Button type="button" onClick={() => void submit()} loading={book.isPending} disabled={date === ''}>
            บันทึกการนัด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
