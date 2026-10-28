'use client'

import { Link2, PawPrint, UserPlus, UserRound, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Combobox } from '@/components/common/combobox'
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
import { useCreateOwner } from '@/features/owner/hooks'
import { OwnerPickerDialog } from '@/features/owner/owner-picker-dialog'
import { useBreedOptions, useCreatePet, useSpeciesOptions } from '@/features/pet/hooks'
import type { QueueRow } from '@/features/visit/api'
import { useLinkVisit } from '@/features/visit/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { cn } from '@/lib/utils'

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
 *
 * **สองโหมด** (ผู้ใช้ขอ 2026-10-29: "เปิดคิวแล้วมันไปลงทะเบียนผู้ใช้ด้วยได้มั้ย
 * โดยที่ไม่ต้องออกไปเพิ่ม"):
 *
 *   เลือกจากทะเบียน    ค้นหาสัตว์ที่มีอยู่แล้ว (เดิม)
 *   ลงทะเบียนใหม่      สร้างเจ้าของ+สัตว์ใหม่ตรงนี้เลย — ดึงชื่อ/เบอร์ที่เขียนไว้
 *                       ตอนเปิดคิวมาเติมให้อัตโนมัติ ไม่ต้องพิมพ์ซ้ำ
 *
 * **ไม่รวมเข้าฟอร์มเปิดคิว** — ฟอร์มเปิดคิวตั้งใจไม่ถามชนิดสัตว์เพื่อให้เคสฉุกเฉิน
 * กดจบใน 2 วินาที (ดู `check-in-dialog.tsx`) การลงทะเบียนเต็มต้องรู้ชนิดสัตว์
 * (บังคับที่ฐาน) จึงแยกมาเป็นขั้นที่สองตรงนี้แทน
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
  const createOwner = useCreateOwner()
  const createPet = useCreatePet()
  const species = useSpeciesOptions()

  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [picked, setPicked] = useState<{
    ownerId: number
    ownerName: string
    ownerCode: string
    petId: number | null
    petName: string | null
  } | null>(null)

  const [ownerName, setOwnerName] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [petName, setPetName] = useState('')
  const [speciesId, setSpeciesId] = useState<number | null>(null)
  const [breedId, setBreedId] = useState<number | null>(null)
  const breeds = useBreedOptions(speciesId)

  const pending = link.isPending || createOwner.isPending || createPet.isPending

  /**
   * ถูกควบคุมจากพ่อแม่ล้วน (`open={row !== null}`) — ไม่มี trigger ในนี้ · เติมชื่อ
   * ที่เขียนหน้างานตอนเปิดคิวให้อัตโนมัติทุกครั้งที่เปลี่ยนไปเป็นคิวใหม่
   */
  useEffect(() => {
    if (open && row) {
      setOwnerName(row.walkInOwnerName ?? '')
      setOwnerPhone(row.walkInOwnerPhone ?? '')
      setPetName(row.walkInPetName ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id])

  /** ปิด (ยกเลิก, Esc, คลิกข้างนอก, หรือหลังบันทึกสำเร็จ) — ล้างทุกอย่างเสมอ */
  function close(next: boolean) {
    if (!next) {
      setMode('existing')
      setPicked(null)
      setOwnerName('')
      setOwnerPhone('')
      setPetName('')
      setSpeciesId(null)
      setBreedId(null)
    }
    onOpenChange(next)
  }

  async function submitExisting() {
    if (!row || picked?.petId == null) return

    try {
      await link.mutateAsync({ id: row.id, petId: picked.petId })
      toast.success(`ผูกคิว ${row.queueNumber} กับ "${picked.petName}" แล้ว`)
      close(false)
    } catch (e) {
      toast.error(toErrorMessage(e))
    }
  }

  const canSubmitNew = ownerName.trim().length > 0 && petName.trim().length > 0 && speciesId !== null

  async function submitNew() {
    if (!row || !canSubmitNew || speciesId === null) return

    try {
      const owner = await createOwner.mutateAsync({
        name: ownerName.trim(),
        phone: ownerPhone.trim() || null,
        phoneAlt: null,
        email: null,
        address: null,
        note: null,
      })
      const pet = await createPet.mutateAsync({
        ownerId: owner.id,
        name: petName.trim(),
        speciesId,
        breedId,
        sex: 'UNKNOWN',
        isNeutered: null,
        bornOn: null,
        weightKg: null,
        color: null,
        microchip: null,
        allergyNote: null,
        note: null,
      })
      await link.mutateAsync({ id: row.id, petId: pet.id })
      toast.success(`ลงทะเบียน "${pet.name}" ของ "${owner.name}" แล้ว — ผูกกับคิว ${row.queueNumber}`)
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

            <div className="flex gap-1 rounded-md bg-muted p-1">
              <button
                type="button"
                onClick={() => setMode('existing')}
                className={cn(
                  'flex-1 rounded px-3 py-1.5 text-sm transition-colors',
                  mode === 'existing'
                    ? 'bg-background font-medium shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                เลือกจากทะเบียน
              </button>
              <button
                type="button"
                onClick={() => setMode('new')}
                className={cn(
                  'flex-1 rounded px-3 py-1.5 text-sm transition-colors',
                  mode === 'new'
                    ? 'bg-background font-medium shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <UserPlus className="mr-1 inline size-3.5" />
                ลงทะเบียนใหม่
              </button>
            </div>

            {mode === 'existing' ? (
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
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="new-owner-name">ชื่อเจ้าของ</Label>
                    <Input
                      id="new-owner-name"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      disabled={pending}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="new-owner-phone">เบอร์ติดต่อ</Label>
                    <Input
                      id="new-owner-phone"
                      value={ownerPhone}
                      onChange={(e) => setOwnerPhone(e.target.value)}
                      inputMode="tel"
                      disabled={pending}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-pet-name">ชื่อสัตว์</Label>
                  <Input
                    id="new-pet-name"
                    value={petName}
                    onChange={(e) => setPetName(e.target.value)}
                    disabled={pending}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label>ชนิดสัตว์</Label>
                    <Combobox
                      value={speciesId}
                      onChange={(v) => {
                        setSpeciesId(Number(v))
                        setBreedId(null)
                      }}
                      options={(species.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
                      placeholder="เลือกชนิด"
                      loading={species.isPending}
                      disabled={pending}
                      required
                      aria-label="ชนิดสัตว์"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>สายพันธุ์</Label>
                    <Combobox
                      value={breedId}
                      onChange={(v) => setBreedId(Number(v))}
                      options={(breeds.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
                      placeholder={speciesId === null ? 'เลือกชนิดก่อน' : 'ไม่บังคับ'}
                      loading={breeds.isPending && speciesId !== null}
                      disabled={pending || speciesId === null}
                      onClear={() => setBreedId(null)}
                      aria-label="สายพันธุ์"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              ยกเลิก
            </Button>
            {mode === 'existing' ? (
              <Button type="button" onClick={submitExisting} disabled={picked?.petId == null || pending}>
                {link.isPending ? 'กำลังผูก…' : 'ผูกกับสัตว์นี้'}
              </Button>
            ) : (
              <Button type="button" onClick={submitNew} disabled={!canSubmitNew || pending}>
                {pending ? 'กำลังลงทะเบียน…' : 'ลงทะเบียนและผูกคิว'}
              </Button>
            )}
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
