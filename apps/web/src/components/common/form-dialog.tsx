'use client'

import type { ReactNode } from 'react'
import { toast } from 'sonner'

import { AppForm } from '@/components/common/app-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toErrorMessage } from '@/lib/api-client'
import { cn } from '@/lib/utils'

/**
 * กล่องที่มีฟอร์มอยู่ข้างใน — เพิ่ม · แก้ · ดู
 *
 * **ไม่รู้จักโดเมนไหนเลย** ฟิลด์มาจากคนเรียกทั้งหมด · กล่องนี้ดูแลแค่สิ่งที่ทุกฟอร์ม
 * ในกล่องต้องเหมือนกัน: หัวเรื่อง ปุ่มล่าง การปิดหลังบันทึก และการแปลง error
 * เป็น toast
 *
 * โหมด `view` คือกล่องเดิมที่ปิดการแก้ — คนไม่มีสิทธิ์เขียนยังเปิดดูค่าเต็มได้
 * ซึ่งจำเป็นเมื่อข้อความยาวเกินความกว้างของคอลัมน์ · สร้างกล่องที่สามสำหรับ "ดู"
 * แปลว่าฟอร์มเดียวกันถูกวางสองที่ แล้ววันหนึ่งจะไม่ตรงกัน
 */

export type DialogMode = 'create' | 'edit' | 'view'

