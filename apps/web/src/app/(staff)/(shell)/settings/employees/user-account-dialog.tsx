'use client'

import { KeyRound, Lock, ShieldBan, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { AppForm } from '@/components/common/app-form'
import { AppFormField } from '@/components/common/app-form-field'
import { ComboboxField } from '@/components/common/combobox-field'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { Employee } from '@/features/employee/api'
import { useRoleOptions } from '@/features/role/hooks'
import { accountStatus } from '@/features/user/api'
import {
  useCreateUser,
  useResetPassword,
  useSuspendUser,
  useUnlockUser,
  useUnsuspendUser,
  useUpdateUser,
  useUserByEmployee,
} from '@/features/user/hooks'
import { toErrorMessage } from '@/lib/api-client'

/** ยาวสุดที่ BE รับ — `USERNAME_MAX` ใน `apps/api/src/modules/user/user.service.ts` */
const USERNAME_MAX = 50

const schema = z.object({
  username: z
    .string()
    .trim()
    .min(1, 'กรอกชื่อผู้ใช้')
    .max(USERNAME_MAX, `ยาวเกิน ${USERNAME_MAX} ตัวอักษร`),
  roleId: z.number({ message: 'เลือกบทบาท' }),
})

type FormValues = z.infer<typeof schema>

/** ผูกปุ่มบันทึกที่อยู่ท้ายกล่อง เข้ากับฟอร์มที่อยู่กลางกล่อง */
const FORM_ID = 'user-account-form'

/**
 * กล่องจัดการบัญชีเข้าระบบของพนักงานหนึ่งคน
 *
 * **ทุกอย่างที่เกี่ยวกับบัญชีอยู่ในกล่องนี้กล่องเดียว** (ผู้ใช้ตัดสิน 2026-08-26) —
 * เปิดบัญชี · แก้ชื่อผู้ใช้และบทบาท · รีเซ็ตรหัส · ระงับ · ปลดระงับ · ปลดล็อก
 *
 * แยกจากกล่องแก้ข้อมูลพนักงานโดยตั้งใจ · การให้สิทธิ์เข้าระบบไม่ใช่เรื่องเดียวกับ
 * การแก้ชื่อเล่นหรือย้ายแผนก และมันอยู่คนละ endpoint คนละสิทธิ์ · รวมกันเมื่อไหร่
 * คนที่กดบันทึกข้อมูลทั่วไปจะเปลี่ยนบทบาทของใครไปโดยไม่รู้ตัว
 *
 * **ไม่ใช้ `FormDialog`** — กล่องนี้มีสองหน้าตาตามว่ามีบัญชีอยู่หรือยัง และมีปุ่มที่
 * ไม่ใช่ "บันทึก" อยู่ด้วยหลายตัว · ยัดเข้า `FormDialog` ต้องเพิ่ม flag ให้ของกลาง
 * ซึ่งเป็นสิ่งที่เลิกทำไปแล้ว (`docs/standards/web-conventions.md`)
 */
export function UserAccountDialog({
  employee,
  open,
  onOpenChange,
  canWrite,
}: {
  /** พนักงานที่กำลังจัดการบัญชีให้ · `null` = ยังไม่ได้เลือกแถว */
  employee: Employee | null
  open: boolean
  onOpenChange: (open: boolean) => void
  canWrite: boolean
}) {
  const employeeId = employee?.id ?? 0

  // ถามเฉพาะตอนกล่องเปิดและรู้ว่าถามถึงใคร — ไม่งั้นยิงทุกครั้งที่ตารางรีเรนเดอร์
  const account = useUserByEmployee(employeeId, open && employeeId > 0)
  const roles = useRoleOptions()

  const create = useCreateUser(employeeId)
  const update = useUpdateUser(employeeId)
  const reset = useResetPassword(employeeId)
  const suspend = useSuspendUser(employeeId)
  const unsuspend = useUnsuspendUser(employeeId)
  const unlock = useUnlockUser(employeeId)

  /**
   * รหัสที่เพิ่งได้มา — **อยู่ใน state ของกล่องนี้เท่านั้น ไม่เข้า cache**
   *
   * BE ส่งมาครั้งเดียวตอนเปิดบัญชีและตอนรีเซ็ต · เก็บลง query cache เมื่อไหร่
   * มันจะอยู่ในหน่วยความจำต่อไปหลังกล่องปิด และโผล่กลับมาตอนเปิดกล่องครั้งหน้า
   */
  const [freshPassword, setFreshPassword] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<'suspend' | null>(null)

  // ปิดกล่องแล้วรหัสต้องหายไปจริง — เปิดใหม่ต้องไม่เห็นของเก่า
  useEffect(() => {
    if (!open) setFreshPassword(null)
  }, [open])

  const row = account.data ?? null
  const status = accountStatus(row)
  const pending =
    create.isPending ||
    update.isPending ||
    reset.isPending ||
    suspend.isPending ||
    unsuspend.isPending ||
    unlock.isPending

  async function handleSubmit(values: FormValues): Promise<void> {
    try {
      if (row) {
        const saved = await update.mutateAsync({ id: row.id, ...values })
        toast.success(`แก้บัญชี "${saved.username}" แล้ว`)
        return
      }

      const created = await create.mutateAsync({ ...values, employeeId })
      // รหัสขึ้นในกล่อง ไม่ใช่ใน toast — toast หายไปเองใน 4 วินาที
      setFreshPassword(created.password)
      toast.success(`เปิดบัญชี "${created.username}" แล้ว`)
    } catch (err) {
      toast.error(toErrorMessage(err))
    }
  }

  /** ปุ่มสถานะที่ไม่ใช่ฟอร์ม — ทำงานทันที ไม่ต้องกดบันทึก */
  async function runAction(action: () => Promise<unknown>, message: string): Promise<void> {
    try {
      await action()
      toast.success(message)
    } catch (err) {
      toast.error(toErrorMessage(err))
    }
  }

  const name = employee ? `${employee.firstName} ${employee.lastName}` : ''

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{row ? `บัญชีของ ${name}` : `เปิดบัญชีให้ ${name}`}</DialogTitle>
          </DialogHeader>

          {account.isPending ? (
            <p className="py-6 text-center text-sm text-muted-foreground">กำลังโหลด</p>
          ) : account.isError ? (
            <p className="py-6 text-center text-sm text-destructive">
              {toErrorMessage(account.error)}
            </p>
          ) : (
            <>
              {/*
                รหัสผ่านขึ้นบนสุด — มันคือสิ่งที่คนเปิดกล่องมาเพื่อดู และเห็นได้ครั้งเดียว
                (ผู้ใช้ตัดสิน 2026-08-27) · วางไว้กลางกล่องแล้วมันแทรกอยู่ระหว่างฟอร์ม
                กับปุ่ม ซึ่งอ่านเหมือนเป็นช่องกรอกอีกอัน
              */}
              {freshPassword && <FreshPassword password={freshPassword} />}

              {row && <AccountStatusBanner status={status} lockCount={row.lockCount} />}

              {/*
                สองส่วนแยกกัน (ผู้ใช้ตัดสิน 2026-08-27)

                บน — **ข้อมูลของบัญชี** ที่แก้แล้วต้องกดบันทึก
                ล่าง — **การกระทำ** ที่ทำงานทันทีที่กด ไม่เกี่ยวกับสิ่งที่พิมพ์ค้างไว้

                ปนกันแล้วคนกดรีเซ็ตรหัสจะไม่รู้ว่าชื่อที่เพิ่งพิมพ์ถูกบันทึกไปด้วยหรือเปล่า
              */}
              <AppForm<FormValues>
                id={FORM_ID}
                schema={schema}
                // `key` บังคับให้ฟอร์มสร้างใหม่เมื่อสลับพนักงาน หรือเมื่อบัญชีเพิ่งเกิด
                key={row?.id ?? `new-${employeeId}`}
                defaultValues={{
                  username: row?.username ?? '',
                  // `undefined` ไม่ใช่ `null` ตอนยังไม่มีบัญชี — zod จะได้ฟ้องว่ายังไม่ได้เลือก
                  roleId: row?.roleId as number,
                }}
                onSubmit={handleSubmit}
                readOnly={!canWrite}
              >
                {(form) => (
                  /* ชื่อผู้ใช้กับบทบาทเป็นของบัญชีเดียวกัน — อยู่แถวเดียว */
                  <div className="grid gap-3 sm:grid-cols-2">
                    <AppFormField name="username" label="ชื่อผู้ใช้" required={canWrite}>
                      <Input
                        {...form.register('username')}
                        disabled={pending}
                        autoFocus={canWrite && !row}
                      />
                    </AppFormField>
                    <AppFormField name="roleId" label="บทบาท" required={canWrite}>
                      <ComboboxField
                        name="roleId"
                        options={roles.data ?? []}
                        placeholder="เลือกบทบาท"
                        disabled={pending}
                        readOnly={!canWrite}
                        required
                        loading={roles.isPending}
                      />
                    </AppFormField>
                  </div>
                )}
              </AppForm>

              {row && <LastLogin at={row.lastLoginAt} />}

              {/*
                การกระทำกับบัญชี — ทำงานทันทีที่กด ไม่ได้รอปุ่มบันทึก
                มีเฉพาะเมื่อบัญชีมีอยู่แล้ว และมีสิทธิ์เขียน
              */}
              {row && canWrite && (
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      runAction(async () => {
                        const { password } = await reset.mutateAsync(row.id)
                        setFreshPassword(password)
                      }, 'ตั้งรหัสใหม่ให้แล้ว')
                    }
                  >
                    <KeyRound className="size-4" />
                    รีเซ็ตรหัสผ่าน
                  </Button>

                  {/*
                    ดู `lockedAt` ตรง ๆ ไม่ใช่ `status`

                    `accountStatus` จัดลำดับให้เหลือคำเดียวเพื่อ**แสดงผล** — ติดทั้ง
                    ระงับและล็อกจะได้ `suspended` · เอามาคุมปุ่มแล้วปุ่มปลดล็อกหายไป
                    ทั้งที่บัญชียังล็อกอยู่จริง ผู้ใช้ต้องปลดระงับ ปิดกล่อง เปิดใหม่
                    ถึงจะเห็น (เจอจาก e2e 2026-08-27)
                  */}
                  {row.lockedAt !== null && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        runAction(() => unlock.mutateAsync(row.id), 'ปลดล็อกบัญชีแล้ว')
                      }
                    >
                      <Lock className="size-4" />
                      ปลดล็อก
                    </Button>
                  )}

                  {status === 'suspended' ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        runAction(() => unsuspend.mutateAsync(row.id), 'ปลดระงับบัญชีแล้ว')
                      }
                    >
                      <ShieldCheck className="size-4" />
                      ปลดระงับ
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={pending}
                      onClick={() => setPendingAction('suspend')}
                    >
                      <ShieldBan className="size-4" />
                      ระงับบัญชี
                    </Button>
                  )}
                </div>
              )}
            </>
          )}

          {/*
            ปุ่มยืนยันอยู่ท้ายกล่องที่เดียว — ที่เดียวกับทุกกล่องในระบบ

            `form` ชี้กลับไปที่ฟอร์มด้านบน ปุ่มจึง submit ได้ทั้งที่อยู่นอกฟอร์ม ·
            ก่อนหน้านี้ปุ่มบันทึกลอยอยู่กลางกล่องเพราะฟอร์มครอบมันอยู่ แล้วมีทั้ง
            รหัสผ่าน ปุ่มจัดการ และปุ่มปิด ต่อท้ายลงไปอีกสามชั้น
          */}
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline">
                  ปิด
                </Button>
              }
            />
            {canWrite && !account.isPending && !account.isError && (
              <Button type="submit" form={FORM_ID} variant="success" disabled={pending}>
                {row ? 'บันทึก' : 'เปิดบัญชี'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        ระงับถามยืนยันก่อน — มันตัดเซสชันที่เปิดอยู่ทันที คนที่กำลังทำงานค้างจะหลุดกลางคัน
        ส่วนรีเซ็ตรหัสไม่ถาม เพราะกดผิดแล้วกดใหม่ได้ ไม่มีอะไรหาย
      */}
      <ConfirmDialog
        open={pendingAction === 'suspend'}
        onOpenChange={(next) => {
          if (!next) setPendingAction(null)
        }}
        title="ระงับบัญชี"
        description={`"${row?.username ?? ''}" จะเข้าระบบไม่ได้อีก และเซสชันที่เปิดอยู่จะถูกตัดทันที`}
        actionText="ระงับบัญชี"
        pending={suspend.isPending}
        onAction={async () => {
          if (!row) return
          await runAction(() => suspend.mutateAsync(row.id), 'ระงับบัญชีแล้ว')
          setPendingAction(null)
        }}
      />
    </>
  )
}

