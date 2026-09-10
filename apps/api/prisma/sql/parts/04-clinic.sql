-- ข้อบังคับของยาและรายการรักษา
--
-- ทุกคำสั่งรันซ้ำได้ เพราะมันรันใหม่ทุกครั้งที่ `bun run db:push`

-- ============================================================================
-- drug_category · service_category
-- ============================================================================

COMMENT ON TABLE drug_category IS 'หมวดยา — จัดการจากในหน้ายา ไม่มีเมนูแยก';
COMMENT ON TABLE service_category IS 'หมวดบริการ — จัดการจากในหน้ารายการรักษา';

CREATE UNIQUE INDEX IF NOT EXISTS drug_category_name_live_key
  ON drug_category (name)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS service_category_name_live_key
  ON service_category (name)
  WHERE deleted_at IS NULL;

ALTER TABLE drug_category DROP CONSTRAINT IF EXISTS drug_category_deleted_pair_check;
ALTER TABLE drug_category ADD CONSTRAINT drug_category_deleted_pair_check
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

ALTER TABLE service_category DROP CONSTRAINT IF EXISTS service_category_deleted_pair_check;
ALTER TABLE service_category ADD CONSTRAINT service_category_deleted_pair_check
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

ALTER TABLE drug_category DROP CONSTRAINT IF EXISTS drug_category_sort_order_check;
ALTER TABLE drug_category ADD CONSTRAINT drug_category_sort_order_check
  CHECK (sort_order >= 0 AND sort_order <= 2000000000);

ALTER TABLE service_category DROP CONSTRAINT IF EXISTS service_category_sort_order_check;
ALTER TABLE service_category ADD CONSTRAINT service_category_sort_order_check
  CHECK (sort_order >= 0 AND sort_order <= 2000000000);

ALTER TABLE drug_category DROP CONSTRAINT IF EXISTS drug_category_name_not_blank_check;
ALTER TABLE drug_category ADD CONSTRAINT drug_category_name_not_blank_check
  CHECK (btrim(name) <> '');

ALTER TABLE service_category DROP CONSTRAINT IF EXISTS service_category_name_not_blank_check;
ALTER TABLE service_category ADD CONSTRAINT service_category_name_not_blank_check
  CHECK (btrim(name) <> '');

-- ============================================================================
-- drug
-- ============================================================================

COMMENT ON TABLE drug IS 'ยาและเวชภัณฑ์ — รหัสและราคาไม่บังคับ';
COMMENT ON COLUMN drug.code IS 'รหัสยา ไม่บังคับ ห้ามซ้ำเฉพาะแถวที่กรอกมาและยังไม่ถูกลบ';
COMMENT ON COLUMN drug.price IS 'ราคาต่อหน่วยวันนี้ null คือยังไม่ตั้งราคา ต่างจาก 0 ที่แปลว่าแจกฟรี';
COMMENT ON COLUMN drug.generic_name IS 'ตัวยาสำคัญ ใช้เทียบว่ายาสองตัวคือตัวเดียวกัน';
COMMENT ON COLUMN drug.is_active IS 'เลิกใช้แล้ว ยังอยู่ในประวัติเก่าแต่ไม่ให้เลือกใหม่ คนละเรื่องกับการลบ';

-- ชื่อยาห้ามซ้ำในกลุ่มที่ยังไม่ถูกลบ
CREATE UNIQUE INDEX IF NOT EXISTS drug_name_live_key
  ON drug (name)
  WHERE deleted_at IS NULL;

-- **รหัสห้ามซ้ำ เฉพาะแถวที่กรอกมา**
--
-- `WHERE code IS NOT NULL` สำคัญมาก — ขาดไปแล้วยาที่ไม่มีรหัสจะมีได้ตัวเดียวทั้งคลินิก
-- เพราะ `null` ตัวที่สองจะชนกับตัวแรก
--
-- (Postgres ยอมให้ `null` ซ้ำได้ภายใต้ unique ธรรมดาอยู่แล้ว แต่ที่นี่เป็น partial index
-- ที่มีเงื่อนไข `deleted_at` อยู่ด้วย จึงเขียนให้ชัดว่ากรองอะไรบ้าง)
CREATE UNIQUE INDEX IF NOT EXISTS drug_code_live_key
  ON drug (code)
  WHERE deleted_at IS NULL AND code IS NOT NULL;

