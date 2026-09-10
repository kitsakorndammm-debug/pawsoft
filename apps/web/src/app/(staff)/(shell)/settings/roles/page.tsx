'use client'

import { Plus, ShieldCheck } from 'lucide-react'
import { parseAsInteger, useQueryState } from 'nuqs'
import { Suspense, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DataTable, type DataTableColumn } from '@/components/common/data-table'
import type { DialogMode } from '@/components/common/form-dialog'
import { ListToolbar } from '@/components/common/list-toolbar'
import { PageHint } from '@/components/common/page-hint'
import { RowActions } from '@/components/common/row-actions'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCan } from '@/features/auth/hooks'
import type { Role } from '@/features/role/api'
import { ROLE_PAGE_SIZE, useDeleteRole, useRoles } from '@/features/role/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { MASTER_WRITE } from '@/lib/permissions'
import { useDebounce } from '@/lib/use-debounce'

import { RoleDialog } from './role-dialog'

const NOUN = 'บทบาท'

export default function RolesPage() {
  /**
   * `useQueryState` อ่าน `useSearchParams` ข้างใน ซึ่ง Next บังคับให้อยู่ใน `Suspense`
   * ไม่ห่อแล้ว `next build` ตกทั้งหน้า ทั้งที่ `dev` กับ `typecheck` เขียวสนิท
   */
  return (
    <Suspense fallback={null}>
      <RoleList />
    </Suspense>
  )
}

function RoleList() {
  const [search, setSearch] = useQueryState('q', { defaultValue: '', clearOnDefault: true })
  /**
   * หน้าอยู่ใน URL เหมือนคำค้น — ส่งลิงก์ของหน้าที่ 3 ให้กันได้ และปุ่มย้อนกลับ
   * พากลับไปหน้าที่เพิ่งดู ไม่ใช่หน้าแรก
   */
  const [page, setPage] = useQueryState('page', parseAsInteger.withDefault(1))
  // ยิงตามทุกตัวอักษรคือ request หนึ่งใบต่อการกดคีย์หนึ่งครั้ง
  const debouncedSearch = useDebounce(search, 300)

  const canWrite = useCan(MASTER_WRITE)

  const { data, isPending, isFetching, isError, error } = useRoles(debouncedSearch, page)
  const remove = useDeleteRole()

  const [dialog, setDialog] = useState<{ mode: DialogMode; row: Role | null; open: boolean }>({
    mode: 'create',
    row: null,
    open: false,
  })
  const [pendingDelete, setPendingDelete] = useState<Role | null>(null)

  const isSearching = debouncedSearch.length > 0

  function openDialog(mode: DialogMode, row: Role | null) {
    setDialog({ mode, row, open: true })
  }

  const columns: DataTableColumn<Role>[] = [
    {
      key: 'name',
      title: 'ชื่อบทบาท',
      truncate: true,
      render: (row) =>
        /*
          บทบาทระบบต้องอ่านออกตั้งแต่แถวว่าทำไมปุ่มแก้กับปุ่มลบหายไป — ไม่บอกตรงนี้
          แล้วมันดูเหมือนแถวที่สิทธิ์ของคนดูไม่ถึง ซึ่งเป็นคนละเรื่องกัน
        */
        row.isSystem ? (
          <span className="inline-flex items-center gap-1.5">
            {row.name}
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="inline-flex cursor-help items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    <ShieldCheck className="size-3.5" />
                    ของระบบ
                  </span>
                }
              />
              <TooltipContent>
                ถือทุกสิทธิ์ในระบบเสมอ — แก้หรือลบไม่ได้ เพื่อให้ยังมีคนแก้เรื่องนี้ได้อยู่
              </TooltipContent>
            </Tooltip>
          </span>
        ) : (
          row.name
        ),
    },
    {
      key: 'userCount',
      title: 'บัญชีที่ถืออยู่',
      width: 130,
      align: 'right',
      render: (row) => `${row.userCount} บัญชี`,
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
          label={`บทบาท ${row.name}`}
          /*
            บทบาทระบบเปิดได้แค่ดู — เหมือนคนที่ไม่มีสิทธิ์เขียน · BE ปฏิเสธอยู่แล้ว
            แต่ปุ่มที่กดแล้วโดนปฏิเสธอ่านเหมือนระบบพัง ไม่ใช่เหมือนกฎ
          */
          canWrite={canWrite && !row.isSystem}
          onView={() => openDialog('view', row)}
          onEdit={() => openDialog('edit', row)}
          /*
            ไม่มีปุ่มลบตอนยังมีคนถืออยู่ — BE ปฏิเสธด้วย `IN_USE` และคอลัมน์ข้าง ๆ
            บอกอยู่แล้วว่าต้องย้ายกี่คนออกก่อน
          */
          onDelete={row.userCount === 0 ? () => setPendingDelete(row) : undefined}
        />
      ),
    },
  ]

  async function handleDelete() {
    if (!pendingDelete) return
    // จับชื่อไว้ก่อน — endpoint ลบคืน null และแถวหายจากตารางทันทีที่สำเร็จ
    const deletedName = pendingDelete.name
    try {
      await remove.mutateAsync(pendingDelete.id)
      setPendingDelete(null)
      toast.success(`ลบบทบาท ${deletedName} แล้ว`)
    } catch (err) {
      toast.error(toErrorMessage(err))
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <ListToolbar
        searchLabel={`ค้นหา${NOUN}`}
        search={search}
        onSearchChange={(next) => {
          setSearch(next)
          // คำค้นใหม่มีจำนวนหน้าของตัวเอง — ค้างอยู่หน้า 3 แล้วมักเจอจอเปล่า
          setPage(1)
        }}
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

      <PageHint>
        บทบาทคือชุดสิทธิ์ที่บัญชีหนึ่งถือ — บัญชีเลือกได้บทบาทเดียว
        และการถอนสิทธิ์ออกจากบทบาทจะตัดเซสชันของทุกคนที่ถือมันทันที
      </PageHint>

      {/*
        `DataTable` ตรง ๆ ไม่ผ่าน `SortableDataTable` — ตารางนี้ไม่มี `sortOrder`
        และแบ่งหน้า · ลากจัดลำดับข้ามหน้าไม่ได้อยู่แล้ว
      */}
      <DataTable<Role>
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
          // `DataTable` เรียกมันว่า `limit` · BE เรียกว่า `pageSize` — เป็นตัวเดียวกัน
          limit: data?.page.pageSize ?? ROLE_PAGE_SIZE,
          total: data?.page.total ?? 0,
          onPageChange: setPage,
        }}
      />

      <RoleDialog
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
        description={`ต้องการลบบทบาท ${pendingDelete?.name ?? ''} ใช่หรือไม่`}
        actionText="ลบ"
        onAction={handleDelete}
        pending={remove.isPending}
      />
    </div>
  )
}
