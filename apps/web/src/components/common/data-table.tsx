'use client'

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  ListFilter,
} from 'lucide-react'
import { Fragment, type CSSProperties, type ReactNode, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export interface DataTablePaginationState {
  page: number
  limit: number
  total: number
  onPageChange: (page: number) => void
  /** เปลี่ยนจำนวนต่อหน้า — แสดง dropdown 20/50/75/100 ถ้าส่ง */
  onLimitChange?: (limit: number) => void
}

const PAGE_SIZE_OPTIONS = [20, 50, 75, 100]

export type SortDirection = 'asc' | 'desc' | null

/** Excel-style filter ในหัวคอลัมน์ — multi-select checkbox popover */
export interface DataTableColumnFilter {
  options: { value: string; label: string }[]
  selected: Set<string>
  onToggle: (value: string) => void
  /** ล้างกรอง column นี้ = กลับไปเลือกครบ (default). */
  onReset?: () => void
}

export interface DataTableColumn<T> {
  key: string
  title: ReactNode
  render?: (row: T, index: number) => ReactNode
  /** field path (string accessor) ใช้ตอนไม่ render เอง */
  dataIndex?: keyof T
  align?: 'left' | 'center' | 'right'
  width?: number | string
  sortable?: boolean
  /** filter dropdown ในหัวคอลัมน์ (Excel-style) */
  filter?: DataTableColumnFilter
  /** ตัดข้อความยาวด้วย … (max-width = width). content ต้องเป็น text/inline */
  truncate?: boolean
  /** sort key ส่งกลับใน onSort (default = key) */
  sortKey?: string
  className?: string
  headerClassName?: string
  /** sticky column — stays visible during horizontal scroll. ใช้กับ action column (right) ทั่วระบบ */
  fixed?: 'left' | 'right'
  /** group header (สองแถว) — คอลัมน์ที่ group เดียวกันติดกันรวมเป็น cell เดียวแถวบน. ไม่ใส่ = span 2 แถว */
  group?: string
}

/**
 * สิ่งที่ `renderRow` ได้รับ เพื่อประกอบ `<tr>` เอง
 *
 * มีไว้ให้แถวที่ต้องผูก ref กับ `<tr>` — การลากจัดลำดับเป็นเคสเดียวที่มีตอนนี้
 * `useSortable` ต้องเรียกเป็น hook ต่อแถว ซึ่งทำใน `.map()` ข้างในตารางไม่ได้
 */
export type DataTableRowRenderArgs = {
  row: unknown
  key: string | number
  /** `<td>` ทุกช่องของแถวนี้ ประกอบมาแล้วตาม `columns` */
  cells: ReactNode
  /** prop ที่ `<tr>` ต้องได้รับ — คลิก · สีแถว · สถานะเลือก */
  rowProps: {
    'data-selected': true | undefined
    onClick: (() => void) | undefined
    style: CSSProperties | undefined
    className: string | undefined
  }
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  /** Initial load — data ยังไม่มีเลย. แสดง "กำลังโหลด..." in body */
  loading?: boolean
  /** Refetch — data มีอยู่แล้ว แต่ background fetch. แสดง top progress bar */
  fetching?: boolean
  rowKey?: keyof T | ((row: T) => string | number)
  emptyText?: string
  className?: string
  /** controlled sort */
  sort?: { column: string; direction: SortDirection }
  onSort?: (column: string, direction: SortDirection) => void
  onRowClick?: (row: T) => void
  /**
   * รายละเอียดที่กางออกใต้แถว — **คืน `null` แปลว่าแถวนั้นกางไม่ได้**
   *
   * แถวที่กางได้จะมีปุ่มลูกศรที่คอลัมน์แรก · คลิกที่แถวก็กางเหมือนกัน เว้นแต่หน้านั้น
   * ผูก `onRowClick` ไว้แล้ว ซึ่งแปลว่าคลิกแถวมีความหมายอื่นอยู่ก่อน
   */
  renderExpanded?: (row: T) => ReactNode
  selectedRowKey?: string | number
  rowClassName?: (row: T) => string | undefined
  /** Inline per-row style — beats `:hover` bg classes (use for status/flag row tint that must persist on hover) */
  rowStyle?: (row: T) => CSSProperties | undefined
  /** server-side pagination — footer with prev/next + page info (data = current page only) */
  pagination?: DataTablePaginationState
  /**
   * ประกอบ `<tr>` เอง แทนที่จะให้ตารางสร้างให้
   *
   * ไม่ส่งมา = ตารางสร้าง `<tr>` ปกติ · ส่งมาเมื่อแถวต้องมี ref ของตัวเอง
   * ซึ่งตอนนี้มีเคสเดียวคือลากจัดลำดับ (ดู `DataTableRowRenderArgs`)
   */
  renderRow?: (args: DataTableRowRenderArgs) => ReactNode
}

const ALIGN_CLASS = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const

/** Column sizing. `width: 'fit-content'` shrink-wraps to content (1px preferred + nowrap → the cell
 * grows only to its content and the table's slack flows to the flex columns instead of bloating it);
 * a number/string width is pinned (width + minWidth). */
function colSizeStyle<T>(col: DataTableColumn<T>): CSSProperties | undefined {
  if (col.width === 'fit-content') return { width: '1px', whiteSpace: 'nowrap' }
  if (col.width != null) return { width: col.width, minWidth: col.width }
  return undefined
}

export function DataTable<T>({
  columns,
  data,
  loading,
  fetching,
  rowKey = 'id' as keyof T,
  emptyText = 'ไม่มีข้อมูล',
  className,
  sort,
  onSort,
  onRowClick,
  renderExpanded,
  selectedRowKey,
  rowClassName,
  rowStyle,
  pagination,
  renderRow,
}: DataTableProps<T>) {
  const getKey = (row: T, idx: number): string | number => {
    if (typeof rowKey === 'function') return rowKey(row)
    return (row[rowKey] as unknown as string | number) ?? idx
  }

  const handleSort = (col: DataTableColumn<T>) => {
    if (!col.sortable || !onSort) return
    const key = col.sortKey ?? col.key
    // loop ไม่ตัน: (ไม่ sort) → asc → desc → (ไม่ sort) → ...
    const current = sort?.column === key ? (sort?.direction ?? null) : null
    const next: SortDirection = current === null ? 'asc' : current === 'asc' ? 'desc' : null
    onSort(key, next)
  }

  // Show progress bar whenever loading OR fetching — applies both to first load
  // (empty data) and re-fetch (already has data). Avoid blocking the table with
  // text — let header + rows render; bar floats on top.
  const showProgressBar = loading || fetching
  const isInitialLoading = loading && data.length === 0
  const hasGroups = columns.some((c) => c.group != null)
  // ต้น/ท้ายกลุ่ม (group != null และต่างจาก column ข้างเคียง) → วาดเส้นแบ่งซ้าย/ขวา ปิดขอบกลุ่มทั้งสองด้าน
  /** แถวที่กางอยู่ — คีย์เดียวกับ `rowKey` ที่ตารางใช้ */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())

  const groupStartKeys = new Set(
    columns
      .filter((c, i) => c.group != null && columns[i - 1]?.group !== c.group)
      .map((c) => c.key),
  )
  const groupEndKeys = new Set(
    columns
      .filter((c, i) => c.group != null && columns[i + 1]?.group !== c.group)
      .map((c) => c.key),
  )

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="relative isolate min-h-0 flex-1 overflow-auto rounded-md border bg-card">
        {showProgressBar && (
          <div
            aria-hidden
            className="indeterminate-bar pointer-events-none absolute inset-x-0 top-0 z-30 h-0.5 text-primary"
          />
        )}
        {/* ใช้ <table> ตรง (ไม่ผ่าน <Table> ที่มี inner div overflow-x-auto) — inner wrapper สร้าง scroll
            context ซ้อน ทำให้ sticky header อ้าง wrapper (ไม่ scroll y) แทน outer container → ไม่ค้าง.
            outer div (overflow-auto ด้านบน) คุม scroll ทั้ง 2 แกน → sticky top-0 ของ th อ้าง outer = ค้างจริง. */}
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            {hasGroups ? (
              <>
                <TableRow>{buildGroupCells(columns, sort, handleSort)}</TableRow>
                <TableRow>
                  {columns.map((col) =>
                    col.group
                      ? renderHeadCell(
                          col,
                          sort,
                          handleSort,
                          undefined,
                          groupStartKeys.has(col.key),
                          groupEndKeys.has(col.key),
                        )
                      : null,
                  )}
                </TableRow>
              </>
            ) : (
              <TableRow>{columns.map((col) => renderHeadCell(col, sort, handleSort))}</TableRow>
            )}
          </TableHeader>
          <TableBody>
            {isInitialLoading ? (
              // Initial load: show empty body — progress bar on top handles the indicator
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24" />
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, idx) => {
                const key = getKey(row, idx)
                const selected = selectedRowKey !== undefined && key === selectedRowKey
                const cells = (
                  <DataTableCells
                    row={row}
                    idx={idx}
                    columns={columns}
                    groupStartKeys={groupStartKeys}
                    groupEndKeys={groupEndKeys}
                  />
                )
                const rowProps = {
                  'data-selected': selected || undefined,
                  onClick: onRowClick ? () => onRowClick(row) : undefined,
                  style: rowStyle?.(row),
                  className: cn(
                    onRowClick && 'cursor-pointer',
                    selected && 'bg-accent/60',
                    rowClassName?.(row),
                  ),
                }

                /**
                 * แถวที่ลากได้ ต้องให้ `renderRow` เป็นคนสร้าง `<tr>`
                 *
                 * `useSortable` ต้องผูก ref กับ `<tr>` ตัวจริง และ hook เรียกใน map
                 * ตรงนี้ไม่ได้ · คนเรียกจึงส่งฟังก์ชันมาแทน แล้วห่อเอง
                 */
                if (renderRow) return renderRow({ row, key, cells, rowProps })

                const detail = renderExpanded?.(row) ?? null
                const isOpen = expanded.has(String(key))

                /*
                 * แถวรายละเอียดเป็น `<tr>` ของตัวเอง ไม่ใช่กล่องซ้อนในเซลล์
                 *
                 * ซ้อนในเซลล์แล้วความกว้างผูกกับคอลัมน์นั้นคอลัมน์เดียว · รายละเอียด
                 * ต้องใช้ทั้งแถว จึงต้อง `colSpan` เต็มจำนวนคอลัมน์
                 */
                return (
                  <Fragment key={key}>
                    <TableRow
                      {...rowProps}
                      onClick={
                        detail !== null && !onRowClick
                          ? () =>
                              setExpanded((prev) => {
                                const next = new Set(prev)
                                if (next.has(String(key))) next.delete(String(key))
                                else next.add(String(key))
                                return next
                              })
                          : rowProps.onClick
                      }
                      className={cn(rowProps.className, detail !== null && 'cursor-pointer')}
                    >
                      {cells}
                    </TableRow>

                    {detail !== null && isOpen && (
                      <TableRow className="hover:bg-transparent">
                        <td colSpan={columns.length} className="border-t bg-muted/20 p-0">
                          {detail}
                        </td>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })
            )}
          </TableBody>
        </table>
      </div>
      {pagination && <DataTablePagination {...pagination} />}
    </div>
  )
}