ALTER TABLE drug DROP CONSTRAINT IF EXISTS drug_deleted_pair_check;
ALTER TABLE drug ADD CONSTRAINT drug_deleted_pair_check
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

ALTER TABLE drug DROP CONSTRAINT IF EXISTS drug_name_not_blank_check;
ALTER TABLE drug ADD CONSTRAINT drug_name_not_blank_check
  CHECK (btrim(name) <> '');

-- ราคาติดลบไม่มีความหมาย · ศูนย์มี (ของแจก)
ALTER TABLE drug DROP CONSTRAINT IF EXISTS drug_price_check;
ALTER TABLE drug ADD CONSTRAINT drug_price_check
  CHECK (price IS NULL OR price >= 0);

-- **มีราคาแล้วต้องมีหน่วย**
--
-- ราคาที่ไม่รู้ว่าต่อหน่วยอะไร คือตัวเลขที่คิดเงินไม่ได้ · บังคับที่ฐานด้วย ไม่ใช่แค่ที่
-- ฟอร์ม เพราะเส้นนำเข้าข้อมูลในอนาคตจะไม่ผ่านฟอร์ม
ALTER TABLE drug DROP CONSTRAINT IF EXISTS drug_price_needs_unit_check;
ALTER TABLE drug ADD CONSTRAINT drug_price_needs_unit_check
  CHECK (price IS NULL OR btrim(coalesce(unit, '')) <> '');

-- ============================================================================
-- service_item
-- ============================================================================

COMMENT ON TABLE service_item IS 'รายการรักษาและบริการ — รหัสและราคาไม่บังคับ';
COMMENT ON COLUMN service_item.price IS 'ราคาวันนี้ null คือยังไม่ตั้งราคา ต่างจาก 0 ที่แปลว่าไม่คิดเงิน';

CREATE UNIQUE INDEX IF NOT EXISTS service_item_name_live_key
  ON service_item (name)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS service_item_code_live_key
  ON service_item (code)
  WHERE deleted_at IS NULL AND code IS NOT NULL;

ALTER TABLE service_item DROP CONSTRAINT IF EXISTS service_item_deleted_pair_check;
ALTER TABLE service_item ADD CONSTRAINT service_item_deleted_pair_check
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

ALTER TABLE service_item DROP CONSTRAINT IF EXISTS service_item_name_not_blank_check;
ALTER TABLE service_item ADD CONSTRAINT service_item_name_not_blank_check
  CHECK (btrim(name) <> '');

ALTER TABLE service_item DROP CONSTRAINT IF EXISTS service_item_price_check;
ALTER TABLE service_item ADD CONSTRAINT service_item_price_check
  CHECK (price IS NULL OR price >= 0);

-- ============================================================================
-- drug_stock_movement
-- ============================================================================

COMMENT ON TABLE drug_stock_movement IS
  'ประวัติสต็อกยา — log ที่ไม่แก้ไม่ลบ จำนวนคงเหลือคือผลรวม quantity ต่อยาแต่ละตัว';
COMMENT ON COLUMN drug_stock_movement.quantity IS 'มีเครื่องหมาย บวกคือเพิ่มสต็อก ลบคือลดสต็อก';
COMMENT ON COLUMN drug_stock_movement.reason IS 'บังคับกรอกเฉพาะตอนปรับยอด (type = ADJUST)';

-- ไม่มีค่า 0 — ไม่มีเหตุผลจะบันทึกรายการที่ไม่เปลี่ยนอะไรเลย
ALTER TABLE drug_stock_movement DROP CONSTRAINT IF EXISTS drug_stock_movement_quantity_check;
ALTER TABLE drug_stock_movement ADD CONSTRAINT drug_stock_movement_quantity_check
  CHECK (quantity <> 0);

-- ปรับยอดต้องอธิบายเหตุผล — ประเภทอื่นไม่บังคับ
ALTER TABLE drug_stock_movement DROP CONSTRAINT IF EXISTS drug_stock_movement_reason_check;
ALTER TABLE drug_stock_movement ADD CONSTRAINT drug_stock_movement_reason_check
  CHECK (type <> 'ADJUST' OR btrim(coalesce(reason, '')) <> '');
