-- ข้อบังคับของเจ้าของสัตว์และสัตว์เลี้ยง
--
-- ทุกคำสั่งรันซ้ำได้ เพราะมันรันใหม่ทุกครั้งที่ `bun run db:push`

-- ============================================================================
-- owner
-- ============================================================================

COMMENT ON TABLE owner IS 'เจ้าของสัตว์ ตัวคน ไม่ใช่บัญชีล็อกอิน มีได้โดยไม่ต้องมี Google';
COMMENT ON COLUMN owner.code IS 'รหัสลูกค้า unique เต็มตาราง ห้ามเอากลับมาใช้ซ้ำเพราะไปโผล่บนใบเสร็จ';
COMMENT ON COLUMN owner.phone IS 'เบอร์โทร ตัวระบุตัวตนของลูกค้า ห้ามซ้ำ ปล่อยว่างได้เฉพาะเคสฉุกเฉินที่เปิดแถวก่อนรู้ชื่อ';
COMMENT ON COLUMN owner.pet_owner_account_id IS 'บัญชี Google ที่จับคู่ไว้ null คือปกติ พนักงานจับคู่ทีหลังได้';

ALTER TABLE owner DROP CONSTRAINT IF EXISTS owner_deleted_pair_check;
ALTER TABLE owner ADD CONSTRAINT owner_deleted_pair_check
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

ALTER TABLE owner DROP CONSTRAINT IF EXISTS owner_name_not_blank_check;
ALTER TABLE owner ADD CONSTRAINT owner_name_not_blank_check
  CHECK (btrim(name) <> '');

-- **เบอร์ห้ามซ้ำ — เบอร์คือตัวระบุตัวตนของลูกค้า** (ผู้ใช้กำหนด 2026-09-01)
--
-- ลูกค้าที่ล็อกอิน Google แล้วกรอกเบอร์ตรงกับแถวเดิม ระบบเชื่อมประวัติให้เอง ·
-- กฎนั้นจะเชื่อถือได้ก็ต่อเมื่อเบอร์หนึ่งชี้ไปลูกค้าได้คนเดียว · มีสองแถวถือเบอร์
-- เดียวกันเมื่อไหร่ "เชื่อมให้เอง" จะกลายเป็นการเดาว่าเชื่อมกับใคร
--
-- **`unique` แบบ partial ไม่ใช่เต็มตาราง** — แถวที่ถูกลบแล้วต้องปล่อยเบอร์คืน
-- ให้คนใหม่ใช้ได้ · และแถวที่ไม่มีเบอร์ (เคสฉุกเฉินที่เปิดแถวก่อนรู้ชื่อ) ไม่ถูกนับ
-- เพราะ `NULL` ไม่ชนกันเองใน unique index อยู่แล้ว
DROP INDEX IF EXISTS owner_phone_live_idx;
CREATE UNIQUE INDEX IF NOT EXISTS owner_phone_live_key
  ON owner (phone)
  WHERE deleted_at IS NULL AND phone IS NOT NULL;

COMMENT ON COLUMN pet.photo_path IS 'ที่อยู่ไฟล์รูปใต้ UPLOAD_DIR ไม่ใช่ตัวไฟล์ null คือยังไม่มีรูป';

-- ============================================================================
-- species · breed
-- ============================================================================

COMMENT ON TABLE species IS 'ชนิดสัตว์ เป็นตารางไม่ใช่ enum เพราะคลินิกเพิ่มสัตว์แปลกใหม่ได้เอง';
COMMENT ON TABLE breed IS 'สายพันธุ์ ผูกกับชนิด ชื่อห้ามซ้ำภายในชนิดเดียวกันไม่ใช่ทั้งตาราง';

CREATE UNIQUE INDEX IF NOT EXISTS species_name_live_key
  ON species (name)
  WHERE deleted_at IS NULL;

-- **ห้ามซ้ำต่อชนิด ไม่ใช่ทั้งตาราง**
--
-- "เปอร์เซีย" เป็นได้ทั้งพันธุ์แมวและพันธุ์กระต่าย และมันคนละพันธุ์กัน · บังคับ
-- ห้ามซ้ำทั้งตารางแปลว่าคลินิกที่รับกระต่ายจะเพิ่มพันธุ์ที่ชื่อชนกับของแมวไม่ได้
CREATE UNIQUE INDEX IF NOT EXISTS breed_species_name_live_key
  ON breed (species_id, name)
  WHERE deleted_at IS NULL;

ALTER TABLE species DROP CONSTRAINT IF EXISTS species_deleted_pair_check;
ALTER TABLE species ADD CONSTRAINT species_deleted_pair_check
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

ALTER TABLE breed DROP CONSTRAINT IF EXISTS breed_deleted_pair_check;
ALTER TABLE breed ADD CONSTRAINT breed_deleted_pair_check
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

ALTER TABLE species DROP CONSTRAINT IF EXISTS species_name_not_blank_check;
ALTER TABLE species ADD CONSTRAINT species_name_not_blank_check
  CHECK (btrim(name) <> '');

