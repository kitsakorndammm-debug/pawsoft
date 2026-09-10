'use client'

import { CalendarPlus, Pill, Stethoscope, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Combobox } from '@/components/common/combobox'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCan } from '@/features/auth/hooks'
import { useDrugOptions } from '@/features/drug/hooks'
import { useServiceItemOptions } from '@/features/service-item/hooks'
import { TRIAGE_LABEL, VISIT_STATUS_LABEL } from '@/features/visit/api'
import {
  useAddVisitDrug,
  useAddVisitService,
  useFinishExam,
  useRemoveVisitDrug,
  useRemoveVisitService,
  useVisit,
  useVisitBill,
} from '@/features/visit/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { MEDICAL_WRITE } from '@/lib/permissions'

import { NextAppointmentDialog } from './next-appointment-dialog'

/**
 * บันทึกการตรวจ + รายการที่คิดเงิน
 *
 * **ราคาที่เห็นตรงนี้ถูกคัดลอกไว้แล้ว ไม่ได้ชี้ไปที่ตารางยา** · ขึ้นราคายาพรุ่งนี้
 * ใบนี้ยังเป็นยอดเดิม — ดู `///` บน `visit-item.service.ts`
 *
 * **ปิดคิวแล้วแก้ไม่ได้** และฟอร์มจะเป็นแบบอ่านอย่างเดียว · ใบที่ปิดแล้วคือใบที่
 * ลูกค้าจ่ายเงินตามยอดนั้นไปแล้ว
 */
