'use client'

import { Download } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

/**
 * วาด QR จาก payload — **วาดในเบราว์เซอร์ ไม่ได้รับรูปมาจาก BE**
 *
 * BE ส่งมาแต่ข้อความตามมาตรฐาน EMVCo · วาดที่นี่แปลว่าไม่มีรูปวิ่งผ่านสาย และ
 * ไม่ต้องมีที่เก็บรูปที่หมดอายุแล้วต้องกวาด
 *
 * **ดาวน์โหลดได้** (ผู้ใช้กำหนด 2026-09-01: "โหลดรูป QR ได้เพื่อเอาไปจ่ายในแอปธนาคาร")
 * — คนที่เปิดหน้านี้บนคอมต้องส่งรูปให้ตัวเองไปสแกนจากมือถือ
 */
export function PromptPayQrView({
  payload,
  amount,
  invoiceCode,
}: {
  payload: string
  amount: string
  invoiceCode: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    /**
     * `errorCorrectionLevel: 'M'` — ระดับกลาง
     *
     * สูงกว่านี้ QR จะหนาแน่นจนกล้องมือถือรุ่นเก่าอ่านยาก · ต่ำกว่านี้รอยเปื้อนบน
     * จอหรือกระดาษทำให้สแกนไม่ติด
     */
    QRCode.toCanvas(canvas, payload, {
      // เล็กลงเพราะอยู่ข้างฟอร์ม — ยังสแกนจากจอได้สบาย
      width: 180,
      margin: 1,
      errorCorrectionLevel: 'M',
    }).catch((e: unknown) => setError(String(e)))
  }, [payload])

  function download() {
    const canvas = canvasRef.current
    if (!canvas) return

    const link = document.createElement('a')
    link.download = `promptpay-${invoiceCode}-${amount}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  if (error !== null) {
    return <p className="text-sm text-destructive">วาด QR ไม่ได้: {error}</p>
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {/* พื้นขาวเสมอ — QR บนพื้นสีอ่านไม่ติดในหลายแอป */}
      <div className="rounded-lg border bg-white p-2">
        <canvas ref={canvasRef} />
      </div>

      <Button type="button" variant="ghost" size="sm" onClick={download} className="text-primary-strong">
        <Download className="size-3.5" />
        บันทึกรูป QR
      </Button>
    </div>
  )
}
