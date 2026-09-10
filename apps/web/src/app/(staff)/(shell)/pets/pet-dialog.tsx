'use client'

import { UserRound, X } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'

import { AppDatePicker } from '@/components/common/app-date-picker'
import { AppFormField } from '@/components/common/app-form-field'
import { NumberInput } from '@/components/common/number-input'
import { Combobox } from '@/components/common/combobox'
import { ComboboxField } from '@/components/common/combobox-field'
import { type DialogMode, FormDialog } from '@/components/common/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { OwnerPickerDialog } from '@/features/owner/owner-picker-dialog'
import { useOwner } from '@/features/owner/hooks'
import type { Pet } from '@/features/pet/api'
import { useBreedOptions, useCreatePet, useSpeciesOptions, useUpdatePet } from '@/features/pet/hooks'

const NAME_MAX = 200
const COLOR_MAX = 200
const MICROCHIP_MAX = 50
const TEXT_MAX = 2_000

/**
 * **`breedId` ไม่บังคับ · `speciesId` บังคับ** — ตรงกับ BE
 *
 * พันธุ์ผสมที่ตอบไม่ได้มีจริง · ส่วนสัตว์ที่ไม่รู้ว่าเป็นชนิดอะไรไม่มี
 */
const schema = z.object({
  ownerId: z.number({ message: 'เลือกเจ้าของ' }),
  name: z.string().trim().min(1, 'กรอกชื่อสัตว์').max(NAME_MAX),
  speciesId: z.number({ message: 'เลือกชนิดสัตว์' }),
  breedId: z.number().nullable(),
  sex: z.enum(['MALE', 'FEMALE', 'UNKNOWN']),
  isNeutered: z.boolean().nullable(),
  bornOn: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ไม่ถูกต้อง'), z.literal('')])
    .nullish(),
  weightKg: z
    .union([z.string().regex(/^\d+(\.\d{1,2})?$/, 'น้ำหนักต้องเป็นตัวเลข'), z.literal('')])
    .nullish(),
  color: z.string().trim().max(COLOR_MAX).nullish(),
  microchip: z.string().trim().max(MICROCHIP_MAX).nullish(),
  allergyNote: z.string().trim().max(TEXT_MAX).nullish(),
  note: z.string().trim().max(TEXT_MAX).nullish(),
})

type FormValues = z.infer<typeof schema>

const TITLE: Record<DialogMode, string> = {
  create: 'เพิ่มสัตว์เลี้ยง',
  edit: 'แก้ไขสัตว์เลี้ยง',
  view: 'สัตว์เลี้ยง',
}

