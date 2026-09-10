import { invalid } from '../../kit/app-error.ts'
import type { PromptPayTargetKind } from './promptpay.ts'

/**
 * บัญชีพร้อมเพย์ที่รับเงิน — **มาจาก `.env` ไม่ใช่จากฐาน** (ผู้ใช้กำหนด 2026-09-01)
 *
 * **ทำไมไม่เก็บในตาราง**
 *
 * มันคือค่าตั้งของ *เครื่องที่รัน* ไม่ใช่ข้อมูลของคลินิก · เครื่อง dev กับเครื่องจริง
 * ต้องชี้คนละบัญชีเสมอ และค่าที่อยู่ในฐานจะติดไปกับ dump ที่ก๊อปมาทดสอบ — แล้ววันหนึ่ง
 * เครื่อง dev จะออก QR ที่เงินเข้าบัญชีจริง
 *
 * อีกอย่างคือ **ไม่มีหน้าจอให้ใครแก้** ซึ่งถูกแล้ว: เปลี่ยนบัญชีปลายทางคือการเปลี่ยน
 * ปลายทางของเงินทั้งคลินิก ควรเป็นการ deploy ไม่ใช่การกดปุ่ม
 *
 * **อ่านตอนเรียก ไม่ใช่ตอนโหลดโมดูล** — ไฟล์เทสตั้งค่าของตัวเองแล้วเรียก · อ่านไว้
 * ตั้งแต่ import แปลว่าค่าที่ตั้งทีหลังไม่มีผล
 */

export type PromptPaySettings = {
  target: string
  targetKind: PromptPayTargetKind
  displayName: string
}

/** ตั้งค่าครบหรือยัง — หน้าเว็บถามก่อนวาดปุ่ม "จ่ายด้วย QR" */
export function isPromptPayConfigured(): boolean {
  return (process.env['PROMPTPAY_TARGET'] ?? '').trim().length > 0
}

/**
 * ค่าที่ตั้งไว้ — **โยน `INVALID` เมื่อยังไม่ตั้งหรือตั้งผิดรูป**
 *
 * ตรวจรูปทุกครั้งที่เรียก ไม่ใช่ตอนบูต · เบอร์ที่ผิดรูปจะได้ QR ที่สแกนไม่ติด ซึ่ง
 * ลูกค้าเป็นคนเจอ ไม่ใช่คนที่ตั้งค่า · ปฏิเสธตรงนี้แปลว่าพนักงานเห็นข้อความทันที
 */
export function getPromptPaySettings(): PromptPaySettings {
  const raw = (process.env['PROMPTPAY_TARGET'] ?? '').trim()

  if (raw.length === 0) {
    throw invalid('ยังไม่ได้ตั้งค่าพร้อมเพย์ — ตั้ง `PROMPTPAY_TARGET` ใน .env', {
      field: 'promptpay',
    })
  }

  const target = raw.replace(/\D/g, '')

  /**
   * เดาชนิดจากความยาว — 10 หลักคือเบอร์ · 13 หลักคือเลขผู้เสียภาษี
   *
   * ให้ตั้งชนิดเองอีกตัวก็ได้ แต่มันเป็นค่าที่อนุมานจากตัวเลขได้อยู่แล้ว และค่าที่
   * ตั้งขัดกับตัวเลขจริงคือสิ่งที่จะเกิดถ้าเปิดให้ตั้ง
   */
  const targetKind: PromptPayTargetKind =
    target.length === 13 ? 'TAX_ID' : 'PHONE'

  if (targetKind === 'PHONE' && !/^0\d{9}$/.test(target)) {
    throw invalid(
      'PROMPTPAY_TARGET ต้องเป็นเบอร์ 10 หลักขึ้นต้นด้วย 0 หรือเลขผู้เสียภาษี 13 หลัก',
      { field: 'promptpay' },
    )
  }

  return {
    target,
    targetKind,
    displayName: (process.env['PROMPTPAY_NAME'] ?? 'Paw Soft Clinic').trim(),
  }
}
