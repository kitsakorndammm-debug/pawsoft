-- ข้อบังคับของการจองและคิวหน้างาน
--
-- ทุกคำสั่งรันซ้ำได้ เพราะมันรันใหม่ทุกครั้งที่ `bun run db:push`

-- ============================================================================
-- appointment
-- ============================================================================

COMMENT ON TABLE appointment IS 'การจองล่วงหน้า ยังไม่ใช่คิว คิวเกิดตอน check-in ที่ตาราง visit';
COMMENT ON COLUMN appointment.booked_on IS 'วันที่จอง เป็น date ไม่ใช่ timestamp เพราะจองเป็นช่วงไม่ใช่ขณะเวลา';
COMMENT ON COLUMN appointment.slot IS 'ช่วงเวลา 4 ช่วง เช้า 2 บ่าย 2 เวลาจริงตั้งที่ฝั่งแสดงผลไม่ใช่ที่ฐาน';
COMMENT ON COLUMN appointment.created_by IS 'null เมื่อลูกค้าจองเอง ตอนนั้นดูที่ created_by_owner_account_id แทน';

-- **ต้องรู้ว่าจองให้สัตว์ตัวไหน อย่างน้อยเป็นชื่อ**
--
-- `pet_id` ไม่บังคับ เพราะคนโทรมาจองให้สัตว์ที่ยังไม่เคยมาคลินิกได้ · แต่ใบจองที่
-- ไม่มีทั้ง id และชื่อ คือใบที่พนักงานหน้างานอ่านแล้วทำอะไรไม่ได้
ALTER TABLE appointment DROP CONSTRAINT IF EXISTS appointment_pet_identified_check;
ALTER TABLE appointment ADD CONSTRAINT appointment_pet_identified_check
  CHECK (pet_id IS NOT NULL OR btrim(coalesce(pet_name_text, '')) <> '');

-- **ผู้สร้างต้องเป็นฝ่ายใดฝ่ายหนึ่ง ไม่ใช่ทั้งคู่และไม่ใช่ไม่มีเลย**
--
-- ตารางนี้เป็นตารางเดียวในระบบที่คนนอกเขียนได้ · แถวที่ไม่มีทั้งสองฝั่งคือแถวที่
-- ตอบไม่ได้ว่าใครจอง และแถวที่มีทั้งสองฝั่งคือแถวที่ตอบสองคำตอบขัดกัน
ALTER TABLE appointment DROP CONSTRAINT IF EXISTS appointment_creator_check;
ALTER TABLE appointment ADD CONSTRAINT appointment_creator_check
  CHECK ((created_by IS NULL) <> (created_by_owner_account_id IS NULL));

-- การจองทาง ONLINE ต้องมาจากบัญชีลูกค้า · ทาง PHONE ต้องมาจากพนักงาน
--
-- ไม่มีตัวนี้ `source` จะกลายเป็นข้อความที่ใครพิมพ์อะไรก็ได้ แล้วรายงาน
-- "ลูกค้าจองเองกี่ราย" จะนับผิดโดยไม่มีใครรู้
ALTER TABLE appointment DROP CONSTRAINT IF EXISTS appointment_source_matches_creator_check;
ALTER TABLE appointment ADD CONSTRAINT appointment_source_matches_creator_check
  CHECK (
    (source = 'ONLINE' AND created_by_owner_account_id IS NOT NULL)
    OR (source = 'PHONE' AND created_by IS NOT NULL)
  );

-- ยกเลิกต้องมีเหตุผล · ไม่ได้ยกเลิกต้องไม่มี
ALTER TABLE appointment DROP CONSTRAINT IF EXISTS appointment_cancel_reason_check;
ALTER TABLE appointment ADD CONSTRAINT appointment_cancel_reason_check
  CHECK (
    (status = 'CANCELLED' AND btrim(coalesce(cancel_reason, '')) <> '')
    OR (status <> 'CANCELLED' AND cancel_reason IS NULL)
  );

