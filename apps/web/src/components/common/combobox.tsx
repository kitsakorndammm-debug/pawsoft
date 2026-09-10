'use client'

import { Check, ChevronsUpDown } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { comboboxContract } from './combobox.contract'

export type ComboboxValue = string | number

export interface ComboboxOption<V extends ComboboxValue = ComboboxValue> {
  value: V
  label: string
  badge?: string
  /** ถ้ามี = disabled + tooltip */
  warning?: string
  group?: string
}

export interface ComboboxGroup {
  key: string
  label: string
}

interface ComboboxProps<V extends ComboboxValue = ComboboxValue> {
  value: V | null | undefined
  onChange: (value: V) => void
  options: ComboboxOption<V>[]
  groups?: ComboboxGroup[]
  placeholder?: string
  emptyText?: string
  searchPlaceholder?: string
  className?: string
  disabled?: boolean
  /** readOnly — แสดงค่าที่เลือก, อ่านได้, copy ได้, แต่เปิด dropdown ไม่ได้ */
  readOnly?: boolean
  /** required = ไม่มีปุ่ม clear, ไม่แสดงรายการ "ไม่ระบุ" */
  required?: boolean
  /**
   * คำบนปุ่มตอนยังไม่ได้เลือก และช่องไม่บังคับ — ค่าตั้งต้น `ไม่ระบุ`
   *
   * มีไว้ให้ช่องที่มีอย่างอื่นทับอยู่แล้วบอกว่าไม่ต้องเขียนอะไร (ส่ง `''`) ·
   * ช่องที่ล็อกในแท็บตัวอย่างมีคำว่ารออะไรทับอยู่ สองคำซ้อนกันอ่านไม่ออกทั้งคู่
   */
  emptyLabel?: string
  /** เรียกเมื่อกด clear (ไม่ระบุ) */
  onClear?: () => void
  /** loading state — แสดง skeleton ใน list */
  loading?: boolean
  /** ปิด chevron icon (ใช้กับ inline combobox ใน table) */
  noChevron?: boolean
  id?: string
  /** invalid state — แสดงกรอบแดง (จาก react-hook-form FormField error) */
  'aria-invalid'?: boolean
  /** accessible name ของ trigger (combobox ที่ไม่มี <label> ผูก เช่นใน dialog) */
  'aria-label'?: string
  /** test/a11y hook — ผูกชื่อ field ลง trigger (combobox ใน dynamic form ไม่มี label ผูก) */
  'data-field-name'?: string
  /**
   * บอก action-coverage gate ว่า **ไม่ใช่ทุกเทสที่ต้องแตะตัวนี้** — ใช้กับ combobox ที่โผล่ทุกหน้า
   * แต่มี TC ของตัวเองรับผิดชอบอยู่แล้ว (ตัวเลือกกลุ่มบนแถบเครื่องมือ). ไม่ใช่การยกเว้นการเทส:
   * หน้าที่มีตัวเลือกกลุ่มยังต้องมี TC ที่สลับกลุ่มจริง
   */
  'data-e2e-action-optional'?: boolean
}

