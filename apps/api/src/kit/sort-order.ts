import { notFound } from './app-error.ts'
import type { Tx } from './db.ts'

/**
 * ลำดับที่ผู้ใช้ลากเอง
 *
 * ตารางที่มี `sortOrder` ทุกตัวเดินเลขคณิตชุดเดียวกัน — แถวใหม่ขึ้นบนแล้วคนอื่นเลื่อนลง
 * ลบแล้วปิดช่องที่ทิ้งไว้ ย้ายแล้วคนที่ขวางทางเลื่อนหลบ · ฟังก์ชันในไฟล์นี้**ไม่รู้จัก
 * ตารางไหนเลย** ผู้เรียกส่ง delegate ของตัวเองเข้ามา
 *
 * ที่ยกมาไว้ที่เดียวเพราะเลขคณิตพวกนี้ผิดแล้วเห็นยาก: ลิสต์ยังดูเรียงถูกอยู่ แต่เลขข้างใน
 * กลายเป็น 0, 4, 9, 11 แล้ววันหนึ่งสองแถวถือเลขเดียวกัน ลิสต์ก็สลับตัวเองทุกครั้งที่
 * refresh
 */

/**
 * เท่าที่ฟังก์ชันพวกนี้ต้องรู้จักตาราง — ไม่ต้องรู้ว่าคอลัมน์อื่นมีอะไร
 *
 * `any` ในพารามิเตอร์เป็นของจำเป็น ไม่ใช่ความมักง่าย: delegate ของ Prisma รับ generic
 * ที่ผูกกับ argument type ของตารางตัวเอง ประกาศเป็น `unknown` แล้วไม่มีตารางไหน
 * assign ได้เลย · สิ่งที่ยังรัดไว้คือ **ค่าที่คืนกลับมา** ซึ่งเป็นฝั่งที่โค้ดตรงนี้อ่าน
 */
export type SortableTable = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findFirst: (args: any) => Promise<{ id: bigint; sortOrder: number | null } | null>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateMany: (args: any) => Promise<unknown>
}

/**
 * ขอบเขตที่ลำดับนับอยู่ — ว่างแปลว่าทั้งตาราง
 *
 * ทะเบียนอย่างแผนกหรือสาขามีลิสต์ชุดเดียว ลำดับจึงเป็นของทั้งตารางและไม่ต้องส่งอะไรมา ·
 * ตารางที่ลำดับเป็นของแต่ละกลุ่มส่งคอลัมน์ที่แบ่งกลุ่มเข้ามา เช่น
 * `{ componentCategoryId }` — ตัวเลือกในหมวด "ชนิดผ้า" กับใน "สีผ้า" ต่างถือเลข 0
 * พร้อมกันได้ และถูกต้อง เพราะแต่ละหมวดเป็นลิสต์ของตัวเอง
 *
 * **ทุกฟังก์ชันในไฟล์นี้ต้องรับมันไปด้วยกันทั้งชุด** — ตัวใดตัวหนึ่งลืมแล้วเลขจะเพี้ยน
 * ข้ามกลุ่ม: เปิดที่ให้แถวใหม่ในหมวดหนึ่งแล้วไปเลื่อนอีกหมวดตามไปด้วย
 */
export type SortScope = Record<string, unknown>

