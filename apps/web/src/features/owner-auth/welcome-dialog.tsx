'use client'

import { PawPrint } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toErrorMessage } from '@/lib/api-client'

import { useRegisterMe } from './hooks'

/**
 * ทักทายคนที่ล็อกอินครั้งแรก — **ขอชื่อกับเบอร์แล้วสร้างตัวตนให้เลย**
 *
 * (ผู้ใช้ทักท้วง 2026-09-01: "ไม่ใช่ลูกค้าทุกคนที่จะเคยมาคลินิกนะ ... login ครั้งแรก
 * ก็ได้เป็น dialog แจ้งเตือน" · "เบอร์บังคับด้วยสิ")
 *
 * ก่อนหน้านี้หน้าแรกบอกให้ "ติดต่อคลินิกเพื่อเชื่อมบัญชี" กับทุกคน · แปลว่าคนที่ยังไม่เคย
 * มาคลินิกล็อกอินเข้ามาแล้วทำอะไรไม่ได้เลย และไม่มีปุ่มไหนพาเขาไปต่อได้
 *
 * **ปิด dialog ได้ แต่กรอกไม่ครบส่งไม่ได้** — คนที่แค่อยากดูก่อนกด "ไว้ทีหลัง" ได้
 * และกลับมากรอกจากปุ่มที่หน้าแรก · แต่จะสมัครครึ่ง ๆ กลาง ๆ โดยไม่มีเบอร์ไม่ได้
 *
 * **เบอร์ตรงกับลูกค้าเดิม = ได้ประวัติเดิมกลับมาทันที** — `selfRegisterOwner` เชื่อม
 * บัญชี Google เข้ากับแถวเดิมแทนที่จะสร้างใหม่
 *
 * **ชื่อเติมจากบัญชี Google ไว้ให้** — คนส่วนใหญ่ใช้ชื่อเดียวกัน · แก้ได้ถ้าไม่ใช่
 */
export function WelcomeDialog({
  open,
  onOpenChange,
  defaultName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultName: string
}) {
  const register = useRegisterMe()

  const [name, setName] = useState(defaultName)
  const [phone, setPhone] = useState('')

  /**
   * **เบอร์บังคับ** (ผู้ใช้กำหนด 2026-09-01) — เบอร์คือตัวระบุตัวตนของลูกค้า และเป็น
   * ทางเดียวที่คลินิกโทรยืนยันคิวได้ · นับเฉพาะตัวเลขเพราะคนกรอกขีดกับเว้นวรรคมาด้วย
   */
  const phoneDigits = phone.replace(/\D/g, '')
  const canSubmit =
    name.trim().length > 0 && phoneDigits.length >= 9 && !register.isPending

  function submit() {
    if (!canSubmit) return

    register.mutate(
      { name: name.trim(), phone: phone.trim() },
      {
        onSuccess: () => {
          toast.success('ยินดีต้อนรับ — เพิ่มสัตว์เลี้ยงแล้วจองคิวได้เลย')
          onOpenChange(false)
        },
        onError: (e) => toast.error(toErrorMessage(e)),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PawPrint className="size-5 text-primary" />
            ยินดีต้อนรับสู่ Paw Soft
          </DialogTitle>
          <DialogDescription>
            กรอกข้อมูลติดต่อไว้ครั้งเดียว แล้วเพิ่มสัตว์เลี้ยงกับจองคิวได้เลย
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wname">ชื่อ-นามสกุล</Label>
            <Input
              id="wname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ชื่อที่ใช้ติดต่อกับคลินิก"
              disabled={register.isPending}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wphone">
              เบอร์โทร
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                (คลินิกใช้โทรยืนยันคิว)
              </span>
            </Label>
            <Input
              id="wphone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08x-xxx-xxxx"
              inputMode="tel"
              disabled={register.isPending}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
            />
          </div>

          {/*
            บอกว่าเบอร์เดิมจะดึงประวัติมาให้ — คนที่เคยมาแล้วจะได้กรอกเบอร์เดิม
            ไม่ใช่เบอร์ใหม่ที่เพิ่งเปลี่ยน แล้วเสียประวัติทั้งหมดไปเปล่า ๆ
          */}
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            เคยมารักษาที่คลินิกแล้ว? กรอกเบอร์เดิมที่เคยให้ไว้ — ระบบจะดึงประวัติและสัตว์เลี้ยงมาให้อัตโนมัติ
          </p>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={register.isPending}
          >
            ไว้ทีหลัง
          </Button>
          <Button onClick={submit} disabled={!canSubmit} loading={register.isPending}>
            เริ่มใช้งาน
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
