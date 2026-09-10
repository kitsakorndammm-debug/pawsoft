'use client'

import { Command as CommandPrimitive } from 'cmdk'
import type * as React from 'react'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'
import { CheckIcon, SearchIcon } from 'lucide-react'

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        'flex size-full flex-col overflow-hidden rounded-xl! bg-popover p-1 text-popover-foreground',
        className,
      )}
      {...props}
    />
  )
}

function CommandDialog({
  title = 'Command Palette',
  description = 'Search for a command to run...',
  children,
  className,
  showCloseButton = false,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, 'children'> & {
  title?: string
  description?: string
  className?: string
  showCloseButton?: boolean
  children: React.ReactNode
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn('top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0', className)}
        showCloseButton={showCloseButton}
      >
        {children}
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div data-slot="command-input-wrapper" className="p-1 pb-0">
      {/*
        ช่องค้นหาขาวเท่ากล่อง (ผู้ใช้ตัดสิน 2026-08-27) — พื้นเทาคาดบนสุดทำให้กล่อง
        อ่านเป็นสองชั้นที่ไม่ได้แยกอะไร · เส้นขอบบอกว่ามันเป็นช่องกรอกอยู่แล้ว
      */}
      <InputGroup className="h-8! rounded-lg! border-input bg-popover shadow-none! *:data-[slot=input-group-addon]:pl-2!">
        <CommandPrimitive.Input
          data-slot="command-input"
          className={cn('w-full text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50', className)}
          {...props}
        />
        <InputGroupAddon>
          <SearchIcon className="size-4 shrink-0 opacity-50" />
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn('no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none', className)}
      {...props}
    />
  )
}

function CommandEmpty({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn('py-6 text-center text-sm', className)}
      {...props}
    />
  )
}

function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        'overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

function CommandSeparator({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn('-mx-1 h-px bg-border', className)}
      {...props}
    />
  )
}

/**
 * แถวหนึ่งในรายการ
 *
 * **`data-[selected=true]` ไม่ใช่ `data-selected`** — cmdk ใส่ `data-selected="false"`
 * ให้แถวที่ไม่ได้ถูกเลือกด้วย ไม่ได้ถอด attribute ออก · `data-selected:` ของ Tailwind
 * จับแค่ว่ามี attribute อยู่ไหม ทุกแถวจึงติดพื้นเทาพร้อมกัน แล้วกล่องอ่านเป็นพื้นทึบ
 * ทั้งกล่องแทนที่จะเป็นรายการบนพื้นขาว (เจอจากภาพหลักฐาน 2026-08-27)
 */
function CommandItem({ className, children, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "group/command-item relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none in-data-[slot=dialog-content]:rounded-lg! data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[selected=true]:*:[svg]:text-accent-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <CheckIcon className="ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100" />
    </CommandPrimitive.Item>
  )
}

function CommandShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        'ml-auto text-xs tracking-widest text-muted-foreground group-data-[selected=true]/command-item:text-accent-foreground',
        className,
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}
