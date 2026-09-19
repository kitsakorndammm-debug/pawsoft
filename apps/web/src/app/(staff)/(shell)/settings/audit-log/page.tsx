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
import { formatFieldValue, labelForAction, labelForField, labelForModule } from '@/features/audit-log/labels'
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
    {
      key: 'module',
      title: 'โมดูล',
      width: 140,
      render: (row) => labelForModule(row.module),
    },
    {
      key: 'action',
      title: 'การกระทำ',
      truncate: true,
      render: (row) => labelForAction(row.module, row.action),
    },
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
                  {labelForModule(m)}
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

type DiffRow = { key: string; before: unknown; after: unknown; hasBefore: boolean; hasAfter: boolean }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * เทียบ `before`/`after` เป็นรายฟิลด์ — **แถวเดียวต่อฟิลด์ที่เปลี่ยน** ไม่ใช่ JSON ดิบ
 * สองก้อน (ผู้ใช้ตัดสิน 2026-09-20 หลังเห็นว่า JSON ดิบอ่านยากเกินไปสำหรับพนักงานทั่วไป)
 *
 * `create` มีแต่ `after` → ทุกฟิลด์โชว์เป็น "ค่าเริ่มต้น" · `delete` มีแต่ `before` →
 * โชว์เป็น "ค่าก่อนลบ" · `update` มีทั้งคู่ (มาจาก `diffFields()` ฝั่ง service ซึ่งส่งมา
 * เฉพาะฟิลด์ที่เปลี่ยนจริงอยู่แล้ว) → โชว์เป็นลูกศรก่อน→หลัง
 */
function diffRows(before: unknown, after: unknown): DiffRow[] {
  const b = isRecord(before) ? before : {}
  const a = isRecord(after) ? after : {}
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]))

  return keys.map((key) => ({
    key,
    before: b[key],
    after: a[key],
    hasBefore: key in b,
    hasAfter: key in a,
  }))
}

function AuditDiff({ module, before, after }: { module: string; before: unknown; after: unknown }) {
  const rows = diffRows(before, after)

  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">ไม่มีรายละเอียดเพิ่มเติม</p>
  }

  return (
    <div className="overflow-hidden rounded-md border">
      {rows.map((row) => (
        <div
          key={row.key}
          className="flex items-start justify-between gap-3 border-b bg-card px-3 py-2 text-sm last:border-b-0"
        >
          <span className="shrink-0 text-muted-foreground">{labelForField(row.key)}</span>
          <span className="min-w-0 text-right">
            {row.hasBefore && row.hasAfter ? (
              <>
                <span className="text-muted-foreground line-through decoration-muted-foreground/50">
                  {formatFieldValue(module, row.key, row.before)}
                </span>{' '}
                <span aria-hidden>→</span>{' '}
                <span className="font-medium">{formatFieldValue(module, row.key, row.after)}</span>
              </>
            ) : row.hasAfter ? (
              <span className="font-medium">{formatFieldValue(module, row.key, row.after)}</span>
            ) : (
              <span className="text-muted-foreground">{formatFieldValue(module, row.key, row.before)}</span>
            )}
          </span>
        </div>
      ))}
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
            {row ? labelForAction(row.module, row.action) : ''}
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
                <dd>{labelForModule(row.module)}</dd>
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

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                {row.before === null || row.before === undefined
                  ? 'ค่าที่ตั้งไว้ตอนสร้าง'
                  : row.after === null || row.after === undefined
                    ? 'ค่าก่อนลบ'
                    : 'สิ่งที่เปลี่ยน'}
              </span>
              <AuditDiff module={row.module} before={row.before} after={row.after} />
            </div>

            {/* ทางออกสำรอง — เผื่อพจนานุกรมคำแปลยังไม่ครอบคลุมทุกฟิลด์ ข้อมูลดิบยังดูได้เสมอ */}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none hover:text-foreground">
                ดูข้อมูลดิบ (JSON)
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded-md border bg-muted/40 p-2 whitespace-pre-wrap">
                {JSON.stringify({ before: row.before, after: row.after }, null, 2)}
              </pre>
            </details>
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
