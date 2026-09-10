'use client'

import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'

import { DataTable, type DataTableColumn } from '@/components/common/data-table'
import { SortableTableRow } from '@/components/common/sortable-table-row'

/**
 * `DataTable` ที่ลากจัดลำดับได้
 *
 * ห่อ dnd ไว้ให้ และแปลง "ลากจากตำแหน่ง A ไป B" เป็น "ไปอยู่ก่อนแถวไหน" ซึ่ง
 * เป็นสิ่งที่ BE รับ · การแปลงนี้ผิดง่ายและผิดเหมือนกันทุกหน้า จึงอยู่ที่เดียว
 *
 * หน้าที่ไม่ลากเรียง ใช้ `DataTable` ตรง ๆ ได้เลย ไม่ต้องผ่านตัวนี้
 */

export function SortableDataTable<T extends { id: number }>({
  columns,
  data,
  loading,
  fetching,
  emptyText,
  reorderable,
  onMove,
  className,
}: {
  columns: DataTableColumn<T>[]
  data: T[]
  loading?: boolean
  fetching?: boolean
  emptyText: string
  /** ลากได้ไหม — ปิดตอนไม่มีสิทธิ์เขียน หรือกำลังค้นหา */
  reorderable: boolean
  /** `beforeId: null` = ไปอยู่ล่างสุด */
  onMove: (id: number, beforeId: number | null) => void
  className?: string
}) {
  const sensors = useSensors(
    // ต้องลากพ้น 5px ก่อนถึงนับเป็นการลาก — ไม่งั้นการคลิกปุ่มในแถวกลายเป็นการลากค้าง
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const from = data.findIndex((r) => r.id === active.id)
    const to = data.findIndex((r) => r.id === over.id)
    if (from === -1 || to === -1) return

    /**
     * BE รับ "ไปอยู่ก่อนแถวไหน" ไม่ใช่ "ไปอยู่ตำแหน่งที่เท่าไหร่"
     *
     * ลากลง: แถวที่ปล่อยทับจะเลื่อนขึ้นมาแทนที่ — ปลายทางจึงเป็นแถว **ถัดจาก** มัน
     * และถ้าปล่อยที่ท้ายสุดก็ไม่มีแถวถัดไป ซึ่งคือ `null` = ล่างสุด
     */
    const beforeId = from < to ? (data[to + 1]?.id ?? null) : (data[to]?.id ?? null)

    onMove(Number(active.id), beforeId)
  }

  return (
    /**
     * ห่อไว้เสมอแม้ลากปิดอยู่ — `SortableTableRow` ปิดตัวเองด้วย `disabled`
     * ซึ่งถูกกว่าการมี render สองทางที่ต่างกันได้
     */
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={data.map((r) => r.id)} strategy={verticalListSortingStrategy}>
        <DataTable<T>
          className={className}
          columns={columns}
          data={data}
          loading={loading}
          fetching={fetching}
          emptyText={emptyText}
          renderRow={(args) => (
            <SortableTableRow key={args.key} args={args} draggable={reorderable} />
          )}
        />
      </SortableContext>
    </DndContext>
  )
}
