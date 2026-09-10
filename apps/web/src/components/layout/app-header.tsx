'use client'

import { useQueryClient } from '@tanstack/react-query'
import { PawPrint, Power } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { NotificationBell } from '@/components/layout/notification-bell'
import { Button } from '@/components/ui/button'
import { authApi, displayNameOf } from '@/features/auth/api'
import { useMe } from '@/features/auth/hooks'
import { getInitials } from '@/lib/format'
import { ROUTE_HOME, ROUTE_LOGIN } from '@/lib/routes'

const APP_TITLE = 'Paw Soft — คลินิกรักษาสัตว์'

/**
 * แถบบนสุด — โลโก้ · ชื่อคนที่ล็อกอิน · ปุ่มออกจากระบบ
 *
 * `sticky top-0` อยู่กับที่เสมอ · ปุ่มออกจากระบบอยู่ขวาสุดไกลจากทุกอย่าง
 * เพราะเป็นปุ่มที่กดพลาดแล้วเสียงานที่ค้างอยู่
 */
export function AppHeader() {
  const { data: me } = useMe()
  const queryClient = useQueryClient()
  const [loggingOut, setLoggingOut] = useState(false)

  const displayName = me ? displayNameOf(me) : ''
  const initials = getInitials(displayName)

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)

    try {
      await authApi.logout()
    } catch {
      // ยิงไม่ผ่านก็ยังต้องออก — cookie อาจหมดอายุไปแล้ว ซึ่งก็คือออกแล้วอยู่ดี ·
      // ค้างอยู่หน้าเดิมเพราะ logout พัง คือผู้ใช้ที่ออกจากระบบไม่ได้
    }

    // ล้าง cache ก่อนออก — ไม่ล้างแล้ว /login จะเห็นเซสชันเก่าใน cache แล้วเด้งกลับเข้ามา
    queryClient.clear()

    // reload เต็มใบ ไม่ใช่ router.replace — router cache ของ Next พา proxy.ts ไปเจอ
    // สถานะ auth เก่า
    window.location.replace(ROUTE_LOGIN)
  }

  return (
    <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <Link
        href={ROUTE_HOME}
        className="flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-muted"
      >
        <PawPrint className="size-6 shrink-0 text-primary" />
        <span className="hidden text-sm font-semibold tracking-tight sm:inline">{APP_TITLE}</span>
      </Link>

      <div className="flex-1" />

      <NotificationBell />

      <div className="flex items-center gap-2.5 rounded-full border border-border/70 bg-card py-1 pl-1 pr-1 sm:pr-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {initials}
        </span>
        <span className="hidden min-w-0 max-w-48 flex-col text-left leading-tight sm:flex">
          <span className="truncate text-xs font-semibold text-foreground">{displayName}</span>
          <span className="truncate text-[11px] text-muted-foreground">{me?.role.name}</span>
        </span>
      </div>

      <ConfirmDialog
        title="ออกจากระบบ"
        description="ต้องการออกจากระบบใช่หรือไม่"
        actionText="ออกจากระบบ"
        onAction={handleLogout}
        pending={loggingOut}
        trigger={
          <Button
            type="button"
            variant="destructiveSolid"
            size="icon"
            className="size-9 shrink-0 rounded-full"
            aria-label="ออกจากระบบ"
            title="ออกจากระบบ"
          >
            <Power className="size-4" />
          </Button>
        }
      />
    </header>
  )
}
