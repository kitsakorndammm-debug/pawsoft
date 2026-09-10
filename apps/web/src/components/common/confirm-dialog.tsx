'use client'

import type { ReactNode } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

/**
 * ปุ่มยืนยันเป็นสีเขียวเสมอ — **รวมปุ่มลบด้วย** (ผู้ใช้ตัดสิน 2026-08-27)
 *
 * ต่างจากกฎของปุ่มในฟอร์ม ที่เขียวสงวนให้การเขียนข้อมูลและลบเป็นแดง · ในกล่องยืนยัน
 * สีไม่ได้ทำหน้าที่นั้น เพราะหัวข้อกับคำอธิบายบอกอยู่แล้วว่ากำลังจะลบอะไร และคนมาถึง
 * ตรงนี้เพราะตั้งใจกดปุ่มลบมาแล้ว · ปุ่มเขียวคือ "ยืนยันสิ่งที่เลือกไว้" เหมือนกันทุกกล่อง
 *
 * **ไม่มี `actionVariant` แล้ว** — prop ที่รับไว้แต่ไม่มีผล คือคำสัญญาที่หน้าจอ
 * ไม่ได้ทำตาม และคนอ่านโค้ดจะเชื่อว่ามันเปลี่ยนสีได้
 */

interface ConfirmDialogProps {
  trigger?: ReactNode
  title: string
  description: ReactNode
  cancelText?: string
  actionText?: string
  hideAction?: boolean
  onAction: () => void
  /** Mutation in-flight — Button shows centered Loader (text invisible), Cancel disabled, backdrop close blocked */
  pending?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** raise z above a host dialog that dims via box-shadow instead of a backdrop */
  nested?: boolean
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  cancelText = 'ยกเลิก',
  actionText = 'ยืนยัน',
  hideAction = false,
  onAction,
  pending = false,
  open,
  onOpenChange,
  nested = false,
}: ConfirmDialogProps) {
  function handleOpenChange(next: boolean) {
    if (pending && !next) return
    onOpenChange?.(next)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <AlertDialogTrigger render={trigger as React.ReactElement} />}
      <AlertDialogContent
        className={nested ? 'z-60 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]' : undefined}
        overlayClassName={nested ? 'z-60' : undefined}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelText}</AlertDialogCancel>
          {!hideAction && (
            <AlertDialogAction
              variant="success"
              onClick={onAction}
              loading={pending}
            >
              {actionText}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
