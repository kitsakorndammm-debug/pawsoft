'use client'

import { History } from 'lucide-react'
import { useQueryState } from 'nuqs'
import { Suspense, useState } from 'react'

import { AppDatePicker } from '@/components/common/app-date-picker'
import { DataTable, type DataTableColumn } from '@/components/common/data-table'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AUDIT_LOG_PAGE_SIZE, useAuditLogModules, useAuditLogs } from '@/features/audit-log/hooks'
import type { AuditLogRow } from '@/features/audit-log/api'
import { toErrorMessage } from '@/lib/api-client'

/**
 * ประวัติการใช้งาน (audit log) — **อ่านอย่างเดียว**
 *
 * ตอบคำถาม "ใครทำอะไรกับข้อมูลไหนเมื่อไหร่" ให้ผู้ดูแลตรวจสอบภายหลังได้ — แถวมาจาก
 * `writeAudit()` ที่ทุกโมดูลเรียกเองตอนเปลี่ยนข้อมูล หน้านี้ไม่มีปุ่มเพิ่ม/แก้/ลบเลย
 */
function AuditLogBoard() {
  const [module, setModule] = useQueryState('module', { defaultValue: '', clearOnDefault: true })
  const [date, setDate] = useQueryState('date', { defaultValue: '', clearOnDefault: true })
  const [page, setPage] = useQueryState('page', {
    defaultValue: 1,
    clearOnDefault: true,
    parse: (v) => Math.max(Number(v) || 1, 1),
    serialize: String,
  })

  const { data, isPending, isFetching, isError, error } = useAuditLogs({
    module: module || null,
    date: date || null,
    page,
  })
  const modules = useAuditLogModules()

  const [detail, setDetail] = useState<AuditLogRow | null>(null)

  const rows = data?.rows ?? []

  const columns: DataTableColumn<AuditLogRow>[] = [
    {
      key: 'createdAt',
      title: 'เวลา',
      width: 160,
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.createdAt).toLocaleString('th-TH')}
        </span>
      ),
    },
    { key: 'module', title: 'โมดูล', width: 140, dataIndex: 'module' },
    { key: 'action', title: 'การกระทำ', truncate: true, dataIndex: 'action' },
    {
      key: 'recordId',
      title: 'แถวที่',
      width: 90,
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-muted-foreground">{row.recordId ?? '—'}</span>
      ),
    },
    { key: 'userName', title: 'ผู้ทำ', width: 160, dataIndex: 'userName' },
    {
      key: 'source',
      title: 'ที่มา',
      width: 80,
      render: (row) => (
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.source}</span>
      ),
    },
  ]

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <History className="size-5 text-primary-strong" />
          ประวัติการใช้งาน
        </h1>

        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          <Select
            value={module || 'ALL'}
            onValueChange={(v) => {
              void setModule(v === 'ALL' ? '' : v)
              void setPage(1)
            }}
          >
            <SelectTrigger className="w-40" aria-label="กรองตามโมดูล">
              <SelectValue placeholder="ทุกโมดูล" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">ทุกโมดูล</SelectItem>
              {(modules.data ?? []).map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <AppDatePicker
            value={date}
            onChange={(v) => {
              void setDate(v ?? '')
              void setPage(1)
            }}
            className="w-40"
            aria-label="ดูประวัติของวันที่"
          />
          {date ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => void setDate('')}>
              ทุกวัน
            </Button>
          ) : null}
        </div>
      </div>

      <DataTable<AuditLogRow>
        className="min-h-0 flex-1"
        columns={columns}
        data={rows}
        loading={isPending}
        fetching={isFetching}
        onRowClick={setDetail}
        emptyText={isError ? toErrorMessage(error) : 'ไม่มีประวัติ'}
        pagination={{
          page: data?.page.page ?? page,
          limit: data?.page.pageSize ?? AUDIT_LOG_PAGE_SIZE,
          total: data?.page.total ?? 0,
          onPageChange: setPage,
        }}
      />

      <AuditLogDetailDialog
        row={detail}
        open={detail !== null}
        onOpenChange={(next) => !next && setDetail(null)}
      />
    </div>
  )
}

/** แสดง `before`/`after` เป็น JSON จัดรูปแบบ — ข้อมูลจริงต่างกันไปทุกโมดูล จึงไม่มีคอลัมน์ตายตัวให้วาด */
function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <pre className="max-h-48 overflow-auto rounded-md border bg-muted/40 p-2 text-xs whitespace-pre-wrap">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

function AuditLogDetailDialog({
  row,
  open,
  onOpenChange,
}: {
  row: AuditLogRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5 text-primary-strong" />
            {row?.action}
          </DialogTitle>
        </DialogHeader>

        {row ? (
          <div className="flex flex-col gap-3 text-sm">
            <dl className="flex flex-col gap-1 rounded-md border bg-card p-3">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">เวลา</dt>
                <dd>{new Date(row.createdAt).toLocaleString('th-TH')}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">ผู้ทำ</dt>
                <dd>{row.userName}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">โมดูล</dt>
                <dd>{row.module}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">แถวที่</dt>
                <dd>{row.recordId ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">ที่มา</dt>
                <dd>{row.source}</dd>
              </div>
            </dl>

            <JsonBlock label="ก่อนแก้ไข" value={row.before} />
            <JsonBlock label="หลังแก้ไข" value={row.after} />
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function AuditLogPage() {
  // `useQueryState` อ่าน URL — ไม่ห่อ `Suspense` แล้ว `next build` พังทั้งหน้า
  return (
    <Suspense fallback={null}>
      <AuditLogBoard />
    </Suspense>
  )
}
