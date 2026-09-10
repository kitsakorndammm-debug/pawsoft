'use client'

import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { useState, type ReactNode } from 'react'
import { Toaster } from 'sonner'

import { TooltipProvider } from '@/components/ui/tooltip'

/**
 * ของที่ทุกหน้าต้องมี
 *
 * `QueryClient` สร้างใน `useState` ไม่ใช่ที่ระดับโมดูล — ตัวที่ระดับโมดูลจะถูกใช้
 * ร่วมกันข้ามผู้ใช้เมื่อ render ที่ฝั่งเซิร์ฟเวอร์ แล้วข้อมูลของคนหนึ่งจะโผล่ให้อีกคนเห็น
 *
 * **`NuqsAdapter` ต้องมี** — `useQueryState` ที่หน้ารายการใช้เก็บคำค้นกับเลขหน้าไว้ใน
 * URL จะโยน `nuqs requires an adapter` ทันทีที่หน้านั้นถูก render · ไม่ใช่ error ตอน
 * คอมไพล์ จึงไม่มีอะไรเตือนจนกว่าจะเปิดหน้าจริง (เจอเมื่อ 2026-09-01)
 *
 * **`TooltipProvider` ต้องมี** ด้วยเหตุผลเดียวกัน — ปุ่มไอคอนในแถวตารางทุกปุ่มห่อด้วย
 * `Tooltip` ตามกฎใน `ui-design.md` · หน่วง 300ms เพราะขึ้นทันทีจะกะพริบตามเมาส์ที่
 * กวาดผ่าน และบังของที่ผู้ใช้กำลังจะกด
 */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      }),
  )

  return (
    <QueryClientProvider client={client}>
      <NuqsAdapter>
        <TooltipProvider delay={300}>
          {children}
          <Toaster position="top-center" richColors duration={3000} />
        </TooltipProvider>
      </NuqsAdapter>
    </QueryClientProvider>
  )
}
