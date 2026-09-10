-- ข้อบังคับของการชำระเงิน
--
-- ทุกคำสั่งรันซ้ำได้ เพราะมันรันใหม่ทุกครั้งที่ `bun run db:push`

-- ============================================================================
-- invoice
-- ============================================================================

COMMENT ON TABLE invoice IS 'ใบเสร็จ หนึ่งคิวหนึ่งใบ เคาน์เตอร์ส่งยอดแล้วบัญชียืนยันอีกที';
COMMENT ON COLUMN invoice.code IS 'เลขที่ใบเสร็จ unique เต็มตาราง ห้ามใช้ซ้ำเพราะไปอยู่ในบัญชีลูกค้า';
COMMENT ON COLUMN invoice.subtotal IS 'ยอดรายการ ณ วินาทีที่ออกใบ คัดลอกมาไม่ได้คำนวณสด';
COMMENT ON COLUMN invoice.total IS 'subtotal ลบ discount เก็บซ้ำโดยตั้งใจ มี CHECK บังคับว่าตรงสูตร';
COMMENT ON COLUMN invoice.verified_by IS 'บัญชีที่ยืนยัน ต้องไม่ใช่คนเดียวกับ submitted_by';

-- **หนึ่งคิวหนึ่งใบ — เฉพาะใบที่ยังมีผล**
--
-- ไม่นับใบที่ยกเลิก (`VOID`) หรือถูกลบ · ใบที่ออกผิดจึงยกเลิกแล้วออกใหม่ได้
-- (ผู้ใช้ทักท้วง 2026-09-01: "ยกเลิกใบเก็บแล้วเปิดกลับมาไม่ได้ มันไม่ดีเลยนะ")
--
-- `@unique` เต็มที่คอลัมน์แปลว่าใบที่ตายแล้วยังกินที่อยู่ตลอดกาล ซึ่งเป็นทางตัน
CREATE UNIQUE INDEX IF NOT EXISTS invoice_visit_live_key
  ON invoice (visit_id)
  WHERE deleted_at IS NULL AND status <> 'VOID';

ALTER TABLE invoice DROP CONSTRAINT IF EXISTS invoice_deleted_pair_check;
ALTER TABLE invoice ADD CONSTRAINT invoice_deleted_pair_check
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

ALTER TABLE invoice DROP CONSTRAINT IF EXISTS invoice_submitted_pair_check;
ALTER TABLE invoice ADD CONSTRAINT invoice_submitted_pair_check
  CHECK ((submitted_at IS NULL) = (submitted_by IS NULL));

ALTER TABLE invoice DROP CONSTRAINT IF EXISTS invoice_verified_pair_check;
ALTER TABLE invoice ADD CONSTRAINT invoice_verified_pair_check
  CHECK ((verified_at IS NULL) = (verified_by IS NULL));

