'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { Combobox } from '@/components/common/combobox'
import { FileDrop } from '@/components/common/file-drop'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { toErrorMessage } from '@/lib/api-client'

import { useBreeds, useCreateMyPet, useSpecies, useUpdateMyPet, useUploadPetPhoto } from './hooks'
import type { MyPet } from './api'

/**
 * ลูกค้าเพิ่มสัตว์ของตัวเอง
 *
 * (ผู้ใช้กำหนด 2026-09-01: "1. สร้างสัตว์")
 *
 * **ขอแค่ชื่อกับชนิด** — สองอย่างนี้คือทั้งหมดที่ฐานบังคับ · น้ำหนัก · สี · ไมโครชิป
 * หมอกรอกตอนตรวจได้และแม่นกว่า · ฟอร์มยาวบนมือถือคือฟอร์มที่คนกรอกไม่จบ
 */
/**
 * แถวของฟอร์ม — ป้ายซ้าย ช่องขวา
 *
 * ป้ายกว้างคงที่ทำให้ทุกช่องเริ่มตรงกัน · ปล่อยให้ยืดตามความยาวคำ ช่องจะเยื้องกันเป็นขั้นบันได
 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function AddPetDialog({
  open,
  onOpenChange,
  /** ส่งมา = โหมดแก้ไข · ไม่ส่ง = เพิ่มตัวใหม่ */
  pet,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pet?: MyPet | null
}) {
  const create = useCreateMyPet()
  const update = useUpdateMyPet()
  const uploadPhoto = useUploadPetPhoto()
  const species = useSpecies(open)

  const editing = pet != null

  const [name, setName] = useState('')
  const [speciesId, setSpeciesId] = useState<number | null>(null)
  const [breedId, setBreedId] = useState<number | null>(null)
  /** รูปที่เพิ่งเลือก — อัปหลังบันทึกสำเร็จ ไม่ใช่ตอนเลือก */
  const [photo, setPhoto] = useState<File | null>(null)

  /**
   * เติมค่าเดิมตอนเปิดโหมดแก้ไข
   *
   * **ผูกกับ `open` ด้วย** — ไม่ผูก ค่าจะค้างจากตัวที่เปิดครั้งก่อน แล้วคนที่กดแก้
   * สัตว์ตัวที่สองจะเห็นชื่อของตัวแรก
   */
  useEffect(() => {
    if (!open) return

    setName(pet?.name ?? '')
    setSpeciesId(pet?.speciesId ?? null)
    setBreedId(null)
    setPhoto(null)
  }, [open, pet])

  const breeds = useBreeds(speciesId)

  const pending = create.isPending || update.isPending || uploadPhoto.isPending
  const canSubmit = name.trim().length > 0 && speciesId !== null && !pending

  function close() {
    onOpenChange(false)
    setName('')
    setSpeciesId(null)
    setBreedId(null)
    setPhoto(null)
  }

  async function submit() {
    if (!canSubmit) return

    const body = {
      name: name.trim(),
      speciesId: String(speciesId),
      breedId: breedId === null ? null : String(breedId),
      bornOn: null,
      note: null,
    }

    try {
      /**
       * **บันทึกข้อมูลก่อน แล้วค่อยอัปรูป** — รูปต้องมี `petId` ถึงจะอัปได้
       *
       * รูปอัปไม่ผ่านไม่ถือว่าทั้งงานล้ม · ข้อมูลบันทึกไปแล้วจริง ๆ · บอกให้รู้แล้ว
       * ให้ลองใหม่จากปุ่มเปลี่ยนรูป ดีกว่าย้อนทุกอย่างกลับ
       */
      const saved = editing
        ? await update.mutateAsync({ id: pet.id, ...body })
        : await create.mutateAsync(body)

      if (photo !== null) {
        try {
          await uploadPhoto.mutateAsync({ id: saved.id, file: photo })
        } catch (e) {
          toast.error(`บันทึกแล้ว แต่อัปรูปไม่สำเร็จ — ${toErrorMessage(e)}`)
          close()

          return
        }
      }

      toast.success(editing ? `แก้ไข ${saved.name} แล้ว` : `เพิ่ม ${saved.name} แล้ว`)
      close()
    } catch (e) {
      toast.error(toErrorMessage(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'แก้ไขสัตว์เลี้ยง' : 'เพิ่มสัตว์เลี้ยง'}</DialogTitle>
          <DialogDescription>
            กรอกแค่ชื่อกับชนิด — ที่เหลือเจ้าหน้าที่กรอกให้ตอนพามาตรวจ
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-3">
          {/*
            **ป้ายอยู่ซ้าย ช่องอยู่ขวา ไม่ใช่ป้ายบนช่องล่าง**

            (ผู้ใช้ทักท้วง 2026-09-01: "การใช้ form ก็ยังเปลืองบรรทัดอยู่ในหน้าสร้างสัตว์
            ไม่มืออาชีพเลย")

            แบบเดิมสามช่องกินสามคู่บรรทัด ~250px · แบบนี้เหลือสามบรรทัด และตากวาด
            ลงมาตรงขอบเดียวได้ · ชนิดกับพันธุ์อยู่แถวเดียวกันเพราะเป็นคำถามเดียวกัน
            แค่หยาบกับละเอียด
          */}
          <Field label="ชื่อ">
            <Input
              id="pname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น ข้าวปั้น"
              disabled={pending}
              className="h-9"
            />
          </Field>

          <Field label="ชนิด">
            <div className="flex gap-2">
              <Combobox
                value={speciesId}
                onChange={(v) => {
                  setSpeciesId(v)
                  // เปลี่ยนชนิดแล้วพันธุ์เดิมใช้ไม่ได้ — ล้างทิ้ง ไม่งั้นส่งพันธุ์ข้ามชนิดไป
                  setBreedId(null)
                }}
                options={(species.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
                placeholder="เลือกชนิด"
                required
                disabled={pending}
                className="h-9 flex-1"
              />

              {/*
                พันธุ์ขึ้นข้าง ๆ เมื่อเลือกชนิดแล้ว — ไม่ใช่แถวใหม่ด้านล่าง
                ยังไม่เลือกชนิดก็ยังไม่มีพันธุ์ให้เลือกอยู่ดี
              */}
              {speciesId !== null ? (
                <Combobox
                  value={breedId}
                  onChange={setBreedId}
                  options={(breeds.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
                  placeholder={breeds.isPending ? 'กำลังโหลด…' : 'พันธุ์ (ถ้าทราบ)'}
                  disabled={pending}
                  className="h-9 flex-1"
                />
              ) : null}
            </div>
          </Field>

          {/*
            รูปสัตว์ (ผู้ใช้กำหนด 2026-09-01: "อยากให้มีการอัพโหลดรูปด้วย")

            **ไม่รับ PDF ต่างจากช่องแนบสลิป** — รูปสัตว์ที่เป็น PDF คือไฟล์ที่แนบผิด
          */}
          <Field label="รูป">
            <FileDrop
              value={photo}
              onChange={setPhoto}
              accept="image/png,image/jpeg,image/webp"
              maxSizeMb={3}
              disabled={pending}
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={pending}>
            ยกเลิก
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit} loading={pending}>
            {editing ? 'บันทึก' : 'เพิ่มสัตว์เลี้ยง'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