ALTER TABLE appointment DROP CONSTRAINT IF EXISTS appointment_deleted_pair_check;
ALTER TABLE appointment ADD CONSTRAINT appointment_deleted_pair_check
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

-- **กันจองซ้ำซ้อน — เจ้าของคนเดิม สัตว์ตัวเดิม วันเดิม ช่วงเดิม จองได้ใบเดียว**
--
-- กดปุ่มจองสองครั้งเพราะเน็ตช้า เป็นเหตุการณ์ปกติ · ไม่มีตัวนี้ คลินิกจะเห็นสองใบ
-- แล้วเตรียมของสองชุด · เฉพาะใบที่ยังมีผล เพราะจองใหม่หลังยกเลิกต้องได้
--
-- **นับ `PENDING` ด้วย ไม่ใช่แค่ `BOOKED`** (เพิ่ม 2026-09-01 พร้อมการจองออนไลน์) ·
-- ใบที่รอพนักงานโทรยืนยันก็กินที่อยู่เหมือนกัน · นับแต่ `BOOKED` แปลว่าลูกค้ากดจอง
-- ซ้ำได้ไม่จำกัดตราบใดที่ยังไม่มีใครโทรกลับ ซึ่งเป็นช่วงที่กดซ้ำง่ายที่สุด
--
-- **`DROP` ก่อนเสมอ ไม่ใช่ `IF NOT EXISTS` เปล่า ๆ** · `IF NOT EXISTS` ดูแค่ชื่อซ้ำ
-- ไม่ได้ดูว่าเงื่อนไขข้างในเปลี่ยนไปหรือยัง · ตอนแก้เงื่อนไขให้นับ `PENDING` ด้วย
-- คำสั่งนี้ถูกข้ามเงียบ ๆ แล้ว index เก่ายังบังคับกฎเดิมอยู่ (เจอตอนวัดจริง 2026-09-01
-- — เทสจองซ้ำได้ 201 ทั้งที่โค้ดกับ SQL อ่านแล้วถูกทั้งคู่)
DROP INDEX IF EXISTS appointment_no_double_booking_key;
CREATE UNIQUE INDEX appointment_no_double_booking_key
  ON appointment (owner_id, pet_id, booked_on, slot)
  WHERE deleted_at IS NULL AND status IN ('PENDING', 'BOOKED') AND pet_id IS NOT NULL;

-- **ยืนยันแล้วต้องรู้ว่าใครยืนยันและเมื่อไหร่ — และ `PENDING` ต้องยังไม่มีค่านั้น**
--
-- สองคอลัมน์นี้ต้องมาคู่กันเสมอ · มีเวลาแต่ไม่รู้ว่าใครกด คือหลักฐานที่ใช้ตอบไม่ได้ว่า
-- ใครรับปากกับลูกค้าไว้
ALTER TABLE appointment DROP CONSTRAINT IF EXISTS appointment_confirmed_pair_check;
ALTER TABLE appointment ADD CONSTRAINT appointment_confirmed_pair_check
  CHECK ((confirmed_at IS NULL) = (confirmed_by IS NULL));

ALTER TABLE appointment DROP CONSTRAINT IF EXISTS appointment_pending_unconfirmed_check;
ALTER TABLE appointment ADD CONSTRAINT appointment_pending_unconfirmed_check
  CHECK (status <> 'PENDING' OR confirmed_at IS NULL);

COMMENT ON COLUMN appointment.confirmed_at IS 'พนักงานกดยืนยันเมื่อไหร่ null คือยังรอยืนยัน';
COMMENT ON COLUMN appointment.confirmed_by IS 'พนักงานที่กดยืนยัน user.id';

-- ============================================================================
-- visit — คิวจริง
-- ============================================================================