-- **หัวใจของ recheck: คนยืนยันต้องไม่ใช่คนส่ง**
--
-- (ผู้ใช้กำหนด 2026-09-01: "จะมีบัญชีมายืนยันยอดอีกทีนึงหลังจากที่เคาน์เตอร์ส่งยอดแล้ว
-- เป็นระบบ recheck ของคลินิก")
--
-- บังคับที่ฐาน ไม่ใช่แค่ที่ service — เส้นนำเข้าข้อมูลหรือสคริปต์แก้ฉุกเฉินในอนาคต
-- จะไม่ผ่าน service และนั่นคือตอนที่กฎนี้จะถูกข้ามถ้ามันอยู่แค่ในโค้ด
ALTER TABLE invoice DROP CONSTRAINT IF EXISTS invoice_verifier_not_submitter_check;
ALTER TABLE invoice ADD CONSTRAINT invoice_verifier_not_submitter_check
  CHECK (verified_by IS NULL OR submitted_by IS NULL OR verified_by <> submitted_by);

-- ยืนยันได้ก็ต่อเมื่อส่งมาแล้ว — ข้ามขั้นไม่ได้
ALTER TABLE invoice DROP CONSTRAINT IF EXISTS invoice_verify_after_submit_check;
ALTER TABLE invoice ADD CONSTRAINT invoice_verify_after_submit_check
  CHECK (verified_at IS NULL OR (submitted_at IS NOT NULL AND verified_at >= submitted_at));

-- สถานะต้องตรงกับ timestamp ที่มี
ALTER TABLE invoice DROP CONSTRAINT IF EXISTS invoice_status_stamp_check;
ALTER TABLE invoice ADD CONSTRAINT invoice_status_stamp_check
  CHECK (
    (status = 'DRAFT'           AND verified_at IS NULL)
    OR (status = 'AWAITING_VERIFY' AND submitted_at IS NOT NULL AND verified_at IS NULL)
    OR (status = 'VERIFIED'        AND verified_at IS NOT NULL)
    OR (status = 'REJECTED'        AND submitted_at IS NOT NULL)
    OR  status = 'VOID'
  );

-- ตีกลับต้องบอกเหตุผล · ไม่ได้ตีกลับต้องไม่มี
ALTER TABLE invoice DROP CONSTRAINT IF EXISTS invoice_reject_reason_check;
ALTER TABLE invoice ADD CONSTRAINT invoice_reject_reason_check
  CHECK (
    (status = 'REJECTED' AND btrim(coalesce(reject_reason, '')) <> '')
    OR (status <> 'REJECTED' AND reject_reason IS NULL)
  );

-- เงินติดลบไม่มี · ส่วนลดเกินยอดไม่ได้
ALTER TABLE invoice DROP CONSTRAINT IF EXISTS invoice_amount_check;
ALTER TABLE invoice ADD CONSTRAINT invoice_amount_check
  CHECK (subtotal >= 0 AND discount >= 0 AND paid >= 0 AND discount <= subtotal);

-- **`total` ต้องตรงสูตรเสมอ**
--
-- เก็บซ้ำเพื่อให้ทุกที่ที่รวมยอดไม่ต้องจำสูตรเอง · ไม่มีตัวนี้ วันหนึ่งจะมีแถวที่
-- `total` ไม่เท่ากับ `subtotal - discount` แล้วไม่มีใครรู้ว่าเลขไหนถูก
ALTER TABLE invoice DROP CONSTRAINT IF EXISTS invoice_total_formula_check;
ALTER TABLE invoice ADD CONSTRAINT invoice_total_formula_check
  CHECK (total = subtotal - discount);

-- **ใบที่ยืนยันแล้วต้องรับเงินครบ**
--
-- บัญชีกดยืนยันทั้งที่ยังเก็บไม่ครบ คือใบที่ปิดไปโดยมีหนี้ค้างที่ไม่มีใครตาม
ALTER TABLE invoice DROP CONSTRAINT IF EXISTS invoice_verified_paid_full_check;
ALTER TABLE invoice ADD CONSTRAINT invoice_verified_paid_full_check
  CHECK (status <> 'VERIFIED' OR paid >= total);

CREATE INDEX IF NOT EXISTS invoice_awaiting_verify_idx
  ON invoice (submitted_at)
  WHERE deleted_at IS NULL AND status = 'AWAITING_VERIFY';

-- ============================================================================
-- payment
-- ============================================================================

COMMENT ON TABLE payment IS 'การจ่ายหนึ่งครั้ง ใบหนึ่งมีได้หลายครั้ง จ่ายสดครึ่งโอนครึ่งได้';
COMMENT ON COLUMN payment.received_at IS 'เวลาที่รับเงินจริง ไม่ใช่เวลาที่พิมพ์เข้าระบบ';
COMMENT ON COLUMN payment.slip_hash IS 'sha256 ของสลิป กันสลิปใบเดียวถูกแนบหลายใบเสร็จ';

ALTER TABLE payment DROP CONSTRAINT IF EXISTS payment_amount_check;
ALTER TABLE payment ADD CONSTRAINT payment_amount_check
  CHECK (amount > 0);

-- สลิปต้องมาคู่กับ hash เสมอ — มีไฟล์แต่ไม่มี hash แปลว่ากันซ้ำไม่ได้
ALTER TABLE payment DROP CONSTRAINT IF EXISTS payment_slip_pair_check;
ALTER TABLE payment ADD CONSTRAINT payment_slip_pair_check
  CHECK ((slip_path IS NULL) = (slip_hash IS NULL));

-- **จ่ายสดต้องไม่มีสลิป · โอนต้องมี**
--
-- ปล่อยให้จ่ายสดแนบสลิปได้ แปลว่ายอดโอนกับยอดสดกระทบกับ statement ไม่ตรง และ
-- ไม่มีใครรู้ว่าแถวไหนคือเงินที่อยู่ในลิ้นชักจริง
ALTER TABLE payment DROP CONSTRAINT IF EXISTS payment_slip_method_check;
ALTER TABLE payment ADD CONSTRAINT payment_slip_method_check
  CHECK (
    (method = 'CASH' AND slip_path IS NULL)
    OR method <> 'CASH'
  );

-- `promptpay_ref` มีได้เฉพาะการจ่ายแบบพร้อมเพย์
ALTER TABLE payment DROP CONSTRAINT IF EXISTS payment_promptpay_ref_check;
ALTER TABLE payment ADD CONSTRAINT payment_promptpay_ref_check
  CHECK (promptpay_ref IS NULL OR method = 'PROMPTPAY');

-- **ผู้สร้างต้องเป็นฝ่ายใดฝ่ายหนึ่ง ไม่ใช่ทั้งคู่และไม่ใช่ไม่มีเลย**
--
-- (ผู้ใช้กำหนด 2026-09-01: ลูกค้าสแกน QR แล้วอัปสลิปเองได้)
--
-- รูปเดียวกับ `appointment_creator_check` · แถวที่ไม่มีทั้งสองฝั่งคือแถวที่ตอบไม่ได้ว่า
-- ใครแนบสลิปมา ซึ่งเป็นคำถามแรกที่บัญชีถามตอนสลิปไม่ตรง
ALTER TABLE payment DROP CONSTRAINT IF EXISTS payment_creator_check;
ALTER TABLE payment ADD CONSTRAINT payment_creator_check
  CHECK ((created_by IS NULL) <> (created_by_owner_account_id IS NULL));

-- **ลูกค้าแนบได้เฉพาะการโอน ไม่ใช่เงินสด**
--
-- เงินสดต้องมีคนรับจริงที่เคาน์เตอร์ · ปล่อยให้ลูกค้ากดเองแปลว่าใบเสร็จบอกว่ารับ
-- เงินสดแล้วทั้งที่ไม่มีเงินอยู่ในลิ้นชัก
ALTER TABLE payment DROP CONSTRAINT IF EXISTS payment_owner_method_check;
ALTER TABLE payment ADD CONSTRAINT payment_owner_method_check
  CHECK (created_by_owner_account_id IS NULL OR method IN ('PROMPTPAY', 'TRANSFER'));

-- **สลิปใบเดียวใช้ได้ครั้งเดียวทั้งระบบ**
--
-- เป็นการฉ้อโกงที่เกิดจริง: โอนครั้งเดียวแล้วเอาสลิปเดิมไปแนบหลายใบเสร็จ ·
-- partial เพราะจ่ายสดไม่มีสลิป และ `null` หลายแถวต้องอยู่ร่วมกันได้
CREATE UNIQUE INDEX IF NOT EXISTS payment_slip_hash_key
  ON payment (slip_hash)
  WHERE slip_hash IS NOT NULL;
