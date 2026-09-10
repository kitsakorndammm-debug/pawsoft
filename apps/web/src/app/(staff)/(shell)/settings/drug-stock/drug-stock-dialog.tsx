'use client'

import { z } from 'zod'

import { AppFormField } from '@/components/common/app-form-field'
import { ComboboxField } from '@/components/common/combobox-field'
import { FormDialog } from '@/components/common/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useDrugOptions } from '@/features/drug/hooks'
import { useCreateDrugStockMovement } from '@/features/drug-stock/hooks'

/** ยาวสุดที่ BE รับ — ตรงกับ `REASON_MAX` ใน `apps/api/src/modules/drug-stock/drug-stock.service.ts` */
const REASON_MAX = 500

const QUANTITY_PATTERN = /^-?\d+(\.\d{1,2})?$/

const schema = z
  .object({
    drugId: z.number({ message: 'เลือกยา' }),
    type: z.enum(['RECEIVE', 'ADJUST'], { message: 'เลือกประเภท' }),
    quantity: z
      .string()
      .trim()
      .min(1, 'กรอกจำนวน')
      .regex(QUANTITY_PATTERN, 'จำนวนต้องเป็นตัวเลข ทศนิยมไม่เกินสองตำแหน่ง')
      .refine((v) => Number(v) !== 0, 'จำนวนต้องไม่เป็นศูนย์'),
    reason: z.string().trim().max(REASON_MAX, `ยาวเกิน ${REASON_MAX} ตัวอักษร`).optional(),
  })
  // รับเข้าต้องเป็นบวก — ตรงกับที่ BE ปฏิเสธ ให้กรอบแดงขึ้นก่อนยิง API
  .refine((data) => data.type !== 'RECEIVE' || Number(data.quantity) > 0, {
    message: 'รับเข้าต้องเป็นจำนวนบวก',
    path: ['quantity'],
  })
  // ปรับยอดบังคับเหตุผล — เหตุผลเดียวกับ CHECK ที่ฐาน
  .refine((data) => data.type !== 'ADJUST' || (data.reason?.trim().length ?? 0) > 0, {
    message: 'ปรับยอดต้องกรอกเหตุผล',
    path: ['reason'],
  })

type FormValues = z.infer<typeof schema>

const TYPE_LABEL: Record<FormValues['type'], string> = { RECEIVE: 'รับเข้า', ADJUST: 'ปรับยอด' }

/** กล่องบันทึกรับเข้า/ปรับยอดสต็อก — สร้างอย่างเดียว ไม่มีแก้/ดู เพราะเป็น log */
export function DrugStockDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const drugs = useDrugOptions()
  const create = useCreateDrugStockMovement()

  async function handleSubmit(values: FormValues): Promise<string> {
    await create.mutateAsync({
      drugId: values.drugId,
      type: values.type,
      quantity: values.quantity,
      reason: values.reason?.trim() || null,
    })

    // ชื่อยาเอาจากตัวเลือกที่โหลดไว้ — response ของ BE คืนแค่ `drugId` ไม่มีชื่อ
    const drugName = drugs.data?.find((d) => d.id === values.drugId)?.name ?? 'ยา'

    return values.type === 'RECEIVE'
      ? `บันทึกรับเข้า "${drugName}" จำนวน ${values.quantity} แล้ว`
      : `บันทึกปรับยอด "${drugName}" จำนวน ${values.quantity} แล้ว`
  }

  return (
    <FormDialog<FormValues>
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      title="บันทึกการเคลื่อนไหวสต็อก"
      schema={schema}
      defaultValues={{
        drugId: undefined as unknown as number,
        type: 'RECEIVE',
        quantity: '',
        reason: '',
      }}
      onSubmit={handleSubmit}
      formKey="new"
      pending={create.isPending}
    >
      {({ form, pending }) => (
        <>
          <AppFormField name="drugId" label="ยา" required>
            <ComboboxField
              name="drugId"
              options={drugs.data ?? []}
              placeholder="เลือกยา"
              disabled={pending}
              required
              loading={drugs.isPending}
            />
          </AppFormField>

          <AppFormField name="type" label="ประเภท" required>
            {(field) => (
              <div className="flex gap-2">
                {(['RECEIVE', 'ADJUST'] as const).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant={field.value === value ? 'default' : 'outline'}
                    disabled={pending}
                    onClick={() => field.onChange(value)}
                  >
                    {TYPE_LABEL[value]}
                  </Button>
                ))}
              </div>
            )}
          </AppFormField>

          <AppFormField name="quantity" label="จำนวน" required>
            <Input {...form.register('quantity')} disabled={pending} />
          </AppFormField>

          {form.watch('type') === 'ADJUST' && (
            <p className="-mt-2 text-xs text-muted-foreground">
              ใส่จำนวนติดลบถ้าต้องการลดสต็อก เช่น -5
            </p>
          )}

          <AppFormField name="reason" label="เหตุผล" required={form.watch('type') === 'ADJUST'}>
            <Textarea {...form.register('reason')} disabled={pending} rows={2} />
          </AppFormField>
        </>
      )}
    </FormDialog>
  )
}