COMMENT ON TABLE visit IS 'การมาถึงคลินิกหนึ่งครั้ง นี่คือคิวจริง เกิดจากจองหรือ walk-in ก็ได้';
COMMENT ON COLUMN visit.queue_number IS 'เลขคิวของวัน รีเซ็ตทุกวัน ไม่ใช่ลำดับที่จะได้เจอหมอ';
COMMENT ON COLUMN visit.queue_date IS 'วันของคิว แยกจาก arrived_at เพราะคลินิกที่เปิดข้ามเที่ยงคืนตัดสินเอง';
COMMENT ON COLUMN visit.triage IS 'ความเร่งด่วน เรียงคิวใช้ตัวนี้ก่อนเวลามาถึงเสมอ เคสแดงแทรกได้';
COMMENT ON COLUMN visit.pet_id IS 'null ได้ เคสฉุกเฉินเปิดคิวก่อนแล้วผูกสัตว์ทีหลัง ระบบต้องไม่ขวางการรักษา';
COMMENT ON COLUMN visit.weight_kg IS 'น้ำหนักครั้งนี้ แหล่งความจริงของใบสั่งยาครั้งนี้ ไม่ใช่ pet.weight_kg';

-- **เลขคิวห้ามซ้ำภายในวันเดียวกัน**
--
-- เลขคิวคือสิ่งที่ลูกค้าถือและได้ยินตอนเรียก · สองคนถือเลข 12 แปลว่าเรียกแล้วลุกมา
-- สองคน · unique ต่อวัน ไม่ใช่ทั้งตาราง เพราะพรุ่งนี้เริ่มนับหนึ่งใหม่
CREATE UNIQUE INDEX IF NOT EXISTS visit_queue_number_per_day_key
  ON visit (queue_date, queue_number)
  WHERE deleted_at IS NULL;

-- **ต้องรู้ว่าเป็นสัตว์ตัวไหน อย่างน้อยเป็นชื่อที่เขียนหน้างาน**
--
-- เหตุผลเดียวกับ `appointment_pet_identified_check` — คิวที่ไม่มีชื่ออะไรเลย
-- คือคิวที่เรียกไม่ได้
ALTER TABLE visit DROP CONSTRAINT IF EXISTS visit_pet_identified_check;
ALTER TABLE visit ADD CONSTRAINT visit_pet_identified_check
  CHECK (pet_id IS NOT NULL OR btrim(coalesce(walk_in_pet_name, '')) <> '');

-- เรียกแล้วต้องมีเวลาเรียก · จบแล้วต้องมีเวลาจบ
--
-- สถานะกับ timestamp ที่ไม่ตรงกัน แปลว่ารายงาน "รอเฉลี่ยกี่นาที" คำนวณจากค่าว่าง
ALTER TABLE visit DROP CONSTRAINT IF EXISTS visit_called_at_check;
ALTER TABLE visit ADD CONSTRAINT visit_called_at_check
  CHECK (status NOT IN ('IN_PROGRESS', 'AWAITING_PAYMENT', 'DONE') OR called_at IS NOT NULL);

ALTER TABLE visit DROP CONSTRAINT IF EXISTS visit_done_at_check;
ALTER TABLE visit ADD CONSTRAINT visit_done_at_check
  CHECK ((status = 'DONE') = (done_at IS NOT NULL));

-- เวลาต้องเดินไปข้างหน้า
ALTER TABLE visit DROP CONSTRAINT IF EXISTS visit_time_order_check;
ALTER TABLE visit ADD CONSTRAINT visit_time_order_check
  CHECK (
    (called_at IS NULL OR called_at >= arrived_at)
    AND (done_at IS NULL OR called_at IS NULL OR done_at >= called_at)
  );

ALTER TABLE visit DROP CONSTRAINT IF EXISTS visit_queue_number_check;
ALTER TABLE visit ADD CONSTRAINT visit_queue_number_check
  CHECK (queue_number > 0);

