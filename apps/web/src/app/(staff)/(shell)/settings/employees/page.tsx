'use client'

import { Ban, Plus, RotateCcw, UserCog } from 'lucide-react'
import { parseAsInteger, useQueryState } from 'nuqs'
import { Suspense, useMemo, useState } from 'react'
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
import { useDepartmentOptions } from '@/features/department/hooks'
import type { Employee } from '@/features/employee/api'
import {
  EMPLOYEE_PAGE_SIZE,
  useDeleteEmployee,
  useEmployees,
  useSetEmployeeWorkStatus,
} from '@/features/employee/hooks'
import { usePositionOptions } from '@/features/position/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { HR_WRITE } from '@/lib/permissions'
import { useDebounce } from '@/lib/use-debounce'
import { cn } from '@/lib/utils'

import { EmployeeDialog } from './employee-dialog'
import { UserAccountDialog } from './user-account-dialog'

const NOUN = 'พนักงาน'

export default function EmployeesPage() {
  /**
   * `useQueryState` อ่าน `useSearchParams` ข้างใน ซึ่ง Next บังคับให้อยู่ใน `Suspense`
   * ไม่ห่อแล้ว `next build` ตกทั้งหน้า ทั้งที่ `dev` กับ `typecheck` เขียวสนิท
   */
  return (
    <Suspense fallback={null}>
      <EmployeeList />
    </Suspense>
  )
}

