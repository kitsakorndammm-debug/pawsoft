'use client'

import { z } from 'zod'

import { AppFormField } from '@/components/common/app-form-field'
import { type DialogMode, FormDialog } from '@/components/common/form-dialog'
import { Input } from '@/components/ui/input'
import type { Role } from '@/features/role/api'
import { useCreateRole, usePermissionCatalog, useRoleDetail, useUpdateRole } from '@/features/role/hooks'

import { PermissionChecklist } from './permission-checklist'

/**
 * กล่องเพิ่ม · แก้ · ดู ของบทบาท
 *
 * **ชื่อกับสิทธิ์อยู่ฟอร์มเดียวกัน กดบันทึกทีเดียว** — BE รับ `permissionKeys` มาทั้งชุด
 * ไม่มีเส้น grant/revoke ทีละตัว · แยกเป็นสองขั้นแปลว่ามีจังหวะที่บทบาทถูกสร้างแล้ว
 * แต่ยังไม่มีสิทธิ์ แล้วคนที่ถือมันจะกดอะไรไม่ได้เลยโดยไม่มีใครรู้
 *
 * **สิทธิ์ที่ถืออยู่ไม่ได้มากับลิสต์** — ต้องขอทีละตัวตอนเปิดกล่อง · ระหว่างรอ ฟอร์ม
 * ยังไม่ถูกสร้าง (`formKey` เปลี่ยนตอนของมาถึง) ไม่งั้นสวิตช์เปิดมาว่างแล้วค้างว่าง
 * ทั้งที่บทบาทนั้นถือสิทธิ์อยู่เต็ม — กดบันทึกทันทีคือการถอนสิทธิ์ทั้งหมดโดยไม่ตั้งใจ
 */

const schema = z.object({
  name: z.string().trim().min(1, 'กรอกชื่อบทบาท').max(100, 'ชื่อบทบาทยาวเกินไป'),
  /**
   * **ยอมให้ว่างได้** ต่างจากขั้นวงเงินที่บังคับอย่างน้อยหนึ่ง
   *
   * บทบาทที่ยังไม่ให้สิทธิ์อะไรเลยมีความหมายจริง — เปิดไว้ก่อนแล้วค่อยเติมทีหลัง ·
   * BE ก็ยอมรับลิสต์ว่าง · หน้าจอเตือนด้วยข้อความใต้ช่อง ไม่ใช่ด้วยการปฏิเสธ
   */
  permissionKeys: z.array(z.string()),
})

type FormValues = z.infer<typeof schema>

const TITLE: Record<DialogMode, string> = {
  create: 'เพิ่มบทบาท',
  edit: 'แก้ไขบทบาท',
  view: 'บทบาท',
}

export function RoleDialog({
  mode,
  row,
  open,
  onOpenChange,
}: {
  mode: DialogMode
  /** แถวที่กำลังแก้หรือดู · `create` ไม่มี */
  row: Role | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreateRole()
  const update = useUpdateRole()

  /*
    ขอเฉพาะตอนกล่องเปิดและมีแถว — `create` ไม่มีสิทธิ์เดิมให้โหลด และกล่องที่ปิดอยู่
    ไม่ควรยิงอะไรเลย
  */
  const detail = useRoleDetail(open && row ? row.id : null)
  const catalog = usePermissionCatalog()

  /**
   * ยังรอของอยู่ไหม — ตัวที่กั้นไม่ให้ฟอร์มถูกสร้างด้วยค่าที่ยังมาไม่ครบ
   *
   * `create` ไม่รอ `detail` แต่รอสารบัญสิทธิ์ เพราะไม่มีสารบัญก็ไม่มีสวิตช์ให้ติ๊ก
   */
  const loading = catalog.isPending || (row !== null && detail.isPending)

  async function handleSubmit(values: FormValues): Promise<string> {
    const input = { name: values.name.trim(), permissionKeys: values.permissionKeys }

    if (mode === 'create') {
      const saved = await create.mutateAsync(input)
      return `เพิ่มบทบาท ${saved.name} แล้ว`
    }

    if (!row) throw new Error('ไม่มีแถวให้แก้')
    const saved = await update.mutateAsync({ id: row.id, input })
    return `แก้ไขบทบาท ${saved.name} แล้ว`
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
        permissionKeys: detail.data?.permissionKeys ?? [],
      }}
      onSubmit={handleSubmit}
      /*
        `formKey` พ่วงสถานะการโหลด — ของมาถึงเมื่อไหร่ฟอร์มถูกสร้างใหม่พร้อมสิทธิ์
        ที่ถืออยู่จริง · ผูกกับ `row.id` อย่างเดียวแปลว่าฟอร์มถูกสร้างตอนสวิตช์ยังว่าง
        แล้วค่าที่มาทีหลังไม่มีผล เพราะ `defaultValues` ถูกอ่านครั้งเดียวตอน mount
      */
      formKey={`${row?.id ?? 'new'}:${loading ? 'loading' : 'ready'}`}
      pending={create.isPending || update.isPending}
      className="sm:max-w-2xl"
    >
      {({ form, readOnly, pending }) => (
        <div className="flex flex-col gap-4">
          <AppFormField name="name" label="ชื่อบทบาท" required={!readOnly}>
            <Input
              {...form.register('name')}
              disabled={pending}
              readOnly={readOnly}
              autoFocus={!readOnly}
            />
          </AppFormField>

          {/*
            render-prop ไม่ใช่ element ธรรมดา — `AppFormField` ยัด `aria-invalid` ให้เอง
            เฉพาะทางที่สอง และช่องนี้เป็นกล่องหลายชั้นที่ต้องรับค่าไปวางเอง
          */}
          <AppFormField name="permissionKeys" label="สิทธิ์ที่บทบาทนี้ถือ">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <PermissionChecklist
                  value={(field.value as string[]) ?? []}
                  onChange={field.onChange}
                  options={catalog.data ?? []}
                  loading={loading}
                  disabled={pending || readOnly}
                  aria-invalid={field.invalid}
                  aria-label="สิทธิ์ที่บทบาทนี้ถือ"
                />
                {/*
                  บอกไว้เพราะบันทึกผ่าน — คนที่ตั้งบทบาทเปล่าไว้ก่อนแล้วลืมกลับมาเติม
                  จะได้คนที่ล็อกอินเข้ามาแล้วเจอจอว่าง โดยไม่มี error บอกว่าทำไม
                */}
                {!readOnly && (
                  <p className="text-xs text-muted-foreground">
                    ไม่ติ๊กเลยก็บันทึกได้ — คนที่ถือบทบาทนี้จะเข้าระบบได้แต่ยังไม่เห็นเมนูไหน
                  </p>
                )}
              </div>
            )}
          </AppFormField>
        </div>
      )}
    </FormDialog>
  )
}
