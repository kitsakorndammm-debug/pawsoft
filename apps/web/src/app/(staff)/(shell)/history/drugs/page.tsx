'use client'

import { Pill } from 'lucide-react'
import { useQueryState } from 'nuqs'
import { Suspense } from 'react'

import { DataTable, type DataTableColumn } from '@/components/common/data-table'
import { DRUG_MOVEMENT_TYPE_LABEL, type DrugHistoryRow } from '@/features/history/api'
import { HISTORY_PAGE_SIZE, useDrugHistory } from '@/features/history/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { cn } from '@/lib/utils'

/**
 * ประวัติยา — รวมทุกตัวยา พร้อมผู้ป่วยที่เกี่ยวข้อง (ผู้ใช้ตัดสิน 2026-09-18)
 *
 * **อ่านอย่างเดียว** ไม่มีปุ่มบันทึก/แก้ไขเลย — ต่างจากหน้า "สต็อกยา"/"คลังยา" ที่ยัง
 * ต้องมีสิทธิ์เฉพาะเหมือนเดิม หน้านี้เปิดให้พนักงานทุกคนดูย้อนหลังได้
 */
const TYPE_STYLE: Record<DrugHistoryRow['type'], string> = {
  RECEIVE: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300',
  DISPENSE: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  DISPENSE_REVERSED: 'bg-sky-100 text-sky-800 ring-1 ring-sky-300',
  ADJUST: 'bg-muted text-muted-foreground ring-1 ring-border',
}

function DrugHistoryBoard() {
  const [page, setPage] = useQueryState('page', {
    defaultValue: 1,
    clearOnDefault: true,
    parse: (v) => Math.max(Number(v) || 1, 1),
    serialize: String,
  })

  const { data, isPending, isFetching, isError, error } = useDrugHistory(page)
  const rows = data?.rows ?? []

  const columns: DataTableColumn<DrugHistoryRow>[] = [
    {
      key: 'createdAt',
      title: 'เวลา',
      width: 150,
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.createdAt).toLocaleString('th-TH')}
        </span>
      ),
    },
    {
      key: 'type',
      title: 'ประเภท',
      width: 100,
      render: (row) => (
        <span className={cn('rounded px-1.5 py-0.5 text-xs', TYPE_STYLE[row.type])}>
          {DRUG_MOVEMENT_TYPE_LABEL[row.type]}
        </span>
      ),
    },
    { key: 'drugName', title: 'ยา', truncate: true, dataIndex: 'drugName' },
    {
      key: 'quantity',
      title: 'จำนวน',
      width: 110,
      align: 'right',
      render: (row) => (
        <span className="tabular-nums">
          {row.quantity}
          {row.drugUnit ? ` ${row.drugUnit}` : ''}
        </span>
      ),
    },
    {
      key: 'patient',
      title: 'ผู้ป่วย',
      truncate: true,
      render: (row) =>
        row.patient ? (
          <span className="flex flex-col">
            <span className="truncate">{row.patient.petName ?? 'ไม่ระบุสัตว์'}</span>
            <span className="truncate text-xs text-muted-foreground">
              {row.patient.ownerName ?? '—'} · คิว {row.patient.queueNumber}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'reason',
      title: 'เหตุผล',
      truncate: true,
      render: (row) => row.reason ?? <span className="text-muted-foreground">—</span>,
    },
    { key: 'createdByName', title: 'ผู้บันทึก', width: 150, dataIndex: 'createdByName' },
  ]

  return (
    <div className="flex h-full flex-col gap-3">
      <h1 className="flex items-center gap-2 text-lg font-semibold">
        <Pill className="size-5 text-primary-strong" />
        ประวัติยา
      </h1>

      <DataTable<DrugHistoryRow>
        className="min-h-0 flex-1"
        columns={columns}
        data={rows}
        loading={isPending}
        fetching={isFetching}
        emptyText={isError ? toErrorMessage(error) : 'ยังไม่มีประวัติการเคลื่อนไหวของยา'}
        pagination={{
          page: data?.page.page ?? page,
          limit: data?.page.pageSize ?? HISTORY_PAGE_SIZE,
          total: data?.page.total ?? 0,
          onPageChange: setPage,
        }}
      />
    </div>
  )
}

export default function DrugHistoryPage() {
  return (
    <Suspense fallback={null}>
      <DrugHistoryBoard />
    </Suspense>
  )
}