function EmployeeList() {
  const [search, setSearch] = useQueryState('q', { defaultValue: '', clearOnDefault: true })
  /**
   * หน้าอยู่ใน URL เหมือนคำค้น — ส่งลิงก์ของหน้าที่ 3 ให้กันได้ และปุ่มย้อนกลับ
   * พากลับไปหน้าที่เพิ่งดู ไม่ใช่หน้าแรก
   */
  const [page, setPage] = useQueryState('page', parseAsInteger.withDefault(1))
  // ยิงตามทุกตัวอักษรคือ request หนึ่งใบต่อการกดคีย์หนึ่งครั้ง
  const debouncedSearch = useDebounce(search, 300)

  const canWrite = useCan(HR_WRITE)

  const { data, isPending, isFetching, isError, error } = useEmployees(debouncedSearch, page)
  // ชื่อของทะเบียนแม่ — ตารางพนักงานคืนมาแค่ id
  // แปลง id เป็นชื่อในตาราง — `/lookup` ให้ `id` กับ `name` ซึ่งคือทั้งหมดที่ตรงนี้ใช้
  const departments = useDepartmentOptions()
  const positions = usePositionOptions()

  const remove = useDeleteEmployee()
  const workStatus = useSetEmployeeWorkStatus()

  const [dialog, setDialog] = useState<{ mode: DialogMode; row: Employee | null; open: boolean }>({
    mode: 'create',
    row: null,
    open: false,
  })
  const [pendingDelete, setPendingDelete] = useState<Employee | null>(null)
  /**
   * แถวที่กำลังจัดการบัญชีให้ · `null` = กล่องปิด
   *
   * แยกจาก `dialog` ของข้อมูลพนักงาน — สองกล่องคนละเรื่อง เปิดพร้อมกันไม่ได้
   * แต่ก็ไม่ควรใช้ state เดียวกัน เพราะกล่องหนึ่งมี `mode` อีกกล่องไม่มี
   */
  const [accountFor, setAccountFor] = useState<Employee | null>(null)
  /** แถวที่กำลังจะเปลี่ยนสภาพ — ต้องยืนยันก่อน เพราะมันตัดสิทธิ์เข้าระบบของคน */
  const [pendingStatus, setPendingStatus] = useState<Employee | null>(null)

  const isSearching = debouncedSearch.length > 0

  /** หาไว้ล่วงหน้าแทนที่จะไล่หาใหม่ทุกแถว */
  const nameById = useMemo(() => {
    const build = (rows: ReadonlyArray<{ id: number; name: string }> | undefined) => {
      const map = new Map<number, string>()
      for (const row of rows ?? []) map.set(row.id, row.name)
      return map
    }
    return {
      department: build(departments.data),
      position: build(positions.data),
    }
  }, [departments.data, positions.data])

  function openDialog(mode: DialogMode, row: Employee | null) {
    setDialog({ mode, row, open: true })
  }

  /** ค่าที่หาไม่เจอแสดงขีด ไม่ใช่ช่องว่าง — ช่องว่างอ่านเหมือนคอลัมน์พัง */
  const lookup = (map: Map<number, string>, id: number | null) =>
    id === null ? '—' : (map.get(id) ?? '—')

  const columns: DataTableColumn<Employee>[] = [
    { key: 'code', title: 'รหัส', width: 110, dataIndex: 'code' },
    {
      key: 'name',
      title: 'ชื่อ-สกุล',
      truncate: true,
      render: (row) => `${row.firstName} ${row.lastName}`,
    },
    { key: 'nickname', title: 'ชื่อเล่น', width: 120, truncate: true, dataIndex: 'nickname' },
    {
      key: 'phone',
      title: 'เบอร์โทร',
      width: 130,
      truncate: true,
      dataIndex: 'phone',
    },
    {
      key: 'departmentId',
      title: 'แผนก',
      width: 150,
      truncate: true,
      render: (row) => lookup(nameById.department, row.departmentId),
    },
    {
      key: 'positionId',
      title: 'ตำแหน่ง',
      width: 150,
      truncate: true,
      render: (row) => lookup(nameById.position, row.positionId),
    },
    {
      key: 'workStatus',
      title: 'สถานะ',
      width: 100,
      align: 'center',
      render: (row) => (
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs',
            row.workStatus === 'ACTIVE'
              ? 'bg-emerald-500/10 text-emerald-700'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {row.workStatus === 'ACTIVE' ? 'ทำงานอยู่' : 'พ้นสภาพ'}
        </span>
      ),
    },
    {
      key: 'actions',
      title: 'จัดการ',
      width: 160,
      align: 'right',
      // ปุ่มยังอยู่ตอนเลื่อนตารางแนวนอน — ตารางนี้กว้างเกินจอแคบ
      fixed: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-0.5">
          {/*
            ปุ่มเปลี่ยนสภาพอยู่ในแถว แยกจาก RowActions เพราะมันไม่ใช่การแก้ข้อมูล —
            มันตัดสิทธิ์เข้าระบบของคน และมี endpoint ของตัวเอง
          */}
          {canWrite && <WorkStatusAction row={row} onClick={() => setPendingStatus(row)} />}

          {/*
            บัญชีเข้าระบบเป็นเรื่องของตัวเอง — ดินสอแก้ข้อมูลพนักงาน ปุ่มนี้เปิดกล่อง
            ที่จัดการบัญชีทั้งหมด (ผู้ใช้ตัดสิน 2026-08-26)
          */}
          <AccountAction row={row} onClick={() => setAccountFor(row)} />

          <RowActions
            label={`${row.firstName} ${row.lastName}`}
            canWrite={canWrite}
            onView={() => openDialog('view', row)}
            onEdit={() => openDialog('edit', row)}
            onDelete={() => setPendingDelete(row)}
          />
        </div>
      ),
    },
  ]

  async function handleDelete() {
    if (!pendingDelete) return
    // จับชื่อไว้ก่อน — endpoint ลบคืน null และแถวหายจากตารางทันทีที่สำเร็จ
    const name = `${pendingDelete.firstName} ${pendingDelete.lastName}`
    try {
      await remove.mutateAsync(pendingDelete.id)
      setPendingDelete(null)
      toast.success(`ลบ${NOUN} "${name}" แล้ว`)
    } catch (err) {
      toast.error(toErrorMessage(err))
    }
  }

  async function handleWorkStatus() {
    if (!pendingStatus) return
    const next = pendingStatus.workStatus === 'ACTIVE' ? 'TERMINATED' : 'ACTIVE'
    try {
      const saved = await workStatus.mutateAsync({ id: pendingStatus.id, workStatus: next })
      setPendingStatus(null)
      toast.success(
        saved.workStatus === 'ACTIVE'
          ? `รับ "${saved.firstName} ${saved.lastName}" กลับเข้าทำงานแล้ว`
          : `"${saved.firstName} ${saved.lastName}" พ้นสภาพแล้ว`,
      )
    } catch (err) {
      toast.error(toErrorMessage(err))
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <ListToolbar
        searchLabel={`ค้นหา${NOUN}`}
        search={search}
        onSearchChange={(value) => {
          setSearch(value)
          // คำค้นใหม่ = ผลชุดใหม่ · ค้างอยู่หน้า 3 ของผลเก่าคือหน้าที่มักจะว่างเปล่า
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

      {/*
        `DataTable` ตรง ๆ ไม่ผ่าน `SortableDataTable` — ตารางนี้ไม่มี `sortOrder`
        และแบ่งหน้า · ลากจัดลำดับข้ามหน้าไม่ได้อยู่แล้ว
      */}
      <PageHint>พนักงานคือคนที่ระบบรู้จัก แยกจากบัญชีผู้ใช้ที่ใช้ล็อกอิน — คนที่ต้องเข้าระบบต้องมีทั้งสองอย่าง</PageHint>

      <DataTable<Employee>
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
          limit: data?.page.pageSize ?? EMPLOYEE_PAGE_SIZE,
          total: data?.page.total ?? 0,
          onPageChange: setPage,
        }}
      />

      <EmployeeDialog
        mode={dialog.mode}
        row={dialog.row}
        open={dialog.open}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
        onCreateAccount={(saved) => setAccountFor(saved)}
      />

      <UserAccountDialog
        employee={accountFor}
        open={accountFor !== null}
        onOpenChange={(open) => {
          if (!open) setAccountFor(null)
        }}
        canWrite={canWrite}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title={`ลบ${NOUN}`}
        description={`ต้องการลบ "${pendingDelete?.firstName ?? ''} ${pendingDelete?.lastName ?? ''}" ใช่หรือไม่`}
        actionText="ลบ"
        onAction={handleDelete}
        pending={remove.isPending}
      />

      <ConfirmDialog
        open={pendingStatus !== null}
        onOpenChange={(open) => {
          if (!open) setPendingStatus(null)
        }}
        title={pendingStatus?.workStatus === 'ACTIVE' ? 'ให้พ้นสภาพ' : 'รับกลับเข้าทำงาน'}
        description={
          pendingStatus?.workStatus === 'ACTIVE'
            ? `"${pendingStatus?.firstName} ${pendingStatus?.lastName}" จะเข้าระบบไม่ได้อีก บัญชียังอยู่แต่ถูกระงับ`
            : `"${pendingStatus?.firstName} ${pendingStatus?.lastName}" จะกลับเข้าระบบได้ตามปกติ`
        }
        actionText={pendingStatus?.workStatus === 'ACTIVE' ? 'ให้พ้นสภาพ' : 'รับกลับ'}
        onAction={handleWorkStatus}
        pending={workStatus.isPending}
      />
    </div>
  )
}