export function PetDialog({
  mode,
  row,
  open,
  onOpenChange,
}: {
  mode: DialogMode
  row: Pet | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreatePet()
  const update = useUpdatePet()
  const species = useSpeciesOptions()

  const readOnly = mode === 'view'
  const pending = create.isPending || update.isPending

  async function handleSubmit(values: FormValues): Promise<string> {
    const body = {
      ownerId: values.ownerId,
      name: values.name,
      speciesId: values.speciesId,
      breedId: values.breedId,
      sex: values.sex,
      isNeutered: values.isNeutered,
      bornOn: values.bornOn || null,
      weightKg: values.weightKg || null,
      color: values.color || null,
      microchip: values.microchip || null,
      allergyNote: values.allergyNote || null,
      note: values.note || null,
    }

    if (mode === 'create') {
      const saved = await create.mutateAsync(body)

      return `เพิ่ม "${saved.name}" แล้ว — รหัส ${saved.code}`
    }

    if (!row) throw new Error('ไม่มีแถวให้แก้')

    const saved = await update.mutateAsync({ id: row.id, ...body })

    return `แก้ไขเป็น "${saved.name}" แล้ว`
  }

  return (
    <FormDialog<FormValues>
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      title={TITLE[mode]}
      className="sm:max-w-2xl"
      schema={schema}
      formKey={`${row?.id ?? 'new'}`}
      defaultValues={{
        ownerId: row?.ownerId ?? (undefined as unknown as number),
        name: row?.name ?? '',
        speciesId: row?.speciesId ?? (undefined as unknown as number),
        breedId: row?.breedId ?? null,
        sex: row?.sex ?? 'UNKNOWN',
        isNeutered: row?.isNeutered ?? null,
        bornOn: row?.bornOn ?? '',
        weightKg: row?.weightKg ?? '',
        color: row?.color ?? '',
        microchip: row?.microchip ?? '',
        allergyNote: row?.allergyNote ?? '',
        note: row?.note ?? '',
      }}
      onSubmit={handleSubmit}
      pending={pending}
    >
      {({ form }) => {
        const speciesId = form.watch('speciesId') as number | undefined

        return (
          <>
            <OwnerPicker form={form} disabled={pending} readOnly={readOnly} />

            <div className="grid gap-3 sm:grid-cols-2">
              <AppFormField name="name" label="ชื่อสัตว์" required={!readOnly}>
                <Input {...form.register('name')} disabled={pending} readOnly={readOnly} />
              </AppFormField>

              <AppFormField name="microchip" label="ไมโครชิป">
                <Input {...form.register('microchip')} disabled={pending} readOnly={readOnly} />
              </AppFormField>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <AppFormField name="speciesId" label="ชนิดสัตว์" required={!readOnly}>
                <ComboboxField
                  name="speciesId"
                  options={species.data ?? []}
                  placeholder="เลือกชนิด"
                  disabled={pending}
                  readOnly={readOnly}
                  required
                  loading={species.isPending}
                  /* เลือกชนิดแล้วต้องล้างพันธุ์ — ดู `BreedPicker` */
                  noAutoSelect
                />
              </AppFormField>

              <BreedPicker
                speciesId={speciesId ?? null}
                disabled={pending}
                readOnly={readOnly}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <AppFormField name="sex" label="เพศ">
                <Combobox
                  value={form.watch('sex') as string}
                  onChange={(v) => form.setValue('sex', v ?? 'UNKNOWN')}
                  options={[
                    { value: 'UNKNOWN', label: 'ยังไม่รู้' },
                    { value: 'MALE', label: 'ผู้' },
                    { value: 'FEMALE', label: 'เมีย' },
                  ]}
                  placeholder="เลือกเพศ"
                  required
                  disabled={pending}
                  readOnly={readOnly}
                  aria-label="เพศ"
                />
              </AppFormField>

              {/*
                **ทำหมันมีสามค่า ไม่ใช่ checkbox** — `null` = ยังไม่ได้ถาม
                ต่างจาก `false` ที่แปลว่าถามแล้วและยังไม่ทำ · หมอที่เห็น "ยังไม่ทำ"
                จะไม่ถามซ้ำ ส่วนที่เห็น "ยังไม่ได้ถาม" จะถาม
              */}
              <AppFormField name="isNeutered" label="ทำหมัน">
                <Combobox
                  value={
                    form.watch('isNeutered') === null
                      ? 'unknown'
                      : form.watch('isNeutered')
                        ? 'yes'
                        : 'no'
                  }
                  onChange={(v) =>
                    form.setValue('isNeutered', v === 'unknown' || v === null ? null : v === 'yes')
                  }
                  options={[
                    { value: 'unknown', label: 'ยังไม่ได้ถาม' },
                    { value: 'yes', label: 'ทำแล้ว' },
                    { value: 'no', label: 'ยังไม่ทำ' },
                  ]}
                  placeholder="เลือก"
                  required
                  disabled={pending}
                  readOnly={readOnly}
                  aria-label="ทำหมัน"
                />
              </AppFormField>

              {/* `AppDatePicker` ไม่ใช่ `<input type="date">` — ปฏิทินไทยและรูปเดียวกับทั้งระบบ */}
              <AppFormField name="bornOn" label="วันเกิด">
                <AppDatePicker
                  value={form.watch('bornOn') as string | null}
                  onChange={(v) => form.setValue('bornOn', v ?? '')}
                  disabled={pending}
                  readOnly={readOnly}
                  aria-label="วันเกิด"
                />
              </AppFormField>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {/*
                `NumberInput` ไม่ใช่ `Input` เปล่า — กันตัวอักษรที่ไม่ใช่ตัวเลขตั้งแต่พิมพ์
                และคุมทศนิยมสองตำแหน่งให้ตรงกับที่ฐานเก็บ (`Decimal(6,2)`)
              */}
              <AppFormField name="weightKg" label="น้ำหนักล่าสุด (กก.)">
                <NumberInput
                  value={(form.watch('weightKg') as string | null) ?? ''}
                  onChange={(v) => form.setValue('weightKg', v)}
                  disabled={pending}
                  readOnly={readOnly}
                  aria-label="น้ำหนักล่าสุด"
                />
              </AppFormField>
              <AppFormField name="color" label="สีและตำหนิ">
                <Input {...form.register('color')} disabled={pending} readOnly={readOnly} />
              </AppFormField>
            </div>

            {/* แพ้ยาเป็นข้อความอิสระ ไม่ใช่ลิสต์ — สัตว์แพ้ตัวยา ไม่ได้แพ้ยี่ห้อ */}
            <AppFormField name="allergyNote" label="ประวัติแพ้ยา">
              <Textarea
                {...form.register('allergyNote')}
                rows={2}
                disabled={pending}
                readOnly={readOnly}
              />
            </AppFormField>

            <AppFormField name="note" label="บันทึก">
              <Textarea {...form.register('note')} rows={2} disabled={pending} readOnly={readOnly} />
            </AppFormField>
          </>
        )
      }}
    </FormDialog>
  )
}

/**
 * เลือกเจ้าของ — **เปิดกล่องแยก** (ผู้ใช้กำหนด 2026-09-01)
 *
 * ช่องค้นที่ฝังในฟอร์มทำให้ผลค้นดันช่องที่เหลือลงไป และคนกรอกต้องเลื่อนกลับไปหา
 * สิ่งที่กรอกค้างไว้ · กล่องแยกทำให้ฟอร์มอยู่นิ่ง
 */
function OwnerPicker({
  form,
  disabled,
  readOnly,
}: {
  form: {
    watch: (name: string) => unknown
    setValue: (name: string, value: unknown) => void
  }
  disabled: boolean
  readOnly: boolean
}) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState<string | null>(null)

  const selected = form.watch('ownerId') as number | undefined
  // ตอนเปิดแก้ไข ยังไม่มีชื่อในมือ — ดึงมาจาก id ที่ฟอร์มถืออยู่
  const existing = useOwner(selected !== undefined && label === null ? selected : null)
  const shown = label ?? (existing.data ? `${existing.data.name} · ${existing.data.code}` : null)

  return (
    <>
      <AppFormField name="ownerId" label="เจ้าของ" required={!readOnly}>
        {selected !== undefined && shown !== null ? (
          <div className="flex items-center gap-2.5 rounded-md border bg-card p-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <UserRound className="size-4 text-primary-strong" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">{shown}</span>
            {!readOnly ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="เปลี่ยนเจ้าของ"
                disabled={disabled}
                onClick={() => {
                  form.setValue('ownerId', undefined)
                  setLabel(null)
                }}
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            disabled={disabled || readOnly}
            onClick={() => setOpen(true)}
          >
            <UserRound className="size-4" />
            เลือกเจ้าของ
          </Button>
        )}
      </AppFormField>

      <OwnerPickerDialog
        open={open}
        onOpenChange={setOpen}
        onPick={(p) => {
          form.setValue('ownerId', p.ownerId)
          setLabel(`${p.ownerName} · ${p.ownerCode}`)
        }}
      />
    </>
  )
}

/**
 * เลือกสายพันธุ์ — **ตัวเลือกขึ้นกับชนิดที่เลือกไว้**
 *
 * ไม่กรอง แปลว่าฟอร์มโชว์พันธุ์หมาให้คนที่เลือกแมว แล้วฐานปฏิเสธตอนกดบันทึก
 * ด้วย FK คู่ ซึ่งสายเกินไปและข้อความอ่านไม่รู้เรื่อง
 */
function BreedPicker({
  speciesId,
  disabled,
  readOnly,
}: {
  speciesId: number | null
  disabled: boolean
  readOnly: boolean
}) {
  const breeds = useBreedOptions(speciesId)

  return (
    <AppFormField name="breedId" label="สายพันธุ์">
      <ComboboxField
        name="breedId"
        options={breeds.data ?? []}
        placeholder={speciesId === null ? 'เลือกชนิดก่อน' : 'เลือกสายพันธุ์ (ไม่บังคับ)'}
        disabled={disabled || speciesId === null}
        readOnly={readOnly}
        loading={breeds.isPending && speciesId !== null}
        noAutoSelect
      />
    </AppFormField>
  )
}
