"use client";

import { CalendarPlus, PawPrint, UserRound, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { AppDatePicker } from '@/components/common/app-date-picker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SLOT_LABEL, type AppointmentSlot } from '@/features/appointment/api';
import { useCreateAppointment, useSlots } from '@/features/appointment/hooks';
import { OwnerPickerDialog } from '@/features/owner/owner-picker-dialog';
import { toErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const SLOTS: AppointmentSlot[] = [
  "MORNING_1",
  "MORNING_2",
  "AFTERNOON_1",
  "AFTERNOON_2",
];

/**
 * รับจองทางโทรศัพท์ — **พนักงานกรอกขณะลูกค้าถือสายรออยู่**
 *
 * **สัตว์ไม่บังคับ พิมพ์ชื่อก็พอ** — คนโทรมาบอกว่า "ขอจองพรุ่งนี้เช้าให้หมาที่บ้าน"
 * โดยที่หมาตัวนั้นยังไม่เคยมาคลินิก · บังคับเลือกจากทะเบียนแปลว่าต้องกรอกทะเบียนสัตว์
 * ให้จบก่อน ซึ่งนานเกินกว่าที่ใครจะถือสายรอ
 *
 * **เจ้าของบังคับ** ต่างจากสัตว์ — ต้องรู้ว่าโทรกลับหาใครได้
 */
export function AppointmentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateAppointment();
  const slots = useSlots();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<{
    ownerId: number;
    ownerName: string;
    ownerCode: string;
    petId: number | null;
    petName: string | null;
  } | null>(null);
  const [petNameText, setPetNameText] = useState("");
  const [bookedOn, setBookedOn] = useState("");
  const [slot, setSlot] = useState<AppointmentSlot>("MORNING_1");
  const [reason, setReason] = useState("");

  const today = slots.data?.today ?? "";
  const date = bookedOn || today;

  function close(next: boolean) {
    if (!next) {
      setPicked(null);
      setPetNameText('');
      setBookedOn("");
      setSlot("MORNING_1");
      setReason("");
    }
    onOpenChange(next);
  }

  const canSubmit =
    picked !== null &&
    date !== "" &&
    (picked.petId !== null || petNameText.trim().length > 0);

  async function submit() {
    if (!canSubmit || picked === null) return;

    try {
      await create.mutateAsync({
        bookedOn: date,
        slot,
        ownerId: picked.ownerId,
        petId: picked.petId,
        // ส่งชื่อเฉพาะตอนไม่ได้เลือกจากทะเบียน — ส่งทั้งคู่ไม่ผิด แต่ทำให้อ่านสับสน
        petNameText: picked.petId === null ? petNameText.trim() : null,
        reason: reason.trim() || null,
      });

      toast.success("บันทึกการจองแล้ว");
      close(false);
    } catch (e) {
      toast.error(toErrorMessage(e));
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="size-5 text-primary-strong" />
              รับจองทางโทรศัพท์
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>ลูกค้า</Label>

              {picked !== null ? (
                <div className="flex items-center gap-2.5 rounded-md border bg-card p-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    {picked.petId !== null ? (
                      <PawPrint className="size-4 text-primary-strong" />
                    ) : (
                      <UserRound className="size-4 text-primary-strong" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {picked.petName ?? picked.ownerName}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {picked.petName !== null ? `${picked.ownerName} · ` : ""}
                      {picked.ownerCode}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="เลือกใหม่"
                    onClick={() => setPicked(null)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="justify-start"
                  onClick={() => setPickerOpen(true)}
                >
                  <UserRound className="size-4" />
                  เลือกลูกค้าและสัตว์
                </Button>
              )}
            </div>

            {/*
            สัตว์ที่ยังไม่มีในทะเบียน — คนโทรมาบอกว่า "จองให้หมาที่บ้าน" ซึ่งยังไม่เคย
            มาคลินิก · ช่องนี้โผล่เฉพาะตอนเลือกลูกค้าแล้วแต่ยังไม่ได้เลือกสัตว์
          */}
            {picked !== null && picked.petId === null ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ap-petname">ชื่อสัตว์ที่จะพามา</Label>
                <Input
                  id="ap-petname"
                  value={petNameText}
                  onChange={(e) => setPetNameText(e.target.value)}
                  placeholder="สัตว์ที่ยังไม่มีในระบบ"
                />
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>วันที่</Label>
                {/* `AppDatePicker` รูปเดียวกับทั้งระบบ — ไม่ใช่ `<input type="date">` ของเบราว์เซอร์ */}
                <AppDatePicker
                  value={date}
                  onChange={(v) => setBookedOn(v ?? '')}
                  aria-label="วันที่จอง"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>ช่วงเวลา</Label>
                {/*
                  ปุ่มไม่ใช่ `<select>` — รูปเดียวกับหน้าจองฝั่งลูกค้า · สี่ช่วงมองเห็น
                  พร้อมกันหมด ไม่ต้องกดเปิดถึงจะรู้ว่ามีอะไรให้เลือก
                */}
                <div className="grid grid-cols-2 gap-1.5">
                  {SLOTS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSlot(s)}
                      className={cn(
                        'rounded-md border px-2 py-2 text-xs transition-colors',
                        slot === s
                          ? 'border-primary bg-primary/10 font-medium'
                          : 'border-input hover:bg-muted',
                      )}
                    >
                      {SLOT_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ap-reason">อาการที่เล่ามา</Label>
              <Textarea
                id="ap-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => close(false)}
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={!canSubmit || create.isPending}
            >
              {create.isPending ? "กำลังบันทึก…" : "บันทึกการจอง"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OwnerPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        mode="owner-pet"
        onPick={(v) => {
          setPicked(v);
          setPetNameText('');
        }}
      />
    </>
  );
}
