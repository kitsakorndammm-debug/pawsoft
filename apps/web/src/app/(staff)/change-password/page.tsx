'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useChangePassword } from '@/features/auth/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { ROUTE_LOGIN } from '@/lib/routes'

/**
 * เปลี่ยนรหัสผ่านของตัวเอง
 *
 * **ไม่ถามรหัสเดิม** — เซสชันคือด่านแล้ว · และหน้านี้มีไว้ให้บัญชีที่ยังใช้รหัสที่
 * ผู้ดูแลออกให้ ซึ่งเขาก็รู้รหัสนั้นอยู่แล้ว
 *
 * สำเร็จแล้ว **ทุกเซสชันถูกถอนรวมของตัวเอง** จึงพากลับไปหน้าล็อกอินเสมอ
 */
export default function ChangePasswordPage() {
  const router = useRouter()
  const changePassword = useChangePassword()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const mismatch = confirm.length > 0 && password !== confirm

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (mismatch) return

    changePassword.mutate(password, {
      onSuccess: () => {
        toast.success('เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบใหม่')
        router.replace(ROUTE_LOGIN)
      },
      onError: (err) => toast.error(toErrorMessage(err)),
    })
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4 rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">ตั้งรหัสผ่านใหม่</h1>
          <p className="text-xs text-muted-foreground">
            ต้องตั้งรหัสของตัวเองก่อนเริ่มใช้งาน
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">
            รหัสผ่านใหม่ <span className="text-destructive">*</span>
            </Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">อย่างน้อย 6 ตัวอักษร</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm">
            ยืนยันรหัสผ่านใหม่ <span className="text-destructive">*</span>
            </Label>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            aria-invalid={mismatch}
          />
          {mismatch ? <p className="text-xs text-destructive">รหัสผ่านไม่ตรงกัน</p> : null}
        </div>

        {/* เขียว — ปุ่มนี้เขียนข้อมูล */}
        <Button type="submit" variant="success" disabled={changePassword.isPending || mismatch}>
          {changePassword.isPending ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่าน'}
        </Button>
      </form>
    </main>
  )
}
