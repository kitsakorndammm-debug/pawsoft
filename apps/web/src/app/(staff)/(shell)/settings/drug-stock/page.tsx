'use client'

import { History, Plus } from 'lucide-react'
import { useQueryState } from 'nuqs'
import { Suspense, useState } from 'react'

import { DataTable, type DataTableColumn } from '@/components/common/data-table'
import { ListToolbar } from '@/components/common/list-toolbar'
import { PageHint } from '@/components/common/page-hint'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCan } from '@/features/auth/hooks'
import type { DrugStockBalance } from '@/features/drug-stock/api'
import { useDrugStockBalances } from '@/features/drug-stock/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { formatDate } from '@/lib/format'
import { DRUG_STOCK_WRITE } from '@/lib/permissions'
import { useDebounce } from '@/lib/use-debounce'

import { DrugStockDialog } from './drug-stock-dialog'
import { DrugStockHistoryDialog } from './drug-stock-history-dialog'

const NOUN = 'ยา'

/** ใกล้หมดอายุภายในกี่วันถึงจะไฮไลต์เตือน — หมดอายุแล้วไฮไลต์เสมอไม่ว่ากี่วัน */
const EXPIRY_WARN_DAYS = 30

function expiryClassName(nearestExpiry: string | null): string | undefined {
  if (nearestExpiry === null) return undefined

  const days = (new Date(nearestExpiry).getTime() - Date.now()) / 86_400_000
  if (days < 0) return 'text-destructive font-medium'
  if (days <= EXPIRY_WARN_DAYS) return 'text-amber-600 font-medium'

  return undefined
}

export default function DrugStockPage() {
  /**
   * `useQueryState` อ่าน `useSearchParams` ข้างใน ซึ่ง Next บังคับให้อยู่ใน `Suspense`
   * ไม่ห่อแล้ว `next build` ตกทั้งหน้า ทั้งที่ `dev` กับ `typecheck` เขียวสนิท
   */
  return (
    <Suspense fallback={null}>
      <DrugStockList />
    </Suspense>
  )
}

function DrugStockList() {
  const [search, setSearch] = useQueryState('q', { defaultValue: '', clearOnDefault: true })
  const debouncedSearch = useDebounce(search, 300)
  const isSearching = debouncedSearch.length > 0

  const canWrite = useCan(DRUG_STOCK_WRITE)

  const { data: rows, isPending, isFetching, isError, error } = useDrugStockBalances(debouncedSearch)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [history, setHistory] = useState<{ drugId: number; drugName: string } | null>(null)

  const columns: DataTableColumn<DrugStockBalance>[] = [
    { key: 'name', title: `ชื่อ${NOUN}`, dataIndex: 'name', truncate: true },
    { key: 'code', title: 'รหัส', dataIndex: 'code', width: 120 },
    { key: 'unit', title: 'หน่วย', dataIndex: 'unit', width: 100 },
    {
      key: 'quantity',
      title: 'คงเหลือ',
      width: 120,
      align: 'right',
      render: (row) => (
        <span className={Number(row.quantity) <= 0 ? 'text-destructive' : undefined}>
          {row.quantity}
        </span>
      ),
    },
    {
      key: 'nearestExpiry',
      title: 'วันหมดอายุ',
      width: 130,
      render: (row) =>
        row.nearestExpiry ? (
          <span className={expiryClassName(row.nearestExpiry)}>{formatDate(row.nearestExpiry)}</span>
        ) : (
          '—'
        ),
    },
    {
      key: 'status',
      title: 'สถานะ',
      width: 100,
      render: (row) => (row.isActive ? 'ใช้งานอยู่' : 'เลิกใช้แล้ว'),
    },
    {
      key: 'actions',
      title: 'จัดการ',
      width: 60,
      align: 'right',
      fixed: 'right',
      render: (row) => (
        <div className="flex justify-end">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`ดูประวัติสต็อก ${row.name}`}
                  className="text-primary-strong hover:bg-primary/10"
                  onClick={() => setHistory({ drugId: row.id, drugName: row.name })}
                >
                  <History className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent>{`ดูประวัติสต็อก ${row.name}`}</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ]

  return (
    <div className="flex h-full flex-col gap-3">
      <ListToolbar
        searchLabel={`ค้นหา${NOUN}`}
        search={search}
        onSearchChange={setSearch}
        actions={
          // ไม่มีสิทธิ์เขียน = ไม่มีปุ่มบันทึก ไม่ใช่ปุ่มที่กดแล้วโดนปฏิเสธ
          canWrite ? (
            <Button type="button" variant="success" onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" />
              บันทึกการเคลื่อนไหว
            </Button>
          ) : undefined
        }
      />

      <PageHint>
        ยอดคงเหลือคือผลรวมประวัติรับเข้า/จ่ายออก/ปรับยอดของยาแต่ละตัว — จ่ายยาในคิวตัดสต็อกให้เองอัตโนมัติ ·
        วันหมดอายุคือล็อตที่ใกล้หมดอายุที่สุดจากประวัติรับเข้า
      </PageHint>

      <DataTable<DrugStockBalance>
        className="min-h-0 flex-1"
        columns={columns}
        data={rows ?? []}
        loading={isPending}
        fetching={isFetching}
        emptyText={
          isError ? toErrorMessage(error) : isSearching ? `ไม่พบ${NOUN}ที่ค้นหา` : `ยังไม่มี${NOUN}ในระบบ`
        }
      />

      <DrugStockDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <DrugStockHistoryDialog
        drugId={history?.drugId ?? null}
        drugName={history?.drugName ?? ''}
        open={history !== null}
        onOpenChange={(open) => {
          if (!open) setHistory(null)
        }}
      />
    </div>
  )
}
