import { db } from './db.ts'

/**
 * สิทธิ์ทั้งหมดที่โค้ดในระบบนี้ตรวจ — **ประกาศที่นี่ ไม่ใช่ตารางที่ผู้ใช้เพิ่มเองได้**
 *
 * ตาราง `permission` ไม่มีหน้าจัดการ เพราะมีแต่โค้ดที่รู้ว่าจะถามว่า "คนนี้ทำสิ่งนี้ได้ไหม"
 * key ที่ผู้ใช้สร้างเองจะไม่มีโค้ดไหนถามถึง · แถวในตารางจึงมาจากไฟล์นี้ผ่าน
 * `syncPermissions()` ตอนบูต
 *
 * **โมดูลใหม่เพิ่ม key ที่นี่ พร้อมกับที่ route เริ่มตรวจมัน** — เพิ่มที่เดียวไม่ครบ
 * แปลว่ามี key ที่ guard ถามถึงแต่ไม่มีใคร grant ได้ (route ตรวจแต่ไม่ประกาศ) หรือ
 * มีสวิตช์ในหน้าตั้งค่าที่กดแล้วไม่มีผล (ประกาศแต่ไม่มีใครตรวจ)
 *
 * **ไม่มี key ของฝั่งเจ้าของสัตว์** และจะไม่มี · บัญชีฝั่งนั้นเห็นเฉพาะข้อมูลของตัวเอง
 * ซึ่งบังคับด้วยการกรองด้วย id จากเซสชัน ไม่ใช่ด้วย key — ดู `docs/standards/auth.md`
 */

export type PermissionDef = {
  /** `main:master:read` — รูป `<ส่วนของระบบ>:<เมนู>:<การกระทำ>` */
  key: string
  /** คำไทยที่คนอ่านในหน้าตั้งค่าสิทธิ์ */
  label: string
  /** โมดูลเจ้าของ key · ใช้จัดกลุ่มในหน้าตั้งค่า */
  groupCode: string
  /** ชื่อไทยของกลุ่ม */
  groupName: string
}

/**
 * รูปที่ key ทุกตัวต้องเดินตาม
 *
 * ใช้สองที่: เทสที่พิสูจน์ว่ารายการข้างล่างไม่หลุดรูป และ `syncPermissions` ที่ใช้มัน
 * ตัดสินว่าแถวไหนในตารางเป็น key ของระบบจริง
 *
 * ท่อนสุดท้ายรับคำที่คั่นด้วย `_` ได้ (`write_all`) เผื่อเมนูที่ถามว่าแก้ **ของใคร** ได้
 * ซึ่งยังไม่มีตอนนี้ · แต่รูปยังรัดไว้เท่าเดิม เพราะ `syncPermissions` ใช้มันแยกว่า
 * แถวไหนเป็น key จริง และแถวไหนเป็นของไฟล์เทสที่รันขนานกันอยู่ (ซึ่งติด prefix
 * `[ชื่อไฟล์] ` ไว้ข้างหน้า)
 *
 * ฐานบังคับรูปเดียวกันนี้ด้วย CHECK ใน `01-auth.sql` — แถวที่ผิดรูปจึงเข้าไม่ได้เลย
 * ไม่ว่าจะเข้ามาทางไหน
 */
export const PERMISSION_KEY_SHAPE = /^[a-z-]+:[a-z-]+:[a-z]+(_[a-z]+)*$/

/**
 * สิทธิ์ของเมนูตั้งค่า — ทะเบียนทั้งหมดใช้คู่นี้ร่วมกัน
 *
 * ตั้งชื่อตามเมนูบนหน้าจอ ไม่ใช่ตามตาราง · `write` คลุมถึง create, update, delete
 * และ move · **ตารางใหม่ไม่ได้แปลว่าต้องมี key ใหม่**
 */
export const MASTER_PERMISSION = {
  read: 'main:master:read',
  write: 'main:master:write',
} as const

/**
 * สิทธิ์ของเมนูบุคคล — บัญชีผู้ใช้และบทบาท
 *
 * **แยกจาก `master` โดยตั้งใจ** · การปลดระงับบัญชีคือการคืนทางเข้าระบบให้คน
 * ซึ่งหนักกว่าการแก้ชื่อทะเบียน · ใช้ key ร่วมกันแปลว่าใครแก้ทะเบียนได้ก็ปลดบัญชี
 * ที่ผู้ดูแลระงับไว้ได้ ทั้งที่เป็นคนละอำนาจกัน
 */
export const HR_PERMISSION = {
  read: 'main:hr:read',
  write: 'main:hr:write',
} as const