ALTER TABLE breed DROP CONSTRAINT IF EXISTS breed_name_not_blank_check;
ALTER TABLE breed ADD CONSTRAINT breed_name_not_blank_check
  CHECK (btrim(name) <> '');

ALTER TABLE species DROP CONSTRAINT IF EXISTS species_sort_order_check;
ALTER TABLE species ADD CONSTRAINT species_sort_order_check
  CHECK (sort_order >= 0 AND sort_order <= 2000000000);

-- ============================================================================
-- pet
-- ============================================================================

COMMENT ON TABLE pet IS 'สัตว์เลี้ยงหนึ่งตัว เจ้าของบังคับ เคสฉุกเฉินที่ไม่รู้เจ้าของไปเปิด visit แทน';
COMMENT ON COLUMN pet.is_neutered IS 'ทำหมันแล้วหรือยัง null คือยังไม่ได้ถาม ต่างจาก false ที่ถามแล้ว';
COMMENT ON COLUMN pet.born_on IS 'วันเกิด เก็บวันเกิดไม่ใช่อายุ เพราะอายุที่เก็บเป็นตัวเลขจะผิดตั้งแต่วันถัดไป';
COMMENT ON COLUMN pet.weight_kg IS 'น้ำหนักล่าสุดไว้โชว์ ค่าจริงของใบสั่งยาอยู่ที่ visit.weight_kg';
COMMENT ON COLUMN pet.allergy_note IS 'ประวัติแพ้ยา ข้อความอิสระไม่ใช่ FK เพราะสัตว์แพ้ตัวยาไม่ได้แพ้ยี่ห้อ';
COMMENT ON COLUMN pet.deceased_on IS 'เสียชีวิตแล้ว ไม่ใช่การลบ ประวัติยังอยู่แต่ไม่ให้เลือกในคิวใหม่';

-- **พันธุ์ต้องเป็นพันธุ์ของชนิดที่เลือก**
--
-- ไม่มีตัวนี้ ฐานจะยอมให้บันทึกว่าเป็น "แมวพันธุ์ชิวาวา" เพราะ FK สองเส้นแยกกัน
-- ต่างคนต่างถูก · บังคับด้วย FK คู่ ต้องมี unique รองรับที่ปลายทางก่อน
--
-- **ลำดับสำคัญ: ถอน FK ก่อนถอน unique ที่มันพิงอยู่** ไม่งั้น Postgres ปฏิเสธ
--
-- ตัว `db:push` เองก็ชนเรื่องนี้ — Prisma มองไม่เห็นไฟล์นี้ เลยสั่งลบ index ที่
-- constraint พิงอยู่ · `prisma/push.ts` จึงถอนให้ก่อนเรียก Prisma (ดู `PATCH_OWNED`
-- ที่นั่น) · **เพิ่ม constraint แบบนี้เมื่อไหร่ ต้องไปเติมชื่อในลิสต์นั้นด้วย**
ALTER TABLE pet DROP CONSTRAINT IF EXISTS pet_breed_matches_species_fk;
ALTER TABLE breed DROP CONSTRAINT IF EXISTS breed_id_species_key;

ALTER TABLE breed ADD CONSTRAINT breed_id_species_key UNIQUE (id, species_id);
ALTER TABLE pet ADD CONSTRAINT pet_breed_matches_species_fk
  FOREIGN KEY (breed_id, species_id) REFERENCES breed (id, species_id);

ALTER TABLE pet DROP CONSTRAINT IF EXISTS pet_deleted_pair_check;
ALTER TABLE pet ADD CONSTRAINT pet_deleted_pair_check
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

ALTER TABLE pet DROP CONSTRAINT IF EXISTS pet_name_not_blank_check;
ALTER TABLE pet ADD CONSTRAINT pet_name_not_blank_check
  CHECK (btrim(name) <> '');

-- น้ำหนักติดลบหรือศูนย์ไม่มีความหมาย — ต่างจากราคาที่ศูนย์แปลว่าแจกฟรี
ALTER TABLE pet DROP CONSTRAINT IF EXISTS pet_weight_check;
ALTER TABLE pet ADD CONSTRAINT pet_weight_check
  CHECK (weight_kg IS NULL OR weight_kg > 0);

-- เกิดหลังตายไม่ได้
ALTER TABLE pet DROP CONSTRAINT IF EXISTS pet_born_before_deceased_check;
ALTER TABLE pet ADD CONSTRAINT pet_born_before_deceased_check
  CHECK (born_on IS NULL OR deceased_on IS NULL OR born_on <= deceased_on);

-- ไมโครชิปห้ามซ้ำ เฉพาะแถวที่กรอกมา — เหตุผลเดียวกับ `drug.code`
CREATE UNIQUE INDEX IF NOT EXISTS pet_microchip_live_key
  ON pet (microchip)
  WHERE deleted_at IS NULL AND microchip IS NOT NULL;
