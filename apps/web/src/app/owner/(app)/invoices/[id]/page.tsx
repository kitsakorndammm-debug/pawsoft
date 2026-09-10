'use client'

import { ArrowLeft, Check, Clock, Pill, Receipt, Stethoscope, Upload } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { FileDrop } from '@/components/common/file-drop'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_STYLE,
  PAYMENT_METHOD_LABEL,
  type InvoiceLine,
  type PaymentMethod,
} from '@/features/payment/api'
import {
  useMyBankTransfer,
  useMyInvoice,
  useMyInvoiceQr,
  useUploadMySlip,
} from '@/features/payment/my-hooks'
import { PromptPayQrView } from '@/features/payment/promptpay-qr'
import { useOwnerMe } from '@/features/owner-auth/hooks'
import { toErrorMessage } from '@/lib/api-client'
import { ROUTE_OWNER_INVOICES, ROUTE_OWNER_LOGIN } from '@/lib/routes'
import { cn } from '@/lib/utils'

/**
 * ใบเสร็จรายใบฝั่งลูกค้า — **อ่านรายการ · สแกน QR · แนบสลิป**
 *
 * (ผู้ใช้กำหนด 2026-09-01: "สแกน QR อัปโหลดหลักฐานเองได้ โหลดรูป QR ได้เพื่อเอาไป
 * จ่ายในแอปธนาคาร")
 *
 * **แนบสลิปแล้วยังไม่จบ** — บัญชีต้องตรวจอีกที · หน้านี้ต้องบอกให้ชัด ไม่งั้นลูกค้า
 * ที่อัปโหลดเสร็จจะคิดว่าเรียบร้อยแล้ว แล้วเดินออกจากคลินิกทั้งที่ยอดยังไม่ถูกยืนยัน
 */
export default function MyInvoicePage() {
  const params = useParams<{ id: string }>()
  const id = Number(params.id)
  const router = useRouter()

  const { data: session, isLoading } = useOwnerMe()
  const invoice = useMyInvoice(Number.isFinite(id) ? id : null)

  useEffect(() => {
    if (!isLoading && !session) router.replace(ROUTE_OWNER_LOGIN)
  }, [session, isLoading, router])

  if (isLoading || !session || invoice.isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
      </main>
    )
  }

  if (invoice.isError || !invoice.data) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 p-6">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={ROUTE_OWNER_INVOICES} />}>
          <ArrowLeft className="size-4" />
          กลับ
        </Button>
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          ไม่พบใบเสร็จนี้
        </p>
      </main>
    )
  }

  const row = invoice.data
  const outstanding = Number(row.outstanding)
  const owes = outstanding > 0

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 p-6">
      <header className="flex items-center gap-3 border-b pb-4">
        <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={ROUTE_OWNER_INVOICES} />}>
          <ArrowLeft className="size-4" />
        </Button>
        <Receipt className="size-5 text-primary" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{row.code}</h1>
          <p className="text-xs text-muted-foreground">
            {row.visit.petName ?? 'สัตว์เลี้ยง'} · {row.visit.queueDate}
          </p>
          <p className="text-xs text-muted-foreground">
            ออกใบเมื่อ {new Date(row.createdAt).toLocaleString('th-TH')}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
            INVOICE_STATUS_STYLE[row.status],
          )}
        >
          {INVOICE_STATUS_LABEL[row.status]}
        </span>
      </header>

      {/* ---- รายการที่คิดเงิน ---- */}
      <section className="overflow-hidden rounded-lg border bg-card">
        {row.lines.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">ไม่มีรายการ</p>
        ) : (
          row.lines.map((line, i) => <LineRow key={i} line={line} />)
        )}
      </section>

      {/* ---- ยอด ---- */}
      <section className="flex flex-col gap-1.5 rounded-lg border bg-card p-4 text-sm">
        <Row label="ยอดรายการ" value={row.subtotal} />
        {Number(row.discount) > 0 ? (
          <Row label="ส่วนลด" value={`-${row.discount}`} tone="text-emerald-700" />
        ) : null}
        <Row label="ยอดที่ต้องจ่าย" value={row.total} strong />
        {Number(row.paid) > 0 ? <Row label="จ่ายแล้ว" value={row.paid} /> : null}
        {owes ? (
          <Row label="ยังค้าง" value={row.outstanding} strong tone="text-destructive" />
        ) : null}
      </section>

      {/* ---- รายการที่จ่ายมาแล้ว ---- */}
      {row.payments.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">การชำระ</h2>
          {row.payments.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
              <Check className="size-4 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {PAYMENT_METHOD_LABEL[p.method]}
                  {p.byOwner ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      คุณแจ้งเอง
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(p.receivedAt).toLocaleString('th-TH')}
                </p>
              </div>
              <span className="font-semibold tabular-nums">{p.amount}</span>
            </div>
          ))}
        </section>
      ) : null}

      {/* ---- จ่าย ---- */}
      {owes ? (
        <PayBox invoiceId={row.id} amount={row.outstanding} invoiceCode={row.code} />
      ) : row.status === 'AWAITING_VERIFY' ? (
        <p className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <Clock className="size-4 shrink-0" />
          แจ้งชำระแล้ว — รอเจ้าหน้าที่บัญชีตรวจยอด
        </p>
      ) : row.status === 'VERIFIED' ? (
        <div className="flex flex-col gap-1 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="flex items-center gap-2">
            <Check className="size-4 shrink-0" />
            ชำระครบและยืนยันแล้ว
          </p>
          {row.verifiedAt ? (
            <p className="pl-6 text-xs text-emerald-800">
              ยืนยันเมื่อ {new Date(row.verifiedAt).toLocaleString('th-TH')}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          ชำระครบแล้ว — รอเจ้าหน้าที่ปิดใบ
        </p>
      )}
    </main>
  )
}

