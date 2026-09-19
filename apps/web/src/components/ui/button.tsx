import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { type VariantProps, cva } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // shadow-xs → hover:shadow-sm ให้ปุ่มที่ "เขียนข้อมูล/เดินหน้าต่อ" รู้สึกยกตัวนิดเดียว
        // ตอนชี้เมาส์ (ผู้ใช้ตัดสิน 2026-09-20) — ปุ่ม outline/ghost/secondary ไม่มี เพราะพวกนั้น
        // เป็นปุ่มรอง สีจางอยู่แล้ว การเพิ่มเงาให้ปุ่มรองจะแย่งสายตาจากปุ่มหลัก
        default: 'bg-primary text-primary-foreground shadow-xs hover:shadow-sm [a]:hover:bg-primary/80',
        outline:
          'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
        destructiveSolid:
          'bg-destructive text-white shadow-xs hover:shadow-sm hover:bg-destructive/90 focus-visible:border-destructive/40 focus-visible:ring-destructive/30',
        success:
          'bg-emerald-500 text-white shadow-xs hover:shadow-sm hover:bg-emerald-600 focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/30',
        warning:
          'bg-orange-500 text-white shadow-xs hover:shadow-sm hover:bg-orange-600 focus-visible:border-orange-500/40 focus-visible:ring-orange-500/30',
        /**
         * เหลืองอำพัน — **การกระทำที่พาไปทำอย่างอื่นต่อ** ไม่ใช่ทางออกปกติของกล่อง
         *
         * ที่ใช้ตอนนี้คือปุ่มสร้างต่อเนื่อง ("บันทึกแล้วเพิ่มสาขา") · เขียวเป็นของปุ่ม
         * บันทึกซึ่งเป็นตัวหลัก · สามปุ่มเขียวเรียงกันแปลว่าไม่มีตัวไหนเป็นตัวหลัก
         *
         * **ไม่ใช่ `warning`** ทั้งที่สีใกล้กัน · `warning` แปลว่าระวัง ส่วนตัวนี้แค่บอก
         * ว่าเป็นทางเลือกที่ทำต่อ ไม่ได้เตือนอะไร · ปนกันเมื่อไหร่ วันที่มีปุ่มเตือนจริง
         * จะไม่มีสีเหลือให้มัน
         */
        continueAction:
          'bg-amber-500 text-white shadow-xs hover:shadow-sm hover:bg-amber-600 focus-visible:border-amber-500/40 focus-visible:ring-amber-500/30',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-8 min-w-20 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        xs: "h-6 min-w-12 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 min-w-16 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-9 min-w-24 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        icon: 'size-8',
        'icon-xs':
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /** When true, show centered Loader (children hidden but space preserved) + disable */
    loading?: boolean
  }

function Button({
  className,
  variant = 'default',
  size = 'default',
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-loading={loading || undefined}
      disabled={loading || disabled}
      className={cn(buttonVariants({ variant, size, className }), loading && 'relative')}
      {...props}
    >
      {loading ? (
        <>
          <span className="invisible inline-flex items-center gap-1.5">{children}</span>
          <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin" />
        </>
      ) : (
        children
      )}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
