'use client'

import { z } from 'zod'

import { AppFormField } from '@/components/common/app-form-field'
import { type DialogMode, FormDialog } from '@/components/common/form-dialog'
import { Input } from '@/components/ui/input'
import type { DrugCategory } from '@/features/drug-category/api'
import { useCreateDrugCategory, useUpdateDrugCategory } from '@/features/drug-category/hooks'


/** ยาวสุดที่ BE รับ — ตรงกับ `NAME_MAX` ใน `apps/api/src/modules/drug-category/drug-category.service.ts` */
const NAME_MAX = 200

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'กรอกชื่อหมวดยา')
    .max(NAME_MAX, `ยาวเกิน ${NAME_MAX} ตัวอักษร`),
  /**
   * ชนิดบังคับเลือก — ไม่มีค่ากลาง
   *
   * BE ให้ไม่ส่งมาได้ (แล้วมันใช้ค่าตั้งต้นของฐาน) แต่หน้าจอนี้ถามเสมอ · หมวดยา
   * ที่ยังไม่รู้ว่าเป็นบุคคลหรือนิติบุคคล คือแถวที่หน้าลูกค้าตัดสินใจอะไรไม่ได้เลย
   */
})

type FormValues = z.infer<typeof schema>

const TITLE: Record<DialogMode, string> = {
  create: 'เพิ่มหมวดยา',
  edit: 'แก้ไขหมวดยา',
  view: 'หมวดยา',
}

/**
 * กล่องเพิ่ม · แก้ · ดู ของหมวดยา
 *
 * **สองช่อง ต่างจากทะเบียนชื่อล้วนอื่น ๆ** — `kind` เปลี่ยนสิ่งที่หน้าลูกค้าทำจริง ·
 * แก้ได้ตลอดตามที่ผู้ใช้ตัดสิน (2026-08-27) เพราะมันแก้ความหมายของลูกค้าที่ผูกไว้แล้ว
 * ซึ่งเป็นสิ่งที่คนกรอกผิดแล้วต้องแก้ได้
 */
export function DrugCategoryDialog({
  mode,
  row,
  open,
  onOpenChange,
}: {
  mode: DialogMode
  /** แถวที่กำลังแก้หรือดู · `create` ไม่มี */
  row: DrugCategory | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreateDrugCategory()
  const update = useUpdateDrugCategory()

  async function handleSubmit(values: FormValues): Promise<string> {
    /**
     * ข้อความสำเร็จประกอบที่นี่ ไม่ได้มาจาก BE — BE ส่งประโยคมาเฉพาะตอนปฏิเสธ
     * ชื่อเอาจากแถวที่ BE คืนกลับมา เพราะ BE `trim()` ก่อนบันทึก
     */
    if (mode === 'create') {
      const saved = await create.mutateAsync({ name: values.name })
      return `เพิ่มหมวดยา "${saved.name}" แล้ว`
    }

    if (!row) throw new Error('ไม่มีแถวให้แก้')
    const saved = await update.mutateAsync({ id: row.id, name: values.name })
    return `แก้ไขเป็น "${saved.name}" แล้ว`
  }

  return (
    <FormDialog<FormValues>
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      title={TITLE[mode]}
      schema={schema}
      defaultValues={{
        name: row?.name ?? '',
      }}
      onSubmit={handleSubmit}
      formKey={row?.id ?? 'new'}
      pending={create.isPending || update.isPending}
      // สองคอลัมน์ต้องกว้างกว่าค่าตั้งต้น — `sm:max-w-md` ทำให้ทั้งคู่แคบกว่าเดิม
      className="sm:max-w-xl"
    >
      {({ form, readOnly, pending }) => (
        <div className="flex flex-col gap-3">
          {/*
            สองช่องนี้เป็นของสิ่งเดียวกัน — ชื่อประเภทกับชนิดของมัน

            `docs/standards/web-conventions.md` §ฟอร์มจัดเป็นแถว: ฟอร์มสองช่องก็นับ ·
            ชื่อกว้างกว่าเพราะเป็นข้อความ ส่วนชนิดมีสองตัวเลือก
          */}
          <div className="grid gap-3 sm:grid-cols-3">
          <AppFormField
            name="name"
            label="ชื่อหมวดยา"
            required={!readOnly}
            className="sm:col-span-2"
          >
            <Input {...form.register('name')} disabled={pending} autoFocus={!readOnly} />
          </AppFormField>
          </div>

          <p className="-mt-2 text-xs text-muted-foreground">
            นิติบุคคลมีสาขาและเลขประจำตัวผู้เสียภาษี · บุคคลธรรมดาไม่มีสาขา
          </p>
        </div>
      )}
    </FormDialog>
  )
}
