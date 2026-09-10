import { cn } from '@/lib/utils'

/**
 * ปุ่ม "Sign in with Google" ตาม **Google Identity branding guidelines**
 *
 * <https://developers.google.com/identity/branding-guidelines>
 *
 * **เป็น `<a>` ไม่ใช่ `<button>` ที่ยิง `fetch`** — การไป Google เป็นการเดินทางของ
 * เบราว์เซอร์ทั้งหน้า · ยิงด้วย fetch จะติด CORS ของ Google และไม่มีทางสำเร็จ
 *
 * **โลโก้เป็น SVG ฝังในไฟล์ ไม่ได้โหลดจาก CDN ของ Google** · ปุ่มล็อกอินที่รูปหาย
 * เพราะเน็ตลูกค้าบล็อก CDN คือปุ่มที่ดูเหมือนพัง · และ Google ไม่รับประกัน URL รูป
 * ให้ hotlink อยู่แล้ว
 */

/** โลโก้ G สี่สี — ค่าสีมาจากไฟล์ทางการของ Google ห้ามแก้ */
function GoogleG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false" className={className}>
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"
      />
    </svg>
  )
}

/**
 * **`href` ไม่ใช่ `onClick`** — ผู้เรียกส่งที่อยู่ของเส้นที่พาไป Google มาให้
 *
 * `disabled` ไม่มีให้ตั้ง · ปุ่มที่กดแล้วไม่เกิดอะไรคือปุ่มที่ไม่ควรวาด — ที่เรียกใช้
 * ต้องไม่วาดมันตั้งแต่แรกเมื่อระบบยังไม่ได้ตั้งค่า Google
 */
export function GoogleSignInButton({
  href,
  label = 'เข้าสู่ระบบด้วย Google',
  className,
}: {
  href: string
  label?: string
  className?: string
}) {
  return (
    <a
      href={href}
      className={cn(
        /*
          สเปคของ Google: พื้นขาว · ขอบเทา · มุมมน · ตัวหนังสือ Roboto Medium สีเทาเข้ม
          ความสูง 40px เป็นขนาดมาตรฐานที่เอกสารใช้เป็นตัวอย่าง
        */
        'flex h-10 w-full items-center justify-center gap-3 rounded-md',
        'border border-[#dadce0] bg-white px-3',
        'text-sm font-medium text-[#3c4043]',
        'transition-colors duration-150',
        // hover/active ตามสเปค — เงาจาง ๆ ไม่ใช่เปลี่ยนสีพื้น
        'hover:border-[#d2e3fc] hover:bg-[#f8faff]',
        'active:bg-[#f0f5ff]',
        // โฟกัสต้องเห็นชัดสำหรับคนที่ใช้คีย์บอร์ด
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4285f4]',
        'cursor-pointer',
        className,
      )}
    >
      {/*
        **โลโก้กับข้อความเป็นก้อนเดียวกันตรงกลาง** — ไม่ใช่โลโก้ยึดซ้ายสุด

        ปุ่มนี้กว้างเต็มการ์ด (~330px) แต่ข้อความสั้น · วางโลโก้ชิดซ้ายด้วย `absolute`
        จะเหลือช่องว่างกว้างคั่นกลางจนดูเหมือนจัดวางพลาด — วัดจากจอจริงแล้ว
        ตัวอย่างของ Google เองก็เป็นปุ่มพอดีตัวที่โลโก้ติดกับข้อความ
      */}
      <GoogleG className="size-[18px] shrink-0" />
      <span>{label}</span>
    </a>
  )
}
