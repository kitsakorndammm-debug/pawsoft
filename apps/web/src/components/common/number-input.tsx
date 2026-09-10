'use client'

import { Input } from '@/components/ui/input'

/**
 * ช่องกรอกตัวเลข — **ปฏิเสธที่ปลายนิ้ว ไม่ใช่ตอนบันทึก**
 *
 * `<Input inputMode="decimal">` เปลี่ยนแค่คีย์บอร์ดบนมือถือ · บนเดสก์ท็อปมันคือช่อง
 * ข้อความธรรมดาที่พิมพ์ "abc" ลงไปได้ แล้วไปตายตอนกดบันทึก
 *
 * **ไม่ใช่ `type="number"`** ด้วยเหตุผลสามข้อ:
 *
 * 1. ล้อเมาส์เลื่อนทับค่าที่กรอกไว้ตอนคนเลื่อนหน้า — แก้ได้แต่ต้องเขียนเพิ่มทุกที่
 * 2. มันยอมให้พิมพ์ `1e5` และ `-` ได้อยู่ดี · `e` เป็นตัวเลขที่ถูกต้องในสายตามัน
 * 3. `value` อ่านได้เป็น `''` เมื่อค่าที่พิมพ์ยังไม่สมบูรณ์ — เลข "12." หายทั้งช่อง
 *
 * ที่นี่กรองด้วยรูปของสตริงแทน · ค่ายังเป็นสตริงตลอดทาง ซึ่งตรงกับที่ BE รับ
 * (ราคาและขนาดเป็น decimal — float ทำให้ `0.1 + 0.2` ไม่เท่ากับ `0.3`)
 */

/** จำนวนเต็มบวก — ไม่มีจุด ไม่มีลบ · ว่างได้ระหว่างพิมพ์ */
const INTEGER_SHAPE = /^\d*$/

/**
 * ทศนิยมบวก — จุดเดียว ไม่มีลบ · ว่างได้ และ `"12."` ระหว่างพิมพ์ก็ผ่าน
 *
 * ปล่อยให้จุดค้างได้เพราะคนพิมพ์ `12.5` ต้องผ่าน `12.` ก่อนเสมอ · ปฏิเสธตรงนั้น
 * แปลว่าพิมพ์ทศนิยมไม่ได้เลย
 */
const DECIMAL_SHAPE = /^\d*\.?\d*$/

export function NumberInput({
  value,
  onChange,
  /** `decimal` = มีจุดได้ · `integer` = จำนวนเต็มล้วน */
  mode = 'decimal',
  /** ทศนิยมกี่ตำแหน่ง — เกินกว่านี้พิมพ์ไม่ลง · BE ปัดให้อยู่แล้ว แต่ปัดเงียบ ๆ */
  scale = 2,
  ...rest
}: {
  value: string
  onChange: (value: string) => void
  mode?: 'decimal' | 'integer'
  scale?: number
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'>) {
  const shape = mode === 'integer' ? INTEGER_SHAPE : DECIMAL_SHAPE

  return (
    <Input
      {...rest}
      value={value}
      inputMode={mode === 'integer' ? 'numeric' : 'decimal'}
      onChange={(event) => {
        const next = event.target.value
        if (!shape.test(next)) return

        // ทศนิยมเกินที่ตกลงไว้ — BE ปัดให้เงียบ ๆ ซึ่งอ่านเหมือนค่าที่กรอกถูกแก้
        if (mode === 'decimal') {
          const fraction = next.split('.')[1]
          if (fraction !== undefined && fraction.length > scale) return
        }

        onChange(next)
      }}
    />
  )
}