/**
 * กันไม่ให้สองคำขอแตะลำดับของลิสต์เดียวกันพร้อมกัน
 *
 * ทุกฟังก์ชันในไฟล์นี้เลื่อนลำดับด้วย `updateMany` ที่แตะแถวเป็นชุด · สองทรานแซกชัน
 * ที่ทำพร้อมกันจะล็อกแถวชุดที่ทับกันคนละลำดับ แล้วเกิดสองอาการ:
 *
 *   1. **deadlock** — Postgres ตัดตัวหนึ่งทิ้ง ออกไปเป็น 500 "ระบบขัดข้อง"
 *   2. **เลขซ้ำ** — ต่างฝ่ายต่างลดจากค่าที่อ่านมาก่อนอีกฝ่ายเขียน แล้วสองแถวถือเลข
 *      เดียวกัน · อาการนี้เงียบสนิท ไม่มี error และลิสต์จะสลับตัวเองทุกครั้งที่ refresh
 *
 * ทั้งคู่วัดได้จริง 2026-08-26 — ลบสิบแถวพร้อมกันแล้วได้ `2000001 2000001`
 *
 * **`pg_advisory_xact_lock` ไม่ใช่ตารางล็อก** — มันผูกกับทรานแซกชันและปล่อยเองตอน
 * commit หรือ rollback จึงไม่มีทางค้าง · คนละลิสต์ได้คนละกุญแจ จึงไม่ขวางกัน
 *
 * `tx` ต้องเป็นทรานแซกชันจริง — ล็อกที่จับนอกทรานแซกชันจะถูกปล่อยทันที
 * ซึ่งเท่ากับไม่ได้ล็อกอะไรเลย
 */
