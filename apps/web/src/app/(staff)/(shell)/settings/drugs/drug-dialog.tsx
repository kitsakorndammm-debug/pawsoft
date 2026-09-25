'use client'

import { z } from 'zod'

import { AppFormField } from '@/components/common/app-form-field'
import { NumberInput } from '@/components/common/number-input'
import { ComboboxField } from '@/components/common/combobox-field'
import { type DialogMode, FormDialog } from '@/components/common/form-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useDrugCategoryOptions } from '@/features/drug-category/hooks'
import type { Drug } from '@/features/drug/api'
import { useCreateDrug, useUpdateDrug } from '@/features/drug/hooks'

/** เพดานที่ BE บังคับ — `apps/api/src/modules/drug/drug.service.ts` */
const CODE_MAX = 30
const NAME_MAX = 200
const GENERIC_MAX = 200
const UNIT_MAX = 30
const PACKAGE_MAX = 100
const TEXT_MAX = 5_000

/**
 * ความบังคับอ่านจาก schema ของ BE — `name` เป็น `t.String()` → บังคับ · ที่เหลือ nullable
 *
 * **ราคาเป็นข้อความ ไม่ใช่ตัวเลข** · `z.number()` จะแปลง `'12.50'` เป็น `12.5` แล้วเงิน
 * เริ่มคลาดตั้งแต่ยังไม่ออกจากฟอร์ม · รูปที่รับตรงกับที่ BE ตรวจ (`^\d+(\.\d{1,2})?$`)
 */
const schema = z
  .object({
    code: z.string().trim().max(CODE_MAX).nullish(),
    name: z.string().trim().min(1, 'กรอกชื่อยา').max(NAME_MAX, `ยาวเกิน ${NAME_MAX} ตัวอักษร`),
    genericName: z.string().trim().max(GENERIC_MAX).nullish(),
    unit: z.string().trim().max(UNIT_MAX).nullish(),
    packageSize: z.string().trim().max(PACKAGE_MAX).nullish(),
    price: z
      .union([z.string().regex(/^\d+(\.\d{1,2})?$/, 'ราคาต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง'), z.literal('')])
      .nullish(),
    categoryId: z.number().nullable(),
    // จำนวนเต็มไม่ติดลบ — `NumberInput mode="integer"` กันรูปผิดตั้งแต่พิมพ์อยู่แล้ว
    lowStockThreshold: z.string().trim(),
    note: z.string().trim().max(TEXT_MAX).nullish(),
  })
  /**
   * **กรอกราคาแล้วต้องมีหน่วย** — กฎเดียวกับที่ BE และฐานบังคับ · ตรวจที่นี่ด้วยเพื่อให้
   * ข้อความขึ้นใต้ช่องที่ผิด แทนที่จะเป็น toast แดงหลังกดบันทึก
   */
  .refine((v) => !v.price || Boolean(v.unit?.trim()), {
    message: 'กรอกราคาแล้วต้องระบุหน่วยนับด้วย',
    path: ['unit'],
  })

type FormValues = z.infer<typeof schema>

const TITLE: Record<DialogMode, string> = {
  create: 'เพิ่มยา',
  edit: 'แก้ไขยา',
  view: 'ยา',
}

export function DrugDialog({
  mode,
  row,
  open,
  onOpenChange,
}: {
  mode: DialogMode
  row: Drug | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreateDrug()
  const update = useUpdateDrug()
  const categories = useDrugCategoryOptions()

  const readOnly = mode === 'view'
  const pending = create.isPending || update.isPending

  async function handleSubmit(values: FormValues): Promise<string> {
    const body = {
      code: values.code || null,
      name: values.name,
      genericName: values.genericName || null,
      unit: values.unit || null,
      packageSize: values.packageSize || null,
      price: values.price || null,
      categoryId: values.categoryId,
      lowStockThreshold: values.lowStockThreshold === '' ? null : Number(values.lowStockThreshold),
      note: values.note || null,
    }

    // ข้อความประกอบจากค่าที่ BE คืนมา — BE เป็นคนตัดช่องว่างหัวท้าย
    if (mode === 'create') {
      const saved = await create.mutateAsync(body)

      return `เพิ่มยา "${saved.name}" แล้ว`
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
        genericName: row?.genericName ?? '',
        unit: row?.unit ?? '',
        packageSize: row?.packageSize ?? '',
        price: row?.price ?? '',
        categoryId: row?.categoryId ?? null,
        lowStockThreshold: row?.lowStockThreshold != null ? String(row.lowStockThreshold) : '',
        note: row?.note ?? '',
      }}
      onSubmit={handleSubmit}
      pending={pending}
    >
      {({ form }) => (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <AppFormField name="code" label="รหัสยา">
              <Input {...form.register('code')} disabled={pending} readOnly={readOnly} />
            </AppFormField>
            <div className="sm:col-span-2">
              <AppFormField name="name" label="ชื่อยา" required={!readOnly}>
                <Input {...form.register('name')} disabled={pending} readOnly={readOnly} autoFocus />
              </AppFormField>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <AppFormField name="genericName" label="ตัวยาสำคัญ">
              <Input {...form.register('genericName')} disabled={pending} readOnly={readOnly} />
            </AppFormField>
            <AppFormField name="categoryId" label="หมวดยา">
              <ComboboxField
                name="categoryId"
                options={categories.data ?? []}
                placeholder="เลือกหมวด (ไม่บังคับ)"
                disabled={pending}
                readOnly={readOnly}
                loading={categories.isPending}
              />
            </AppFormField>
          </div>

          {/* ราคาอยู่แถวเดียวกับหน่วย เพราะสองช่องนี้ผูกกัน — มีราคาต้องมีหน่วย */}
          <div className="grid gap-3 sm:grid-cols-3">
            <AppFormField name="price" label="ราคาต่อหน่วย">
              {/* เงิน — `NumberInput` คุมให้เป็นตัวเลขทศนิยมสองตำแหน่งตั้งแต่พิมพ์ */}
              <NumberInput
                value={(form.watch('price') as string | null) ?? ''}
                onChange={(v) => form.setValue('price', v)}
                disabled={pending}
                readOnly={readOnly}
                aria-label="ราคา"
              />
            </AppFormField>
            <AppFormField name="unit" label="หน่วยนับ">
              <Input {...form.register('unit')} disabled={pending} readOnly={readOnly} />
            </AppFormField>
            <AppFormField name="packageSize" label="ขนาดบรรจุ">
              <Input {...form.register('packageSize')} disabled={pending} readOnly={readOnly} />
            </AppFormField>
          </div>

          <AppFormField name="lowStockThreshold" label="เกณฑ์แจ้งเตือนสต็อกต่ำ">
            <NumberInput
              mode="integer"
              value={form.watch('lowStockThreshold') as string}
              onChange={(v) => form.setValue('lowStockThreshold', v)}
              disabled={pending}
              readOnly={readOnly}
              aria-label="เกณฑ์แจ้งเตือนสต็อกต่ำ"
            />
          </AppFormField>
          {/* ว่าง = ใช้ค่ากลางของคลินิก — ไม่บังคับกรอก */}
          <p className="-mt-2 text-xs text-muted-foreground">ไม่กรอก = ใช้ค่ากลางของคลินิก (เหลือ 5 หรือน้อยกว่า)</p>

          <AppFormField name="note" label="บันทึก">
            <Textarea {...form.register('note')} disabled={pending} readOnly={readOnly} rows={2} />
          </AppFormField>
        </>
      )}
    </FormDialog>
  )
}
