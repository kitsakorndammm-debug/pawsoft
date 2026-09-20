import { APPOINTMENT_STATUS_LABEL } from '@/features/appointment/api'
import { DRUG_MOVEMENT_TYPE_LABEL } from '@/features/history/api'
import { INVOICE_STATUS_LABEL, PAYMENT_METHOD_LABEL } from '@/features/payment/api'
import { TRIAGE_LABEL, VISIT_STATUS_LABEL } from '@/features/visit/api'
import { WAREHOUSE_STOCK_MOVEMENT_TYPE_LABEL } from '@/features/warehouse-stock/api'

/**
 * แปล `module`/`action`/ชื่อฟิลด์ในหน้าประวัติการใช้งานเป็นภาษาไทยอ่านง่าย (ผู้ใช้ขอ
 * 2026-09-20) — เก็บเป็นพจนานุกรมแยกจากหน้าจอ เพราะรายการยาวและไม่เกี่ยวกับการวางหน้า
 *
 * **คีย์ที่ไม่มีในพจนานุกรม ต้องไม่พัง** — โมดูลใหม่ที่ยังไม่ได้เพิ่มคำแปล จะ fallback
 * ไปที่ค่าดิบ (`module.action` หรือชื่อฟิลด์เดิม) แทนที่จะทำให้หน้าจอ error
 */

export const MODULE_LABEL: Record<string, string> = {
  visit: 'คิว/การตรวจ',
  visitItem: 'รายการในคิว',
  payment: 'ใบเสร็จ/การชำระเงิน',
  appointment: 'ใบจอง',
  employee: 'พนักงาน',
  user: 'บัญชีผู้ใช้',
  owner: 'เจ้าของสัตว์',
  pet: 'สัตว์เลี้ยง',
  'drug-stock': 'สต็อกยา',
  'warehouse-stock': 'คลังยา',
  drug: 'ยา',
  'drug-category': 'หมวดยา',
  'service-item': 'รายการรักษา',
  'service-category': 'หมวดรายการรักษา',
  department: 'แผนก',
  position: 'ตำแหน่ง',
  species: 'ชนิดสัตว์',
  breed: 'สายพันธุ์',
  role: 'บทบาทและสิทธิ์',
}

