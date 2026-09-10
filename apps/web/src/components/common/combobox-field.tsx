'use client'

import { useEffect, useRef } from 'react'
import { Controller, type ControllerRenderProps, useFormContext } from 'react-hook-form'

import { Combobox } from '@/components/common/combobox'

/**
 * `Combobox` ที่ผูกกับ react-hook-form แล้ว
 *
 * combobox เป็น controlled — รับ `value`/`onChange` ไม่ใช่ `ref` แบบ `<input>` ·
 * `{...register()}` จึงใช้กับมันไม่ได้ และต้องผ่าน `Controller`
 *
 * เก็บค่าเป็น **number หรือ null** ไม่ใช่ string — ต่างจาก `<select>` ที่คืน string เสมอ
 * ทำให้ไม่ต้องแปลงตอนส่ง และ `null` แปลว่าไม่ได้เลือก ตรงกับที่ BE รับ
 *
 * วางไว้ใน `AppFormField` เหมือน `Input` — ตัวนั้นดูแล label กับข้อความ error
 *
 * ช่องที่มีตัวเลือกเดียว **เลือกให้เลย** — ดู `AutoSelectOnlyOption` · ปิดด้วย
 * `noAutoSelect` เมื่อการเลือกให้มีผลข้างเคียง (เช่นไปเติมช่องอื่นต่อ)
 */
export function ComboboxField({
  name,
  options,
  placeholder,
  disabled,
  readOnly,
  required,
  loading,
  id,
  noAutoSelect,
}: {
  /** ชื่อฟิลด์ใน schema — ต้องตรงกับที่ `AppFormField` ใช้ */
  name: string
  options: ReadonlyArray<{ id: number; name: string }>
  placeholder: string
  disabled?: boolean
  readOnly?: boolean
  /** ไม่บังคับ = มีปุ่มล้างค่า และมีรายการ "ไม่ระบุ" ให้เลือกกลับ */
  required?: boolean
  loading?: boolean
  id?: string
  /**
   * ไม่ต้องเลือกให้เองแม้มีตัวเลือกเดียว
   *
   * ค่าตั้งต้นคือเลือกให้ ซึ่งดีกับช่องที่การเลือกจบในตัวมันเอง · แต่ช่องที่การเลือก
   * ไปเติมช่องอื่นต่อ (ผู้ติดต่อ → เบอร์ อีเมล) กลายเป็นว่าแค่เลือกลูกค้าแล้วฟอร์ม
   * เต็มไปหมดโดยไม่มีใครสั่ง
   */
  noAutoSelect?: boolean
}) {
  const { control } = useFormContext()

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <>
          {!noAutoSelect && (
            <AutoSelectOnlyOption field={field} options={options} loading={loading} />
          )}
          <Combobox<number>
            id={id}
            /**
             * **ส่งชื่อฟิลด์ลงไปเป็น `data-field-name`** — combobox ไม่มี `<label for>`
             * ผูกอยู่ ทำให้ Playwright หาด้วยชื่อช่องไม่ได้ · ต้องไปจับ placeholder แทน
             * ซึ่งเปลี่ยนตามค่าที่เลือกไว้ แล้ว selector พังทันทีที่ฟอร์มมีค่าเดิม
             */
            data-field-name={name}
            value={field.value ?? null}
            onChange={(value) => field.onChange(value)}
            // ล้างค่าแล้วเป็น `null` ไม่ใช่ `undefined` — RHF แยกสองอย่างนี้
            onClear={() => field.onChange(null)}
            options={options.map((option) => ({ value: option.id, label: option.name }))}
            placeholder={placeholder}
            searchPlaceholder="พิมพ์เพื่อค้นหา"
            emptyText="ไม่พบรายการ"
            disabled={disabled}
            readOnly={readOnly}
            required={required}
            loading={loading}
            aria-invalid={fieldState.invalid}
          />
        </>
      )}
    />
  )
}

/**
 * เลือกให้เอง เมื่อมีตัวเลือกเดียว
 *
 * ช่องที่มีทางเลือกเดียว ไม่ใช่การเลือก — มันคือการกดยืนยันสิ่งที่ระบบรู้คำตอบอยู่แล้ว ·
 * ผู้ใช้ต้องเปิด เห็นหนึ่งบรรทัด แล้วกด ทุกครั้งที่เปิดฟอร์ม
 *
 * **มากกว่าหนึ่งตัวเลือก ไม่แตะ** (ผู้ใช้ตัดสิน 2026-08-26) — เดาแทนคนกรอกเมื่อไหร่
 * จะมีคนกดบันทึกโดยไม่ได้อ่านว่าเลือกอะไรไป แล้วข้อมูลผิดโดยไม่มีใครเห็น
 *
 * ตอน `loading` ไม่แตะ เพราะรายการที่ยังมาไม่ครบอาจเหลือตัวเดียวชั่วคราว
 *
 * แยกเป็นคอมโพเนนต์เพราะ `useEffect` เรียกใน render-prop ของ `Controller` ไม่ได้
 */
function AutoSelectOnlyOption({
  field,
  options,
  loading,
}: {
  field: ControllerRenderProps
  options: ReadonlyArray<{ id: number; name: string }>
  loading?: boolean
}) {
  const only = options.length === 1 ? (options[0]?.id ?? null) : null

  /**
   * `field` เป็นออบเจกต์ใหม่ทุก render — ใส่ใน deps แล้ว effect จะรันทุกครั้ง
   * และการเรียก `onChange` ข้างในก็ทำให้ render อีกรอบ วนไม่จบ · กล่องที่กำลังบันทึก
   * จะถูกสร้างใหม่กลางทาง แล้วคำสั่งปิดหายไปกับตัวเก่า — แถวลงฐาน แต่กล่องค้างเปิด
   * (เกิดจริง 2026-08-26 · เห็นจากภาพหลักฐานของ e2e ไม่ใช่จาก assertion)
   *
   * เก็บไว้ใน ref แล้วอ่านตอน effect ทำงาน · deps จึงเหลือแต่ค่าที่เปลี่ยนจริง
   */
  const latest = useRef(field)
  latest.current = field

  /**
   * เติมให้ครั้งเดียวต่อรายการหนึ่งชุด
   *
   * ช่องที่ไม่บังคับก็เติมให้ด้วย ซึ่งแปลว่าผู้ใช้กดล้างค่าได้ · ถ้าดูแค่ "ค่ายังว่างไหม"
   * ค่าที่เพิ่งล้างจะถูกเติมกลับทันทีใน render ถัดไป แล้วปุ่มล้างจะกลายเป็นปุ่มที่กดไม่ได้ผล
   *
   * เก็บ `only` ที่เติมไปแล้วไว้ · รายการเปลี่ยน (เช่นเปลี่ยนแผนกแล้วตำแหน่งเป็นชุดใหม่)
   * ถึงจะเติมอีกครั้ง
   */
  const filled = useRef<number | null>(null)

  useEffect(() => {
    if (only === null) {
      filled.current = null
      return
    }
    if (loading || filled.current === only) return

    const current = latest.current
    if (current.value !== null && current.value !== undefined) return

    filled.current = only
    current.onChange(only)
  }, [loading, only])

  return null
}
