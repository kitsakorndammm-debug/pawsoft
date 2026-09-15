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
import type { WarehouseStockBalance } from '@/features/warehouse-stock/api'
import { useWarehouseStockBalances } from '@/features/warehouse-stock/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { DRUG_WAREHOUSE_WRITE } from '@/lib/permissions'
import { useDebounce } from '@/lib/use-debounce'

import { WarehouseStockDialog } from './warehouse-stock-dialog'
import { WarehouseStockHistoryDialog } from './warehouse-stock-history-dialog'

const NOUN = 'ยา'

export default function WarehouseStockPage() {
  /**
   * `useQueryState` อ่าน `useSearchParams` ข้างใน ซึ่ง Next บังคับให้อยู่ใน `Suspense`
   * ไม่ห่อแล้ว `next build` ตกทั้งหน้า ทั้งที่ `dev` กับ `typecheck` เขียวสนิท
   */
  return (
    <Suspense fallback={null}>
      <WarehouseStockList />
    </Suspense>
  )
}

function WarehouseStockList() {
  const [search, setSearch] = useQueryState('q', { defaultValue: '', clearOnDefault: true })
  const debouncedSearch = useDebounce(search, 300)
  const isSearching = debouncedSearch.length > 0

  const canWrite = useCan(DRUG_WAREHOUSE_WRITE)

  const { data: rows, isPending, isFetching, isError, error } = useWarehouseStockBalances(debouncedSearch)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [history, setHistory] = useState<{ drugId: number; drugName: string } | null>(null)

  const columns: DataTableColumn<WarehouseStockBalance>[] = [
    { key: 'name', title: `ชื่อ${NOUN}`, dataIndex: 'name', truncate: true },
    { key: 'code', title: 'รหัส', dataIndex: 'code', width: 120 },
    { key: 'unit', title: 'หน่วย', dataIndex: 'unit', width: 100 },
    {
      key: 'quantity',
      title: 'คงเหลือในคลัง',
      width: 140,
      align: 'right',
      render: (row) => (
        <span className={Number(row.quantity) <= 0 ? 'text-destructive' : undefined}>
          {row.quantity}
        </span>
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
                  aria-label={`ดูประวัติคลัง ${row.name}`}
                  className="text-primary-strong hover:bg-primary/10"
                  onClick={() => setHistory({ drugId: row.id, drugName: row.name })}
                >
                  <History className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent>{`ดูประวัติคลัง ${row.name}`}</TooltipContent>
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
        คลังยาคือสต็อกกลางที่แยกจากสต็อกที่หมอใช้จ่ายคนไข้ — ซื้อยาเข้ามาเก็บที่นี่ก่อน แล้วให้พนักงาน
        "เบิกจากคลัง" ไปเติมสต็อกที่หมอใช้ (ทำได้ที่หน้า "สต็อกยา")
      </PageHint>

      <DataTable<WarehouseStockBalance>
        className="min-h-0 flex-1"
        columns={columns}
        data={rows ?? []}
        loading={isPending}
        fetching={isFetching}
        emptyText={
          isError ? toErrorMessage(error) : isSearching ? `ไม่พบ${NOUN}ที่ค้นหา` : `ยังไม่มี${NOUN}ในระบบ`
        }
      />

      <WarehouseStockDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <WarehouseStockHistoryDialog
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