function LineRow({ line }: { line: InvoiceLine }) {
  return (
    <div className="flex items-start gap-3 border-b p-3 last:border-b-0">
      {line.kind === 'drug' ? (
        <Pill className="mt-0.5 size-4 shrink-0 text-primary-strong" />
      ) : (
        <Stethoscope className="mt-0.5 size-4 shrink-0 text-primary-strong" />
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{line.name}</p>
        <p className="text-xs text-muted-foreground">
          {line.quantity}
          {line.unit ? ` ${line.unit}` : ''} × {line.unitPrice}
          {line.dosage ? ` · ${line.dosage}` : ''}
        </p>
      </div>

      <span className="shrink-0 text-sm font-medium tabular-nums">{line.amount}</span>
    </div>
  )
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn(strong ? 'font-medium' : 'text-muted-foreground', tone)}>{label}</span>
      <span className={cn('tabular-nums', strong && 'font-semibold', tone)}>{value}</span>
    </div>
  )
}

/**
 * กล่องจ่ายเงิน — **QR ขึ้นทันทีที่เปิด**
 *
 * (ผู้ใช้กำหนด 2026-09-01: "เปิดมาก็ generate QR ให้เลย")
 *
 * **ยอดล็อกที่ยอดค้าง แก้ไม่ได้** — จ่ายทางเดียวยอดเดียว แบ่งจ่ายไม่ได้ · ช่องกรอกยอด
 * ที่แก้ได้จะเชิญให้กรอกเลขที่ไม่ตรงกับ QR ที่เพิ่งสแกนไป แล้วบัญชีต้องมานั่งไล่
 */
/** วิธีจ่ายที่ลูกค้าเลือกเองได้ — ฝั่งนี้ไม่มีเงินสด ไม่มีบัตร (ดู `myInvoiceApi.uploadSlip`) */
type MyPayMethod = Extract<PaymentMethod, 'PROMPTPAY' | 'TRANSFER'>

