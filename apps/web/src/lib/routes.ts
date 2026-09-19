/**
 * ที่อยู่ของทุกหน้าในระบบ
 *
 * **ไม่มีหน้าจอไหนพิมพ์ path เอง** — path ที่กระจายอยู่ตามไฟล์คือ path ที่ `grep`
 * หาไม่เจอวันที่ต้องย้ายหน้า
 */

// ---- ฝั่งหลังบ้าน (พนักงานคลินิก) ----
export const ROUTE_LOGIN = '/login'
export const ROUTE_CHANGE_PASSWORD = '/change-password'
export const ROUTE_HOME = '/'
export const ROUTE_USERS = '/settings/users'
export const ROUTE_ROLES = '/settings/roles'

// ---- ฝั่งเจ้าของสัตว์ ----
export const ROUTE_OWNER_LOGIN = '/owner/login'
export const ROUTE_OWNER_HOME = '/owner'

// ---- เมนูข้อมูลหลัก ----
export const ROUTE_SETTINGS = '/settings'
export const ROUTE_DEPARTMENTS = '/settings/departments'
export const ROUTE_POSITIONS = '/settings/positions'
export const ROUTE_EMPLOYEES = '/settings/employees'
export const ROUTE_DRUGS = '/settings/drugs'
export const ROUTE_DRUG_STOCK = '/settings/drug-stock'
export const ROUTE_WAREHOUSE_STOCK = '/settings/warehouse-stock'
export const ROUTE_SERVICE_ITEMS = '/settings/service-items'
export const ROUTE_AUDIT_LOG = '/settings/audit-log'

// ---- เมนูหน้างาน ----
export const ROUTE_QUEUE = '/queue'
export const ROUTE_APPOINTMENTS = '/appointments'
export const ROUTE_OWNERS = '/owners'
export const ROUTE_PETS = '/pets'
export const ROUTE_BILLING = '/billing'
export const ROUTE_DIAGRAMS = '/diagrams'

// ---- ประวัติ — เปิดให้พนักงานทุกคนดู ไม่ต้องมีสิทธิ์เฉพาะ ----
export const ROUTE_HISTORY = '/history'
export const ROUTE_HISTORY_DRUGS = '/history/drugs'
export const ROUTE_HISTORY_PAYMENTS = '/history/payments'
export const ROUTE_HISTORY_TREATMENTS = '/history/treatments'

// ---- ฝั่งเจ้าของสัตว์ ----
export const ROUTE_OWNER_BOOKING = '/owner/booking'
export const ROUTE_OWNER_INVOICES = '/owner/invoices'
export const ROUTE_OWNER_HISTORY = '/owner/history'
export const ROUTE_OWNER_PETS = '/owner/pets'
/** รายการจองทั้งหมด — แยกจากหน้าจองใหม่ (`ROUTE_OWNER_BOOKING`) */
export const ROUTE_OWNER_BOOKINGS = '/owner/bookings'
export const ROUTE_PUBLIC_DIAGRAMS = '/public-diagrams'
/** ใบเสร็จรายใบของลูกค้า — หน้าที่สแกน QR และแนบสลิป */
export const routeOwnerInvoice = (id: number) => `/owner/invoices/${id}`
/** ประวัติการรักษาครั้งเดียว — วันที่ รักษาอะไรไปบ้าง */
export const routeOwnerHistory = (id: number) => `/owner/history/${id}`
