'use client'

import { ArrowLeft, CalendarDays, PawPrint, Plus, Stethoscope } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { AppDatePicker } from '@/components/common/app-date-picker'
import { Combobox } from '@/components/common/combobox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SLOT_LABEL, type AppointmentSlot } from '@/features/appointment/api'
import { useCreateMyAppointment, useMySlots } from '@/features/appointment/hooks'
import { useBreeds, useCreateMyPet, useMyPets, useMyProfile, useSpecies } from '@/features/owner-auth/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { ROUTE_OWNER_HOME } from '@/lib/routes'
import { cn } from '@/lib/utils'

const SLOTS: AppointmentSlot[] = ['MORNING_1', 'MORNING_2', 'AFTERNOON_1', 'AFTERNOON_2']

/**
 * ลูกค้าจองคิวเอง — ทาง 1 ของทั้งสามทาง
 *
 * **จองเป็นช่วงเวลา ไม่ใช่นาที** (ผู้ใช้กำหนด 2026-09-01) · การรักษาคาดเวลาเป๊ะ ๆ
 * ไม่ได้และเคสฉุกเฉินแทรกได้ตลอด · ให้จอง 10:30 คือการสัญญาเวลาที่คลินิกรักษาไม่ได้
 * แล้วทุกคนที่มาตามเวลาจะรู้สึกว่าระบบโกหก
 *
 * **ข้อความบนหน้าบอกตรง ๆ ว่านี่ไม่ใช่คิว** — พอมาถึงคลินิกยังต้องลงทะเบียนที่
 * เคาน์เตอร์อยู่ดี · ไม่บอกไว้ ลูกค้าจะเดินเข้ามาแล้วคิดว่าตัวเองมีคิวอยู่แล้ว
 */
