'use client'

import { useMemo } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import type { Permission } from '@/features/role/api'
import { cn } from '@/lib/utils'

/**
 * สวิตช์สิทธิ์ทั้งระบบ จัดเป็นกอง
 *
 * **อยู่ข้างหน้าที่ใช้มัน ไม่ได้อยู่ `components/common/`** — มีหน้าเดียวที่วาดมัน ·
 * ย้ายขึ้นวันที่มีหน้าที่สองเรียกใช้จริง ไม่ใช่วันที่เดาว่าจะมี
 *
 * ไม่ใช่ `RoleMultiSelect` เพราะสิทธิ์มีเป็นสิบและแบ่งเป็นกลุ่มตามเมนู · popover ที่ต้อง
 * เลื่อนหาในลิสต์ยาวทำให้คนไม่เห็นภาพรวมว่าบทบาทนี้ถืออะไรบ้าง ซึ่งเป็นคำถามหลัก
 * ของหน้านี้ · กองที่กางอยู่ตอบได้ด้วยการกวาดตาครั้งเดียว
 */

export function PermissionChecklist({
  value,
  onChange,
  options,
  loading,
  disabled,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
}: {
  value: string[]
  onChange: (value: string[]) => void
  options: Permission[]
  loading?: boolean
  disabled?: boolean
  'aria-invalid'?: boolean
  'aria-label'?: string
}) {
  /**
   * จัดกองตาม `groupCode` โดยคงลำดับที่ BE ส่งมา
   *
   * BE เรียงตาม `groupCode` แล้วตาม `key` มาแล้ว — เรียงใหม่ที่นี่แปลว่ามีลำดับสองชุด
   * ที่ต้องดูแลให้ตรงกัน · `Map` คงลำดับที่ใส่เข้าไป จึงได้กองตามที่ BE ตั้งใจฟรี
   */
  const groups = useMemo(() => {
    const byGroup = new Map<string, { name: string; items: Permission[] }>()
    for (const option of options) {
      const bucket = byGroup.get(option.groupCode)
      if (bucket) bucket.items.push(option)
      else byGroup.set(option.groupCode, { name: option.groupName, items: [option] })
    }
    return [...byGroup.entries()].map(([code, bucket]) => ({ code, ...bucket }))
  }, [options])

  const held = useMemo(() => new Set(value), [value])

  const toggle = (key: string) => {
    onChange(held.has(key) ? value.filter((current) => current !== key) : [...value, key])
  }

  /**
   * ติ๊กทั้งกอง / ถอนทั้งกอง — ปุ่มเดียวที่สลับความหมายตามสภาพปัจจุบัน
   *
   * บทบาทจริงมักถือทั้งเมนูหรือไม่ถือเลย · ไล่ติ๊กทีละสิบช่องเพื่อผลลัพธ์ที่พูดได้
   * ในประโยคเดียวคือการทำงานที่หน้าจอควรทำให้
   */
  const toggleGroup = (items: Permission[]) => {
    const keys = items.map((item) => item.key)
    const whole = keys.every((key) => held.has(key))
    onChange(whole ? value.filter((current) => !keys.includes(current)) : [...new Set([...value, ...keys])])
  }

  if (loading) {
    return (
      <div className="rounded-md border p-3" aria-busy="true">
        <p className="py-6 text-center text-sm text-muted-foreground">กำลังโหลด</p>
      </div>
    )
  }

  return (
    <div
      /*
        กรอบแดงตอนยังไม่ติ๊กอะไรเลย — `AppFormField` ยัด `aria-invalid` ให้เฉพาะ
        element ตัวเดียว ที่นี่เป็นกล่องหลายชั้นจึงต้องรับมาวางเอง
      */
      aria-invalid={ariaInvalid}
      aria-label={ariaLabel}
      role="group"
      className={cn(
        'max-h-80 overflow-y-auto rounded-md border p-3',
        ariaInvalid && 'border-destructive',
        disabled && 'opacity-60',
      )}
    >
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">ไม่มีสิทธิ์ให้เลือก</p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => {
            const keys = group.items.map((item) => item.key)
            const whole = keys.every((key) => held.has(key))

            return (
              <div key={group.code} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{group.name}</span>
                  {!disabled && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() => toggleGroup(group.items)}
                    >
                      {whole ? 'ถอนทั้งกลุ่ม' : 'เลือกทั้งกลุ่ม'}
                    </button>
                  )}
                </div>

                <div className="grid gap-1.5 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <label
                      key={item.key}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                        !disabled && 'cursor-pointer hover:bg-muted',
                      )}
                    >
                      <Checkbox
                        checked={held.has(item.key)}
                        onCheckedChange={() => toggle(item.key)}
                        disabled={disabled}
                        /* อ่านด้วยเสียงได้ว่าติ๊กสิทธิ์อะไรอยู่ ไม่ใช่แค่ "ช่องติ๊ก" */
                        aria-label={item.label}
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
