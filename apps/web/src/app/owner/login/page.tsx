'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { PawPrint } from 'lucide-react'
import { GoogleSignInButton } from '@/components/common/google-sign-in-button'
import { googleLoginUrl } from '@/features/owner-auth/api'
import { useGoogleStatus } from '@/features/owner-auth/hooks'

/**
 * เข้าสู่ระบบฝั่งเจ้าของสัตว์ — Google เท่านั้น
 *
 * **ไม่มีช่องรหัสผ่าน และจะไม่มี** · ตาราง `pet_owner_account` ไม่มีคอลัมน์รหัสผ่านเลย
 *
 * ปุ่มอยู่ใน `GoogleSignInButton` ซึ่งทำตาม branding guidelines ของ Google
 */
function OwnerLoginForm() {
  const params = useSearchParams()
  const status = useGoogleStatus()

  const error = params.get('error')

  return (
    <div className="flex w-full max-w-sm flex-col gap-6 rounded-lg border bg-card p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <PawPrint className="size-10 text-primary" />
        <h1 className="text-lg font-semibold">Paw Soft</h1>
        <p className="text-xs text-muted-foreground">
          สำหรับเจ้าของสัตว์เลี้ยง — ดูประวัติการรักษาและนัดหมาย
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {status.isLoading ? (
        <p className="text-center text-sm text-muted-foreground">กำลังโหลด…</p>
      ) : null}

      {/* ปุ่มที่กดแล้วเจอหน้า error คือปุ่มที่ไม่ควรมีให้กด */}
      {status.data?.configured === false ? (
        <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
          ระบบยังไม่ได้เปิดใช้การเข้าสู่ระบบด้วย Google กรุณาติดต่อคลินิก
        </p>
      ) : null}

      {status.data?.configured ? <GoogleSignInButton href={googleLoginUrl()} /> : null}
    </div>
  )
}

export default function OwnerLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      {/* `useSearchParams` ต้องอยู่ใน Suspense ไม่งั้น `next build` พังทั้งหน้า */}
      <Suspense fallback={null}>
        <OwnerLoginForm />
      </Suspense>
    </main>
  )
}