export function VisitDetailDialog({
  visitId,
  open,
  onOpenChange,
}: {
  visitId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const visit = useVisit(visitId)
  const bill = useVisitBill(visitId)

  const drugs = useDrugOptions()
  const services = useServiceItemOptions()

  const addDrug = useAddVisitDrug()
  const addService = useAddVisitService()
  const removeDrug = useRemoveVisitDrug()
  const removeService = useRemoveVisitService()
  const finish = useFinishExam()

  const [diagnosis, setDiagnosis] = useState('')
  const [note, setNote] = useState('')
  const [weightKg, setWeightKg] = useState('')

  const [drugId, setDrugId] = useState('')
  const [drugQty, setDrugQty] = useState('1')
  const [dosage, setDosage] = useState('')

  const [serviceId, setServiceId] = useState('')
  const [serviceQty, setServiceQty] = useState('1')

  const [nextAppointmentOpen, setNextAppointmentOpen] = useState(false)

  const row = visit.data

  /**
   * เติมค่าเดิมลงฟอร์มเมื่อเปิดคิวคนละใบ
   *
   * ผูกกับ `row?.id` ไม่ใช่ `row` — object ใหม่ทุกครั้งที่ refetch จะทับสิ่งที่หมอ
   * กำลังพิมพ์ค้างอยู่ทุก 15 วินาที
   */
  useEffect(() => {
    if (!row) return
    setDiagnosis(row.diagnosis ?? '')
    setNote(row.note ?? '')
    setWeightKg(row.weightKg ?? '')
  }, [row?.id])

  /**
   * **แก้ได้ก็ต่อเมื่อเป็นหมอ** (ผู้ใช้ตัดสิน 2026-09-01)
   *
   * เดิมใครที่เปิดคิวได้ก็เขียนผลวินิจฉัยและสั่งยาได้ — ซึ่งเป็นงานที่ต้องมีใบประกอบ
   * วิชาชีพ · เคาน์เตอร์ยังเปิดกล่องนี้ดูได้ แต่เห็นเป็นแบบอ่านอย่างเดียว
   *
   * **นี่คือการซ่อน ไม่ใช่การกัน** — BE ปฏิเสธด้วย `medical:write` อีกชั้นเสมอ
   */
  const canWriteMedical = useCan(MEDICAL_WRITE)

  const closed = row?.status === 'DONE' || row?.status === 'CANCELLED'
  const readOnly = closed || !canWriteMedical
  const pending = addDrug.isPending || addService.isPending || finish.isPending

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn()
      toast.success(done)
    } catch (e) {
      toast.error(toErrorMessage(e))
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              คิว {row?.queueNumber ?? '—'}
              {row ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {VISIT_STATUS_LABEL[row.status]} · {TRIAGE_LABEL[row.triage]}
                </span>
              ) : null}
            </DialogTitle>
          </DialogHeader>

          {visit.isPending ? (
            <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
          ) : !row ? (
            <p className="text-sm text-destructive">ไม่พบคิวนี้</p>
          ) : (
            <div className="flex flex-col gap-4">
              {!canWriteMedical && !closed ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900">
                  ดูได้อย่างเดียว — การบันทึกผลตรวจและจ่ายยาเป็นสิทธิ์ของสัตวแพทย์
                </div>
              ) : null}

              {row.symptom ? (
                <div className="rounded-md bg-muted p-2 text-sm">
                  <span className="text-muted-foreground">อาการที่แจ้ง: </span>
                  {row.symptom}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="v-weight">น้ำหนัก (กก.)</Label>
                  <Input
                    id="v-weight"
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    inputMode="decimal"
                    readOnly={readOnly}
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="v-diagnosis">ผลวินิจฉัย</Label>
                  <Input
                    id="v-diagnosis"
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    readOnly={readOnly}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="v-note">บันทึกเพิ่มเติม</Label>
                <Textarea
                  id="v-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  readOnly={readOnly}
                />
              </div>

              {/* ---- รายการรักษา ---- */}
              <section className="flex flex-col gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-medium">
                  <Stethoscope className="size-4 text-primary-strong" />
                  รายการรักษา
                </h3>

                {!readOnly ? (
                  <div className="flex flex-wrap items-end gap-2">
                    {/*
                      `Combobox` ไม่ใช่ `<select>` — ค้นได้ด้วยการพิมพ์ ซึ่งจำเป็นเมื่อ
                      รายการรักษามีหลายสิบ · รูปเดียวกับช่องเลือกทั้งระบบ
                    */}
                    <Combobox
                      value={serviceId === '' ? null : Number(serviceId)}
                      onChange={(v) => setServiceId(v === null ? '' : String(v))}
                      options={(services.data ?? []).map((s) => ({
                        value: s.id,
                        label: `${s.name}${s.price === null ? ' (ยังไม่ตั้งราคา)' : ` — ${s.price}`}`,
                      }))}
                      placeholder="เลือกรายการรักษา"
                      searchPlaceholder="พิมพ์ชื่อรายการ"
                      loading={services.isPending}
                      className="min-w-56 flex-1"
                      aria-label="เลือกรายการรักษา"
                    />
                    <Input
                      className="w-20"
                      value={serviceQty}
                      onChange={(e) => setServiceQty(e.target.value)}
                      inputMode="numeric"
                      aria-label="จำนวน"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={serviceId === '' || pending}
                      onClick={() =>
                        void run(async () => {
                          await addService.mutateAsync({
                            visitId: row.id,
                            serviceItemId: Number(serviceId),
                            quantity: Number(serviceQty) || 1,
                            unitPrice: null,
                            note: null,
                          })
                          setServiceId('')
                          setServiceQty('1')
                        }, 'เพิ่มรายการแล้ว')
                      }
                    >
                      เพิ่ม
                    </Button>
                  </div>
                ) : null}

                <ItemTable
                  rows={(bill.data?.services ?? []).map((s) => ({
                    id: s.id,
                    name: s.name,
                    detail: `x${s.quantity}`,
                    price: s.unitPrice,
                  }))}
                  readOnly={readOnly}
                  onRemove={(id) =>
                    void run(() => removeService.mutateAsync(id), 'เอารายการออกแล้ว')
                  }
                  empty="ยังไม่มีรายการรักษา"
                />
              </section>

              {/* ---- ยา ---- */}
              <section className="flex flex-col gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-medium">
                  <Pill className="size-4 text-primary-strong" />
                  ยา
                </h3>

                {!readOnly ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <Combobox
                      value={drugId === '' ? null : Number(drugId)}
                      onChange={(v) => setDrugId(v === null ? '' : String(v))}
                      options={(drugs.data ?? []).map((d) => ({
                        value: d.id,
                        label: `${d.name}${d.price === null ? ' (ยังไม่ตั้งราคา)' : ` — ${d.price}`}${d.unit ? `/${d.unit}` : ''}`,
                      }))}
                      placeholder="เลือกยา"
                      searchPlaceholder="พิมพ์ชื่อยา"
                      loading={drugs.isPending}
                      className="min-w-56 flex-1"
                      aria-label="เลือกยา"
                    />
                    <Input
                      className="w-20"
                      value={drugQty}
                      onChange={(e) => setDrugQty(e.target.value)}
                      inputMode="decimal"
                      aria-label="จำนวน"
                    />
                    <Input
                      className="w-40"
                      value={dosage}
                      onChange={(e) => setDosage(e.target.value)}
                      placeholder="วิธีใช้"
                      aria-label="วิธีใช้"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={drugId === '' || pending}
                      onClick={() =>
                        void run(async () => {
                          await addDrug.mutateAsync({
                            visitId: row.id,
                            drugId: Number(drugId),
                            quantity: drugQty.trim() || '1',
                            unitPrice: null,
                            dosage: dosage.trim() || null,
                          })
                          setDrugId('')
                          setDrugQty('1')
                          setDosage('')
                        }, 'เพิ่มยาแล้ว')
                      }
                    >
                      เพิ่ม
                    </Button>
                  </div>
                ) : null}

                <ItemTable
                  rows={(bill.data?.drugs ?? []).map((d) => ({
                    id: d.id,
                    name: d.name,
                    detail: `${d.quantity}${d.unit ? ` ${d.unit}` : ''}${d.dosage ? ` · ${d.dosage}` : ''}`,
                    price: d.unitPrice,
                  }))}
                  readOnly={readOnly}
                  onRemove={(id) => void run(() => removeDrug.mutateAsync(id), 'เอายาออกแล้ว')}
                  empty="ยังไม่มียา"
                />
              </section>

              <div className="flex items-center justify-between rounded-md bg-primary/5 px-3 py-2">
                <span className="text-sm font-medium">ยอดรวม</span>
                {/* เงินเป็นข้อความจาก BE — ห้าม `Number()` ที่ไหนทั้งสิ้น */}
                <span className="text-lg font-semibold">{bill.data?.total ?? '0.00'}</span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ปิด
            </Button>

            {/*
              **ไม่ผูกกับสถานะคิว** — นัดได้แม้คิวปิดแล้ว (ผู้ใช้ตัดสิน 2026-09-08) ·
              ซ่อนถ้ายังไม่ผูกเจ้าของสัตว์ เพราะ BE ปฏิเสธแน่นอนถ้าไม่มี ownerId
            */}
            {row && canWriteMedical && row.ownerId !== null ? (
              <Button type="button" variant="outline" onClick={() => setNextAppointmentOpen(true)}>
                <CalendarPlus className="size-4" />
                นัดครั้งถัดไป
              </Button>
            ) : null}

            {row?.status === 'IN_PROGRESS' && canWriteMedical ? (
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    await finish.mutateAsync({
                      id: row.id,
                      diagnosis: diagnosis.trim() || null,
                      note: note.trim() || null,
                      weightKg: weightKg.trim() || null,
                    })
                    onOpenChange(false)
                  }, 'ปิดการตรวจแล้ว — รอชำระเงิน')
                }
              >
                ตรวจเสร็จ
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {row ? (
        <NextAppointmentDialog
          visitId={row.id}
          open={nextAppointmentOpen}
          onOpenChange={setNextAppointmentOpen}
        />
      ) : null}
    </>
  )
}

function ItemTable({
  rows,
  readOnly,
  onRemove,
  empty,
}: {
  rows: { id: number; name: string; detail: string; price: string }[]
  readOnly: boolean
  onRemove: (id: number) => void
  empty: string
}) {
  if (rows.length === 0) {
    return <p className="rounded-md border border-dashed p-2 text-sm text-muted-foreground">{empty}</p>
  }

  return (
    <div className="divide-y rounded-md border">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
          <span className="min-w-0 flex-1 truncate">{r.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{r.detail}</span>
          <span className="w-20 shrink-0 text-right tabular-nums">{r.price}</span>
          {!readOnly ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`เอา ${r.name} ออก`}
              onClick={() => onRemove(r.id)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  )
}
