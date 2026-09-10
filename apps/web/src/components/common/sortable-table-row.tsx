'use client'

import type { DraggableAttributes } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { createContext, useContext, type ReactNode } from 'react'

import type { DataTableRowRenderArgs } from '@/components/common/data-table'
import { TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * แถวของ `DataTable` ที่ลากจัดลำดับได้
 *
 * `useSortable` ต้องเรียกเป็น hook ครั้งหนึ่งต่อแถว ซึ่งทำใน `.map()` ข้างใน
 * `DataTable` ไม่ได้ · `DataTable` จึงส่ง `cells` ที่ประกอบเสร็จแล้วมาให้ทาง
 * `renderRow` แล้วที่นี่ห่อด้วย `<tr>` ที่มี ref ของตัวเอง
 */

/**
 * ตัวลากของแถวที่กำลัง render อยู่
 *
 * ปุ่ม grip เป็น **คอลัมน์แรกของตาราง** ไม่ใช่ของที่ยัดท้ายแถว — แต่ `columns`
 * ถูกประกอบก่อนที่จะรู้ว่าแถวไหนกำลัง render · context จึงเป็นทางเดียวที่ส่งค่า
 * จาก `<tr>` ลงไปถึง `<td>` ที่อยู่ข้างใน
 */
const DragHandleContext = createContext<{
  listeners: Record<string, unknown> | undefined
  attributes: DraggableAttributes | undefined
  draggable: boolean
}>({ listeners: undefined, attributes: undefined, draggable: false })

export function SortableTableRow({
  args,
  draggable,
}: {
  args: DataTableRowRenderArgs
  /** ลากไม่ได้ก็ยัง render — แค่ไม่ผูก listener และไม่โชว์ grip */
  draggable: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: args.key,
    disabled: !draggable,
  })

  return (
    <DragHandleContext.Provider value={{ listeners, attributes, draggable }}>
      {/*
        **ไม่ส่ง `attributes` ของ `useSortable` ลง `<tr>`**

        มันมี `role="button"` กับ `aria-roledescription="sortable"` ติดมา ซึ่งทำให้
        ทั้งแถวถูกประกาศว่าเป็นปุ่มที่ชื่อยาวเท่าเนื้อหาทั้งแถว — โปรแกรมอ่านหน้าจอ
        อ่านผิด และการหาปุ่มด้วยชื่อจะเจอทั้งแถวกับปุ่มจริงพร้อมกัน
        (เจอจาก e2e 2026-08-26)

        ตัวลากที่แท้จริงคือปุ่ม grip · `attributes` จึงไปอยู่ที่นั่นแทน
      */}
      <TableRow
        ref={setNodeRef}
        {...args.rowProps}
        style={{
          ...args.rowProps.style,
          transform: CSS.Transform.toString(transform),
          transition,
        }}
        className={cn('group/row', args.rowProps.className, isDragging && 'relative z-10 shadow-md')}
      >
        {args.cells}
      </TableRow>
    </DragHandleContext.Provider>
  )
}

/**
 * ปุ่มลากของแถว — วางเป็น `render` ของคอลัมน์แรก
 *
 * ที่ถูกจองไว้เท่าเดิมแม้ลากไม่ได้ ไม่งั้นคอลัมน์ขยับตอนสลับโหมดค้นหา
 */
export function DragHandle(): ReactNode {
  const { listeners, attributes, draggable } = useContext(DragHandleContext)

  if (!draggable) return <span className="block size-6" />

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            // `attributes` อยู่ที่นี่ ไม่ใช่ที่ `<tr>` — ปุ่มนี้คือสิ่งที่ลากได้จริง
            {...attributes}
            {...listeners}
            aria-label="ลากเพื่อจัดลำดับ"
            className="flex size-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </button>
        }
      />
      <TooltipContent>ลากเพื่อจัดลำดับ</TooltipContent>
    </Tooltip>
  )
}

/** คอลัมน์ของช่องลาก — เหมือนกันทุกตาราง จึงเขียนไว้ที่เดียว */
export const DRAG_COLUMN = {
  key: 'drag',
  title: '',
  width: 40,
  render: () => <DragHandle />,
} as const
