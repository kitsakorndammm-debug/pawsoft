'use client'

import { FileText, Image as ImageIcon, Paperclip, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * ช่องแนบไฟล์ — **ลากวางได้ และเห็นรูปก่อนส่ง**
 *
 * (ผู้ใช้ทักท้วง 2026-09-01: "อัปโหลดรูปก็จืด ไม่มี component สวย ๆ หรอ")
 *
 * `<input type="file">` เปล่า ๆ แสดงแค่ชื่อไฟล์ · คนที่แนบสลิปผิดใบจะรู้ตัวตอนบัญชี
 * ตีกลับ ไม่ใช่ตอนแนบ · เห็นรูปตอนเลือกแปลว่าจับผิดได้ทันที
 *
 * **สร้าง object URL แล้วคืนทิ้งเสมอ** — ไม่คืน เบราว์เซอร์จะถือไฟล์ไว้ในหน่วยความจำ
 * จนกว่าจะปิดแท็บ · หน้าที่เปิดค้างทั้งวันแล้วแนบสลิปสิบใบคือสิบไฟล์ที่ค้างอยู่
 */
/**
 * ชื่อชนิดไฟล์ที่คนอ่านออก — **คำนวณจาก `accept` ไม่ใช่เขียนตายตัว**
 *
 * เขียนตายตัวแล้วช่องที่ส่ง `accept` ไม่มี PDF ยังโฆษณาว่ารับ PDF อยู่ · คนที่เชื่อ
 * ข้อความแล้วลากไฟล์ PDF มาวางจะโดนปฏิเสธโดยไม่เข้าใจว่าทำไม (เจอตอนทำช่องรูปสัตว์
 * 2026-09-01)
 */
const TYPE_LABEL: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/webp': 'WebP',
  'application/pdf': 'PDF',
}

const describeAccept = (accept: string) =>
  accept
    .split(',')
    .map((t) => TYPE_LABEL[t.trim()] ?? t.trim())
    .join(' · ')

export function FileDrop({
  value,
  onChange,
  accept = 'image/png,image/jpeg,image/webp,application/pdf',
  maxSizeMb = 5,
  disabled,
  id,
}: {
  value: File | null
  onChange: (file: File | null) => void
  accept?: string
  maxSizeMb?: number
  disabled?: boolean
  id?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (value === null || !value.type.startsWith('image/')) {
      setPreview(null)

      return
    }

    const url = URL.createObjectURL(value)
    setPreview(url)

    return () => URL.revokeObjectURL(url)
  }, [value])

  function take(file: File | null) {
    setError(null)

    if (file === null) {
      onChange(null)

      return
    }

    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(`ไฟล์ใหญ่เกิน ${maxSizeMb} MB`)

      return
    }

    /**
     * ตรวจชนิดคร่าว ๆ ที่นี่ — **BE ตรวจไบต์จริงอีกชั้น**
     *
     * `file.type` เบราว์เซอร์เป็นคนบอก และปลอมได้ · ที่นี่กันแค่คนที่เลือกผิดไฟล์
     * ไม่ได้กันคนที่ตั้งใจ
     */
    const allowed = accept.split(',').map((t) => t.trim())
    if (!allowed.includes(file.type)) {
      setError(`รับเฉพาะ ${describeAccept(accept)}`)

      return
    }

    onChange(file)
  }

  function clear() {
    onChange(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  // ---- เลือกไฟล์แล้ว ----
  if (value !== null) {
    const isPdf = value.type === 'application/pdf'

    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-3 rounded-lg border bg-card p-2.5">
          {preview !== null ? (
            /* รูปย่อ — คลิกเปิดเต็มในแท็บใหม่ */
            <a href={preview} target="_blank" rel="noreferrer" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="ตัวอย่างสลิป"
                className="size-16 rounded-md border object-cover"
              />
            </a>
          ) : (
            <span className="flex size-16 shrink-0 items-center justify-center rounded-md border bg-muted">
              {isPdf ? (
                <FileText className="size-6 text-primary-strong" />
              ) : (
                <ImageIcon className="size-6 text-muted-foreground" />
              )}
            </span>
          )}

          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{value.name}</span>
            <span className="block text-xs text-muted-foreground">
              {(value.size / 1024).toFixed(0)} KB
              {isPdf ? ' · PDF' : ''}
            </span>
          </span>

          {!disabled ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="เอาไฟล์ออก"
              onClick={clear}
              className="text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>

        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          className="hidden"
          disabled={disabled}
          onChange={(e) => take(e.target.files?.[0] ?? null)}
        />
      </div>
    )
  }

  // ---- ยังไม่เลือก ----
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!disabled) take(e.dataTransfer.files?.[0] ?? null)
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 transition-colors',
          dragging
            ? 'border-primary bg-primary/10'
            : 'border-input hover:border-primary/50 hover:bg-muted/50',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span
          className={cn(
            'flex size-10 items-center justify-center rounded-full transition-colors',
            dragging ? 'bg-primary/20' : 'bg-muted',
          )}
        >
          {dragging ? (
            <Upload className="size-5 text-primary-strong" />
          ) : (
            <Paperclip className="size-5 text-muted-foreground" />
          )}
        </span>

        <span className="text-sm font-medium">
          {dragging ? 'วางไฟล์ตรงนี้' : 'ลากไฟล์มาวาง หรือคลิกเพื่อเลือก'}
        </span>
        <span className="text-xs text-muted-foreground">
          {describeAccept(accept)} — ไม่เกิน {maxSizeMb} MB
        </span>
      </button>

      {error !== null ? <p className="text-xs text-destructive">{error}</p> : null}

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => take(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}
