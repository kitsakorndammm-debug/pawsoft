'use client'

import { z } from 'zod'

import { AppFormField } from '@/components/common/app-form-field'
import { type DialogMode, FormDialog } from '@/components/common/form-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { Owner } from '@/features/owner/api'
import { useCreateOwner, useUpdateOwner } from '@/features/owner/hooks'

/** เพดานที่ BE บังคับ — `apps/api/src/modules/owner/owner.service.ts` */
const NAME_MAX = 200
const PHONE_MAX = 30
const EMAIL_MAX = 255
const ADDRESS_MAX = 500
const NOTE_MAX = 2_000

/**
 * **มีแค่ `name` ที่บังคับ** — ตรงกับ BE
 *
 * เบอร์ไม่บังคับ เพราะเคสฉุกเฉินที่คนอุ้มสัตว์คนอื่นเข้ามาก็ต้องเปิดแถวได้ ·
 * บังคับเบอร์แปลว่าพนักงานจะพิมพ์ `0000000000` ลงไป ซึ่งแย่กว่าค่าว่าง
 */
const schema = z.object({
  name: z.string().trim().min(1, 'กรอกชื่อ').max(NAME_MAX, `ยาวเกิน ${NAME_MAX} ตัวอักษร`),
  phone: z.string().trim().max(PHONE_MAX).nullish(),
  phoneAlt: z.string().trim().max(PHONE_MAX).nullish(),
  email: z
    .union([z.string().trim().email('อีเมลไม่ถูกรูปแบบ').max(EMAIL_MAX), z.literal('')])
    .nullish(),
  address: z.string().trim().max(ADDRESS_MAX).nullish(),
  note: z.string().trim().max(NOTE_MAX).nullish(),
})

type FormValues = z.infer<typeof schema>

const TITLE: Record<DialogMode, string> = {
  create: 'เพิ่มเจ้าของสัตว์',
  edit: 'แก้ไขเจ้าของสัตว์',
  view: 'เจ้าของสัตว์',
}

export function OwnerDialog({
  mode,
  row,
  open,
  onOpenChange,
}: {
  mode: DialogMode
  row: Owner | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreateOwner()
  const update = useUpdateOwner()

  const readOnly = mode === 'view'
  const pending = create.isPending || update.isPending

  async function handleSubmit(values: FormValues): Promise<string> {
    const body = {
      name: values.name,
      phone: values.phone || null,
      phoneAlt: values.phoneAlt || null,
      email: values.email || null,
      address: values.address || null,
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
      className="sm:max-w-xl"
      schema={schema}
      formKey={`${row?.id ?? 'new'}`}
      defaultValues={{
        name: row?.name ?? '',
        phone: row?.phone ?? '',
        phoneAlt: row?.phoneAlt ?? '',
        email: row?.email ?? '',
        address: row?.address ?? '',
        note: row?.note ?? '',
      }}
      onSubmit={handleSubmit}
      pending={pending}
    >
      {({ form }) => (
        <>
          {/* รหัสระบบออกให้ ไม่มีช่องให้กรอก — โชว์เฉพาะตอนแก้/ดู */}
          {row ? (
            <p className="text-sm text-muted-foreground">
              รหัสลูกค้า <span className="font-medium text-foreground">{row.code}</span>
            </p>
          ) : null}

          <AppFormField name="name" label="ชื่อ" required={!readOnly}>
            <Input {...form.register('name')} disabled={pending} readOnly={readOnly} autoFocus />
          </AppFormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <AppFormField name="phone" label="เบอร์โทร">
              <Input
                {...form.register('phone')}
                inputMode="tel"
                disabled={pending}
                readOnly={readOnly}
              />
            </AppFormField>
            <AppFormField name="phoneAlt" label="เบอร์สำรอง">
              <Input
                {...form.register('phoneAlt')}
                inputMode="tel"
                disabled={pending}
                readOnly={readOnly}
              />
            </AppFormField>
          </div>

          {/* อีเมลนี้พนักงานพิมพ์เอง — คนละอันกับอีเมลของ Google ที่ใช้ล็อกอิน */}
          <AppFormField name="email" label="อีเมล">
            <Input {...form.register('email')} disabled={pending} readOnly={readOnly} />
          </AppFormField>

          <AppFormField name="address" label="ที่อยู่">
            <Textarea {...form.register('address')} rows={2} disabled={pending} readOnly={readOnly} />
          </AppFormField>

          <AppFormField name="note" label="บันทึก">
            <Textarea {...form.register('note')} rows={2} disabled={pending} readOnly={readOnly} />
          </AppFormField>
        </>
      )}
    </FormDialog>
  )
}
