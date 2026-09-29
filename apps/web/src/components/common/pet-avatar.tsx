'use client'

import { PawPrint } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * รูปสัตว์เลี้ยงเล็ก ๆ — ใช้ซ้ำได้ทั้งฝั่งเจ้าของและพนักงาน
 *
 * **ไม่รู้จัก endpoint ไหนเลย** — รับแค่ `src` ที่คนเรียกตัดสินใจมาแล้วว่าจะยิงไปที่ไหน
 * (ฝั่งเจ้าของใช้ `petPhotoUrl` จาก `owner-auth/api.ts` ฝั่งพนักงานใช้ตัวจาก
 * `features/pet/api.ts` — คนละเส้นคนละการ์ด) `null` = ไม่มีรูปให้ลองโหลดเลย
 * (เช่น สัตว์หน้างานที่ยังไม่ได้ลงทะเบียน)
 *
 * **ลองโหลดเสมอแล้วถอยไปใช้ไอคอนเมื่อพัง** — โครงเดียวกับหน้า "สัตว์เลี้ยงของฉัน"
 * ฝั่งเจ้าของ เพราะ BE ไม่บอกไว้ล่วงหน้าว่าตัวไหนมีรูปจริง
 */
export function PetAvatar({
  src,
  alt,
  size = 'md',
  className,
}: {
  src: string | null
  alt: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const [broken, setBroken] = useState(false)

  // สลับไปดูสัตว์ตัวอื่นในกล่องเดิม (ไม่ได้ remount) — ต้องลองโหลดรูปใหม่ใหม่เสมอ
  useEffect(() => {
    setBroken(false)
  }, [src])

  const sizeClass = size === 'sm' ? 'size-9' : 'size-11'

  if (src === null || broken) {
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full border bg-muted/40',
          sizeClass,
          className,
        )}
      >
        <PawPrint className={cn('text-muted-foreground', size === 'sm' ? 'size-4' : 'size-5')} />
      </span>
    )
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={alt}
      onError={() => setBroken(true)}
      className={cn('shrink-0 rounded-full border object-cover', sizeClass, className)}
    />
  )
}
