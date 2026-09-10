'use client'

import { AlertTriangle, PawPrint, Scale, Stethoscope, UserRound, X } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { OwnerPickerDialog } from '@/features/owner/owner-picker-dialog'
import { TRIAGE_LABEL, type TriageLevel } from '@/features/visit/api'
import { useCheckIn } from '@/features/visit/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { cn } from '@/lib/utils'

/**
 * ลงทะเบียนหน้างาน — **จุดเดียวที่คิวเกิดขึ้น**
 *
 * ฟอร์มนี้ต้องรองรับสองสถานการณ์ที่ขัดกันเอง:
 *
 *   ลูกค้าเก่าเดินเข้ามา   กดเลือกลูกค้า → เลือกสัตว์ในกล่องเดียว → เสร็จ
 *   เคสฉุกเฉินอุ้มเข้ามา   พิมพ์ชื่อสัตว์อย่างเดียว → กด → เสร็จใน 2 วินาที
 *
 * **จึงไม่ใช้ `FormDialog` + zod เหมือนฟอร์มอื่น** · schema ที่บังคับ "ต้องมีเจ้าของ
 * หรือต้องมีชื่อ" ทำได้ แต่หน้าจอที่ต้องสลับโหมดกลางคันคือสิ่งที่ทำให้เคสฉุกเฉินช้าลง
 *
 * **การเลือกลูกค้าเปิดเป็นกล่องแยก** (ผู้ใช้กำหนด 2026-09-01) — ช่องค้นที่ฝังอยู่ใน
 * ฟอร์มทำให้ผลค้นดันฟอร์มที่เหลือลงไป และคนกรอกต้องเลื่อนหาสิ่งที่กรอกค้างไว้
 */
export function CheckInDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const checkIn = useCheckIn()

  const [mode, setMode] = useState<'known' | 'unknown'>('known')
  const [triage, setTriage] = useState<TriageLevel>('NORMAL')
  const [pickerOpen, setPickerOpen] = useState(false)

  const [picked, setPicked] = useState<{
    ownerId: number
    ownerName: string
    ownerCode: string
    petId: number | null
    petName: string | null
  } | null>(null)

  const [walkInPetName, setWalkInPetName] = useState('')
  const [walkInOwnerName, setWalkInOwnerName] = useState('')
  const [walkInOwnerPhone, setWalkInOwnerPhone] = useState('')

  const [symptom, setSymptom] = useState('')
  const [weightKg, setWeightKg] = useState('')

  function reset() {
    setMode('known')
    setTriage('NORMAL')
    setPicked(null)
    setWalkInPetName('')
    setWalkInOwnerName('')
    setWalkInOwnerPhone('')
    setSymptom('')
    setWeightKg('')
  }

  function close(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  const canSubmit =
    mode === 'known' ? picked?.petId != null : walkInPetName.trim().length > 0

  async function submit() {
    if (!canSubmit) return

    try {
      const created = await checkIn.mutateAsync({
        appointmentId: null,
        ownerId: mode === 'known' ? (picked?.ownerId ?? null) : null,
        petId: mode === 'known' ? (picked?.petId ?? null) : null,
        walkInPetName: mode === 'unknown' ? walkInPetName.trim() : null,
        walkInOwnerName: mode === 'unknown' ? walkInOwnerName.trim() || null : null,
        walkInOwnerPhone: mode === 'unknown' ? walkInOwnerPhone.trim() || null : null,
        triage,
        symptom: symptom.trim() || null,
        weightKg: weightKg.trim() || null,
      })

      toast.success(`เปิดคิวหมายเลข ${created.queueNumber}`)
      close(false)
    } catch (e) {
      toast.error(toErrorMessage(e))
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PawPrint className="size-5 text-primary-strong" />
              ลงทะเบียนหน้างาน
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/*
              ระดับความเร่งด่วนอยู่**บนสุด** ไม่ใช่ล่างสุด — เคสแดงต้องกดได้ก่อนที่จะ
              เริ่มกรอกอะไรเลย และคนที่กำลังรีบจะไม่เลื่อนลงไปหาปุ่มข้างล่าง
            */}
            <div className="flex flex-col gap-1.5">
              <Label>ระดับความเร่งด่วน</Label>
              <div className="flex gap-2">
                {(['EMERGENCY', 'URGENT', 'NORMAL'] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setTriage(level)}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors',
                      triage === level
                        ? level === 'EMERGENCY'
                          ? 'border-red-400 bg-red-100 font-medium text-red-800'
                          : level === 'URGENT'
                            ? 'border-amber-400 bg-amber-100 font-medium text-amber-800'
                            : 'border-emerald-400 bg-emerald-50 font-medium text-emerald-800'
                        : 'border-input hover:bg-muted',
                    )}
                  >
                    {level === 'EMERGENCY' ? <AlertTriangle className="size-4" /> : null}
                    {TRIAGE_LABEL[level]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-1 rounded-md bg-muted p-1">
              <TabButton active={mode === 'known'} onClick={() => setMode('known')}>
                ลูกค้าในระบบ
              </TabButton>
              <TabButton active={mode === 'unknown'} onClick={() => setMode('unknown')}>
                ยังไม่มีในระบบ
              </TabButton>
            </div>

            {mode === 'known' ? (
              <div className="flex flex-col gap-1.5">
                <Label>ลูกค้าและสัตว์</Label>

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
                    เลือกลูกค้าและสัตว์
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="walkin-pet">ชื่อสัตว์ที่พามา</Label>
                  <Input
                    id="walkin-pet"
                    value={walkInPetName}
                    onChange={(e) => setWalkInPetName(e.target.value)}
                    placeholder="เช่น หมาถูกรถชน"
                    autoFocus
                  />
                  {/*
                    เหตุผลที่ช่องเดียวก็พอ — ระบบต้องไม่ยืนขวางการรักษา
                    ทะเบียนเต็มกรอกทีหลังแล้วกด "ผูกกับสัตว์" ที่บัตรคิว
                  */}
                  <p className="text-xs text-muted-foreground">
                    กรอกแค่ชื่อก็เปิดคิวได้ · ผูกกับทะเบียนสัตว์ทีหลังจากบัตรคิว
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="walkin-owner">ชื่อผู้พามา</Label>
                    <Input
                      id="walkin-owner"
                      value={walkInOwnerName}
                      onChange={(e) => setWalkInOwnerName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="walkin-phone">เบอร์ติดต่อ</Label>
                    <Input
                      id="walkin-phone"
                      value={walkInOwnerPhone}
                      onChange={(e) => setWalkInOwnerPhone(e.target.value)}
                      inputMode="tel"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="symptom" className="flex items-center gap-1.5">
                  <Stethoscope className="size-3.5" />
                  อาการที่แจ้ง
                </Label>
                <Textarea
                  id="symptom"
                  rows={2}
                  value={symptom}
                  onChange={(e) => setSymptom(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="weight" className="flex items-center gap-1.5">
                  <Scale className="size-3.5" />
                  น้ำหนัก (กก.)
                </Label>
                <Input
                  id="weight"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  inputMode="decimal"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              ยกเลิก
            </Button>
            <Button type="button" onClick={submit} disabled={!canSubmit || checkIn.isPending}>
              {checkIn.isPending ? 'กำลังเปิดคิว…' : 'เปิดคิว'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OwnerPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        mode="owner-pet"
        onPick={setPicked}
      />
    </>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded px-3 py-1.5 text-sm transition-colors',
        active ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
