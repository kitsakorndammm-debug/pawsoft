'use client'

import { z } from 'zod'

import { AppDatePicker } from '@/components/common/app-date-picker'
import { AppFormField } from '@/components/common/app-form-field'
import { ComboboxField } from '@/components/common/combobox-field'
import { FormDialog } from '@/components/common/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useDrugOptions } from '@/features/drug/hooks'
import { useCreateWarehouseStockMovement } from '@/features/warehouse-stock/hooks'

/** ยาวสุดที่ BE รับ — ตรงกับ `REASON_MAX` ใน `apps/api/src/modules/warehouse-stock/warehouse-stock.service.ts` */
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
    // ไม่บังคับกรอก — มีความหมายเฉพาะตอนซื้อเข้า (ดูฝั่ง BE ก่อนใส่ฟิลด์ใหม่)
    expiresOn: z.string().trim().optional(),
    receivedOn: z.string().trim().optional(),
  })
  // ซื้อเข้าต้องเป็นบวก — ตรงกับที่ BE ปฏิเสธ ให้กรอบแดงขึ้นก่อนยิง API
  .refine((data) => data.type !== 'RECEIVE' || Number(data.quantity) > 0, {
    message: 'ซื้อเข้าต้องเป็นจำนวนบวก',
    path: ['quantity'],
  })
  // ปรับยอดบังคับเหตุผล — เหตุผลเดียวกับ CHECK ที่ฐาน
  .refine((data) => data.type !== 'ADJUST' || (data.reason?.trim().length ?? 0) > 0, {
    message: 'ปรับยอดต้องกรอกเหตุผล',
    path: ['reason'],
  })

type FormValues = z.infer<typeof schema>

const TYPE_LABEL: Record<FormValues['type'], string> = { RECEIVE: 'ซื้อเข้า', ADJUST: 'ปรับยอด' }

/** กล่องบันทึกซื้อเข้า/ปรับยอดคลัง — สร้างอย่างเดียว ไม่มีแก้/ดู เพราะเป็น log */
export function WarehouseStockDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const drugs = useDrugOptions()
  const create = useCreateWarehouseStockMovement()

  async function handleSubmit(values: FormValues): Promise<string> {
    await create.mutateAsync({
      drugId: values.drugId,
      type: values.type,
      quantity: values.quantity,
      reason: values.reason?.trim() || null,
      expiresOn: values.expiresOn?.trim() || null,
      receivedOn: values.receivedOn?.trim() || null,
    })

    // ชื่อยาเอาจากตัวเลือกที่โหลดไว้ — response ของ BE คืนแค่ `drugId` ไม่มีชื่อ
    const drugName = drugs.data?.find((d) => d.id === values.drugId)?.name ?? 'ยา'

    return values.type === 'RECEIVE'
      ? `บันทึกซื้อเข้า "${drugName}" จำนวน ${values.quantity} แล้ว`
      : `บันทึกปรับยอด "${drugName}" จำนวน ${values.quantity} แล้ว`
  }

  return (
    <FormDialog<FormValues>
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      title="บันทึกการเคลื่อนไหวคลังยา"
      schema={schema}
      defaultValues={{
        drugId: undefined as unknown as number,
        type: 'RECEIVE',
        quantity: '',
        reason: '',
        expiresOn: '',
        receivedOn: '',
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
              ใส่จำนวนติดลบถ้าต้องการลดคลัง เช่น -5
            </p>
          )}

          {form.watch('type') === 'RECEIVE' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <AppFormField name="receivedOn" label="วันที่ซื้อเข้า">
                <AppDatePicker
                  value={form.watch('receivedOn') as string | null}
                  onChange={(v) => form.setValue('receivedOn', v ?? '')}
                  disabled={pending}
                  aria-label="วันที่ซื้อเข้า"
                />
              </AppFormField>
              <AppFormField name="expiresOn" label="วันหมดอายุ">
                <AppDatePicker
                  value={form.watch('expiresOn') as string | null}
                  onChange={(v) => form.setValue('expiresOn', v ?? '')}
                  disabled={pending}
                  aria-label="วันหมดอายุ"
                />
              </AppFormField>
            </div>
          )}

          <AppFormField name="reason" label="เหตุผล" required={form.watch('type') === 'ADJUST'}>
            <Textarea {...form.register('reason')} disabled={pending} rows={2} />
          </AppFormField>
        </>
      )}
    </FormDialog>
  )
}