export const ACTION_LABEL: Record<string, string> = {
  // คิว/การตรวจ
  'visit.check-in': 'เปิดคิว (เช็คอิน)',
  'visit.set-triage': 'เปลี่ยนระดับความเร่งด่วน',
  'visit.call': 'เรียกเข้าตรวจ',
  'visit.finish-exam': 'ตรวจเสร็จ ส่งไปชำระเงิน',
  'visit.close': 'ปิดคิว (ชำระเงินครบ)',
  'visit.abandon': 'ปิดคิวกลางทาง',
  'visit.link': 'ผูกคิวกับสัตว์เลี้ยงในระบบ',
  'visitItem.add-service': 'เพิ่มรายการรักษาในคิว',
  'visitItem.remove-service': 'ลบรายการรักษาออกจากคิว',
  'visitItem.add-drug': 'จ่ายยาในคิว',
  'visitItem.remove-drug': 'ยกเลิกรายการยาที่จ่าย',

  // ใบเสร็จ/การชำระเงิน
  'payment.issue': 'ออกใบเสร็จ',
  'payment.add': 'บันทึกรับชำระเงิน',
  'payment.remove': 'ลบรายการชำระเงิน',
  'payment.submit': 'ส่งใบเสร็จให้บัญชีตรวจ',
  'payment.verify': 'ยืนยันใบเสร็จ',
  'payment.reject': 'ตีกลับใบเสร็จ',
  'payment.void': 'ยกเลิกใบเสร็จ',

  // ใบจอง
  'appointment.create': 'รับจองคิวล่วงหน้า',
  'appointment.cancel': 'ยกเลิกใบจอง',
  'appointment.no-show': 'บันทึกว่าลูกค้าไม่มาตามนัด',
  'appointment.confirm': 'ยืนยันใบจองที่ลูกค้าจองเอง',
  'appointment.delete': 'ลบใบจอง',

  // สต็อกยา
  'drug-stock.create': 'บันทึกรับยาเข้า/ปรับยอดสต็อก',
  'drug-stock.dispense': 'ตัดสต็อกยา (จ่ายให้คนไข้)',
  'drug-stock.dispense-reversed': 'คืนสต็อกยา (ยกเลิกรายการจ่าย)',
  'drug-stock.reverse': 'ย้อนรายการสต็อกยาที่บันทึกผิด',
  'warehouse-stock.create': 'บันทึกรับยาเข้าคลัง',
  'warehouse-stock.withdraw': 'เบิกยาออกจากคลัง',

  // ยา / รายการรักษา — โมดูลทะเบียนใช้รูปแบบเดียวกัน (create/update/delete/move/set-active)
  'drug.create': 'เพิ่มยาใหม่',
  'drug.update': 'แก้ไขข้อมูลยา',
  'drug.delete': 'ลบยา',
  'drug.set-active': 'เปิด/ปิดการใช้งานยา',
  'service-item.create': 'เพิ่มรายการรักษาใหม่',
  'service-item.update': 'แก้ไขรายการรักษา',
  'service-item.delete': 'ลบรายการรักษา',
  'service-item.set-active': 'เปิด/ปิดการใช้งานรายการรักษา',

  // พนักงาน / บัญชีผู้ใช้
  'employee.create': 'เพิ่มพนักงานใหม่',
  'employee.update': 'แก้ไขข้อมูลพนักงาน',
  'employee.delete': 'ลบพนักงาน (ลาออก)',
  'employee.work-status': 'เปลี่ยนสถานะการทำงานของพนักงาน',
  'user.create': 'สร้างบัญชีผู้ใช้',
  'user.update': 'แก้ไขบัญชีผู้ใช้',
  'user.change-password': 'เปลี่ยนรหัสผ่าน',
  'user.reset-password': 'ตั้งรหัสผ่านใหม่ให้',
  'user.unlock': 'ปลดล็อกบัญชี',
  'user.suspend': 'ระงับบัญชี',
  'user.unsuspend': 'ยกเลิกการระงับบัญชี',

  // เจ้าของสัตว์ / สัตว์เลี้ยง
  'owner.create': 'เพิ่มเจ้าของสัตว์ใหม่',
  'owner.update': 'แก้ไขข้อมูลเจ้าของสัตว์',
  'owner.delete': 'ลบเจ้าของสัตว์',
  'owner.self_link': 'เจ้าของสัตว์ผูกบัญชีตัวเอง',
  'owner.self_register': 'เจ้าของสัตว์สมัครบัญชีเอง',
  'pet.create': 'เพิ่มสัตว์เลี้ยงใหม่',
  'pet.update': 'แก้ไขข้อมูลสัตว์เลี้ยง',
  'pet.delete': 'ลบสัตว์เลี้ยง',
  'pet.set-deceased': 'บันทึกวันที่สัตว์เสียชีวิต',
  'pet.photo': 'เปลี่ยนรูปสัตว์เลี้ยง',
  'pet.photo_clear': 'ลบรูปสัตว์เลี้ยง',

  // บทบาทและสิทธิ์
  'role.create': 'สร้างบทบาทใหม่',
  'role.update': 'แก้ไขบทบาท/สิทธิ์',
  'role.delete': 'ลบบทบาท',

  // ข้อมูลหลัก — ทะเบียนที่มี sortOrder ใช้รูปแบบเดียวกันหมด (create/update/delete/move)
  'department.create': 'เพิ่มแผนกใหม่',
  'department.update': 'แก้ไขชื่อแผนก',
  'department.delete': 'ลบแผนก',
  'department.move': 'จัดลำดับแผนกใหม่',
  'position.create': 'เพิ่มตำแหน่งใหม่',
  'position.update': 'แก้ไขชื่อตำแหน่ง',
  'position.delete': 'ลบตำแหน่ง',
  'position.move': 'จัดลำดับตำแหน่งใหม่',
  'species.create': 'เพิ่มชนิดสัตว์ใหม่',
  'species.update': 'แก้ไขชื่อชนิดสัตว์',
  'species.delete': 'ลบชนิดสัตว์',
  'species.move': 'จัดลำดับชนิดสัตว์ใหม่',
  'breed.create': 'เพิ่มสายพันธุ์ใหม่',
  'breed.update': 'แก้ไขชื่อสายพันธุ์',
  'breed.delete': 'ลบสายพันธุ์',
  'drug-category.create': 'เพิ่มหมวดยาใหม่',
  'drug-category.update': 'แก้ไขชื่อหมวดยา',
  'drug-category.delete': 'ลบหมวดยา',
  'drug-category.move': 'จัดลำดับหมวดยาใหม่',
  'service-category.create': 'เพิ่มหมวดรายการรักษาใหม่',
  'service-category.update': 'แก้ไขชื่อหมวดรายการรักษา',
  'service-category.delete': 'ลบหมวดรายการรักษา',
  'service-category.move': 'จัดลำดับหมวดรายการรักษาใหม่',
}

