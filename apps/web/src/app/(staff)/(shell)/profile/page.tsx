'use client'

import { type FormEvent, useState } from 'react'
import { UserCog } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SessionUser } from '@/features/auth/api'
import { useMe, useUpdateOtpEmail } from '@/features/auth/hooks'
import { toErrorMessage } from '@/lib/api-client'

/**
 * ข้อมูลส่วนตัว — ตอนนี้มีแค่ "อีเมลรับ OTP" (ผู้ใช้ตัดสิน 2026-09-18)
 *
 * **คนละอันกับอีเมลพนักงานที่ HR กรอกไว้ที่หน้า "พนักงาน"** — อันนั้นแก้ได้เฉพาะ
 * แอดมิน/HR อันนี้เจ้าของบัญชีแก้เอง ไม่มี permission key ใดกั้น เหมือน "เปลี่ยนรหัสผ่าน"
 *
 * เข้าถึงจากชื่อ/รูปประจำตัวที่แถบบนสุด ไม่มีในเมนู "ข้อมูลหลัก" เพราะไม่ใช่ทะเบียน
 */
function ProfileForm({ me }: { me: SessionUser }) {
  const updateEmail = useUpdateOtpEmail()
  const [email, setEmail] = useState(me.email ?? '')

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()

    const value = email.trim()

    updateEmail.mutate(value.length === 0 ? null : value, {
      onSuccess: (updated) => {
        toast.success(
          updated.email ? `ตั้งอีเมลรับ OTP เป็น "${updated.email}" แล้ว` : 'ล้างอีเมลรับ OTP แล้ว',
        )
      },
      onError: (err) => toast.error(toErrorMessage(err)),
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex max-w-md flex-col gap-4 rounded-lg border bg-card p-5"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="otp-email">อีเมลรับ OTP</Label>
        <Input
          id="otp-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={updateEmail.isPending}
        />
        <p className="text-xs text-muted-foreground">
          ใช้ส่งรหัสยืนยันตอนเข้าสู่ระบบเท่านั้น — คนละอันกับอีเมลติดต่อที่ HR กรอกไว้ใน
          ข้อมูลพนักงาน
        </p>
        {!me.email ? (
          <p className="text-xs text-amber-700">
            ยังไม่ได้ตั้งไว้ — ตอนนี้เข้าสู่ระบบด้วยรหัสผ่านอย่างเดียว
          </p>
        ) : null}
      </div>

      <Button type="submit" variant="success" disabled={updateEmail.isPending}>
        {updateEmail.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
      </Button>
    </form>
  )
}

export default function ProfilePage() {
  const { data: me, isPending } = useMe()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="flex items-center gap-2 text-lg font-semibold">
        <UserCog className="size-5 text-primary-strong" />
        ข้อมูลส่วนตัว
      </h1>

      {isPending ? (
        <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
      ) : me ? (
        <ProfileForm me={me} />
      ) : null}
    </div>
  )
}