/**
 * แถบบอกสถานะ — ขึ้นเฉพาะตอนบัญชีเข้าระบบไม่ได้
 *
 * บัญชีปกติไม่ต้องมีแถบบอกว่าปกติ · แถบที่ขึ้นตลอดเวลาคือแถบที่ไม่มีใครอ่าน
 */
function AccountStatusBanner({
  status,
  lockCount,
}: {
  status: ReturnType<typeof accountStatus>
  /** ถูกล็อกมาแล้วกี่ครั้ง — บอกว่าเป็นเรื่องซ้ำซากหรือครั้งเดียว */
  lockCount: number
}) {
  if (status === 'active' || status === 'none') return null

  const text =
    status === 'suspended'
      ? 'บัญชีนี้ถูกระงับ — เข้าระบบไม่ได้จนกว่าจะปลดระงับ'
      : `บัญชีนี้ถูกล็อกเพราะกรอกรหัสผิดหลายครั้ง — ปลดล็อกเพื่อให้ลองใหม่ได้${
          lockCount > 1 ? ` (ล็อกมาแล้ว ${lockCount} ครั้ง)` : ''
        }`

  return (
    <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{text}</p>
  )
}

/**
 * เข้าระบบล่าสุดเมื่อไหร่
 *
 * บัญชีที่ไม่เคยถูกใช้เลยเป็นเรื่องที่คนดูแลควรเห็น — อาจเปิดทิ้งไว้แล้วลืม
 * หรือเจ้าตัวไม่เคยได้รับรหัส
 */