export function Combobox<V extends ComboboxValue = ComboboxValue>({
  value,
  onChange,
  options,
  groups,
  placeholder = 'เลือก',
  emptyText = 'ไม่พบข้อมูล',
  searchPlaceholder,
  className,
  disabled,
  readOnly,
  required,
  emptyLabel = 'ไม่ระบุ',
  onClear,
  loading,
  noChevron,
  id,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'data-field-name': dataFieldName,
  'data-e2e-action-optional': e2eOptional,
}: ComboboxProps<V>) {
  const [open, setOpen] = React.useState(false)
  const handleOpenChange = (next: boolean) => {
    if (readOnly) return
    setOpen(next)
  }
  const selected = options.find((o) => o.value === value)
  const displayLabel = selected ? selected.label : required ? placeholder : emptyLabel
  const grouped = Array.isArray(groups) && groups.length > 0

  // Auto-select when required + only 1 valid option (no other choice)
  React.useEffect(() => {
    if (!required || loading || value != null) return
    const usable = options.filter((o) => !o.warning)
    if (usable.length === 1) {
      onChange(usable[0]!.value)
    }
  }, [required, loading, value, options, onChange])

  const handleSelect = (next: V) => {
    onChange(next)
    setOpen(false)
  }

  const clearItem = !required && onClear && (
    <CommandItem
      value="__clear__"
      onSelect={() => {
        onClear()
        setOpen(false)
      }}
      className={cn(value == null && 'bg-primary/10 font-medium')}
    >
      <span className="text-muted-foreground">{comboboxContract.clearLabel}</span>
    </CommandItem>
  )

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            // ไม่ใช้ semantic <select> — shadcn combobox pattern: custom listbox ผ่าน Popover
            role="combobox"
            aria-readonly={readOnly || undefined}
            aria-invalid={ariaInvalid || undefined}
            aria-label={ariaLabel}
            // ค่าที่เลือกถูกตัดด้วย `truncate` เมื่อกล่องแคบกว่าข้อความ (ชื่อสถานีมีรหัสนำหน้า) —
            // ชี้เมาส์แล้วเห็นเต็มโดยไม่ต้องกางรายการ
            title={typeof displayLabel === 'string' ? displayLabel : undefined}
            data-field-name={dataFieldName}
            data-e2e-action-optional={e2eOptional ? '' : undefined}
            disabled={disabled}
            className={cn(
              // disabled = view mode → พื้นเทาเหมือน <Input> (project rule: view = disabled/gray)
              'h-8 w-full font-normal disabled:cursor-not-allowed disabled:bg-muted disabled:text-black disabled:opacity-100 dark:disabled:bg-input/80',
              noChevron ? 'justify-center px-1' : 'justify-between',
              !selected && 'text-muted-foreground',
              // readOnly (view mode) = พื้นเทาเหมือน disabled <Input> (project rule: view = gray)
              readOnly && 'pointer-events-none cursor-default bg-muted text-black dark:bg-input/80',
              ariaInvalid && 'border-destructive ring-destructive/20',
              className,
            )}
          >
            <span className="truncate">{displayLabel}</span>
            {!noChevron && !readOnly && !disabled && <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />}
          </Button>
        }
      />
      <PopoverContent className={cn('w-(--anchor-width) p-0', noChevron ? 'min-w-32' : 'min-w-50')} align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder ?? placeholder} className="h-9" />
          <CommandList className="max-h-75 overflow-y-auto">
            {loading ? (
              <div className="p-3 text-sm text-muted-foreground">กำลังโหลด...</div>
            ) : (
              <>
                <CommandEmpty>{emptyText}</CommandEmpty>
                {grouped ? (
                  <>
                    {clearItem && <CommandGroup>{clearItem}</CommandGroup>}
                    {groups?.map((group, idx) => {
                      const groupOptions = options.filter((o) => o.group === group.key)
                      if (groupOptions.length === 0) return null
                      return (
                        <React.Fragment key={group.key}>
                          {idx > 0 && <CommandSeparator />}
                          <CommandGroup heading={group.label}>
                            {groupOptions.map((option) => (
                              <ComboboxOptionItem
                                key={String(option.value)}
                                option={option}
                                selected={option.value === value}
                                onSelect={handleSelect}
                              />
                            ))}
                          </CommandGroup>
                        </React.Fragment>
                      )
                    })}
                  </>
                ) : (
                  <CommandGroup>
                    {clearItem}
                    {options.map((option) => (
                      <ComboboxOptionItem
                        key={String(option.value)}
                        option={option}
                        selected={option.value === value}
                        onSelect={handleSelect}
                      />
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function ComboboxOptionItem<V extends ComboboxValue>({
  option,
  selected,
  onSelect,
}: {
  option: ComboboxOption<V>
  selected: boolean
  onSelect: (value: V) => void
}) {
  const disabled = Boolean(option.warning)
  return (
    <CommandItem
      value={String(option.label)}
      disabled={disabled}
      onSelect={() => {
        if (disabled) return
        onSelect(option.value)
      }}
      className={cn(
        selected && 'bg-primary/10! font-medium text-primary!',
        disabled && 'cursor-not-allowed text-muted-foreground opacity-60',
      )}
    >
      {disabled ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="pointer-events-auto w-full cursor-help line-through decoration-muted-foreground/50">
                {option.label}
              </span>
            }
          />
          <TooltipContent side="right">{option.warning}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="flex w-full items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            {selected && <Check className="h-3.5 w-3.5" />}
            <span>{option.label}</span>
          </span>
          {option.badge && <span className="shrink-0 text-xs text-muted-foreground">{option.badge}</span>}
        </span>
      )}
    </CommandItem>
  )
}
