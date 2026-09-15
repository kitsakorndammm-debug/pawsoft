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
import { useCreateDrugStockMovement } from '@/features/drug-stock/hooks'
import { useWarehouseStockBalances, useWithdrawFromWarehouse } from '@/features/warehouse-stock/hooks'

/** ยาวสุดที่ BE รับ — ตรงกับ `REASON_MAX` ใน `apps/api/src/modules/drug-stock/drug-stock.service.ts` */
const REASON_MAX = 500

const QUANTITY_PATTERN = /^-?\d+(\.\d{1,2})?$/

/**
 * `mode` แทน `type` เดิม — สองปุ่มนี้ยิงคนละ endpoint กันเลย ไม่ใช่แค่ค่า `type`
 * ต่างกันเฉยๆ (ผู้ใช้ตัดสิน 2026-09-15): "เบิกจากคลัง" ไปที่
 * `POST /api/warehouse-stock/withdraw` (ตัดคลัง + เติมสต็อกนี้พร้อมกัน) ส่วน
 * "ปรับยอด" ยังไปที่ `POST /api/drug-stock` เหมือนเดิมทุกอย่าง
 */
const schema = z
  .object({
    drugId: z.number({ message: 'เลือกยา' }),
    mode: z.enum(['WITHDRAW', 'ADJUST'], { message: 'เลือกประเภท' }),
    quantity: z
      .string()
      .trim()
      .min(1, 'กรอกจำนวน')
      .regex(QUANTITY_PATTERN, 'จำนวนต้องเป็นตัวเลข ทศนิยมไม่เกินสองตำแหน่ง')
      .refine((v) => Number(v) !== 0, 'จำนวนต้องไม่เป็นศูนย์'),
    reason: z.string().trim().max(REASON_MAX, `ยาวเกิน ${REASON_MAX} ตัวอักษร`).optional(),
    // ไม่บังคับกรอก — มีความหมายเฉพาะตอนเบิกจากคลัง (ดูฝั่ง BE ก่อนใส่ฟิลด์ใหม่)
    expiresOn: z.string().trim().optional(),
  })
  // เบิกต้องเป็นบวก — ตรงกับที่ BE ปฏิเสธ ให้กรอบแดงขึ้นก่อนยิง API
  .refine((data) => data.mode !== 'WITHDRAW' || Number(data.quantity) > 0, {
    message: 'เบิกต้องเป็นจำนวนบวก',
    path: ['quantity'],
  })
  // ปรับยอดบังคับเหตุผล — เหตุผลเดียวกับ CHECK ที่ฐาน
  .refine((data) => data.mode !== 'ADJUST' || (data.reason?.trim().length ?? 0) > 0, {
    message: 'ปรับยอดต้องกรอกเหตุผล',
    path: ['reason'],
  })

type FormValues = z.infer<typeof schema>

const MODE_LABEL: Record<FormValues['mode'], string> = { WITHDRAW: 'เบิกจากคลัง', ADJUST: 'ปรับยอด' }

/** กล่องบันทึกการเคลื่อนไหวสต็อก — สร้างอย่างเดียว ไม่มีแก้/ดู เพราะเป็น log */
export function DrugStockDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const drugs = useDrugOptions()
  const adjust = useCreateDrugStockMovement()
  const withdraw = useWithdrawFromWarehouse()
  // ยอดคงเหลือในคลัง — โหลดทั้งชุดมาแสดงเป็นตัวช่วยว่าเบิกได้ไม่เกินเท่าไหร่
  const warehouse = useWarehouseStockBalances('')

  const pending = adjust.isPending || withdraw.isPending

  async function handleSubmit(values: FormValues): Promise<string> {
    // ชื่อยาเอาจากตัวเลือกที่โหลดไว้ — response ของ BE คืนแค่ `drugId` ไม่มีชื่อ
    const drugName = drugs.data?.find((d) => d.id === values.drugId)?.name ?? 'ยา'

    if (values.mode === 'WITHDRAW') {
      await withdraw.mutateAsync({
        drugId: values.drugId,
        quantity: values.quantity,
        reason: values.reason?.trim() || null,
        expiresOn: values.expiresOn?.trim() || null,
      })

      return `เบิก "${drugName}" จากคลังจำนวน ${values.quantity} แล้ว`
    }

    await adjust.mutateAsync({
      drugId: values.drugId,
      type: 'ADJUST',
      quantity: values.quantity,
      reason: values.reason?.trim() || null,
    })

    return `บันทึกปรับยอด "${drugName}" จำนวน ${values.quantity} แล้ว`
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
        mode: 'WITHDRAW',
        quantity: '',
        reason: '',
        expiresOn: '',
      }}
      onSubmit={handleSubmit}
      formKey="new"
      pending={pending}
    >
      {({ form, pending: formPending }) => {
        const selectedDrugId = form.watch('drugId') as number | undefined
        const warehouseBalance = warehouse.data?.find((d) => d.id === selectedDrugId)

        return (
          <>
            <AppFormField name="drugId" label="ยา" required>
              <ComboboxField
                name="drugId"
                options={drugs.data ?? []}
                placeholder="เลือกยา"
                disabled={formPending}
                required
                loading={drugs.isPending}
              />
            </AppFormField>

            <AppFormField name="mode" label="ประเภท" required>
              {(field) => (
                <div className="flex gap-2">
                  {(['WITHDRAW', 'ADJUST'] as const).map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant={field.value === value ? 'default' : 'outline'}
                      disabled={formPending}
                      onClick={() => field.onChange(value)}
                    >
                      {MODE_LABEL[value]}
                    </Button>
                  ))}
                </div>
              )}
            </AppFormField>

            {form.watch('mode') === 'WITHDRAW' && selectedDrugId !== undefined && (
              <p className="-mt-2 text-xs text-muted-foreground">
                คลังยามีเหลือ {warehouseBalance?.quantity ?? '0'} {warehouseBalance?.unit ?? ''}
              </p>
            )}

            <AppFormField name="quantity" label="จำนวน" required>
              <Input {...form.register('quantity')} disabled={formPending} />
            </AppFormField>

            {form.watch('mode') === 'WITHDRAW' && (
              <AppFormField name="expiresOn" label="วันหมดอายุ">
                <AppDatePicker
                  value={form.watch('expiresOn') as string | null}
                  onChange={(v) => form.setValue('expiresOn', v ?? '')}
                  disabled={formPending}
                  aria-label="วันหมดอายุ"
                />
              </AppFormField>
            )}

            {form.watch('mode') === 'ADJUST' && (
              <p className="-mt-2 text-xs text-muted-foreground">
                ใส่จำนวนติดลบถ้าต้องการลดสต็อก เช่น -5
              </p>
            )}

            <AppFormField name="reason" label="เหตุผล" required={form.watch('mode') === 'ADJUST'}>
              <Textarea {...form.register('reason')} disabled={formPending} rows={2} />
            </AppFormField>
          </>
        )
      }}
    </FormDialog>
  )
}
