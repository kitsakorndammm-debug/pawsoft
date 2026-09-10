'use client'

import { useEffect, useState } from 'react'

/**
 * หน่วงค่าไว้จนกว่าจะหยุดเปลี่ยน
 *
 * ใช้กับช่องค้นหา — ยิงตามทุกตัวอักษรคือ request หนึ่งใบต่อการกดคีย์หนึ่งครั้ง
 * และคำตอบของคำที่พิมพ์ไม่จบก็ไม่มีใครอ่าน
 *
 * ค่าที่คืนตามหลังค่าจริงเสมอ — ช่องกรอกต้องผูกกับค่าต้นทาง ไม่ใช่ค่าจากที่นี่
 * ไม่งั้นตัวอักษรที่พิมพ์จะโผล่ช้ากว่าที่กด
 */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    // ค่าเปลี่ยนก่อนครบเวลา = เริ่มนับใหม่ ไม่ใช่ปล่อยตัวเก่าไปด้วย
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