/**
 * สิทธิ์ของ**เคาน์เตอร์** — คิว การจอง ลูกค้า และสัตว์
 *
 * (ผู้ใช้ตัดสิน 2026-09-01: แยกจากของหมอ)
 *
 * คนที่นั่งเคาน์เตอร์เปิดคิว รับจอง และลงทะเบียนลูกค้าได้ทั้งวัน · **แต่เขียน
 * ผลวินิจฉัยหรือสั่งยาไม่ได้** ซึ่งเป็นงานที่ต้องมีใบประกอบวิชาชีพ
 */
export const RECEPTION_PERMISSION = {
  read: 'main:reception:read',
  write: 'main:reception:write',
} as const

/**
 * สิทธิ์ของ**สัตวแพทย์** — วินิจฉัย จ่ายยา ปิดการตรวจ
 *
 * **แยกจาก `reception` เพราะกฎหมายแยก** · การวินิจฉัยและการสั่งยาเป็นงานของผู้มี
 * ใบประกอบวิชาชีพ ไม่ใช่ของทุกคนที่เปิดคิวได้
 *
 * รวมกับ `reception` เป็น key เดียวเมื่อไหร่ พนักงานเคาน์เตอร์ทุกคนจะเขียน
 * ผลวินิจฉัยลงประวัติสัตว์ได้ — และไม่มีอะไรในระบบบอกว่าใครเป็นคนเขียนจริง
 *
 * **ไม่มี `read` แยก** — คนที่เห็นคิวได้ (`reception:read`) ควรเห็นว่าเคสนี้
 * วินิจฉัยว่าอะไรด้วย · สิ่งที่ต้องกันคือการ**เขียน** ไม่ใช่การอ่าน
 */
export const MEDICAL_PERMISSION = {
  write: 'main:medical:write',
} as const

/**
 * สิทธิ์ของ**การเงิน** — และนี่คือ **maker-checker สองขั้น ไม่ใช่ key เดียว**
 *
 * (ผู้ใช้กำหนด 2026-09-01: "พอรักษาเสร็จก็จะต้องมีการจ่ายเงิน ... เก็บหลักฐานโดยการ
 * อัปโหลดสลิปโดยพนักงานเคาน์เตอร์" · "จะมีบัญชีมายืนยันยอดอีกทีนึงหลังจากที่เคาน์เตอร์
 * ส่งยอดแล้ว เป็นระบบ recheck ของคลินิก")
 *
 *   `collect`  เคาน์เตอร์ — รับเงิน แนบสลิป แล้ว**ส่งยอด**
 *   `verify`   บัญชี — **ยืนยันว่ายอดตรง** หลังจากนั้นแก้ไม่ได้อีก
 *
 * **สอง key ไม่ใช่ key เดียว เพราะจุดประสงค์ของ recheck คือคนละคนตรวจ** · ให้คนเดียว
 * ถือทั้งคู่ในทางเทคนิคทำได้ (คลินิกเล็กที่เจ้าของทำเองทั้งหมด) แต่ต้องเป็นการตัดสินใจ
 * ที่มองเห็นในหน้าตั้งค่าสิทธิ์ ไม่ใช่สิ่งที่ระบบบังคับให้เป็น
 *
 * รวมเป็น key เดียวเมื่อไหร่ การ recheck จะไม่มีความหมาย — คนที่รับเงินกดยืนยันยอด
 * ของตัวเองได้ และนั่นคือช่องที่ระบบนี้มีอยู่เพื่อปิด
 *
 * **ใช้จริงแล้วที่ `payment.routes.ts`** — `guardBillingRead` / `guardBillingCollect` /
 * `guardBillingVerify` การ์ดทุกเส้นของโมดูลการเงิน
 */
export const BILLING_PERMISSION = {
  read: 'main:billing:read',
  /** รับเงิน แนบสลิป ส่งยอด — งานของเคาน์เตอร์ */
  collect: 'main:billing:collect',
  /** ยืนยันยอด — งานของบัญชี · **หลังจากนี้ใบนั้นแก้ไม่ได้** */
  verify: 'main:billing:verify',
} as const

/**
 * สิทธิ์ของ**สต็อกยา** — แยกจาก `master` โดยตั้งใจ (ผู้ใช้ตัดสิน 2026-09-08)
 *
 * ตอนแรกใช้ `master` ร่วมกับหน้า "ยาและเวชภัณฑ์" แต่คนที่ต้องเห็นสต็อก (หมอ ดูอย่างเดียว ·
 * เคาน์เตอร์ ดูและบันทึก) ไม่ใช่คนกลุ่มเดียวกับที่ควรแก้ทะเบียนยา/แผนก/ตำแหน่ง — ให้
 * `master` ร่วมจะพ่วงสิทธิ์เข้าหน้าตั้งค่าอื่นทั้งชุดไปด้วยโดยไม่ได้ตั้งใจ
 */
export const DRUG_STOCK_PERMISSION = {
  read: 'main:drug-stock:read',
  write: 'main:drug-stock:write',
} as const