/**
 * ปุ่มเปลี่ยนสภาพการทำงาน — ไอคอนคนละตัวตามสถานะปัจจุบัน
 *
 * มีคำอธิบายตอนชี้เหมือนปุ่มอื่นในแถว · ไอคอนคนมีกากบาทกับคนมีถูก แยกออกยาก
 * ถ้าไม่มีคำกำกับ และการกดผิดที่นี่คือการตัดสิทธิ์เข้าระบบของคน
 */
function WorkStatusAction({ row, onClick }: { row: Employee; onClick: () => void }) {
  const name = `${row.firstName} ${row.lastName}`
  const label = row.workStatus === 'ACTIVE' ? `ให้พ้นสภาพ ${name}` : `รับกลับเข้าทำงาน ${name}`

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            onClick={onClick}
            /* สีบอกทิศทางของการกด — ส้มคือตัดออกจากงาน เขียวคือรับกลับเข้ามา */
            className={
              row.workStatus === 'ACTIVE'
                ? 'text-orange-600/80 hover:bg-orange-100 hover:text-orange-700'
                : 'text-emerald-600/80 hover:bg-emerald-100 hover:text-emerald-700'
            }
          >
            {row.workStatus === 'ACTIVE' ? (
              <Ban className="size-3.5" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * ปุ่มเปิดกล่องบัญชีเข้าระบบ
 *
 * **ทุกคนเห็น ไม่ใช่เฉพาะคนที่แก้ได้** — คนที่ดูได้อย่างเดียวยังต้องรู้ว่าใครมีบัญชี
 * และบัญชีนั้นถูกระงับอยู่ไหม · กล่องข้างในเป็นตัวตัดสินเองว่าจะให้แก้อะไรได้บ้าง
 *
 * รูปคนกับฟันเฟือง — เรื่องนี้คือการจัดการ "ผู้ใช้" คนหนึ่ง (ผู้ใช้ตัดสิน 2026-08-27) ·
 * ส่วนสภาพการทำงานใช้เครื่องหมายห้าม ซึ่งบอกสถานะของการจ้าง ไม่ใช่ของตัวคน
 */
function AccountAction({ row, onClick }: { row: Employee; onClick: () => void }) {
  const label = `บัญชีเข้าระบบของ ${row.firstName} ${row.lastName}`

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            onClick={onClick}
            className="text-primary-strong hover:bg-primary/10"
          >
            <UserCog className="size-3.5" />
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