/** ชื่อฟิลด์ที่พบบ่อยในข้อมูล ก่อนแก้ไข/หลังแก้ไข — คีย์ที่ไม่มีในนี้จะโชว์ชื่อดิบแทน */
export const FIELD_LABEL: Record<string, string> = {
  id: 'รหัส',
  code: 'รหัส',
  name: 'ชื่อ',
  firstName: 'ชื่อจริง',
  lastName: 'นามสกุล',
  nickname: 'ชื่อเล่น',
  username: 'ชื่อผู้ใช้',
  status: 'สถานะ',
  workStatus: 'สถานะการทำงาน',
  active: 'เปิดใช้งาน',
  isActive: 'เปิดใช้งาน',
  note: 'บันทึก',
  reason: 'เหตุผล',
  rejectReason: 'เหตุผลที่ตีกลับ',
  cancelReason: 'เหตุผลที่ยกเลิก',
  phone: 'เบอร์โทร',
  email: 'อีเมล',
  address: 'ที่อยู่',
  total: 'ยอดรวม',
  subtotal: 'ยอดก่อนหักส่วนลด',
  discount: 'ส่วนลด',
  paid: 'ยอดที่รับแล้ว',
  amount: 'จำนวนเงิน',
  method: 'ช่องทางชำระ',
  reference: 'เลขอ้างอิง',
  quantity: 'จำนวน',
  unit: 'หน่วย',
  unitPrice: 'ราคาต่อหน่วย',
  dosage: 'ขนาดใช้',
  type: 'ประเภท',
  expiresOn: 'วันหมดอายุ',
  triage: 'ระดับความเร่งด่วน',
  queueNumber: 'เลขคิว',
  bookedOn: 'วันที่จอง',
  slot: 'ช่วงเวลา',
  weightKg: 'น้ำหนัก (กก.)',
  deceasedOn: 'วันที่เสียชีวิต',
  photoPath: 'รูปภาพ',
  hiredAt: 'วันที่เริ่มงาน',
  suspendedAt: 'เวลาที่ถูกระงับ',
  lockedAt: 'เวลาที่ถูกล็อก',
  failedAttempts: 'จำนวนครั้งที่กรอกรหัสผิด',
  mustChangePassword: 'ต้องเปลี่ยนรหัสผ่านครั้งแรก',
  roleId: 'บทบาท',
  employeeId: 'พนักงาน',
  departmentId: 'แผนก',
  positionId: 'ตำแหน่ง',
  ownerId: 'เจ้าของสัตว์',
  petId: 'สัตว์เลี้ยง',
  visitId: 'คิว',
  visitDrugId: 'รายการยาในคิว',
  visitServiceId: 'รายการรักษาในคิว',
  invoiceId: 'ใบเสร็จ',
  drugId: 'ยา',
  vetEmployeeId: 'สัตวแพทย์ผู้ตรวจ',
  submittedBy: 'ผู้ส่งตรวจ',
  walkInPetName: 'ชื่อสัตว์ (walk-in)',
  walkInOwnerName: 'ชื่อเจ้าของ (walk-in)',
  sortOrder: 'ลำดับ',
  reversedMovementId: 'ย้อนรายการที่',
}

/** ค่าของฟิลด์ enum บางตัว แปลตาม module ที่มันสังกัด — ใช้ label เดียวกับที่หน้าจออื่นใช้ */
const STATUS_VALUE_LABEL: Record<string, Record<string, string>> = {
  payment: INVOICE_STATUS_LABEL,
  visit: VISIT_STATUS_LABEL,
  appointment: APPOINTMENT_STATUS_LABEL,
}

/** ฟิลด์ `type` ความหมายไม่เหมือนกันข้ามโมดูล (สต็อกยา vs คลังยา) จึงแยกตาม module เหมือน status */
const TYPE_VALUE_LABEL: Record<string, Record<string, string>> = {
  'drug-stock': DRUG_MOVEMENT_TYPE_LABEL,
  'warehouse-stock': WAREHOUSE_STOCK_MOVEMENT_TYPE_LABEL,
}

const MODULE_SCOPED_FIELDS: Record<string, Record<string, Record<string, string>>> = {
  status: STATUS_VALUE_LABEL,
  type: TYPE_VALUE_LABEL,
}

const FIELD_VALUE_LABEL: Record<string, Record<string, string>> = {
  triage: TRIAGE_LABEL,
  method: PAYMENT_METHOD_LABEL,
}

/** `camelCase`/`kebab-case` ที่ไม่มีในพจนานุกรม → เว้นวรรคให้พออ่านได้ แทนที่จะโชว์ดิบเป๊ะ */
function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .toLowerCase()
}

export function labelForModule(module: string): string {
  return MODULE_LABEL[module] ?? module
}

export function labelForAction(module: string, action: string): string {
  return ACTION_LABEL[action] ?? `${labelForModule(module)}: ${action.split('.').slice(1).join('.')}`
}

export function labelForField(key: string): string {
  return FIELD_LABEL[key] ?? humanizeKey(key)
}

/** แปลงค่าดิบให้อ่านง่าย — boolean เป็นไทย, enum ที่รู้จักแปลเป็น label, ที่เหลือโชว์ตามจริง */
export function formatFieldValue(module: string, key: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'ใช่' : 'ไม่ใช่'

  if (typeof value === 'string') {
    const scoped = MODULE_SCOPED_FIELDS[key]?.[module]
    if (scoped && value in scoped) return scoped[value as keyof typeof scoped] as string

    const fieldMap = FIELD_VALUE_LABEL[key]
    if (fieldMap && value in fieldMap) return fieldMap[value as keyof typeof fieldMap] as string
    return value
  }

  if (typeof value === 'number') return String(value)

  // object/array ที่ยังไม่ได้ทำ mapping เฉพาะ — โชว์ JSON สั้น ๆ กันพังแทนดีกว่าซ่อนข้อมูล
  return JSON.stringify(value)
}
