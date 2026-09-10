'use client'

import { Ban, Plus, RotateCcw, Tags } from 'lucide-react'
import { useQueryState } from 'nuqs'
import { Suspense, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DataTable, type DataTableColumn } from '@/components/common/data-table'
import { type DialogMode } from '@/components/common/form-dialog'
import { RowActions } from '@/components/common/row-actions'
import { SearchInput } from '@/components/common/search-input'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCan } from '@/features/auth/hooks'
import { DrugCategoryManagerDialog } from '@/features/drug-category/drug-category-manager'
import { useDrugCategoryOptions } from '@/features/drug-category/hooks'
import type { Drug } from '@/features/drug/api'
import { DRUG_PAGE_SIZE, useDeleteDrug, useDrugs, useSetDrugActive } from '@/features/drug/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { useDebounce } from '@/lib/use-debounce'
import { MASTER_WRITE } from '@/lib/permissions'

import { DrugDialog } from './drug-dialog'

const NOUN = 'ยา'

/**
 * ยาและเวชภัณฑ์
 *
 * **หมวดยาจัดการจากในหน้านี้ ไม่มีเมนูแยก** (ผู้ใช้ตัดสิน 2026-09-01 · รูปเดียวกับ
 * หน้าลูกค้าของระบบก่อนหน้า) · คนที่มาเพิ่มยาคือคนเดียวกับที่รู้ว่าต้องมีหมวดใหม่ ·
 * บังคับให้ออกไปอีกเมนูแล้วกลับมา แปลว่าทิ้งสิ่งที่กรอกค้างไว้
 */
