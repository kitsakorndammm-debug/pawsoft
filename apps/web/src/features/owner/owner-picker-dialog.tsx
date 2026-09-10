'use client'

import { Check, PawPrint, Phone, Search, UserRound } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useOwnerSearch } from '@/features/owner/hooks'
import { usePetOptions } from '@/features/pet/hooks'
import { useDebounce } from '@/lib/use-debounce'
import { cn } from '@/lib/utils'

/**
 * เลือกเจ้าของ (และสัตว์) — **กล่องแยก ไม่ใช่ช่องค้นฝังในฟอร์ม**
 *
 * (ผู้ใช้กำหนด 2026-09-01: "เวลาคลิกแล้วให้เปิด dialog แยกมาจะได้ง่ายๆ และเฟรนด์ลี่")
 *
 * **ทำไมไม่ใช่ `Combobox` เหมือนช่องอื่น** — combobox โหลดตัวเลือกทั้งชุดมาแล้วค้น
 * ในเครื่อง ซึ่งใช้ได้กับทะเบียนหลักร้อย · ลูกค้าคลินิกมีหลักหมื่นและโตทุกวัน ·
 * ที่นี่จึงค้นที่เซิร์ฟเวอร์ และกล่องเต็มจอทำให้เห็นเบอร์กับสัตว์พร้อมกันได้
 *
 * `mode`:
 *   `owner`      เลือกแค่เจ้าของ (ฟอร์มสัตว์ · ตอนจอง)
 *   `owner-pet`  เลือกเจ้าของแล้วเลือกสัตว์ต่อในกล่องเดียว (check-in · ผูกคิว)
 */
export function OwnerPickerDialog({
  open,
  onOpenChange,
  mode = 'owner',
  title,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode?: 'owner' | 'owner-pet'
  title?: string
  /** `petId` เป็น `null` เสมอเมื่อ `mode = 'owner'` */
  onPick: (picked: {
    ownerId: number
    ownerName: string
    ownerCode: string
    petId: number | null
    petName: string | null
  }) => void
}) {
  const [term, setTerm] = useState('')
  const [ownerId, setOwnerId] = useState<number | null>(null)

  // ค้นที่เซิร์ฟเวอร์ — หน่วงไว้ไม่ให้ยิงทุกตัวอักษร
  const debounced = useDebounce(term, 300)
  const owners = useOwnerSearch(debounced)
  const pets = usePetOptions(mode === 'owner-pet' ? ownerId : null)

  const selectedOwner = (owners.data ?? []).find((o) => o.id === ownerId) ?? null

  function close(next: boolean) {
    if (!next) {
      setTerm('')
      setOwnerId(null)
    }
    onOpenChange(next)
  }

  function pick(petId: number | null, petName: string | null) {
    if (!selectedOwner) return

    onPick({
      ownerId: selectedOwner.id,
      ownerName: selectedOwner.name,
      ownerCode: selectedOwner.code,
      petId,
      petName,
    })
    close(false)
  }

  const rows = owners.data ?? []
  const searching = debounced.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title ?? (mode === 'owner-pet' ? 'เลือกลูกค้าและสัตว์' : 'เลือกลูกค้า')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => {
                setTerm(e.target.value)
                setOwnerId(null)
              }}
              placeholder="ค้นด้วยเบอร์โทร ชื่อ หรือรหัสลูกค้า"
              className="pl-8"
              autoFocus
            />
          </div>

          <div className="min-h-56 overflow-y-auto rounded-md border">
            {!searching ? (
              <EmptyHint icon={Search} text="พิมพ์เบอร์โทรหรือชื่อเพื่อค้นหา" />
            ) : owners.isPending ? (
              <EmptyHint icon={Search} text="กำลังค้น…" />
            ) : rows.length === 0 ? (
              <EmptyHint icon={UserRound} text="ไม่พบลูกค้าที่ค้นหา" />
            ) : (
              <ul className="divide-y">
                {rows.map((o) => {
                  const active = ownerId === o.id

                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() =>
                          mode === 'owner' ? pickOwnerOnly(o) : setOwnerId(active ? null : o.id)
                        }
                        className={cn(
                          'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted',
                          active && 'bg-primary/10',
                        )}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary-strong">
                          <UserRound className="size-4" />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{o.name}</span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="size-3" />
                            {o.phone ?? 'ไม่มีเบอร์'}
                            <span className="ml-1">· {o.code}</span>
                          </span>
                        </span>

                        {active ? <Check className="size-4 shrink-0 text-primary-strong" /> : null}
                      </button>

                      {/* เลือกสัตว์ต่อในแถวเดียวกัน — ไม่ต้องกดเข้าไปอีกชั้น */}
                      {active && mode === 'owner-pet' ? (
                        <div className="flex flex-wrap gap-1.5 border-t bg-muted/40 px-3 py-2">
                          {pets.isPending ? (
                            <span className="text-xs text-muted-foreground">กำลังโหลดสัตว์…</span>
                          ) : (pets.data ?? []).length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              ลูกค้ารายนี้ยังไม่มีสัตว์ในระบบ
                            </span>
                          ) : (
                            (pets.data ?? []).map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => pick(p.id, p.name)}
                                className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm transition-colors hover:border-primary hover:bg-primary/10"
                              >
                                <PawPrint className="size-3.5 text-primary-strong" />
                                {p.name}
                              </button>
                            ))
                          )}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            ยกเลิก
          </Button>

          {/* โหมดเลือกสัตว์ยังเลือก "เจ้าของอย่างเดียว" ได้ — เผื่อสัตว์ยังไม่มีในระบบ */}
          {mode === 'owner-pet' ? (
            <Button type="button" onClick={() => pick(null, null)} disabled={ownerId === null}>
              ใช้เจ้าของรายนี้ (ยังไม่เลือกสัตว์)
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  /** เลือกเจ้าของแล้วปิดทันที — โหมดที่ไม่ต้องเลือกสัตว์ */
  function pickOwnerOnly(o: { id: number; name: string; code: string }) {
    onPick({
      ownerId: o.id,
      ownerName: o.name,
      ownerCode: o.code,
      petId: null,
      petName: null,
    })
    close(false)
  }
}

function EmptyHint({
  icon: Icon,
  text,
}: {
  icon: typeof Search
  text: string
}) {
  return (
    <div className="flex h-56 flex-col items-center justify-center gap-2 text-muted-foreground">
      <Icon className="size-7 opacity-40" />
      <p className="text-sm">{text}</p>
    </div>
  )
}
