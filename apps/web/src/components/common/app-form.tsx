'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { createContext, useCallback, useContext, useRef } from 'react'
import {
  type DefaultValues,
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn,
  useForm,
} from 'react-hook-form'

import { Form } from '@/components/ui/form'
import { cn } from '@/lib/utils'

type AppFormContextValue = {
  readOnly?: boolean
}

const AppFormContext = createContext<AppFormContextValue>({})
export const useAppFormContext = () => useContext(AppFormContext)

interface AppFormProps<T extends FieldValues> {
  /**
   * zod schema ของฟอร์มนี้ · เป็น `any` เพราะ overload ของ zodResolver ผูก generic
   * ของ zod เข้ากับ generic ของ react-hook-form แล้วชนกันทุกครั้งที่ระบุชนิดให้ตรง
   * ชนิดที่ผู้เรียกเห็นจริงคือ `T` ที่ส่งเข้า AppForm ซึ่งยังตรวจครบ
   */
  schema: any
  defaultValues?: DefaultValues<T>
  onSubmit: SubmitHandler<T>
  children: (form: UseFormReturn<T>) => React.ReactNode
  className?: string
  readOnly?: boolean
  mode?: 'onBlur' | 'onChange' | 'onSubmit' | 'onTouched' | 'all'
  autoComplete?: string
  form?: UseFormReturn<T>
  /**
   * `id` ของแท็ก `<form>` — สำหรับปุ่มที่อยู่นอกฟอร์มแต่ต้อง submit มัน
   *
   * กล่องที่มีปุ่มหลายชนิดวางปุ่มบันทึกไว้ท้ายกล่องรวมกับปุ่มอื่นได้ แทนที่จะต้อง
   * แทรกอยู่กลางเนื้อหาเพราะฟอร์มครอบมันอยู่ · `<button form="id">` ของ HTML เอง
   */
  id?: string
}

export function AppForm<T extends FieldValues>({
  schema,
  defaultValues,
  onSubmit,
  children,
  className,
  readOnly,
  mode = 'onSubmit',
  autoComplete = 'off',
  form: externalForm,
  id,
}: AppFormProps<T>) {
  const internalForm = useForm<T>({
    resolver: zodResolver(schema),
    defaultValues,
    mode,
  })
  const form = externalForm ?? internalForm
  const formRef = useRef<HTMLFormElement>(null)

  const handleInvalid = useCallback(() => {
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector("[aria-invalid='true']") as HTMLElement | null
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  return (
    <Form {...(form as unknown as UseFormReturn<FieldValues>)}>
      <AppFormContext.Provider value={{ readOnly }}>
        <form
          ref={formRef}
          id={id}
          // method=post กัน native GET submit หลุดค่า (เช่น password) ลง URL query
          // ตอน React ยังไม่ hydrate (onSubmit ยังไม่ผูก) — dev cold compile / slow network
          method="post"
          /*
           * **หยุด event ที่ขอบฟอร์ม** — กันฟอร์มซ้อนฟอร์มยิงพร้อมกัน
           *
           * กล่องที่เปิดซ้อนอีกกล่อง (สินค้าบนใบ) วาง DOM ผ่าน portal จึงไม่ได้อยู่ใน
           * `<form>` แม่ · แต่ React ยังส่ง event ขึ้นไปตาม **tree ของ component**
           * ไม่ใช่ตาม DOM — กดบันทึกในกล่องในแล้วฟอร์มนอก submit ตามไปด้วย และกล่องแม่
           * ปิดทั้งที่ยังไม่ได้กรอกเสร็จ (เจอจริง 2026-08-28)
           */
          onSubmit={(event) => {
            event.stopPropagation()
            void form.handleSubmit(onSubmit, handleInvalid)(event)
          }}
          className={cn('space-y-4', className)}
          autoComplete={autoComplete}
        >
          {children(form)}
        </form>
      </AppFormContext.Provider>
    </Form>
  )
}