interface FormDialogProps<T extends Record<string, unknown>> {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: DialogMode
  /** หัวกล่อง — คนเรียกประกอบเอง เพราะแต่ละหน้าเรียกของตัวเองไม่เหมือนกัน */
  title: string
  // biome-ignore lint/suspicious/noExplicitAny: zodResolver overload ผูก generic ของ zod เข้ากับ RHF แล้วชนกัน
  schema: any
  defaultValues: T
  /**
   * บันทึก — โยน error ออกมาได้เลย กล่องจับเป็น toast ให้
   *
   * คืนข้อความที่จะขึ้น toast ตอนสำเร็จ · คืน `null` ถ้าไม่ต้องขึ้น
   * (BE ส่งประโยคมาเฉพาะตอนปฏิเสธ — ตอนสำเร็จหน้าจอเป็นคนเขียนเอง)
   */
  onSubmit: (values: T) => Promise<string | null>
  /** กำลังบันทึกอยู่ — ปิดปุ่มและช่องกรอก */
  pending?: boolean
  /**
   * ตัวระบุของสิ่งที่กำลังแก้ — `row.id` หรือ `null` ตอนสร้างใหม่
   *
   * ใช้เป็น `key` ของฟอร์ม เพื่อบังคับให้สร้างใหม่เมื่อสลับแถว · `defaultValues`
   * ของ react-hook-form ถูกอ่านครั้งเดียวตอน mount ไม่มี key แล้วกล่องจะเปิดมา
   * พร้อมค่าของแถวก่อนหน้า
   *
   * **ห้ามผูก key กับตัว `defaultValues` เอง** — ค่านั้นเปลี่ยนทุกครั้งที่ตาราง
   * รีเฟรช (mutation invalidate query แล้ว row object เป็นตัวใหม่) React จะสร้าง
   * ฟอร์มใหม่กลางการ submit แล้ว `onOpenChange(false)` หายไปพร้อมของเก่า —
   * อาการคือบันทึกสำเร็จ แถวขึ้นในตาราง แต่กล่องค้างเปิดอยู่ (เจอจริง 2026-08-26)
   */
  formKey: string | number
  /**
   * ความกว้างของกล่อง — ค่าตั้งต้น `sm:max-w-md` พอสำหรับฟอร์มช่องเดียว
   * ฟอร์มที่จัดหลายช่องต่อแถวต้องกว้างกว่านั้น ไม่งั้นช่องแคบจนอ่านค่าที่กรอกไม่ออก
   */
  className?: string
  /**
   * ทับพื้นหลังให้เข้มขึ้น — **สำหรับกล่องที่ซ้อนบนอีกกล่อง**
   *
   * กล่องแม่ยังอยู่ข้างหลังและอ่านออก ซึ่งแย่งสายตาจากสิ่งที่คนกำลังกรอก · ส่งค่านี้
   * แล้วพื้นหลังทึบขึ้นจนเหลือกล่องเดียวที่มองเห็น
   */
  overlayClassName?: string
  /**
   * ฟิลด์ในฟอร์ม · `form` คือ react-hook-form ตัวเดียวกับที่ `AppForm` สร้าง
   * `readOnly` ให้ปิดช่องเองตอนโหมด `view`
   */
  children: (args: {
    // biome-ignore lint/suspicious/noExplicitAny: ชนิดของ form มาจาก AppForm ซึ่ง generic ไม่ผูกกับที่นี่
    form: any
    readOnly: boolean
    pending: boolean
  }) => ReactNode
  /**
   * ปิดปุ่มบันทึก — **สำหรับกฎที่ zod ตรวจไม่ได้**
   *
   * ช่องที่อยู่นอก react-hook-form (ตารางที่กล่องถือใน state ของตัวเอง) ไม่ผ่าน
   * schema · ปุ่มที่กดแล้วโดน BE ปฏิเสธคือปุ่มที่หลอกให้คนกด
   */
  submitDisabled?: boolean
  /**
   * แถบเหนือปุ่มล่าง — **ไม่เลื่อนไปกับเนื้อฟอร์ม**
   *
   * เนื้อฟอร์มอยู่ใน `DialogBody` ที่เลื่อนได้ · อะไรที่ต้องเห็นตลอดจึงวางในนั้นไม่ได้ ·
   * ที่นี่อยู่นอกกล่องเลื่อน ติดอยู่เหนือปุ่มเหมือนตัวปุ่มเอง
   *
   * ใช้กับสรุปที่คนอ่านก่อนกดบันทึก — ราคารวม ยอดที่จะถูกตัด จำนวนที่เลือกไว้
   */
  beforeFooter?: (args: {
    // biome-ignore lint/suspicious/noExplicitAny: เหตุผลเดียวกับ `children`
    form: any
    readOnly: boolean
  }) => ReactNode
  /**
   * ปุ่มเพิ่มข้างปุ่มบันทึก — **บันทึกแล้วทำอะไรต่อ**
   *
   * มีที่เดียวที่ใช้ตอนนี้: กล่องเปิดบัญชีลูกค้า ซึ่งเสนอ "บันทึกแล้วเพิ่มสาขา" กับ
   * "บันทึกแล้วเพิ่มผู้ติดต่อ" · คนที่เพิ่งกรอกลูกค้าเสร็จมักทำหนึ่งในสองอย่างนั้นต่อ
   *
   * ตัวปุ่มต้อง `type="button"` และเรียก submit เองผ่าน `form.handleSubmit` — ปล่อยเป็น
   * `submit` แล้วทั้งสองปุ่มยิงเส้นทางเดียวกัน แล้วไม่มีทางรู้ว่าคนกดปุ่มไหน
   *
   * ซ่อนเองตอน `view` เหมือนปุ่มบันทึก
   */
  extraActions?: (args: {
    // biome-ignore lint/suspicious/noExplicitAny: เหตุผลเดียวกับ `children`
    form: any
    pending: boolean
  }) => ReactNode
}