function LastLogin({ at }: { at: string | null }) {
  return (
    <p className="text-xs text-muted-foreground">
      {at === null
        ? 'ยังไม่เคยเข้าระบบเลย'
        : `เข้าระบบล่าสุด ${new Date(at).toLocaleString('th-TH', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}`}
    </p>
  )
}

/**
 * รหัสที่เพิ่งได้มา
 *
 * **นี่คือครั้งเดียวที่มันแสดง** — BE ไม่มีเส้นไหนคืนรหัสซ้ำ และตารางเก็บแต่ hash ·
 * ข้อความจึงต้องบอกเรื่องนี้ให้ชัด ไม่ใช่โชว์ตัวเลขเฉย ๆ แล้วปล่อยให้คนปิดกล่องทิ้ง
 *
 * ตัวใหญ่ ระยะห่างระหว่างตัวอักษรกว้าง — รหัสนี้ถูกอ่านออกเสียงหรือพิมพ์ต่อ
 */
function FreshPassword({ password }: { password: string }) {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-3">
      <p className="text-sm font-medium text-foreground">รหัสผ่านใหม่</p>
      <p className="mt-1 font-mono text-xl tracking-widest text-foreground">{password}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        จดไว้แล้วส่งให้เจ้าของบัญชี — ปิดกล่องนี้แล้วดูอีกไม่ได้ ต้องรีเซ็ตใหม่ซึ่งได้คนละรหัส
      </p>
    </div>
  )
}
