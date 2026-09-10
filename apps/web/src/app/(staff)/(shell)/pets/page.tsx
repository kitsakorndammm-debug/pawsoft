'use client'

import { HeartOff, History as HistoryIcon, PawPrint, Plus } from 'lucide-react'
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
import type { Pet } from '@/features/pet/api'
import {
  PET_PAGE_SIZE,
  useDeletePet,
  usePets,
  useSetPetDeceased,
  useSpeciesOptions,
} from '@/features/pet/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { RECEPTION_WRITE } from '@/lib/permissions'
import { useDebounce } from '@/lib/use-debounce'

import { PetDialog } from './pet-dialog'
import { PetHistoryDialog } from './pet-history-dialog'
import { SpeciesManagerDialog } from './species-manager'

const NOUN = 'สัตว์เลี้ยง'

const SEX_LABEL: Record<Pet['sex'], string> = {
  MALE: 'ผู้',
  FEMALE: 'เมีย',
  UNKNOWN: '—',
}

/**
 * ทะเบียนสัตว์เลี้ยง
 *
 * **ชนิดและสายพันธุ์จัดการจากในหน้านี้ ไม่มีเมนูแยก** — รูปเดียวกับหมวดยา ·
 * คนที่มาเพิ่มสัตว์คือคนเดียวกับที่รู้ว่าต้องมีพันธุ์ใหม่
 */