export default function OwnerBookingPage() {
  const router = useRouter()
  const profile = useMyProfile()
  const linked = profile.data?.owner != null
  const pets = useMyPets(linked)
  const slots = useMySlots()
  const create = useCreateMyAppointment()

  const [petId, setPetId] = useState<number | null>(null)
  const [petNameText, setPetNameText] = useState('')

  /** ฟอร์มสัตว์ตัวใหม่ — เปิดแล้วสร้างจริงตอนกดจอง ไม่ใช่ตอนพิมพ์ */
  const [newPetOpen, setNewPetOpen] = useState(false)
  const [newSpeciesId, setNewSpeciesId] = useState<number | null>(null)
  const [newBreedId, setNewBreedId] = useState<number | null>(null)
  const [bookedOn, setBookedOn] = useState('')
  const [slot, setSlot] = useState<AppointmentSlot>('MORNING_1')
  const [reason, setReason] = useState('')

  const species = useSpecies(newPetOpen)
  const breeds = useBreeds(newSpeciesId)
  const createPet = useCreateMyPet()

  const today = slots.data?.today ?? ''
  const date = bookedOn || today

  /**
   * **สัตว์ตัวใหม่ต้องมีทั้งชื่อและชนิด** — ไม่ใช่แค่ชื่อเหมือนเดิม
   *
   * ชนิดเป็นฟิลด์บังคับของตาราง `pet` · ขอไม่ครบแปลว่าสร้างไม่ได้ แล้วต้องถอยไป
   * เก็บเป็นข้อความเปล่าเหมือนเดิม ซึ่งเป็นสิ่งที่กำลังแก้อยู่พอดี
   */
  const newPetReady = petNameText.trim().length > 0 && newSpeciesId !== null
  const canSubmit =
    date !== '' && (petId !== null || newPetReady) && !createPet.isPending

  async function submit() {
    if (!canSubmit) return

    try {
      /**
       * **สร้างสัตว์ก่อน แล้วค่อยจองด้วย `petId` จริง**
       *
       * (ผู้ใช้กำหนด 2026-09-01) · ใบจองที่ผูกกับแถวสัตว์จริงทำให้ประวัติการรักษา
       * ครั้งนี้ไปอยู่กับสัตว์ตัวนั้นตั้งแต่แรก · เก็บเป็นข้อความแปลว่าเจ้าหน้าที่ต้อง
       * มาจับคู่เองทีหลัง และบางครั้งก็ลืม
       *
       * สร้างไม่ผ่าน (ชื่อซ้ำ · เน็ตหลุด) จะโยน error ออกไปให้ `catch` ข้างล่าง
       * และ **ไม่จอง** — ใบจองที่ชี้ไปสัตว์ที่ไม่มีอยู่แย่กว่าไม่ได้จอง
       */
      let bookPetId = petId

      if (bookPetId === null && newPetReady) {
        const created = await createPet.mutateAsync({
          name: petNameText.trim(),
          speciesId: String(newSpeciesId),
          breedId: newBreedId === null ? null : String(newBreedId),
          bornOn: null,
          note: null,
        })
        bookPetId = created.id
      }

      await create.mutateAsync({
        bookedOn: date,
        slot,
        petId: bookPetId,
        petNameText: null,
        reason: reason.trim() || null,
      })

      toast.success('ส่งคำขอจองแล้ว — เจ้าหน้าที่จะโทรยืนยันอีกครั้ง')
      router.push(ROUTE_OWNER_HOME)
    } catch (e) {
      toast.error(toErrorMessage(e))
    }
  }

  if (profile.isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
      </main>
    )
  }

  if (!linked) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-4 p-6">
        <BackLink />
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          บัญชียังไม่เชื่อมกับข้อมูลลูกค้า — ติดต่อคลินิกก่อนจึงจะจองได้
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-5 p-6">
      <BackLink />

      <div>
        <h1 className="text-lg font-semibold">จองคิว</h1>
        {/* บอกตรง ๆ ว่านี่ยังไม่ใช่คิว — ดู `///` บนหัวไฟล์ */}
        <p className="mt-1 text-sm text-muted-foreground">
          เป็นการจองช่วงเวลา ไม่ใช่คิว · <strong className="font-medium text-foreground">
          เจ้าหน้าที่จะโทรยืนยันอีกครั้ง</strong> · เมื่อมาถึงคลินิกกรุณาลงทะเบียนที่เคาน์เตอร์
          เพื่อรับเลขคิว
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="flex items-center gap-1.5">
          <PawPrint className="size-3.5" />
          สัตว์ที่จะพามา
        </Label>

        {(pets.data ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {(pets.data ?? []).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPetId(p.id)
                  // เลือกสัตว์เดิมแล้วปิดฟอร์มตัวใหม่ — เปิดค้างไว้จะไม่รู้ว่าจะจองให้ตัวไหน
                  setPetNameText('')
                  setNewPetOpen(false)
                  setNewSpeciesId(null)
                  setNewBreedId(null)
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors',
                  petId === p.id
                    ? 'border-primary bg-primary/10 font-medium'
                    : 'border-input hover:bg-muted',
                )}
              >
                <PawPrint className="size-3.5" />
                {p.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            ยังไม่มีสัตว์ในระบบ — เพิ่มตัวใหม่ได้เลย
          </p>
        )}

        {/*
          **สัตว์ตัวใหม่ — ขอชนิดกับพันธุ์ไปเลย แล้วสร้างให้อัตโนมัติ**

          (ผู้ใช้กำหนด 2026-09-01: "ถ้าหากเป็นสัตว์ใหม่ก็เอาชื่อ พันธุ์ ชนิด มาให้กรอก
          เลยแล้วสร้างให้อัตโนมัติ จะไม่ดีกว่าหรอ")

          เดิมรับแค่ชื่อเป็นข้อความ แล้วไม่มีแถวสัตว์เกิดขึ้นเลย · เจ้าหน้าที่ต้องมา
          สร้างเองตอนลูกค้ามาถึง และประวัติครั้งนี้ผูกกับสัตว์ไม่ได้
        */}
        {newPetOpen ? (
          <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">สัตว์ตัวใหม่</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => {
                  setNewPetOpen(false)
                  setPetNameText('')
                  setNewSpeciesId(null)
                  setNewBreedId(null)
                }}
              >
                ยกเลิก
              </Button>
            </div>

            <Input
              value={petNameText}
              onChange={(e) => {
                setPetNameText(e.target.value)
                setPetId(null)
              }}
              placeholder="ชื่อสัตว์"
              className="h-9"
            />

            <div className="flex gap-2">
              <Combobox
                value={newSpeciesId}
                onChange={(v) => {
                  setNewSpeciesId(v)
                  setNewBreedId(null)
                }}
                options={(species.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
                placeholder="เลือกชนิด"
                required
                className="h-9 flex-1"
              />

              {newSpeciesId !== null ? (
                <Combobox
                  value={newBreedId}
                  onChange={setNewBreedId}
                  options={(breeds.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
                  placeholder={breeds.isPending ? 'กำลังโหลด…' : 'พันธุ์ (ถ้าทราบ)'}
                  className="h-9 flex-1"
                />
              ) : null}
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => {
              setNewPetOpen(true)
              setPetId(null)
            }}
          >
            <Plus className="size-4" />
            สัตว์ตัวใหม่
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5" />
          วันที่
        </Label>
        {/* รูปเดียวกับฝั่งพนักงาน — ไม่ใช่ `<input type="date">` ที่หน้าตาต่างกันทุกเบราว์เซอร์ */}
        <AppDatePicker
          value={date}
          onChange={(v) => setBookedOn(v ?? '')}
          aria-label="วันที่จอง"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>ช่วงเวลา</Label>
        <div className="grid grid-cols-2 gap-2">
          {SLOTS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSlot(s)}
              className={cn(
                'rounded-md border px-3 py-2.5 text-sm',
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="b-reason" className="flex items-center gap-1.5">
          <Stethoscope className="size-3.5" />
          อาการหรือสิ่งที่ต้องการ
        </Label>
        <Textarea
          id="b-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="เช่น ฉีดวัคซีนประจำปี"
        />
      </div>

      <Button type="button" onClick={submit} disabled={!canSubmit || create.isPending}>
        {create.isPending ? 'กำลังจอง…' : 'ยืนยันการจอง'}
      </Button>
    </main>
  )
}

function BackLink() {
  return (
    <Link
      href={ROUTE_OWNER_HOME}
      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      กลับหน้าแรก
    </Link>
  )
}