export function FormDialog<T extends Record<string, unknown>>({
  open,
  onOpenChange,
  mode,
  title,
  schema,
  defaultValues,
  onSubmit,
  pending = false,
  formKey,
  className,
  overlayClassName,
  children,
  submitDisabled = false,
  beforeFooter,
  extraActions,
}: FormDialogProps<T>) {
  const readOnly = mode === 'view'

  async function handleSubmit(values: T): Promise<void> {
    let message: string | null
    try {
      message = await onSubmit(values)
    } catch (err) {
      toast.error(toErrorMessage(err))
      return
    }

    /**
     * ปิดกล่องนอก `try` และหลัง `await` คืนค่าแล้วเท่านั้น
     *
     * `onSubmit` ของหน้าเรียก `mutateAsync` ซึ่ง `onSuccess` สั่ง invalidate query
     * ทำให้ตารางดึงข้อมูลใหม่และ re-render ทั้งกิ่งระหว่างที่ยังอยู่ใน `await` ·
     * เรียก `onOpenChange` ตอนนั้นบางครั้งไม่มีผล — กล่องค้างเปิดทั้งที่บันทึกสำเร็จ
     * และแถวขึ้นในตารางแล้ว (เจอจากภาพหลักฐาน 2026-08-26)
     *
     * แยกออกมาแบบนี้ การปิดจึงเกิดหลัง render รอบนั้นจบ และไม่ถูกกลืนไปกับมัน
     */
    onOpenChange(false)

    // toast หลังกล่องปิด — ของที่เพิ่งบันทึกหายไปจากสายตาพร้อมกล่อง
    if (message) toast.success(message)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('sm:max-w-md', className)} overlayClassName={overlayClassName}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <AppForm<T>
          // สร้างใหม่เมื่อสลับแถวหรือสลับโหมด — ดูเหตุผลที่ `formKey`
          key={`${mode}-${formKey}`}
          /*
           * **ฟอร์มเป็น flex item ที่ยืดได้ และยอมหดต่ำกว่าเนื้อหา**
           *
           * `DialogContent` เป็น `flex-col` ที่มี `max-h` อยู่แล้ว · แต่ `<form>` ที่ไม่มี
           * `flex-1` ไม่รับความสูงนั้นมา และไม่มี `min-h-0` แปลว่ามันหดต่ำกว่าเนื้อหา
           * ตัวเองไม่ได้ (ค่าเริ่มต้นของ flex item คือ `min-height: auto`) · เนื้อหาสูง
           * เกินกล่องจึงล้นออกไป แทนที่จะเกิดแถบเลื่อนข้างใน (เจอจริง 2026-08-28)
           *
           * `space-y-0` ล้างระยะเริ่มต้นของ `AppForm` — ระยะอยู่ที่ `DialogBody` แทน
           * ซึ่งเป็นตัวที่ห่อเนื้อฟอร์มจริง ๆ · ปล่อยไว้ทั้งคู่แล้วปุ่มล่างจะห่างเกิน
           */
          className="flex min-h-0 flex-1 flex-col space-y-0"
          schema={schema}
          defaultValues={defaultValues as never}
          onSubmit={handleSubmit as never}
          readOnly={readOnly}
        >
          {(form) => (
            <>
              {/*
                **เนื้อฟอร์มเลื่อนเอง หัวกับปุ่มอยู่กับที่**

                `DialogBody` มีมาตั้งแต่ต้นแต่ไม่มีใครใช้ · ฟอร์มที่สูงเกินจอจึงดันปุ่ม
                บันทึกหลุดออกนอกกล่อง แล้วไม่มีอะไรให้เลื่อนถึงมัน (เจอจริง 2026-08-28
                กับกล่องรายการสินค้าที่แท็บสองวาดฟอร์มยาว)
              */}
              <DialogBody className="space-y-4">
                {children({ form, readOnly, pending })}
              </DialogBody>

              {/* นอกกล่องเลื่อน — เห็นตลอดไม่ว่าเนื้อฟอร์มจะยาวแค่ไหน */}
              {beforeFooter !== undefined && (
                <div className="shrink-0 pt-1">{beforeFooter({ form, readOnly })}</div>
              )}

              <DialogFooter>
                <DialogClose
                  render={
                    <Button type="button" variant="outline" disabled={pending}>
                      {readOnly ? 'ปิด' : 'ยกเลิก'}
                    </Button>
                  }
                />
                {!readOnly && (
                  <>
                    <Button
                      type="submit"
                      variant="success"
                      loading={pending}
                      disabled={submitDisabled}
                    >
                      บันทึก
                    </Button>
                    {extraActions?.({ form, pending })}
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </AppForm>
      </DialogContent>
    </Dialog>
  )
}
