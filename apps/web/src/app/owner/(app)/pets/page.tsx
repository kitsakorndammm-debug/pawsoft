'use client'

import { ChevronRight, PawPrint, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { petPhotoUrl, type MyPet } from '@/features/owner-auth/api'
import { AddPetDialog } from '@/features/owner-auth/add-pet-dialog'
import { useDeleteMyPet, useMyPets, useMyProfile } from '@/features/owner-auth/hooks'
import { toErrorMessage } from '@/lib/api-client'

/**
 * สัตว์เลี้ยงของลูกค้า — **แก้ · ลบ · เปลี่ยนรูปได้เอง**
 *
 * (ผู้ใช้ทักท้วง 2026-09-01: "หน้าสัตว์เลี้ยงของ owner ทำไมไม่มีปุ่มลบหรือแก้ไขหล่ะ
 * แล้วอยากให้มีการอัพโหลดรูปด้วย")
 *
 * **ลบสัตว์ที่เคยรักษาแล้วไม่ได้** — BE ปฏิเสธเอง เพราะประวัติกับใบเสร็จชี้มาที่แถวนี้ ·
 * ข้อความจาก BE บอกให้ใช้ "เสียชีวิต" แทน ซึ่งเป็นสิ่งที่เจ้าของตั้งใจจริง ๆ ในกรณีนั้น
 */
export default function MyPetsPage() {
  const profile = useMyProfile()
  const linked = profile.data?.owner != null
  const pets = useMyPets(linked)
  const remove = useDeleteMyPet()

  const [dialogOpen, setDialogOpen] = useState(false)
  /** `null` = เพิ่มตัวใหม่ · มีค่า = แก้ตัวนั้น */
  const [editing, setEditing] = useState<MyPet | null>(null)
  const [pendingDelete, setPendingDelete] = useState<MyPet | null>(null)

  const rows = pets.data ?? []

  function openAdd() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(pet: MyPet) {
    setEditing(pet)
    setDialogOpen(true)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">สัตว์เลี้ยงของฉัน</h1>
        <Button size="sm" onClick={openAdd} disabled={!linked}>
          <Plus className="size-4" />
          เพิ่ม
        </Button>
      </div>

      {!linked ? (
        <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
          กรอกข้อมูลติดต่อที่หน้าแรกก่อน แล้วจะเพิ่มสัตว์เลี้ยงได้
        </p>
      ) : pets.isPending ? (
        <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
          ยังไม่มีสัตว์เลี้ยง — กด &ldquo;เพิ่ม&rdquo; เพื่อเริ่ม
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((p) => (
            <PetRow
              key={p.id}
              pet={p}
              onEdit={() => openEdit(p)}
              onDelete={() => setPendingDelete(p)}
            />
          ))}
        </div>
      )}

      <AddPetDialog open={dialogOpen} onOpenChange={setDialogOpen} pet={editing} />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`ลบ ${pendingDelete?.name ?? ''}`}
        description="สัตว์ตัวนี้จะหายจากรายการของคุณ — ถ้าเคยพามารักษาแล้วจะลบไม่ได้"
        actionText="ลบ"
        onAction={async () => {
          if (!pendingDelete) return

          try {
            await remove.mutateAsync(pendingDelete.id)
            toast.success('ลบแล้ว')
            setPendingDelete(null)
          } catch (e) {
            // ข้อความจาก BE บอกเหตุผลจริง (เช่น มีประวัติรักษา) — แสดงตรง ๆ
            toast.error(toErrorMessage(e))
          }
        }}
      />
    </div>
  )
}

function PetRow({
  pet,
  onEdit,
  onDelete,
}: {
  pet: MyPet
  onEdit: () => void
  onDelete: () => void
}) {
  /**
   * ลองโหลดรูปเสมอ แล้ว**ถอยไปใช้ไอคอนเมื่อโหลดไม่ได้**
   *
   * BE ไม่ได้บอกมาว่าตัวไหนมีรูป (`MyPet` ไม่มีฟิลด์นั้น) · เส้นรูปตอบ 404 เมื่อยังไม่มี
   * ซึ่ง `onError` จับได้ · ถามก่อนว่ามีไหมแปลว่าต้องยิงเพิ่มอีกรอบต่อสัตว์หนึ่งตัว
   */
  const [noPhoto, setNoPhoto] = useState(false)

  /**
   * ทั้งการ์ดกดได้ ไม่ใช่แค่ไอคอนดินสอ (ผู้ใช้ขอ 2026-09-08: "อยากให้มันกดได้ทั้งอันเลย")
   *
   * **`div` ไม่ใช่ `button`** — ปุ่มลบเป็นปุ่มจริงซ้อนอยู่ข้างใน `<button>` ซ้อน `<button>`
   * เป็น HTML ที่ผิดรูป จึงต้องเติม `role`/`tabIndex`/`onKeyDown` เองแทน
   */
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onEdit()
        }
      }}
      aria-label={`ดูข้อมูล ${pet.name}`}
      className="flex cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3 hover:bg-accent"
    >
      {noPhoto ? (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full border bg-muted/40">
          <PawPrint className="size-5 text-muted-foreground" />
        </span>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={petPhotoUrl(pet.id)}
          alt={pet.name}
          onError={() => setNoPhoto(true)}
          className="size-11 shrink-0 rounded-full border object-cover"
        />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{pet.name}</p>
        <p className="font-mono text-xs text-muted-foreground">{pet.code}</p>
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`ลบ ${pet.name}`}
        onClick={(e) => {
          // กันไม่ให้ทะลุไปเปิดกล่องแก้ไขด้วย — คนละการกระทำกัน
          e.stopPropagation()
          onDelete()
        }}
        className="text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </Button>

      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </div>
  )
}
