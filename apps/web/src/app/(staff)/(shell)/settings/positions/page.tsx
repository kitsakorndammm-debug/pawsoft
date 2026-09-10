'use client'

import { Plus } from 'lucide-react'
import { useQueryState } from 'nuqs'
import { Suspense, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/common/confirm-dialog'
import type { DataTableColumn } from '@/components/common/data-table'
import type { DialogMode } from '@/components/common/form-dialog'
import { ListToolbar } from '@/components/common/list-toolbar'
import { PageHint } from '@/components/common/page-hint'
import { RowActions } from '@/components/common/row-actions'
import { SortableDataTable } from '@/components/common/sortable-data-table'
import { DRAG_COLUMN } from '@/components/common/sortable-table-row'
import { Button } from '@/components/ui/button'
import { useCan } from '@/features/auth/hooks'
import type { Position } from '@/features/position/api'
import { useDeletePosition, useMovePosition, usePositions } from '@/features/position/hooks'
import { useDepartmentOptions } from '@/features/department/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { MASTER_WRITE } from '@/lib/permissions'
import { useDebounce } from '@/lib/use-debounce'

import { PositionDialog } from './position-dialog'

const NOUN = 'ตำแหน่ง'
const PARENT_LABEL = 'แผนก'

export default function PositionsPage() {
  /**
   * `useQueryState` อ่าน `useSearchParams` ข้างใน ซึ่ง Next บังคับให้อยู่ใน `Suspense`
   * ไม่ห่อแล้ว `next build` ตกทั้งหน้า ทั้งที่ `dev` กับ `typecheck` เขียวสนิท
   */
  return (
    <Suspense fallback={null}>
      <PositionList />
    </Suspense>
  )
}

function PositionList() {
  const [search, setSearch] = useQueryState('q', { defaultValue: '', clearOnDefault: true })
  // ยิงตามทุกตัวอักษรคือ request หนึ่งใบต่อการกดคีย์หนึ่งครั้ง
  const debouncedSearch = useDebounce(search, 300)

  const canWrite = useCan(MASTER_WRITE)

  const { data: rows, isPending, isFetching, isError, error } = usePositions(debouncedSearch)
  // ชื่อของแม่ — ตารางคืนมาแค่ id
  const parents = useDepartmentOptions()
  const remove = useDeletePosition()
  const move = useMovePosition()

  /**
   * สถานะของกล่องเป็นก้อนเดียว ไม่ใช่สาม state แยกกัน
   *
   * แยกกันแล้วมีจังหวะที่ `mode` เป็น `edit` แต่ `row` ยังเป็นของเดิม (หรือ `null`)
   * — กล่องอ่านค่ากลางคันแล้วบันทึกผิดโหมด: กด "แก้ไข" ได้แถวใหม่แทนที่จะแก้แถวเดิม
   * (เจอจากภาพหลักฐาน 2026-08-26)
   */
  const [dialog, setDialog] = useState<{ mode: DialogMode; row: Position | null; open: boolean }>({
    mode: 'create',
    row: null,
    open: false,
  })
  const [pendingDelete, setPendingDelete] = useState<Position | null>(null)

  /**
   * ลากได้เฉพาะตอนมีสิทธิ์เขียน และไม่ได้กำลังค้นหา
   *
   * ผลการค้นเป็นแถวที่กระโดดข้ามกัน — ลากในนั้นแล้ว "วางก่อนแถวที่เห็น" ไม่ตรงกับ
   * ลำดับจริงในลิสต์เต็ม ผู้ใช้จะเห็นผลลัพธ์ที่ไม่ได้ตั้งใจ
   */
  const isSearching = debouncedSearch.length > 0

  /** หาไว้ล่วงหน้าแทนที่จะไล่หาใหม่ทุกแถว */
  const parentNameById = useMemo(() => {
    const map = new Map<number, string>()
    for (const option of parents.data ?? []) map.set(option.id, option.name)
    return map
  }, [parents.data])

  function openDialog(mode: DialogMode, row: Position | null) {
    setDialog({ mode, row, open: true })
  }

  const columns: DataTableColumn<Position>[] = [
    DRAG_COLUMN,
    { key: 'name', title: `ชื่อ${NOUN}`, dataIndex: 'name', truncate: true },
    {
      key: 'departmentId',
      title: PARENT_LABEL,
      width: 200,
      truncate: true,
      // แม่ที่หาไม่เจอแสดงขีด ไม่ใช่ช่องว่าง — ช่องว่างอ่านเหมือนคอลัมน์พัง
      render: (row) => (row.departmentId == null ? '—' : (parentNameById.get(row.departmentId) ?? '—')),
    },
    {
      key: 'actions',
      title: 'จัดการ',
      width: 100,
      align: 'right',
      // ปุ่มยังอยู่ตอนเลื่อนตารางแนวนอน
      fixed: 'right',
      render: (row) => (
        <RowActions
          label={row.name}
          canWrite={canWrite}
          onView={() => openDialog('view', row)}
          onEdit={() => openDialog('edit', row)}
          onDelete={() => setPendingDelete(row)}
        />
      ),
    },
  ]

  async function handleMove(id: number, beforeId: number | null) {
    try {
      await move.mutateAsync({ id, beforeId })
    } catch (err) {
      toast.error(toErrorMessage(err))
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return
    // จับชื่อไว้ก่อน — endpoint ลบคืน null และแถวหายจากตารางทันทีที่สำเร็จ
    const deletedName = pendingDelete.name
    try {
      await remove.mutateAsync(pendingDelete.id)
      setPendingDelete(null)
      toast.success(`ลบ${NOUN} "${deletedName}" แล้ว`)
    } catch (err) {
      toast.error(toErrorMessage(err))
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <ListToolbar
        searchLabel={`ค้นหา${NOUN}`}
        search={search}
        onSearchChange={setSearch}
        actions={
          // ไม่มีสิทธิ์เขียน = ไม่มีปุ่มเพิ่ม ไม่ใช่ปุ่มที่กดแล้วโดนปฏิเสธ
          canWrite ? (
            <Button type="button" variant="success" onClick={() => openDialog('create', null)}>
              <Plus className="size-4" />
              เพิ่ม
            </Button>
          ) : undefined
        }
      />

      <PageHint>พนักงานถือตำแหน่งจากทะเบียนนี้ — ชื่อไม่ซ้ำทั้งตาราง ไม่ได้แยกตามแผนก "หัวหน้างาน" จึงเป็นแถวเดียวที่ทุกแผนกใช้ร่วมกัน</PageHint>

      <SortableDataTable<Position>
        className="min-h-0 flex-1"
        columns={columns}
        data={rows ?? []}
        loading={isPending}
        fetching={isFetching}
        emptyText={
          isError ? toErrorMessage(error) : isSearching ? `ไม่พบ${NOUN}ที่ค้นหา` : `ยังไม่มี${NOUN}`
        }
        reorderable={canWrite && !isSearching}
        onMove={handleMove}
      />

      <PositionDialog
        mode={dialog.mode}
        row={dialog.row}
        open={dialog.open}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title={`ลบ${NOUN}`}
        description={`ต้องการลบ "${pendingDelete?.name ?? ''}" ใช่หรือไม่`}
        actionText="ลบ"
        onAction={handleDelete}
        pending={remove.isPending}
      />
    </div>
  )
}