/**
 * `<td>` ทุกช่องของหนึ่งแถว
 *
 * แยกออกมาเพราะ `renderRow` ต้องได้ cells ที่ประกอบเสร็จแล้ว ไปวางใน `<tr>` ของตัวเอง
 */
function DataTableCells<T>({
  row,
  idx,
  columns,
  groupStartKeys,
  groupEndKeys,
}: {
  row: T
  idx: number
  columns: DataTableColumn<T>[]
  groupStartKeys: Set<string>
  groupEndKeys: Set<string>
}) {
  return (
    <>
      {columns.map((col) => {
        const content = col.render
          ? col.render(row, idx)
          : col.dataIndex
            ? (row[col.dataIndex] as ReactNode)
            : null
        const fixedClass =
          col.fixed === 'right'
            ? 'sticky right-0 z-10 bg-background shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.08)]'
            : col.fixed === 'left'
              ? 'sticky left-0 z-10 bg-background shadow-[4px_0_6px_-4px_rgba(0,0,0,0.08)]'
              : undefined
        const cellStyle =
          col.width === 'fit-content'
            ? colSizeStyle(col)
            : col.truncate && typeof col.width === 'number'
              ? { maxWidth: col.width }
              : undefined
        return (
          <TableCell
            key={col.key}
            style={cellStyle}
            className={cn(
              col.align && ALIGN_CLASS[col.align],
              fixedClass,
              groupStartKeys.has(col.key) && 'border-border border-l',
              groupEndKeys.has(col.key) && 'border-border border-r',
              col.truncate && 'overflow-hidden',
              col.className,
            )}
          >
            {col.truncate ? <div className="truncate">{content}</div> : content}
          </TableCell>
        )
      })}
    </>
  )
}

