'use client'

import { z } from 'zod'

import { AppFormField } from '@/components/common/app-form-field'
import { NumberInput } from '@/components/common/number-input'
import { ComboboxField } from '@/components/common/combobox-field'
import { type DialogMode, FormDialog } from '@/components/common/form-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useServiceCategoryOptions } from '@/features/service-category/hooks'
import type { ServiceItem } from '@/features/service-item/api'
import { useCreateServiceItem, useUpdateServiceItem } from '@/features/service-item/hooks'

/** เพดานที่ BE บังคับ — `apps/api/src/modules/drug/drug.service.ts` */
const CODE_MAX = 30
const NAME_MAX = 200
const TEXT_MAX = 5_000

/**
 * ความบังคับอ่านจาก schema ของ BE — `name` เป็น `t.String()` → บังคับ · ที่เหลือ nullable
 *
 * **ราคาเป็นข้อความ ไม่ใช่ตัวเลข** · `z.number()` จะแปลง `'12.50'` เป็น `12.5` แล้วเงิน
 * เริ่มคลาดตั้งแต่ยังไม่ออกจากฟอร์ม · รูปที่รับตรงกับที่ BE ตรวจ (`^\d+(\.\d{1,2})?$`)
 */
const schema = z.object({
    code: z.string().trim().max(CODE_MAX).nullish(),
    name: z.string().trim().min(1, 'กรอกชื่อรายการ').max(NAME_MAX, `ยาวเกิน ${NAME_MAX} ตัวอักษร`),
    description: z.string().trim().max(TEXT_MAX).nullish(),
    price: z
      .union([z.string().regex(/^\d+(\.\d{1,2})?$/, 'ราคาต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง'), z.literal('')])
      .nullish(),
    categoryId: z.number().nullable(),
  })

type FormValues = z.infer<typeof schema>

const TITLE: Record<DialogMode, string> = {
  create: 'เพิ่มรายการ',
  edit: 'แก้ไขรายการ',
  view: 'ยา',
}

export function ServiceItemDialog({
  mode,
  row,
  open,
  onOpenChange,
}: {
  mode: DialogMode
  row: ServiceItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreateServiceItem()
  const update = useUpdateServiceItem()
  const categories = useServiceCategoryOptions()

  const readOnly = mode === 'view'
  const pending = create.isPending || update.isPending

  async function handleSubmit(values: FormValues): Promise<string> {
    const body = {
      code: values.code || null,
      name: values.name,
      description: values.description || null,
      price: values.price || null,
      categoryId: values.categoryId,
    }

    // ข้อความประกอบจากค่าที่ BE คืนมา — BE เป็นคนตัดช่องว่างหัวท้าย
    if (mode === 'create') {
      const saved = await create.mutateAsync(body)

      return `เพิ่มรายการ "${saved.name}" แล้ว`
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
        code: row?.code ?? '',
        name: row?.name ?? '',
        description: row?.description ?? '',
        price: row?.price ?? '',
        categoryId: row?.categoryId ?? null,
      }}
      onSubmit={handleSubmit}
      pending={pending}
    >
      {({ form }) => (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <AppFormField name="code" label="รหัสรายการ">
              <Input {...form.register('code')} disabled={pending} readOnly={readOnly} />
            </AppFormField>
            <div className="sm:col-span-2">
              <AppFormField name="name" label="ชื่อรายการ" required={!readOnly}>
                <Input {...form.register('name')} disabled={pending} readOnly={readOnly} autoFocus />
              </AppFormField>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <AppFormField name="categoryId" label="หมวดบริการ">
              <ComboboxField
                name="categoryId"
                options={categories.data ?? []}
                placeholder="เลือกหมวด (ไม่บังคับ)"
                disabled={pending}
                readOnly={readOnly}
                loading={categories.isPending}
              />
            </AppFormField>
            <AppFormField name="price" label="ราคา">
              {/* เงิน — `NumberInput` คุมให้เป็นตัวเลขทศนิยมสองตำแหน่งตั้งแต่พิมพ์ */}
              <NumberInput
                value={(form.watch('price') as string | null) ?? ''}
                onChange={(v) => form.setValue('price', v)}
                disabled={pending}
                readOnly={readOnly}
                aria-label="ราคา"
              />
            </AppFormField>
          </div>

          {/* คำอธิบาย — ให้เคาน์เตอร์เลือกรายการได้ถูกโดยไม่ต้องเดาจากชื่อย่อ */}
          <AppFormField name="description" label="คำอธิบาย">
            <Textarea {...form.register('description')} disabled={pending} readOnly={readOnly} rows={2} />
          </AppFormField>
        </>
      )}
    </FormDialog>
  )
}
