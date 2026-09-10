'use client'

import type { ReactElement, ReactNode } from 'react'
import { type ControllerRenderProps, type FieldValues, useFormContext } from 'react-hook-form'

import { useAppFormContext } from '@/components/common/app-form'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { cn } from '@/lib/utils'

/** field ที่ส่งให้ render-prop children — RHF field + readOnly/disabled/invalid ที่ AppFormField inject */
export type AppFieldRenderProps = ControllerRenderProps<FieldValues, string> & {
  readOnly?: boolean
  disabled?: boolean
  /** true = field มี validation error (สำหรับ aria-invalid / กรอบแดง) */
  invalid?: boolean
}

interface AppFormFieldProps {
  name: string
  label: ReactNode
  children: ReactNode | ((field: AppFieldRenderProps) => ReactNode)
  required?: boolean
  disabled?: boolean
  readOnly?: boolean
  layout?: 'horizontal' | 'vertical'
  labelAlign?: 'left' | 'right'
  className?: string
  classNameLabel?: string
  classNameContent?: string
  noLabel?: boolean
}

export function AppFormField({
  name,
  label,
  children,
  required,
  disabled = false,
  readOnly: propReadOnly,
  layout = 'vertical',
  labelAlign = 'left',
  className,
  classNameLabel,
  classNameContent,
  noLabel = false,
}: AppFormFieldProps) {
  const { control } = useFormContext()
  const { readOnly: contextReadOnly } = useAppFormContext()
  const isReadOnly = propReadOnly ?? contextReadOnly

  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem
          className={cn(layout === 'horizontal' && 'flex items-center gap-3 space-y-0', className)}
        >
          {!noLabel && (
            <FormLabel
              className={cn(
                'font-normal',
                layout === 'horizontal' && 'h-8 min-w-[120px]',
                labelAlign === 'right'
                  ? 'flex items-center justify-end gap-0.5 text-right'
                  : 'flex items-center justify-start gap-0.5 text-left',
                classNameLabel,
              )}
            >
              {label}
              {required && (
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              )}
            </FormLabel>
          )}
          <div className={cn('w-full min-w-0', classNameContent)}>
            {typeof children === 'function' ? (
              children({
                ...field,
                disabled,
                readOnly: isReadOnly,
                invalid: fieldState.invalid,
              } satisfies AppFieldRenderProps)
            ) : (
              <FormControl
                {...({
                  readOnly: isReadOnly,
                  disabled,
                  'aria-invalid': fieldState.invalid || undefined,
                } as Record<string, unknown>)}
              >
                {children as ReactElement}
              </FormControl>
            )}
            <FormMessage />
          </div>
        </FormItem>
      )}
    />
  )
}