function DrugList() {
  const canWrite = useCan(MASTER_WRITE)

  const [search, setSearch] = useQueryState('q', { defaultValue: '', clearOnDefault: true })
  const [page, setPage] = useQueryState('page', {
    defaultValue: 1,
    clearOnDefault: true,
    parse: (v) => Math.max(Number(v) || 1, 1),
    serialize: String,
  })

  const debounced = useDebounce(search, 300)
  const isSearching = debounced.trim().length > 0

  const { data, isPending, isFetching, isError, error } = useDrugs(debounced.trim(), null, page)
  const categories = useDrugCategoryOptions()

  const setActive = useSetDrugActive()
  const remove = useDeleteDrug()

  const [dialog, setDialog] = useState<{ mode: DialogMode; row: Drug | null; open: boolean }>({
    mode: 'create',
    row: null,
    open: false,
  })
  const [pendingDelete, setPendingDelete] = useState<Drug | null>(null)
  const [categoriesOpen, setCategoriesOpen] = useState(false)

  const openDialog = (mode: DialogMode, row: Drug | null) => setDialog({ mode, row, open: true })

  const nameById = new Map((categories.data ?? []).map((c) => [c.id, c.name]))

  async function handleDelete() {
    if (!pendingDelete) return

    // จับชื่อไว้ก่อน — หลังลบแล้วแถวหายไปจาก cache
    const name = pendingDelete.name

    try {
      await remove.mutateAsync(pendingDelete.id)
      toast.success(`ลบ${NOUN} "${name}" แล้ว`)
      setPendingDelete(null)
    } catch (e) {
      toast.error(toErrorMessage(e))
    }
  }

  const columns: DataTableColumn<Drug>[] = [
    { key: 'code', title: 'รหัส', width: 110, dataIndex: 'code' },
    { key: 'name', title: `ชื่อ${NOUN}`, truncate: true, dataIndex: 'name' },
    { key: 'genericName', title: 'ตัวยาสำคัญ', width: 160, truncate: true, dataIndex: 'genericName' },
    {
      key: 'categoryId',
      title: 'หมวด',
      width: 140,
      truncate: true,
      // ช่องว่างอ่านเหมือนคอลัมน์พัง — ขีดกลางบอกว่าไม่มีค่า
      render: (row) => (row.categoryId === null ? '—' : (nameById.get(row.categoryId) ?? '—')),
    },
    {
      key: 'price',
      title: 'ราคา',
      width: 110,
      align: 'right',
      /**
       * **`null` กับ `'0'` แสดงไม่เหมือนกัน** — ยังไม่ตั้งราคา กับ แจกฟรี เป็นคนละเรื่อง
       * และคนที่คิดเงินต้องแยกออก
       */
      render: (row) =>
        row.price === null ? (
          <span className="text-muted-foreground">ยังไม่ตั้งราคา</span>
        ) : (
          `${row.price}${row.unit ? ` / ${row.unit}` : ''}`
        ),
    },
    {
      key: 'isActive',
      title: 'สถานะ',
      width: 90,
      align: 'center',
      render: (row) =>
        row.isActive ? (
          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-700">
            ใช้อยู่
          </span>
        ) : (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            เลิกใช้
          </span>
        ),
    },
    {
      key: 'actions',
      title: 'จัดการ',
      width: 130,
      align: 'right',
      fixed: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          {canWrite ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${row.isActive ? 'เลิกใช้' : 'กลับมาใช้'} ${row.name}`}
                    /* ส้มคือเลิกใช้ · เขียวคือเอากลับมา — สีบอกทิศทางเหมือนหน้าพนักงาน */
                    className={
                      row.isActive
                        ? 'text-orange-600/80 hover:bg-orange-100 hover:text-orange-700'
                        : 'text-emerald-600/80 hover:bg-emerald-100 hover:text-emerald-700'
                    }
                    onClick={() =>
                      setActive.mutate(
                        { id: row.id, isActive: !row.isActive },
                        { onError: (e) => toast.error(toErrorMessage(e)) },
                      )
                    }
                  >
                    {row.isActive ? (
                      <Ban className="size-3.5" />
                    ) : (
                      <RotateCcw className="size-3.5" />
                    )}
                  </Button>
                }
              />
              <TooltipContent>
                {row.isActive ? `เลิกใช้ ${row.name}` : `กลับมาใช้ ${row.name}`}
              </TooltipContent>
            </Tooltip>
          ) : null}

          <RowActions
            label={`${NOUN} ${row.name}`}
            canWrite={canWrite}
            onView={() => openDialog('view', row)}
            onEdit={() => openDialog('edit', row)}
            onDelete={() => setPendingDelete(row)}
          />
        </div>
      ),
    },
  ]

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <SearchInput
          className="max-w-xs flex-1"
          value={search}
          onChange={setSearch}
          placeholder={`ค้นหา${NOUN}`}
          aria-label={`ค้นหา${NOUN}`}
          clearLabel="ล้างการค้นหา"
        />

        <div className="ml-auto flex items-center gap-2">
          {/* ไม่มีสิทธิ์เขียน = ไม่มีปุ่ม ไม่ใช่ปุ่มที่กดแล้วโดนปฏิเสธ */}
          {canWrite ? (
            <Button type="button" variant="success" onClick={() => openDialog('create', null)}>
              <Plus className="size-4" />
              เพิ่ม{NOUN}
            </Button>
          ) : null}

          {/* หมวดยาอยู่ในกล่อง ไม่ใช่เมนูแยก — ดู `///` บนหัวไฟล์ */}
          <Button
            type="button"
            variant="outline"
            /* ปุ่มรอง — ฟ้าอ่อนบอกว่าอยู่ตระกูลเดียวกับปุ่มหลัก แต่ไม่แย่งสายตา */
            className="border-primary/30 bg-primary/5 text-primary-strong hover:bg-primary/10"
            onClick={() => setCategoriesOpen(true)}
          >
            <Tags className="size-4" />
            หมวดยา
          </Button>
        </div>
      </div>

      <DataTable<Drug>
        className="min-h-0 flex-1"
        columns={columns}
        data={data?.rows ?? []}
        loading={isPending}
        fetching={isFetching}
        emptyText={
          isError ? toErrorMessage(error) : isSearching ? `ไม่พบ${NOUN}ที่ค้นหา` : `ยังไม่มี${NOUN}`
        }
        pagination={{
          page: data?.page.page ?? page,
          limit: data?.page.pageSize ?? DRUG_PAGE_SIZE,
          total: data?.page.total ?? 0,
          onPageChange: setPage,
        }}
      />

      <DrugDialog
        mode={dialog.mode}
        row={dialog.row}
        open={dialog.open}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
      />

      <DrugCategoryManagerDialog open={categoriesOpen} onOpenChange={setCategoriesOpen} />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`ลบ${NOUN}`}
        description={`ต้องการลบ "${pendingDelete?.name ?? ''}" ใช่หรือไม่`}
        actionText="ลบ"
        onAction={handleDelete}
        pending={remove.isPending}
      />
    </div>
  )
}

export default function DrugsPage() {
  // `useQueryState` อ่าน URL — ไม่ห่อ `Suspense` แล้ว `next build` พังทั้งหน้า
  return (
    <Suspense fallback={null}>
      <DrugList />
    </Suspense>
  )
}
