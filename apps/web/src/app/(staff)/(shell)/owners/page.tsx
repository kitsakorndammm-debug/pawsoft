'use client'

import { Users, Link2, Plus } from 'lucide-react'
import { useQueryState } from 'nuqs'
import { Suspense, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DataTable, type DataTableColumn } from '@/components/common/data-table'
import { type DialogMode } from '@/components/common/form-dialog'
import { RowActions } from '@/components/common/row-actions'
import { SearchInput } from '@/components/common/search-input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCan } from '@/features/auth/hooks'
import type { Owner } from '@/features/owner/api'
import { OWNER_PAGE_SIZE, useDeleteOwner, useOwners } from '@/features/owner/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { RECEPTION_WRITE } from '@/lib/permissions'
import { useDebounce } from '@/lib/use-debounce'

import { LinkAccountDialog } from './link-account-dialog'
import { OwnerDialog } from './owner-dialog'

const NOUN = 'เจ้าของสัตว์'

/**
 * ทะเบียนเจ้าของสัตว์
 *
 * **ค้นด้วยเบอร์เป็นหลัก** — คำถามแรกตอนรับสายคือ "เบอร์อะไร" ไม่ใช่ "ชื่ออะไร"
 * เพราะชื่อซ้ำกันได้และสะกดผิดได้
 */
function OwnerList() {
  const canWrite = useCan(RECEPTION_WRITE)

  const [search, setSearch] = useQueryState('q', { defaultValue: '', clearOnDefault: true })
  const [page, setPage] = useQueryState('page', {
    defaultValue: 1,
    clearOnDefault: true,
    parse: (v) => Math.max(Number(v) || 1, 1),
    serialize: String,
  })
  /**
   * `all` | `linked` | `unlinked` — **ลงทะเบียน = เชื่อมบัญชี Google แล้ว**
   * (ผู้ใช้กำหนด 2026-09-08) ส่วนใหญ่คือลูกค้าที่พนักงานสร้างให้ตอนมาครั้งแรกและ
   * ไม่เคยสมัคร ไม่ใช่ข้อมูลผิดปกติ — แยกดูสองกลุ่มนี้ง่าย ๆ ผ่านแท็บ
   */
  const [registeredFilter, setRegisteredFilter] = useQueryState('registered', {
    defaultValue: 'all',
    clearOnDefault: true,
  })
  const linked = registeredFilter === 'linked' ? true : registeredFilter === 'unlinked' ? false : undefined

  const debounced = useDebounce(search, 300)
  const isSearching = debounced.trim().length > 0

  const { data, isPending, isFetching, isError, error } = useOwners(debounced.trim(), page, linked)
  const remove = useDeleteOwner()

  const [dialog, setDialog] = useState<{ mode: DialogMode; row: Owner | null; open: boolean }>({
    mode: 'create',
    row: null,
    open: false,
  })
  const [linkRow, setLinkRow] = useState<Owner | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Owner | null>(null)

  const openDialog = (mode: DialogMode, row: Owner | null) => setDialog({ mode, row, open: true })

  async function handleDelete() {
    if (!pendingDelete) return
    const name = pendingDelete.name

    try {
      await remove.mutateAsync(pendingDelete.id)
      toast.success(`ลบ "${name}" แล้ว`)
      setPendingDelete(null)
    } catch (e) {
      toast.error(toErrorMessage(e))
    }
  }

  const columns: DataTableColumn<Owner>[] = [
    { key: 'code', title: 'รหัส', width: 100, dataIndex: 'code' },
    { key: 'name', title: 'ชื่อ', truncate: true, dataIndex: 'name' },
    { key: 'phone', title: 'เบอร์โทร', width: 130, dataIndex: 'phone' },
    { key: 'email', title: 'อีเมล', width: 190, truncate: true, dataIndex: 'email' },
    {
      key: 'petOwnerAccountId',
      title: 'สถานะลงทะเบียน',
      width: 140,
      align: 'center',
      /**
       * **ยังไม่ลงทะเบียน = ปกติ ไม่ใช่ข้อผิดพลาด** · ลูกค้าส่วนใหญ่จะไม่มีวันสมัคร
       * Google จึงแสดงเป็นสีเทา ไม่ใช่สีเตือน
       */
      render: (row) =>
        row.petOwnerAccountId === null ? (
          <span className="text-xs text-muted-foreground">ยังไม่ได้ลงทะเบียน</span>
        ) : (
          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-700">
            ลงทะเบียนแล้ว
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
                    aria-label={`เชื่อมบัญชีของ ${row.name}`}
                    onClick={() => setLinkRow(row)}
                    className="text-primary-strong hover:bg-primary/10"
                  >
                    <Link2 className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent>เชื่อมบัญชี Google</TooltipContent>
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
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Users className="size-5 text-primary-strong" />
          เจ้าของสัตว์
        </h1>

        <SearchInput
          className="max-w-xs flex-1"
          value={search}
          onChange={(value) => {
            setSearch(value)
            // คำค้นใหม่ = ผลชุดใหม่ · ค้างอยู่หน้าหลังของผลเก่าคือหน้าที่มักจะว่างเปล่า
            void setPage(1)
          }}
          placeholder="ค้นด้วยเบอร์ ชื่อ หรือรหัส"
          aria-label={`ค้นหา${NOUN}`}
          clearLabel="ล้างการค้นหา"
        />

        {canWrite ? (
          <Button
            type="button"
            variant="success"
            className="ml-auto"
            onClick={() => openDialog('create', null)}
          >
            <Plus className="size-4" />
            เพิ่ม{NOUN}
          </Button>
        ) : null}
      </div>

      <Tabs
        value={registeredFilter}
        onValueChange={(value) => {
          void setRegisteredFilter(value as string)
          void setPage(1)
        }}
      >
        <TabsList>
          <TabsTrigger value="all">ทั้งหมด</TabsTrigger>
          <TabsTrigger value="linked">ลงทะเบียนแล้ว</TabsTrigger>
          <TabsTrigger value="unlinked">ยังไม่ได้ลงทะเบียน</TabsTrigger>
        </TabsList>
      </Tabs>

      <DataTable<Owner>
        className="min-h-0 flex-1"
        columns={columns}
        data={data?.rows ?? []}
        loading={isPending}
        fetching={isFetching}
        emptyText={
          isError
            ? toErrorMessage(error)
            : isSearching
              ? 'ไม่พบที่ค้นหา'
              : linked === true
                ? `ยังไม่มี${NOUN}ที่ลงทะเบียน`
                : linked === false
                  ? `ยังไม่มี${NOUN}ที่ไม่ได้ลงทะเบียน`
                  : `ยังไม่มี${NOUN}`
        }
        pagination={{
          page: data?.page.page ?? page,
          limit: data?.page.pageSize ?? OWNER_PAGE_SIZE,
          total: data?.page.total ?? 0,
          onPageChange: setPage,
        }}
      />

      <OwnerDialog
        mode={dialog.mode}
        row={dialog.row}
        open={dialog.open}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
      />

      <LinkAccountDialog
        row={linkRow}
        open={linkRow !== null}
        onOpenChange={(open) => !open && setLinkRow(null)}
      />

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

export default function OwnersPage() {
  return (
    <Suspense fallback={null}>
      <OwnerList />
    </Suspense>
  )
}
