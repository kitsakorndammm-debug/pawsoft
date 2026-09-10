'use client'

import { useEffect, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useMe } from '@/features/auth/hooks'
import { ROUTE_CHANGE_PASSWORD, ROUTE_LOGIN } from '@/lib/routes'

/**
 * ด่านที่สองของฝั่งหลังบ้าน
 *
 * `proxy.ts` ดูแค่ว่า **มี** cookie ไหม (เร็ว แต่ไม่รู้ว่ามันยังใช้ได้จริงหรือเปล่า)
 * ตัวนี้ถาม API จริงว่าเซสชันยังใช้ได้ — cookie ที่หมดอายุจะผ่านด่านแรกแต่ไม่ผ่านด่านนี้
 */
export function SessionGuard({ children }: { children: ReactNode }) {
  const { data, isLoading } = useMe()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (isLoading) return

    if (!data) {
      const next = pathname && pathname !== ROUTE_LOGIN ? `?next=${encodeURIComponent(pathname)}` : ''
      router.replace(`${ROUTE_LOGIN}${next}`)

      return
    }

    if (data.mustChangePassword && pathname !== ROUTE_CHANGE_PASSWORD) {
      router.replace(ROUTE_CHANGE_PASSWORD)
    }
  }, [data, isLoading, pathname, router])

  if (isLoading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
      </div>
    )
  }

  return <>{children}</>
}