function PayBox({
  invoiceId,
  amount,
  invoiceCode,
}: {
  invoiceId: number
  amount: string
  invoiceCode: string
}) {
  const [method, setMethod] = useState<MyPayMethod>('PROMPTPAY')

  const qr = useMyInvoiceQr(invoiceId, method === 'PROMPTPAY')
  const bankTransfer = useMyBankTransfer()
  const upload = useUploadMySlip(invoiceId)

  const [file, setFile] = useState<File | null>(null)
  const [reference, setReference] = useState('')

  function submit() {
    if (file === null) return

    upload.mutate(
      {
        file,
        method,
        amount,
        reference: reference.trim() || null,
        promptpayRef: method === 'PROMPTPAY' ? (qr.data?.ref ?? null) : null,
        note: null,
      },
      {
        onSuccess: () => {
          toast.success('ส่งหลักฐานแล้ว — รอเจ้าหน้าที่บัญชีตรวจยอด')
          setFile(null)
          setReference('')
        },
        onError: (e) => toast.error(toErrorMessage(e)),
      },
    )
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-primary/40 bg-primary/5 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">ชำระเงิน</h2>
        <span className="text-lg font-semibold tabular-nums">{amount}</span>
      </div>

      {/* สลับพร้อมเพย์ / โอนธนาคาร — สองอย่างนี้คือทางเลือกเดียวที่ฝั่งลูกค้าจ่ายเองได้ */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => setMethod('PROMPTPAY')}
          className={cn(
            'rounded-md border px-2 py-1.5 text-sm transition-colors',
            method === 'PROMPTPAY'
              ? 'border-primary bg-primary/10 font-medium'
              : 'border-input hover:bg-muted',
          )}
        >
          พร้อมเพย์
        </button>
        <button
          type="button"
          onClick={() => setMethod('TRANSFER')}
          className={cn(
            'rounded-md border px-2 py-1.5 text-sm transition-colors',
            method === 'TRANSFER'
              ? 'border-primary bg-primary/10 font-medium'
              : 'border-input hover:bg-muted',
          )}
        >
          โอนธนาคาร
        </button>
      </div>

      {method === 'PROMPTPAY' ? (
        qr.isPending ? (
          <p className="text-center text-sm text-muted-foreground">กำลังสร้าง QR…</p>
        ) : qr.isError || !qr.data ? (
          <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
            คลินิกยังไม่ได้ตั้งค่าพร้อมเพย์ — ชำระที่เคาน์เตอร์ได้
          </p>
        ) : (
          <>
            <PromptPayQrView
              payload={qr.data.payload}
              amount={qr.data.amount}
              invoiceCode={invoiceCode}
            />
            <p className="text-center text-xs text-muted-foreground">
              สแกนจากแอปธนาคาร หรือบันทึกรูปไปเปิดในแอป
            </p>
          </>
        )
      ) : bankTransfer.isPending ? (
        <p className="text-center text-sm text-muted-foreground">กำลังโหลด…</p>
      ) : bankTransfer.isError || !bankTransfer.data || !bankTransfer.data.configured ? (
        <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
          คลินิกยังไม่ได้ตั้งค่าบัญชีโอน — ชำระที่เคาน์เตอร์ได้
        </p>
      ) : (
        <div className="flex flex-col gap-1 rounded-md border bg-card p-3 text-sm">
          <Row label="ธนาคาร" value={bankTransfer.data.bankName} />
          <Row label="เลขบัญชี" value={bankTransfer.data.accountNumber} strong />
          <Row label="ชื่อบัญชี" value={bankTransfer.data.accountName} />
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-primary/20 pt-4">
        <Label htmlFor="slip">แนบสลิปหลังโอน</Label>
        <FileDrop id="slip" value={file} onChange={setFile} disabled={upload.isPending} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ref">เลขอ้างอิง (ถ้ามี)</Label>
        <Input
          id="ref"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="เลขที่รายการจากแอปธนาคาร"
          disabled={upload.isPending}
        />
      </div>

      <Button onClick={submit} disabled={file === null || upload.isPending} className="w-full">
        <Upload className="size-4" />
        {upload.isPending ? 'กำลังส่ง…' : 'ส่งหลักฐานการโอน'}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        ส่งแล้วเจ้าหน้าที่บัญชีจะตรวจยอดอีกครั้ง
      </p>
    </section>
  )
}