function PetList() {
  const canWrite = useCan(RECEPTION_WRITE)

  const [search, setSearch] = useQueryState('q', { defaultValue: '', clearOnDefault: true })
  const [page, setPage] = useQueryState('page', {
    defaultValue: 1,
    clearOnDefault: true,
    parse: (v) => Math.max(Number(v) || 1, 1),
    serialize: String,
  })

  const debounced = useDebounce(search, 300)
  const isSearching = debounced.trim().length > 0

  const { data, isPending, isFetching, isError, error } = usePets({
    q: debounced.trim(),
    ownerId: null,
    speciesId: null,
    includeDeceased: false,
    page,
  })
  const species = useSpeciesOptions()

  const deceased = useSetPetDeceased()
  const remove = useDeletePet()

  const [dialog, setDialog] = useState<{ mode: DialogMode; row: Pet | null; open: boolean }>({
    mode: 'create',
    row: null,
    open: false,
  })
  const [speciesOpen, setSpeciesOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Pet | null>(null)
  const [pendingDeceased, setPendingDeceased] = useState<Pet | null>(null)
  const [historyPet, setHistoryPet] = useState<Pet | null>(null)

  const openDialog = (mode: DialogMode, row: Pet | null) => setDialog({ mode, row, open: true })

  const speciesName = new Map((species.data ?? []).map((s) => [s.id, s.name]))

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

  async function handleDeceased() {
    if (!pendingDeceased) return
    const name = pendingDeceased.name

    try {
      // วันที่เป็นวันนี้ตามเครื่อง — พอสำหรับการบันทึกว่าเสียชีวิต
      await deceased.mutateAsync({
        id: pendingDeceased.id,
        deceasedOn: new Date().toISOString().slice(0, 10),
      })
      toast.success(`บันทึกว่า "${name}" เสียชีวิตแล้ว`)
      setPendingDeceased(null)
    } catch (e) {
      toast.error(toErrorMessage(e))
    }
  }

  const columns: DataTableColumn<Pet>[] = [
    { key: 'code', title: 'รหัส', width: 100, dataIndex: 'code' },
    { key: 'name', title: `ชื่อ${NOUN}`, truncate: true, dataIndex: 'name' },
    {
      key: 'speciesId',
      title: 'ชนิด',
      width: 110,
      render: (row) => speciesName.get(row.speciesId) ?? '—',
    },
    { key: 'sex', title: 'เพศ', width: 70, align: 'center', render: (row) => SEX_LABEL[row.sex] },
    {
      key: 'weightKg',
      title: 'น้ำหนัก',
      width: 90,
      align: 'right',
      // น้ำหนักเป็นข้อความจาก BE — แสดงตรง ๆ ห้ามแปลงเป็น number
      render: (row) => (row.weightKg === null ? '—' : `${row.weightKg} กก.`),
    },
    {
      key: 'allergyNote',
      title: 'แพ้ยา',
      width: 140,
      truncate: true,
      /** ประวัติแพ้ยาต้องสะดุดตา — มันคือข้อมูลที่ช่วยชีวิต */
      render: (row) =>
        row.allergyNote ? (
          <span className="text-red-700">{row.allergyNote}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'actions',
      title: 'จัดการ',
      width: 160,
      align: 'right',
      fixed: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          {/* ประวัติ **ทุกคนที่เห็นสัตว์ดูได้** — ไม่ต้องมีสิทธิ์เขียน */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`ประวัติการรักษาของ ${row.name}`}
                  onClick={() => setHistoryPet(row)}
                  className="text-primary-strong hover:bg-primary/10"
                >
                  <HistoryIcon className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent>ประวัติการรักษา</TooltipContent>
          </Tooltip>

          {canWrite && row.deceasedOn === null ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`บันทึกว่า ${row.name} เสียชีวิต`}
                    onClick={() => setPendingDeceased(row)}
                    /* เทาเข้ม ไม่ใช่แดง — นี่ไม่ใช่การลบ และไม่ใช่การกระทำที่ต้องเตือน */
                    className="text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <HeartOff className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent>บันทึกว่าเสียชีวิต</TooltipContent>
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
          <PawPrint className="size-5 text-primary-strong" />
          สัตว์เลี้ยง
        </h1>

        <SearchInput
          className="max-w-xs flex-1"
          value={search}
          onChange={setSearch}
          placeholder="ค้นชื่อสัตว์ ชื่อเจ้าของ หรือเบอร์"
          aria-label={`ค้นหา${NOUN}`}
          clearLabel="ล้างการค้นหา"
        />

        <div className="ml-auto flex items-center gap-2">
          {canWrite ? (
            <Button type="button" variant="success" onClick={() => openDialog('create', null)}>
              <Plus className="size-4" />
              เพิ่ม{NOUN}
            </Button>
          ) : null}

          <Button
            type="button"
            variant="outline"
            /* ปุ่มรอง — ฟ้าอ่อนบอกว่าอยู่ตระกูลเดียวกับปุ่มหลัก แต่ไม่แย่งสายตา */
            className="border-primary/30 bg-primary/5 text-primary-strong hover:bg-primary/10"
            onClick={() => setSpeciesOpen(true)}
          >
            ชนิดและสายพันธุ์
          </Button>
        </div>
      </div>

      <DataTable<Pet>
        className="min-h-0 flex-1"
        columns={columns}
        data={data?.rows ?? []}
        loading={isPending}
        fetching={isFetching}
        emptyText={
          isError ? toErrorMessage(error) : isSearching ? 'ไม่พบที่ค้นหา' : `ยังไม่มี${NOUN}`
        }
        pagination={{
          page: data?.page.page ?? page,
          limit: data?.page.pageSize ?? PET_PAGE_SIZE,
          total: data?.page.total ?? 0,
          onPageChange: setPage,
        }}
      />

      <PetDialog
        mode={dialog.mode}
        row={dialog.row}
        open={dialog.open}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
      />

      <SpeciesManagerDialog open={speciesOpen} onOpenChange={setSpeciesOpen} />

      <PetHistoryDialog
        pet={historyPet}
        open={historyPet !== null}
        onOpenChange={(open) => !open && setHistoryPet(null)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`ลบ${NOUN}`}
        description={`ต้องการลบ "${pendingDelete?.name ?? ''}" ใช่หรือไม่ — สัตว์ที่เคยมาคลินิกแล้วลบไม่ได้`}
        actionText="ลบ"
        onAction={handleDelete}
        pending={remove.isPending}
      />

      <ConfirmDialog
        open={pendingDeceased !== null}
        onOpenChange={(open) => !open && setPendingDeceased(null)}
        title="บันทึกว่าเสียชีวิต"
        description={`"${pendingDeceased?.name ?? ''}" จะไม่โผล่ในช่องเลือกสัตว์อีก แต่ประวัติการรักษายังอยู่ครบ`}
        actionText="บันทึก"
        onAction={handleDeceased}
        pending={deceased.isPending}
      />
    </div>
  )
}

export default function PetsPage() {
  return (
    <Suspense fallback={null}>
      <PetList />
    </Suspense>
  )
}
