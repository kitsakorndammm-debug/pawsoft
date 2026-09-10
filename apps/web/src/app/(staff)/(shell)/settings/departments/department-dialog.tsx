'use client'

import { z } from 'zod'

import { AppFormField } from '@/components/common/app-form-field'
import { type DialogMode, FormDialog } from '@/components/common/form-dialog'
import { Input } from '@/components/ui/input'
import type { Department } from '@/features/department/api'
import { useCreateDepartment, useUpdateDepartment } from '@/features/department/hooks'

/** ยาวสุดที่ BE รับ — ตรงกับ `NAME_MAX` ใน `apps/api/src/modules/department/department.service.ts` */
const NAME_MAX = 200

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'กรอกชื่อแผนก')
    .max(NAME_MAX, `ยาวเกิน ${NAME_MAX} ตัวอักษร`),
})

type FormValues = z.infer<typeof schema>

const TITLE: Record<DialogMode, string> = {
  create: 'เพิ่มแผนก',
  edit: 'แก้ไขแผนก',
  view: 'แผนก',
}

/** กล่องเพิ่ม · แก้ · ดู ของแผนก — ทะเบียนนี้มีฟิลด์เดียวคือชื่อ */
export function DepartmentDialog({
  mode,
  row,
  open,
  onOpenChange,
}: {
  mode: DialogMode
  /** แถวที่กำลังแก้หรือดู · `create` ไม่มี */
  row: Department | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreateDepartment()
  const update = useUpdateDepartment()

  async function handleSubmit(values: FormValues): Promise<string> {
    /**
     * ข้อความสำเร็จประกอบที่นี่ ไม่ได้มาจาก BE — BE ส่งประโยคมาเฉพาะตอนปฏิเสธ
     * ชื่อเอาจากแถวที่ BE คืนกลับมา เพราะ BE `trim()` ก่อนบันทึก
     */
    if (mode === 'create') {
      const saved = await create.mutateAsync(values.name)
      return `เพิ่มแผนก "${saved.name}" แล้ว`
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
      defaultValues={{ name: row?.name ?? '' }}
      onSubmit={handleSubmit}
      formKey={row?.id ?? 'new'}
      pending={create.isPending || update.isPending}
    >
      {({ form, readOnly, pending }) => (
        <AppFormField name="name" label="ชื่อแผนก" required={!readOnly}>
          <Input {...form.register('name')} disabled={pending} autoFocus={!readOnly} />
        </AppFormField>
      )}
    </FormDialog>
  )
}
