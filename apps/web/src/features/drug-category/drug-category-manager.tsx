'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/common/confirm-dialog'
import type { DataTableColumn } from '@/components/common/data-table'
import type { DialogMode } from '@/components/common/form-dialog'
import { RowActions } from '@/components/common/row-actions'
import { SearchInput } from '@/components/common/search-input'
import { SortableDataTable } from '@/components/common/sortable-data-table'
import { DRAG_COLUMN } from '@/components/common/sortable-table-row'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCan } from '@/features/auth/hooks'
import type { DrugCategory } from '@/features/drug-category/api'
import { DrugCategoryDialog } from '@/features/drug-category/drug-category-dialog'
import {
  useDrugCategorys,
  useDeleteDrugCategory,
  useMoveDrugCategory,
} from '@/features/drug-category/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { MASTER_WRITE } from '@/lib/permissions'
import { useDebounce } from '@/lib/use-debounce'

/**
 * จัดการหมวดยา — **อยู่ในกล่อง ไม่ใช่หน้าของตัวเอง** (ผู้ใช้ตัดสิน 2026-08-27)
 *
 * เคยเป็นหน้า `/settings/drug-categorys` · ย้ายมาเพราะคนที่ต้องแก้ทะเบียนนี้กำลังกรอก
 * ลูกค้าอยู่ และเจอว่าประเภทที่ต้องการยังไม่มี · เดินไปเมนูตั้งค่าแล้วเดินกลับมา แปลว่า
 * ทิ้งสิ่งที่กรอกค้างไว้
 *
 * **สิทธิ์ยังเป็น `main:master:*` เหมือนเดิม** — ทะเบียนไม่ได้เปลี่ยนเจ้าของเพราะย้ายที่
 * อยู่ · คนที่อ่านลูกค้าได้แต่ไม่มีสิทธิ์ทะเบียน เห็นตารางแต่ไม่มีปุ่ม
 */
const NOUN = 'หมวดยา'

export function DrugCategoryManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  const canWrite = useCan(MASTER_WRITE)

  const { data: rows, isPending, isFetching, isError, error } = useDrugCategorys(debouncedSearch)
  const remove = useDeleteDrugCategory()
  const move = useMoveDrugCategory()

  /**
   * สถานะของกล่องแก้ไขเป็นก้อนเดียว ไม่ใช่สาม state แยกกัน
   *
   * แยกกันแล้วมีจังหวะที่ `mode` เป็น `edit` แต่ `row` ยังเป็นของเดิม
   * — กล่องอ่านค่ากลางคันแล้วบันทึกผิดโหมด
   */
  const [dialog, setDialog] = useState<{
    mode: DialogMode
    row: DrugCategory | null
    open: boolean
  }>({ mode: 'create', row: null, open: false })
  const [pendingDelete, setPendingDelete] = useState<DrugCategory | null>(null)

  /**
   * ลากได้เฉพาะตอนมีสิทธิ์เขียน และไม่ได้กำลังค้นหา
   *
   * ผลการค้นเป็นแถวที่กระโดดข้ามกัน — ลากในนั้นแล้ว "วางก่อนแถวที่เห็น" ไม่ตรงกับ
   * ลำดับจริงในลิสต์เต็ม
   */
  const isSearching = debouncedSearch.length > 0

  function openDialog(mode: DialogMode, row: DrugCategory | null) {
    setDialog({ mode, row, open: true })
  }

  const columns: DataTableColumn<DrugCategory>[] = [
    DRAG_COLUMN,
    { key: 'name', title: `ชื่อ${NOUN}`, dataIndex: 'name', truncate: true },
    {
      key: 'actions',
      title: 'จัดการ',
      width: 100,
      align: 'right',
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
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[80vh] max-w-3xl flex-col gap-3">
          <DialogHeader>
            <DialogTitle>{NOUN}</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <SearchInput
              className="flex-1"
              value={search}
              onChange={setSearch}
              aria-label={`ค้นหา${NOUN}`}
              clearLabel="ล้างการค้นหา"
            />
            {/* ไม่มีสิทธิ์เขียน = ไม่มีปุ่มเพิ่ม ไม่ใช่ปุ่มที่กดแล้วโดนปฏิเสธ */}
            {canWrite && (
              <Button type="button" variant="success" onClick={() => openDialog('create', null)}>
                <Plus className="size-4" />
                เพิ่ม
              </Button>
            )}
          </div>

          <SortableDataTable<DrugCategory>
            className="min-h-0 flex-1"
            columns={columns}
            data={rows ?? []}
            loading={isPending}
            fetching={isFetching}
            emptyText={
              isError
                ? toErrorMessage(error)
                : isSearching
                  ? `ไม่พบ${NOUN}ที่ค้นหา`
                  : `ยังไม่มี${NOUN}`
            }
            reorderable={canWrite && !isSearching}
            onMove={handleMove}
          />
        </DialogContent>
      </Dialog>

      {/*
        กล่องแก้ไขกับกล่องยืนยันอยู่ **นอก** กล่องตาราง

        ซ้อนกล่องในกล่องแล้วตัวในปิดพร้อมตัวนอกตอนกด Esc และ overlay สองชั้นทำให้
        ตัวในจางลงจนอ่านยาก · วางข้างกันแล้วทั้งคู่เป็นกล่องเต็มใบของตัวเอง
      */}
      <DrugCategoryDialog
        mode={dialog.mode}
        row={dialog.row}
        open={dialog.open}
        onOpenChange={(next) => setDialog((prev) => ({ ...prev, open: next }))}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null)
        }}
        title={`ลบ${NOUN}`}
        description={`ต้องการลบ "${pendingDelete?.name ?? ''}" ใช่หรือไม่`}
        actionText="ลบ"
        onAction={handleDelete}
        pending={remove.isPending}
      />
    </>
  )
}