/** ทุก key ที่มีอยู่ตอนนี้ */
export const PERMISSIONS: readonly PermissionDef[] = [
  {
    key: MASTER_PERMISSION.read,
    label: 'ดูข้อมูลตั้งค่า',
    groupCode: 'master',
    groupName: 'ตั้งค่าระบบ',
  },
  {
    key: MASTER_PERMISSION.write,
    label: 'แก้ไขข้อมูลตั้งค่า',
    groupCode: 'master',
    groupName: 'ตั้งค่าระบบ',
  },
  {
    key: HR_PERMISSION.read,
    label: 'ดูบัญชีผู้ใช้และบทบาท',
    groupCode: 'hr',
    groupName: 'บุคคล',
  },
  {
    key: HR_PERMISSION.write,
    label: 'แก้ไขบัญชีผู้ใช้และบทบาท',
    groupCode: 'hr',
    groupName: 'บุคคล',
  },
  {
    key: RECEPTION_PERMISSION.read,
    label: 'ดูคิวและข้อมูลลูกค้า',
    groupCode: 'reception',
    groupName: 'เคาน์เตอร์',
  },
  {
    key: RECEPTION_PERMISSION.write,
    label: 'จัดคิวและแก้ข้อมูลลูกค้า',
    groupCode: 'reception',
    groupName: 'เคาน์เตอร์',
  },
  {
    key: MEDICAL_PERMISSION.write,
    label: 'บันทึกผลตรวจและจ่ายยา',
    groupCode: 'medical',
    groupName: 'การรักษา',
  },
  {
    key: BILLING_PERMISSION.read,
    label: 'ดูยอดบิลและการชำระเงิน',
    groupCode: 'billing',
    groupName: 'การเงิน',
  },
  {
    key: BILLING_PERMISSION.collect,
    label: 'รับชำระเงินและแนบสลิป',
    groupCode: 'billing',
    groupName: 'การเงิน',
  },
  {
    key: BILLING_PERMISSION.verify,
    label: 'ยืนยันยอด (บัญชี)',
    groupCode: 'billing',
    groupName: 'การเงิน',
  },
  {
    key: DRUG_STOCK_PERMISSION.read,
    label: 'ดูยอดคงเหลือสต็อกยา',
    groupCode: 'drug-stock',
    groupName: 'สต็อกยา',
  },
  {
    key: DRUG_STOCK_PERMISSION.write,
    label: 'บันทึกรับเข้า/ปรับยอดสต็อกยา',
    groupCode: 'drug-stock',
    groupName: 'สต็อกยา',
  },
]

/**
 * ทำให้ตาราง `permission` ตรงกับรายการข้างบน
 *
 * เรียกตอนบูต **ก่อนเปิดพอร์ต** — request ที่เข้ามาก่อนตารางตรง จะได้ 403 ที่ผิด
 *
 * **ลบ key ที่ไม่ได้ประกาศแล้วทิ้ง (hard delete)** เพราะมันไม่ได้หายไปไหน มันไม่เคย
 * มีอยู่จริง · แต่ลบเฉพาะแถวที่ **ตรงรูป** `PERMISSION_KEY_SHAPE` เท่านั้น:
 * ไฟล์เทสที่รันขนานกันแทรก key ของตัวเองที่ติด prefix `[ชื่อไฟล์] ` ไว้ และการกวาด
 * แบบไม่เลือกจะลบของไฟล์อื่นทิ้งกลางคัน แล้วเทสจะแดงแบบสุ่มโดยไม่มีสาเหตุที่มองเห็น
 */
export async function syncPermissions(): Promise<void> {
  for (const p of PERMISSIONS) {
    await db.permission.upsert({
      where: { key: p.key },
      create: p,
      update: { label: p.label, groupCode: p.groupCode, groupName: p.groupName },
    })
  }

  const declared = new Set(PERMISSIONS.map((p) => p.key))
  const rows = await db.permission.findMany({ select: { id: true, key: true } })

  const stale = rows.filter((r) => !declared.has(r.key) && PERMISSION_KEY_SHAPE.test(r.key))

  if (stale.length > 0) {
    await db.permission.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } })
  }
}

/**
 * key ทั้งหมดที่บทบาทนี้ถือ
 *
 * **บทบาทระบบถือทุก key ที่ประกาศไว้ โดยไม่ต้องผ่าน `role_permission`** — key ที่เพิ่ง
 * ประกาศใหม่จึงไม่มีทางล็อกผู้ดูแลออกจากหน้าที่ใช้ grant มัน
 */
export async function permissionsOf(roleId: bigint, isSystem: boolean): Promise<string[]> {
  if (isSystem) return PERMISSIONS.map((p) => p.key)

  const rows = await db.rolePermission.findMany({
    where: { roleId },
    select: { permission: { select: { key: true } } },
  })

  return rows.map((r) => r.permission.key)
}