/** หัวคอลัมน์ปกติ (sort/filter อยู่แถวนี้). ใช้ทั้ง single-row + แถวล่างของ grouped layout */
function renderHeadCell<T>(
  col: DataTableColumn<T>,
  sort: { column: string; direction: SortDirection } | undefined,
  handleSort: (col: DataTableColumn<T>) => void,
  rowSpan?: number,
  borderLeft?: boolean,
  borderRight?: boolean,
) {
  const sortKey = col.sortKey ?? col.key
  const isActive = sort?.column === sortKey
  const dir = isActive ? sort?.direction : null
  // filter active = ติ๊กไม่ครบ (กรองอยู่) → highlight หัวคอลัมน์เหมือน sort
  const filterActive = col.filter ? col.filter.selected.size < col.filter.options.length : false
  const style = colSizeStyle(col)
  const fixedClass =
    col.fixed === 'right'
      ? 'sticky right-0 z-20 bg-background shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.08)]'
      : col.fixed === 'left'
        ? 'sticky left-0 z-20 bg-background shadow-[4px_0_6px_-4px_rgba(0,0,0,0.08)]'
        : undefined
  return (
    <TableHead
      key={col.key}
      rowSpan={rowSpan}
      style={style}
      className={cn(
        // sticky header — th ค้างบนสุดตอน scroll แนวตั้ง (bg ทึบกัน body ทะลุ). sticky บน th ไม่ใช่ thead
        // (thead sticky ไม่ reliable ทุก browser). fixedClass (sticky column, z-20) override z → corner บนสุด.
        'sticky top-0 z-10 bg-background',
        col.align && ALIGN_CLASS[col.align],
        col.sortable && 'cursor-pointer select-none transition-colors',
        (isActive || filterActive) && 'text-primary',
        borderLeft && 'border-border border-l',
        borderRight && 'border-border border-r',
        fixedClass,
        col.headerClassName,
      )}
      onClick={col.sortable ? () => handleSort(col) : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {col.title}
        {col.sortable && <SortIcon direction={dir ?? null} active={isActive} />}
        {col.filter && <ColumnFilter filter={col.filter} />}
      </span>
    </TableHead>
  )
}

/** แถวบนของ grouped header — รวม cell ที่ group ติดกัน (colSpan); ไม่มี group = rowSpan 2 (เป็น header เต็มเอง) */
function buildGroupCells<T>(
  columns: DataTableColumn<T>[],
  sort: { column: string; direction: SortDirection } | undefined,
  handleSort: (col: DataTableColumn<T>) => void,
) {
  const cells: ReactNode[] = []
  let i = 0
  while (i < columns.length) {
    const col = columns[i]
    if (!col) break
    if (col.group == null) {
      // ไม่มี group → cell เต็ม span 2 แถว (sort/filter วาดที่นี่เพราะไม่มีในแถวล่าง)
      cells.push(renderHeadCell(col, sort, handleSort, 2))
      i += 1
      continue
    }
    let span = 1
    while (i + span < columns.length && columns[i + span]?.group === col.group) span += 1
    cells.push(
      <TableHead
        key={`group-${col.group}-${col.key}`}
        colSpan={span}
        className="border-border border-r border-l text-center font-medium text-sm"
      >
        {col.group}
      </TableHead>,
    )
    i += span
  }
  return cells
}

function DataTablePagination({
  page,
  limit,
  total,
  onPageChange,
  onLimitChange,
}: DataTablePaginationState) {
  const pageCount = Math.max(1, Math.ceil(total / limit))
  const start = total === 0 ? 0 : (page - 1) * limit + 1
  const end = Math.min(page * limit, total)
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 px-1 pt-2 text-sm">
      <span className="text-muted-foreground">
        {start}–{end} จาก {total.toLocaleString('th-TH')} รายการ
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="หน้าก่อนหน้า"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-muted-foreground">
          หน้า {page} / {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          aria-label="หน้าถัดไป"
        >
          <ChevronRight className="size-4" />
        </Button>
        {onLimitChange && (
          <Select value={String(limit)} onValueChange={(v) => v && onLimitChange(Number(v))}>
            <SelectTrigger className="ml-1 h-8 w-24" aria-label="จำนวนต่อหน้า">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / หน้า
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  )
}

function ColumnFilter({ filter }: { filter: DataTableColumnFilter }) {
  // active (primary) เฉพาะตอนกรองจริง — ติ๊กครบ (size === options.length) = ไม่กรอง = เทา
  const active = filter.selected.size < filter.options.length
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            aria-label="กรองคอลัมน์"
            className={cn(
              'inline-flex cursor-pointer rounded p-0.5 hover:bg-muted',
              active ? 'text-primary' : 'text-muted-foreground/60',
            )}
          >
            <ListFilter className="size-3.5" />
          </button>
        }
      />
      <PopoverContent
        align="start"
        className="flex max-h-[min(60vh,24rem)] w-52 flex-col p-0"
        // base-ui portal: React event bubble ผ่าน React tree → กันคลิกใน popover ทะลุขึ้น header (handleSort)
        onClick={(e) => e.stopPropagation()}
      >
        {/* header: ปุ่มล้างกรอง (กลับเลือกครบ) — disabled เมื่อไม่ได้กรอง */}
        {filter.onReset && (
          <div className="flex items-center justify-between border-b px-2 py-1">
            <span className="text-muted-foreground text-xs">กรองคอลัมน์</span>
            <button
              type="button"
              onClick={() => filter.onReset?.()}
              disabled={!active}
              className={cn(
                'rounded px-1.5 py-0.5 text-xs',
                active
                  ? 'cursor-pointer text-primary hover:bg-muted'
                  : 'cursor-default text-muted-foreground/50',
              )}
            >
              ล้าง
            </button>
          </div>
        )}
        <div className="flex flex-col overflow-y-auto p-1.5">
          {filter.options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => filter.onToggle(o.value)}
              className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left font-normal text-sm hover:bg-accent"
            >
              <Checkbox checked={filter.selected.has(o.value)} className="pointer-events-none" />
              {o.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SortIcon({ direction, active }: { direction: SortDirection; active: boolean }) {
  if (!active || !direction) return <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
  return direction === 'asc' ? (
    <ChevronUp className="h-3.5 w-3.5" />
  ) : (
    <ChevronDown className="h-3.5 w-3.5" />
  )
}
