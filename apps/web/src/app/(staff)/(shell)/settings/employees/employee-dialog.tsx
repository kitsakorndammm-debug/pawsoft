'use client'

import { useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { AppDatePicker } from '@/components/common/app-date-picker'
import { AppFormField } from '@/components/common/app-form-field'
import { ComboboxField } from '@/components/common/combobox-field'
import { type DialogMode, FormDialog } from '@/components/common/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useDepartmentOptions } from '@/features/department/hooks'
import type { Employee, EmployeeInput } from '@/features/employee/api'
import { useCreateEmployee, useUpdateEmployee } from '@/features/employee/hooks'
import { usePositionOptions } from '@/features/position/hooks'
import { toErrorMessage } from '@/lib/api-client'

/** เพดานที่ BE บังคับ — `apps/api/src/modules/employee/employee.service.ts` */
const CODE_MAX = 30
const NAME_MAX = 100
const NICKNAME_MAX = 50
const NOTE_MAX = 5_000

/**
 * ช่องไหนบังคับ อ่านจาก `writeFields` ของ route ไม่ใช่จากความรู้สึก
 *
 * `code` `firstName` `lastName` เป็น `t.String()` → บังคับ · ที่เหลือ nullable
 * `nickname` `note` เป็น `t.Optional` · FK อีกสามตัวเป็น `t.Union([t.Number(), t.Null()])`
 * → **ไม่บังคับ** · ฟอร์มที่บังคับมากกว่า BE คือฟอร์มที่ปฏิเสธข้อมูลที่ระบบรับได้
 */
const schema = z.object({
  code: z.string().trim().min(1, 'กรอกรหัสพนักงาน').max(CODE_MAX, `ยาวเกิน ${CODE_MAX} ตัวอักษร`),
  firstName: z.string().trim().min(1, 'กรอกชื่อ').max(NAME_MAX, `ยาวเกิน ${NAME_MAX} ตัวอักษร`),
  lastName: z.string().trim().min(1, 'กรอกนามสกุล').max(NAME_MAX, `ยาวเกิน ${NAME_MAX} ตัวอักษร`),
  nickname: z.string().trim().max(NICKNAME_MAX, `ยาวเกิน ${NICKNAME_MAX} ตัวอักษร`),
  note: z.string().trim().max(NOTE_MAX, `ยาวเกิน ${NOTE_MAX} ตัวอักษร`),
  phone: z.string().trim().max(30).nullish(),
  email: z.union([z.string().trim().email({ message: 'อีเมลไม่ถูกต้อง' }), z.literal('')]).nullish(),
  hiredAt: z.string().nullish(),
  departmentId: z.number().nullable(),
  positionId: z.number().nullable(),
})

type FormValues = z.infer<typeof schema>

const TITLE: Record<DialogMode, string> = {
  create: 'เพิ่มพนักงาน',
  edit: 'แก้ไขพนักงาน',
  view: 'พนักงาน',
}

/**
 * กล่องเพิ่ม · แก้ · ดู ของพนักงาน
 *
 * **ไม่มีช่องสภาพการทำงาน** — มันมี endpoint ของตัวเอง และมีปุ่มของตัวเองในแถว ·
 * ใส่ไว้ที่นี่ด้วยเมื่อไหร่ คนกดบันทึกข้อมูลทั่วไปจะระงับบัญชีใครไปโดยไม่รู้ตัว
 */
export function EmployeeDialog({
  mode,
  row,
  open,
  onOpenChange,
  onCreateAccount,
}: {
  mode: DialogMode
  row: Employee | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * เพิ่งเพิ่มพนักงานคนนี้เสร็จ ผ่านปุ่ม "บันทึกแล้วเปิดบัญชี" — ให้คนเรียกเปิด
   * `UserAccountDialog` ต่อทันที ไม่ต้องปิดกล่องนี้แล้วไปหาแถวในตารางเอง
   *
   * ไม่มีก็ได้ (ปุ่มไม่โผล่) — กล่องนี้ไม่ผูกกับหน้าจอที่มีกล่องบัญชีเสมอไป
   */
  onCreateAccount?: (employee: Employee) => void
}) {
  const create = useCreateEmployee()
  const update = useUpdateEmployee()

  /**
   * ตัวเลือกของทะเบียนแม่ — จาก `/lookup` ไม่ใช่ลิสต์เต็ม
   *
   * `/lookup` ขอแค่ล็อกอิน · คนที่กรอกฟอร์มพนักงานจึงไม่ต้องได้สิทธิ์เข้าหน้าจัดการ
   * สาขา แผนก และตำแหน่ง ไปด้วย (`docs/standards/web-conventions.md`)
   */
  const departments = useDepartmentOptions()
  const positions = usePositionOptions()

  // ช่องข้อความว่าง = ไม่มีค่า · BE เก็บเป็น null อยู่แล้ว ส่งให้ตรงกันตั้งแต่ที่นี่
  function toInput(values: FormValues): EmployeeInput {
    return {
      code: values.code,
      firstName: values.firstName,
      lastName: values.lastName,
      nickname: values.nickname || null,
      note: values.note || null,
      phone: values.phone || null,
      email: values.email || null,
      hiredAt: values.hiredAt || null,
      departmentId: values.departmentId,
      positionId: values.positionId,
    }
  }

  async function handleSubmit(values: FormValues): Promise<string> {
    const input = toInput(values)

    /**
     * ข้อความสำเร็จประกอบที่นี่ ไม่ได้มาจาก BE — BE ส่งประโยคมาเฉพาะตอนปฏิเสธ
     * ชื่อเอาจากแถวที่ BE คืนกลับมา เพราะ BE `trim()` ก่อนบันทึก
     */
    if (mode === 'create') {
      const saved = await create.mutateAsync(input)
      return `เพิ่มพนักงาน "${saved.firstName} ${saved.lastName}" แล้ว`
    }

    if (!row) throw new Error('ไม่มีแถวให้แก้')
    const saved = await update.mutateAsync({ id: row.id, ...input })
    return `แก้ไข "${saved.firstName} ${saved.lastName}" แล้ว`
  }

  /**
   * บันทึกแล้วเปิดบัญชีต่อทันที — เส้นทางลัดสำหรับคนที่รู้อยู่แล้วว่าพนักงานคนนี้
   * ต้องมีบัญชีเข้าระบบ (ผู้ใช้ขอ 2026-09-08)
   *
   * **เรียก `form.handleSubmit` เอง ไม่ผ่าน `FormDialog`** ตามสัญญาของ `extraActions` —
   * ปุ่มนี้จึงคุมการปิดกล่องกับ toast เองทั้งหมด ไม่ใช้ข้อความ/การปิดที่ `FormDialog`
   * เตรียมไว้ให้ปุ่ม "บันทึก"
   *
   * **มีเฉพาะตอน `create`** — พนักงานที่มีอยู่แล้วอาจมีบัญชีอยู่แล้ว การเปิดบัญชีซ้ำ
   * เป็นเรื่องของปุ่มจัดการบัญชีในแถว ไม่ใช่ของกล่องแก้ข้อมูลทั่วไป
   */
  async function handleSubmitAndCreateAccount(values: FormValues): Promise<void> {
    try {
      const saved = await create.mutateAsync(toInput(values))
      toast.success(`เพิ่มพนักงาน "${saved.firstName} ${saved.lastName}" แล้ว`)
      onOpenChange(false)
      onCreateAccount?.(saved)
    } catch (err) {
      toast.error(toErrorMessage(err))
    }
  }

  const pending = create.isPending || update.isPending
  const loadingOptions =
    departments.isPending || positions.isPending

  return (
    <FormDialog<FormValues>
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      title={TITLE[mode]}
      schema={schema}
      defaultValues={{
        code: row?.code ?? '',
        firstName: row?.firstName ?? '',
        lastName: row?.lastName ?? '',
        nickname: row?.nickname ?? '',
        note: row?.note ?? '',
        // `undefined` ไม่ใช่ `null` ตอนสร้างใหม่ — zod จะได้ฟ้องว่ายังไม่ได้เลือก
        phone: row?.phone ?? '',
        email: row?.email ?? '',
        hiredAt: row?.hiredAt ?? '',
        departmentId: row?.departmentId ?? null,
        positionId: row?.positionId ?? null,
      }}
      onSubmit={handleSubmit}
      formKey={row?.id ?? 'new'}
      pending={pending}
      className="sm:max-w-2xl"
      extraActions={
        mode === 'create' && onCreateAccount
          ? ({ form, pending: actionPending }) => (
              <Button
                type="button"
                variant="outline"
                disabled={actionPending}
                onClick={() => form.handleSubmit(handleSubmitAndCreateAccount)()}
              >
                บันทึกแล้วเปิดบัญชี
              </Button>
            )
          : undefined
      }
    >
      {({ form, readOnly }) => (
        <>
          <PositionSync form={form} />
          {/*
            จัดเป็นแถว ไม่ใช่หนึ่งช่องหนึ่งบรรทัด — ช่องที่เป็นของสิ่งเดียวกันอยู่ด้วยกัน
            (`docs/standards/web-conventions.md`) · เก้าช่องเรียงลงมาคือกล่องที่ต้องเลื่อน
            ทั้งที่กล่องกว้างพอจะวางสามสี่ช่องต่อแถวได้สบาย
          */}
          {/*
            รหัส · ชื่อ · นามสกุล · ชื่อเล่น — ทั้งหมดคือการระบุตัวคนคนเดียว

            รหัสสั้นกว่าช่องอื่นมาก จึงกินหนึ่งคอลัมน์ ส่วนที่เหลือคนละหนึ่ง ·
            ให้มันกินแถวเต็มคนเดียวคือการทิ้งพื้นที่ไปสองในสามเพื่อดันทุกอย่างลงไปอีกบรรทัด
          */}
          <div className="grid gap-3 sm:grid-cols-4">
            <AppFormField name="code" label="รหัสพนักงาน" required={!readOnly}>
              <Input {...form.register('code')} disabled={pending} autoFocus={!readOnly} />
            </AppFormField>
            <AppFormField name="firstName" label="ชื่อ" required={!readOnly}>
              <Input {...form.register('firstName')} disabled={pending} />
            </AppFormField>
            <AppFormField name="lastName" label="นามสกุล" required={!readOnly}>
              <Input {...form.register('lastName')} disabled={pending} />
            </AppFormField>
            <AppFormField name="nickname" label="ชื่อเล่น">
              <Input {...form.register('nickname')} disabled={pending} />
            </AppFormField>
          </div>

          {/* ช่องทางติดต่อกับวันเริ่มงาน — ไม่บังคับทั้งแถว */}
          <div className="grid gap-3 sm:grid-cols-3">
            <AppFormField name="phone" label="เบอร์โทร">
              <Input {...form.register('phone')} disabled={pending} readOnly={readOnly} />
            </AppFormField>
            <AppFormField name="email" label="อีเมล">
              <Input {...form.register('email')} type="email" disabled={pending} readOnly={readOnly} />
            </AppFormField>
            {/*
              `AppDatePicker` ไม่ใช่ `<input type="date">` — ปฏิทินของเบราว์เซอร์
              หน้าตาต่างกันทุกตัวและไม่มีปฏิทินไทย · เป็นที่สุดท้ายในระบบที่ยังใช้อยู่
              (แก้ 2026-09-01)
            */}
            <AppFormField name="hiredAt" label="วันที่เริ่มงาน">
              <AppDatePicker
                value={form.watch('hiredAt') as string | null}
                onChange={(v) => form.setValue('hiredAt', v ?? '')}
                disabled={pending}
                readOnly={readOnly}
                aria-label="วันที่เริ่มงาน"
              />
            </AppFormField>
          </div>

          {/* แผนกกับตำแหน่ง — แม่กับลูก */}
          <div className="grid gap-3 sm:grid-cols-2">
            <AppFormField name="departmentId" label="แผนก">
              <ComboboxField
                name="departmentId"
                options={departments.data ?? []}
                placeholder="เลือกแผนก (ไม่บังคับ)"
                disabled={pending}
                readOnly={readOnly}
                loading={loadingOptions}
              />
            </AppFormField>
            <AppFormField name="positionId" label="ตำแหน่ง">
              <ComboboxField
                name="positionId"
                options={positionsInDepartment(positions.data, form.watch('departmentId'))}
                placeholder="เลือกตำแหน่ง (ไม่บังคับ)"
                disabled={pending}
                readOnly={readOnly}
                loading={loadingOptions}
              />
            </AppFormField>
          </div>

          <AppFormField name="note" label="บันทึก">
            {/*
              ไม่มี placeholder (ผู้ใช้ตัดสิน 2026-08-27) — ป้ายบอกอยู่แล้วว่าช่องนี้คืออะไร
              ข้อความจาง ๆ ในช่องอ่านเหมือนมีค่ากรอกไว้แล้ว และหายไปทันทีที่เริ่มพิมพ์
              ซึ่งเป็นตอนที่คนอาจยังต้องการมันอยู่
            */}
            <Textarea {...form.register('note')} disabled={pending} rows={3} />
          </AppFormField>
        </>
      )}
    </FormDialog>
  )
}

/**
 * ตำแหน่งที่เลือกได้ เมื่ออยู่แผนกนี้
 *
 * BE บังคับให้ตรงกันเป๊ะ (`requirePositionInDepartment`) — ไม่กรองที่นี่แปลว่า
 * ผู้ใช้เลือกได้ทุกตัว แล้วเจอข้อความปฏิเสธตอนกดบันทึก ทั้งที่หน้าจอรู้อยู่ก่อนแล้ว
 *
 * กรองจากรายการที่โหลดมาแล้ว ไม่ยิงใหม่ทุกครั้งที่เปลี่ยนแผนก · `?departmentId=`
 * ของ API รับแต่ตัวเลข จึงถามหา "ตำแหน่งที่ไม่สังกัดแผนก" ไม่ได้อยู่ดี
 */
function positionsInDepartment(
  all: ReadonlyArray<{ id: number; name: string; departmentId: number | null }> | undefined,
  departmentId: number | null | undefined,
): Array<{ id: number; name: string }> {
  const wanted = departmentId ?? null
  return (all ?? []).filter((position) => position.departmentId === wanted)
}

/**
 * ล้างตำแหน่งเมื่อเปลี่ยนแผนก
 *
 * ไม่ล้างแล้วค่าเดิมค้างอยู่ในฟอร์มทั้งที่หายไปจากรายการ — ผู้ใช้เห็นช่องว่าง
 * แต่ยังส่งค่าเก่าไป แล้ว BE ปฏิเสธด้วยเหตุผลที่หน้าจอไม่ได้บอก
 *
 * แยกเป็นคอมโพเนนต์เพราะ `useEffect` เรียกใน render-prop ของ `AppForm` ไม่ได้
 */
function PositionSync({ form }: { form: { watch: (name: string) => unknown; setValue: (name: string, value: unknown) => void } }) {
  const departmentId = form.watch('departmentId') as number | null | undefined
  const positionId = form.watch('positionId') as number | null | undefined
  const positions = usePositionOptions()

  // id ของแผนกที่ตำแหน่งปัจจุบันสังกัด — `undefined` = ยังหาไม่เจอ (รายการยังไม่มา)
  const positionDepartment = useMemo(() => {
    if (positionId == null) return undefined
    return (positions.data ?? []).find((p) => p.id === positionId)?.departmentId
  }, [positions.data, positionId])

  useEffect(() => {
    if (positionId == null || positionDepartment === undefined) return
    if (positionDepartment === (departmentId ?? null)) return

    form.setValue('positionId', null)
  }, [departmentId, positionId, positionDepartment, form])

  return null
}
