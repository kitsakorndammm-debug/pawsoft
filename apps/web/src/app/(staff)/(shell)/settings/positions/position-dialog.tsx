'use client'

import { z } from 'zod'

import { AppFormField } from '@/components/common/app-form-field'
import { type DialogMode, FormDialog } from '@/components/common/form-dialog'
import { ComboboxField } from '@/components/common/combobox-field'
import { Input } from '@/components/ui/input'
import type { Position } from '@/features/position/api'
import { useCreatePosition, useUpdatePosition } from '@/features/position/hooks'
import { useDepartmentOptions } from '@/features/department/hooks'

/** ยาวสุดที่ BE รับ — ตรงกับ `NAME_MAX` ใน `apps/api/src/modules/position/position.service.ts` */
const NAME_MAX = 200

/**
 * แผนก เป็นช่องบังคับ — BE ปฏิเสธค่าที่ชี้ไปยังแม่ที่ไม่มีอยู่
 * ปล่อยว่างได้แปลว่าผู้ใช้กดบันทึกแล้วเจอข้อความปฏิเสธ ทั้งที่หน้าจอรู้อยู่แล้ว
 *
 * เก็บเป็น string เพราะ `<select>` คืน string เสมอ · แปลงเป็น number ตอนส่ง
 */
const schema = z.object({
  name: z.string().trim().min(1, 'กรอกชื่อตำแหน่ง').max(NAME_MAX, `ยาวเกิน ${NAME_MAX} ตัวอักษร`),
  departmentId: z.number({ message: 'เลือกแผนก' }),
})

type FormValues = z.infer<typeof schema>

const TITLE: Record<DialogMode, string> = {
  create: 'เพิ่มตำแหน่ง',
  edit: 'แก้ไขตำแหน่ง',
  view: 'ตำแหน่ง',
}

/** กล่องเพิ่ม · แก้ · ดู ของตำแหน่ง — สองฟิลด์: ชื่อ กับแผนก */
export function PositionDialog({
  mode,
  row,
  open,
  onOpenChange,
}: {
  mode: DialogMode
  row: Position | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreatePosition()
  const update = useUpdatePosition()
  // ตัวเลือกของแม่ — โหลดทั้งหมด ไม่ค้น เพราะทะเบียนแม่มีหลักสิบแถว
  const parents = useDepartmentOptions()

  async function handleSubmit(values: FormValues): Promise<string> {
    const input = { name: values.name, departmentId: values.departmentId }

    /**
     * ข้อความสำเร็จประกอบที่นี่ ไม่ได้มาจาก BE — BE ส่งประโยคมาเฉพาะตอนปฏิเสธ
     * ชื่อเอาจากแถวที่ BE คืนกลับมา เพราะ BE `trim()` ก่อนบันทึก
     */
    if (mode === 'create') {
      const saved = await create.mutateAsync(input)
      return `เพิ่มตำแหน่ง "${saved.name}" แล้ว`
    }

    if (!row) throw new Error('ไม่มีแถวให้แก้')
    const saved = await update.mutateAsync({ id: row.id, ...input })
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
        // combobox เก็บเป็น number — ไม่ต้องแปลงกลับตอนส่ง ต่างจาก `<select>` ที่คืน string
        departmentId: row?.departmentId as number,
      }}
      onSubmit={handleSubmit}
      formKey={row?.id ?? 'new'}
      pending={create.isPending || update.isPending}
      // สองช่องต่อแถวต้องการที่มากกว่า `sm:max-w-md` ที่เป็นค่าตั้งต้น
      className="sm:max-w-xl"
    >
      {({ form, readOnly, pending }) => (
        /*
          สองช่องอยู่แถวเดียว ไม่ใช่เรียงลงมาสองบรรทัด
          (`docs/standards/web-conventions.md`) — ชื่อกับแผนกเป็นของตำแหน่งเดียวกัน
          และกล่องกว้างพอสำหรับทั้งคู่อยู่แล้ว · เรียงลงมาคือการทิ้งพื้นที่แนวนอน
          ไปครึ่งหนึ่งเพื่อดันปุ่มบันทึกให้ไกลมือขึ้น
        */
        <div className="grid gap-3 sm:grid-cols-2">
          <AppFormField name="name" label="ชื่อตำแหน่ง" required={!readOnly}>
            <Input {...form.register('name')} disabled={pending} autoFocus={!readOnly} />
          </AppFormField>

          <AppFormField name="departmentId" label="แผนก" required={!readOnly}>
            <ComboboxField
              name="departmentId"
              options={parents.data ?? []}
              placeholder="เลือกแผนก"
              disabled={pending}
              readOnly={readOnly}
              required
              loading={parents.isPending}
            />
          </AppFormField>
        </div>
      )}
    </FormDialog>
  )
}