ALTER TABLE visit DROP CONSTRAINT IF EXISTS visit_weight_check;
ALTER TABLE visit ADD CONSTRAINT visit_weight_check
  CHECK (weight_kg IS NULL OR weight_kg > 0);

ALTER TABLE visit DROP CONSTRAINT IF EXISTS visit_deleted_pair_check;
ALTER TABLE visit ADD CONSTRAINT visit_deleted_pair_check
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

-- จอคิววันนี้ — เส้นทางที่เปิดบ่อยที่สุดในระบบ กรองเฉพาะแถวที่ยังอยู่ในคลินิก
--
-- **ต้องตรงกับ `LIVE_STATUSES` ใน `visit.service.ts` เสมอ** · ไม่ตรงเมื่อไหร่ index
-- จะไม่ครอบคิวรีที่มันมีไว้เร่ง แล้ว Postgres จะสแกนทั้งตารางเงียบ ๆ โดยไม่มีอะไรพัง
-- ให้เห็น (เพิ่ม `AWAITING_PAYMENT` ตาม service เมื่อ 2026-09-01)
DROP INDEX IF EXISTS visit_live_queue_idx;
CREATE INDEX IF NOT EXISTS visit_live_queue_idx
  ON visit (queue_date, triage, arrived_at)
  WHERE deleted_at IS NULL AND status IN ('WAITING', 'IN_PROGRESS', 'AWAITING_PAYMENT');

-- ============================================================================
-- visit_service · visit_drug
-- ============================================================================

COMMENT ON TABLE visit_service IS 'รายการรักษาที่ทำครั้งนี้ ราคาคัดลอกมาไม่ได้ชี้ไปที่ service_item';
COMMENT ON TABLE visit_drug IS 'ยาที่จ่ายครั้งนี้ ราคาคัดลอกมาด้วยเหตุผลเดียวกัน';
COMMENT ON COLUMN visit_service.unit_price IS 'ราคาตอนนั้น ขึ้นราคาวันหลังใบเสร็จเก่าต้องไม่เปลี่ยนยอด';
COMMENT ON COLUMN visit_drug.dosage IS 'ขนาดที่หมอสั่งให้สัตว์ตัวนี้ครั้งนี้ พิมพ์ลงซองยา';

-- ราคาติดลบไม่มีความหมาย · ศูนย์มี (แถมฟรี)
ALTER TABLE visit_service DROP CONSTRAINT IF EXISTS visit_service_price_check;
ALTER TABLE visit_service ADD CONSTRAINT visit_service_price_check
  CHECK (unit_price >= 0);

ALTER TABLE visit_drug DROP CONSTRAINT IF EXISTS visit_drug_price_check;
ALTER TABLE visit_drug ADD CONSTRAINT visit_drug_price_check
  CHECK (unit_price >= 0);

-- จำนวนศูนย์คือแถวที่ไม่ควรมีอยู่ — ต่างจากราคาศูนย์ที่แปลว่าแจกฟรี
ALTER TABLE visit_service DROP CONSTRAINT IF EXISTS visit_service_quantity_check;
ALTER TABLE visit_service ADD CONSTRAINT visit_service_quantity_check
  CHECK (quantity > 0);

ALTER TABLE visit_drug DROP CONSTRAINT IF EXISTS visit_drug_quantity_check;
ALTER TABLE visit_drug ADD CONSTRAINT visit_drug_quantity_check
  CHECK (quantity > 0);

ALTER TABLE visit_service DROP CONSTRAINT IF EXISTS visit_service_name_not_blank_check;
ALTER TABLE visit_service ADD CONSTRAINT visit_service_name_not_blank_check
  CHECK (btrim(name_snapshot) <> '');

ALTER TABLE visit_drug DROP CONSTRAINT IF EXISTS visit_drug_name_not_blank_check;
ALTER TABLE visit_drug ADD CONSTRAINT visit_drug_name_not_blank_check
  CHECK (btrim(name_snapshot) <> '');
