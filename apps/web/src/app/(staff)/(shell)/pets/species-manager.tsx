'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCan } from '@/features/auth/hooks'
import {
  useBreedList,
  useCreateBreed,
  useCreateSpecies,
  useDeleteBreed,
  useDeleteSpecies,
  useSpeciesList,
} from '@/features/pet/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { RECEPTION_WRITE } from '@/lib/permissions'
import { cn } from '@/lib/utils'

/**
 * ชนิดและสายพันธุ์ — **จัดการจากในหน้าสัตว์ ไม่มีเมนูแยก**
 *
 * รูปเดียวกับหมวดยา (ผู้ใช้ตัดสิน 2026-09-01) · คนที่มาเพิ่มสัตว์คือคนเดียวกับที่รู้ว่า
 * ต้องมีพันธุ์ใหม่ · บังคับให้ออกไปอีกเมนูแล้วกลับมา แปลว่าทิ้งสิ่งที่กรอกค้างไว้
 *
 * **สองคอลัมน์ เพราะพันธุ์สังกัดชนิด** — เลือกชนิดทางซ้าย แล้วพันธุ์ของมันขึ้นทางขวา
 */
export function SpeciesManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const canWrite = useCan(RECEPTION_WRITE)

  const species = useSpeciesList()
  const [selected, setSelected] = useState<number | null>(null)
  const breeds = useBreedList(selected)

  const createSpecies = useCreateSpecies()
  const deleteSpecies = useDeleteSpecies()
  const createBreed = useCreateBreed()
  const deleteBreed = useDeleteBreed()

  const [newSpecies, setNewSpecies] = useState('')
  const [newBreed, setNewBreed] = useState('')

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn()
      toast.success(done)
    } catch (e) {
      toast.error(toErrorMessage(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>ชนิดและสายพันธุ์</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* ---- ชนิด ---- */}
          <section className="flex flex-col gap-2">
            <Label>ชนิดสัตว์</Label>

            {canWrite ? (
              <div className="flex gap-1.5">
                <Input
                  value={newSpecies}
                  onChange={(e) => setNewSpecies(e.target.value)}
                  placeholder="เช่น กระต่าย"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="เพิ่มชนิด"
                  disabled={newSpecies.trim() === '' || createSpecies.isPending}
                  onClick={() =>
                    void run(async () => {
                      await createSpecies.mutateAsync(newSpecies.trim())
                      setNewSpecies('')
                    }, 'เพิ่มชนิดแล้ว')
                  }
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            ) : null}

            <div className="max-h-64 divide-y overflow-y-auto rounded-md border">
              {(species.data ?? []).length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">ยังไม่มีชนิดสัตว์</p>
              ) : (
                (species.data ?? []).map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1.5 text-sm',
                      selected === s.id && 'bg-primary/10',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(s.id)}
                      className="min-w-0 flex-1 truncate text-left"
                    >
                      {s.name}
                    </button>
                    {canWrite ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`ลบ ${s.name}`}
                        onClick={() =>
                          void run(() => deleteSpecies.mutateAsync(s.id), `ลบ ${s.name} แล้ว`)
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>

          {/* ---- สายพันธุ์ของชนิดที่เลือก ---- */}
          <section className="flex flex-col gap-2">
            <Label>
              สายพันธุ์
              {selected === null ? (
                <span className="ml-1 font-normal text-muted-foreground">— เลือกชนิดก่อน</span>
              ) : null}
            </Label>

            {canWrite && selected !== null ? (
              <div className="flex gap-1.5">
                <Input
                  value={newBreed}
                  onChange={(e) => setNewBreed(e.target.value)}
                  placeholder="เช่น ชิวาวา"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="เพิ่มสายพันธุ์"
                  disabled={newBreed.trim() === '' || createBreed.isPending}
                  onClick={() =>
                    void run(async () => {
                      await createBreed.mutateAsync({
                        speciesId: selected,
                        name: newBreed.trim(),
                      })
                      setNewBreed('')
                    }, 'เพิ่มสายพันธุ์แล้ว')
                  }
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            ) : null}

            <div className="max-h-64 divide-y overflow-y-auto rounded-md border">
              {selected === null ? (
                <p className="p-2 text-sm text-muted-foreground">
                  เลือกชนิดทางซ้ายเพื่อดูสายพันธุ์
                </p>
              ) : (breeds.data ?? []).length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">ยังไม่มีสายพันธุ์ในชนิดนี้</p>
              ) : (
                (breeds.data ?? []).map((b) => (
                  <div key={b.id} className="flex items-center gap-1 px-2 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{b.name}</span>
                    {canWrite ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`ลบ ${b.name}`}
                        onClick={() =>
                          void run(() => deleteBreed.mutateAsync(b.id), `ลบ ${b.name} แล้ว`)
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
