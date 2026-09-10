export const metadata = {
  title: 'นโยบายความเป็นส่วนตัว — Paw Soft',
}

/**
 * หน้านโยบายความเป็นส่วนตัว — สาธารณะ ไม่ต้องล็อกอิน
 *
 * ต้องมีลิงก์นี้เพื่อกด "Publish app" ใน Google OAuth consent screen ได้
 * (Google บังคับให้แอปที่ขึ้น production ต้องมีลิงก์นโยบายความเป็นส่วนตัวจริง)
 */
export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">นโยบายความเป็นส่วนตัว</h1>
        <p className="text-sm text-muted-foreground">Paw Soft — ระบบจัดการคลินิกสัตว์เลี้ยง</p>
      </div>

      <section className="flex flex-col gap-2 text-sm leading-relaxed">
        <h2 className="font-medium">ข้อมูลที่เราเก็บ</h2>
        <p>
          เมื่อคุณเข้าสู่ระบบด้วยบัญชี Google เราเก็บชื่อและอีเมลที่ Google ส่งมาให้
          เพื่อใช้ระบุตัวตนบัญชีของคุณในระบบ นอกจากนี้เรายังเก็บข้อมูลที่คุณกรอกเข้ามาเอง
          เช่น ข้อมูลสัตว์เลี้ยง การนัดหมาย และประวัติการรักษา
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed">
        <h2 className="font-medium">เราใช้ข้อมูลนี้ทำอะไร</h2>
        <p>
          ใช้เพื่อดำเนินการนัดหมาย บันทึกประวัติการรักษาสัตว์เลี้ยงของคุณ
          และออกใบเสร็จ/ใบแจ้งหนี้ที่เกี่ยวข้องเท่านั้น
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed">
        <h2 className="font-medium">การเปิดเผยข้อมูล</h2>
        <p>
          เราไม่ขายหรือแบ่งปันข้อมูลของคุณให้บุคคลภายนอก
          ยกเว้นกรณีที่กฎหมายกำหนด
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed">
        <h2 className="font-medium">ติดต่อเรา</h2>
        <p>
          หากมีคำถามเกี่ยวกับนโยบายนี้ ติดต่อได้ที่{' '}
          <a href="mailto:kitsakorndammm@gmail.com" className="underline">
            kitsakorndammm@gmail.com
          </a>
        </p>
      </section>
    </main>
  )
}