async function lockList(tx: Tx, listKey: string): Promise<void> {
  /**
   * แปลงชื่อลิสต์เป็นเลข 64 บิตด้วย `hashtextextended`
   *
   * ฟังก์ชันของ Postgres เอง — ไม่ต้องมีตารางทะเบียนกุญแจ และให้ค่าเดิมเสมอสำหรับ
   * ชื่อเดิม · การชนกันของ hash แปลว่าสองลิสต์ใช้กุญแจร่วมกัน ซึ่งช้าลงนิดหน่อย
   * แต่ยังถูกต้อง — ต่างจากการชนกันของกุญแจที่คนตั้งเอง ซึ่งจะจับผิดตัวเงียบ ๆ
   */
  /**
   * `$executeRaw` ไม่ใช่ `$queryRaw` — ฟังก์ชันนี้คืน `void` ซึ่ง Prisma อ่านกลับ
   * ไม่ได้ (`Failed to deserialize column of type 'void'`) · ที่ต้องการคือผลข้างเคียง
   * ไม่ใช่ค่าที่คืนมา
   */
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${listKey}, 0))`
}

/**
 * ชื่อของลิสต์ที่ลำดับนับอยู่ — ตาราง บวกกลุ่ม (ถ้ามี)
 *
 * ตารางที่ลำดับเป็นของทั้งตารางได้ชื่อเดียว · ตารางที่แบ่งกลุ่มได้ชื่อละกลุ่ม
 * เช่น `component_item:componentCategoryId=8` — ตัวเลือกในหมวดหนึ่งไม่ขวางอีกหมวด
 */
function listKeyOf(table: string, scope: SortScope = {}): string {
  const parts = Object.keys(scope)
    .sort()
    .map((k) => `${k}=${String(scope[k])}`)
  return parts.length === 0 ? table : `${table}:${parts.join(',')}`
}

/**
 * ลิสต์ที่กำลังจะถูกแตะ — ทรานแซกชัน · ตัวตาราง · ชื่อตาราง · กลุ่ม
 *
 * **มัดสี่อย่างไว้ด้วยกันโดยตั้งใจ** — แยกเป็นพารามิเตอร์ทีละตัวแล้วมีวันที่ใครสักคน
 * ส่ง `tx` ของทรานแซกชันหนึ่งพร้อม delegate ของอีกทรานแซกชัน ซึ่งล็อกผิดตัวเงียบ ๆ ·
 * รูปนี้บังคับให้เขียนทั้งชุดพร้อมกัน
 *
 * `name` คือชื่อตารางที่ใช้เป็นกุญแจ ไม่ใช่ชื่อคอลัมน์ — ต้องไม่ซ้ำกับตารางอื่น
 */
export type SortList = {
  tx: Tx
  table: SortableTable
  name: string
  scope?: SortScope
  /**
   * ตารางนี้ soft delete ไหม — **ค่าตั้งต้นคือใช่**
   *
   * ตารางที่ soft delete ต้องกรอง `deletedAt: null` ทุก query ที่แตะลำดับ ไม่งั้นแถวที่
   * ถูกลบไปแล้ว (ซึ่งถือ `sortOrder` เป็น null) จะถูกนับรวม
   *
   * **ตารางที่ลบจริงไม่มีคอลัมน์นั้น** — ส่งตัวกรองไปแล้ว Prisma ปฏิเสธทั้งคำสั่ง
   * (`Unknown argument deletedAt`) · สายใต้ `ProductType` เปลี่ยนเป็นลบจริงเมื่อ
   * 2026-08-27 จึงต้องส่ง `softDeletes: false` มา
   *
   * ค่าตั้งต้นเป็น `true` เพราะทะเบียนส่วนใหญ่ยัง soft delete อยู่ และการลืมส่งค่าที่
   * ตารางนั้นต้องการ จะพังทันทีตอนรัน ไม่ใช่พังเงียบ
   */
  softDeletes?: boolean
}

/** `where` ที่กรองแถวที่ถูกลบออก — ว่างเปล่าเมื่อตารางนั้นลบจริง */
function liveOnly(list: { softDeletes?: boolean }): Record<string, unknown> {
  return list.softDeletes === false ? {} : { deletedAt: null }
}

/**
 * จับกุญแจของลิสต์นี้ แล้วคืน scope ที่ฟังก์ชันข้างในต้องใช้
 *
 * **จับซ้ำได้ไม่มีผล** — `pg_advisory_xact_lock` ที่ทรานแซกชันเดิมถืออยู่แล้วคืนทันที ·
 * ฟังก์ชันที่เรียกต่อกันในคำขอเดียวจึงไม่รอตัวเอง
 */
async function enterList(list: SortList): Promise<SortScope> {
  const scope = list.scope ?? {}
  await lockList(list.tx, listKeyOf(list.name, scope))
  return scope
}

/**
 * จับกุญแจของลิสต์ **ตั้งแต่ต้นทรานแซกชัน** — ก่อนงานอื่นทั้งหมด
 *
 * ฟังก์ชันเลื่อนลำดับจับกุญแจให้เองอยู่แล้ว แต่จับตอนที่ถูกเรียก ซึ่งอาจเป็นกลางทาง ·
 * คำขอที่ลบตัวแม่ต้องไล่ลบลูกก่อน แล้วค่อยปิดช่อง — คนที่รอคิวจึงรอทั้งงานนั้น
 * ไม่ใช่รอแค่ช่วงที่แตะลำดับ และเมื่อคิวยาวพอ ทรานแซกชันแรก ๆ จะหมดเวลา 5 วินาที
 * ของ Prisma ทั้งที่ไม่มีอะไรผิด (วัดจริง 2026-08-26 — ลบสิบแถวพร้อมกันได้ 500 สามตัว)
 *
 * เรียกตัวนี้เป็นบรรทัดแรกใน `inTx` แล้วทุกคนเข้าคิวตั้งแต่ยังไม่ทำงาน คิวจึงเดินเร็ว
 */
export async function lockSortList(list: Omit<SortList, 'table'>): Promise<void> {
  await lockList(list.tx, listKeyOf(list.name, list.scope ?? {}))
}

/**
 * ทุกแถวที่ยังอยู่ในลิสต์เลื่อนลงหนึ่งช่อง — เปิดที่ให้แถวใหม่ที่ตำแหน่ง 0
 *
 * แถวที่ถูกลบถือ `sortOrder` เป็น null และไม่ถูกแตะ — มันไม่ได้อยู่ในลิสต์
 * จึงไม่มีตำแหน่งให้สละ
 *
 * **ต้องเรียกใน transaction เดียวกับ create** ไม่งั้นสองคนที่สร้างพร้อมกันจะอ่านเจอ
 * "ลิสต์เริ่มที่ 0" ทั้งคู่ เลื่อนทั้งคู่ แล้วเขียนลงที่ 0 ทั้งคู่
 */
export async function shiftDownForNew(list: SortList): Promise<void> {
  const scope = await enterList(list)

  await list.table.updateMany({
    where: { ...liveOnly(list), ...scope },
    data: { sortOrder: { increment: 1 } },
  })
}

/**
 * ปิดช่องที่แถวซึ่งถูกลบทิ้งไว้ — คนที่อยู่ข้างล่างเลื่อนขึ้นมาหนึ่งช่อง
 *
 * `vacated` เป็น null ได้ตามสัญญา เพราะแถวหนึ่งอาจถูกทิ้งไว้โดยไม่มีตำแหน่งด้วยเหตุอื่น
 * และ `gt: null` ไม่ตรงกับอะไรที่มีประโยชน์
 */
export async function closeGap(list: SortList, vacated: number | null): Promise<void> {
  if (vacated === null) return

  const scope = await enterList(list)

  await list.table.updateMany({
    where: { ...liveOnly(list), sortOrder: { gt: vacated }, ...scope },
    data: { sortOrder: { decrement: 1 } },
  })
}

/**
 * หาว่าแถวที่กำลังย้ายควรไปลงเลขอะไร
 *
 * `beforeId` เป็น null แปลว่าไปล่างสุด · เป็น id แปลว่าไปอยู่ก่อนแถวนั้น
 *
 * **ย้ายลงต้องลบหนึ่ง** เพราะแถวเป้าหมายจะเลื่อนขึ้นเองตอนที่แถวที่กำลังย้ายออกจาก
 * ช่องเดิม การไปอยู่ "ก่อน" มันจึงหมายถึงเลขที่อยู่หลังตำแหน่งที่มันกำลังจะกลายเป็น
 *
 * คืน `null` เมื่อไม่ต้องย้าย — ลากลงบนตัวเอง หรืออยู่ตรงนั้นอยู่แล้ว
 *
 * **`scope` ปิดทางลากข้ามกลุ่มด้วย** — แถวเป้าหมายที่อยู่คนละกลุ่มหาไม่เจอ แล้วตอบ
 * เหมือน id ที่ไม่มีอยู่ · ไม่กรองแล้วเลขล่างสุดของอีกกลุ่มจะถูกอ่านมาเป็นของกลุ่มนี้
 */
export async function resolveMoveTarget(
  table: SortableTable,
  options: {
    id: bigint
    from: number
    beforeId: bigint | null
    label: string
    /** ดู `SortList.softDeletes` — ตารางที่ลบจริงต้องส่ง `false` มา */
    softDeletes?: boolean
  },
  scope: SortScope = {},
): Promise<number | null> {
  const { id, from, beforeId, label } = options
  const live = liveOnly(options)

  let to: number

  if (beforeId === null) {
    const last = await table.findFirst({
      where: { ...live, ...scope },
      orderBy: { sortOrder: 'desc' },
    })
    to = last?.sortOrder ?? from
  } else {
    if (beforeId === id) return null

    const target = await table.findFirst({
      where: { id: beforeId, ...live, ...scope },
    })
    if (!target || target.sortOrder === null) {
      throw notFound(`ไม่พบ${label}ที่จะย้ายไปอยู่ก่อน`, { beforeId: String(beforeId) })
    }

    to = target.sortOrder > from ? target.sortOrder - 1 : target.sortOrder
  }

  return to === from ? null : to
}

/**
 * เลื่อนแถวที่ขวางทางให้หลบ — ขึ้นหรือลงแล้วแต่ทิศที่แถวนั้นเดินทาง
 *
 * **ต้องเรียกใน transaction เดียวกับการเขียนเลขใหม่ลงแถวที่ย้าย** ครึ่งเดียวคือลิสต์
 * ที่มีสองแถวถือเลขเดียวกัน
 */
export async function shiftBetween(
  list: SortList,
  options: { from: number; to: number },
): Promise<void> {
  const { from, to } = options
  const scope = await enterList(list)

  if (to < from) {
    await list.table.updateMany({
      where: { ...liveOnly(list), sortOrder: { gte: to, lt: from }, ...scope },
      data: { sortOrder: { increment: 1 } },
    })
    return
  }

  await list.table.updateMany({
    where: { ...liveOnly(list), sortOrder: { gt: from, lte: to }, ...scope },
    data: { sortOrder: { decrement: 1 } },
  })
}
