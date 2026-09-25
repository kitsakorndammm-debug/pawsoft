'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, PawPrint } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLogin } from '@/features/auth/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { ROUTE_CHANGE_PASSWORD, ROUTE_HOME } from '@/lib/routes'

/**
 * เข้าสู่ระบบฝั่งพนักงาน
 *
 * **ต้องห่อด้วย `Suspense`** เพราะ `useSearchParams` อ่าน URL · ไม่ห่อแล้ว
 * `next build` จะพังทั้งหน้า ขณะที่ `next dev` กับ `typecheck` ยังเขียวอยู่ทั้งคู่
 */
function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const login = useLogin()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    login.mutate(
      { username, password },
      {
        onSuccess: (user) => {
          if (user.mustChangePassword) {
            router.replace(ROUTE_CHANGE_PASSWORD)

            return
          }

          const next = params.get('next')
          // **ต้องขึ้นต้นด้วย `/` เดียว** — `//evil.com` ผ่าน `startsWith('/')` ได้
          // และกลายเป็นการพาผู้ใช้ออกไปเว็บอื่นทันทีหลังล็อกอินสำเร็จ
          const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : ROUTE_HOME

          router.replace(safe)
        },
        onError: (err) => toast.error(toErrorMessage(err)),
      },
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full flex-col gap-4 rounded-2xl border bg-card p-6 shadow-lg shadow-black/[0.03]"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">เข้าสู่ระบบ</h2>
        <p className="text-xs text-muted-foreground">สำหรับพนักงานคลินิก</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="username">
          ชื่อผู้ใช้ <span className="text-destructive">*</span>
          </Label>
        <Input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">
          รหัสผ่าน <span className="text-destructive">*</span>
          </Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="pr-9"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      {/* สีแบรนด์ ไม่ใช่เขียว — การเข้าสู่ระบบไม่ได้เขียนข้อมูลอะไร */}
      <Button type="submit" disabled={login.isPending}>
        {login.isPending ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
      </Button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* พื้นหลังตกแต่ง — ไล่สีจางๆ จากแบรนด์ + รอยอุ้งเท้าจางๆ ไม่แย่งสายตาจากฟอร์ม */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-primary/10 via-background to-background" />
      <PawPrint
        aria-hidden
        className="pointer-events-none absolute -top-6 -left-10 -z-10 size-40 -rotate-[18deg] text-primary/[0.07]"
      />
      <PawPrint
        aria-hidden
        className="pointer-events-none absolute -right-12 bottom-4 -z-10 size-48 rotate-[16deg] text-primary/[0.07]"
      />
      <PawPrint
        aria-hidden
        className="pointer-events-none absolute top-28 right-16 -z-10 size-16 rotate-[10deg] text-primary/[0.06] sm:right-28"
      />

      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2.5">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <PawPrint className="size-7" />
          </span>
          <div className="text-center">
            <h1 className="text-xl font-semibold">Paw Soft</h1>
            <p className="text-sm text-muted-foreground">ระบบจัดการคลินิกสัตว์</p>
          </div>
        </div>

        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
