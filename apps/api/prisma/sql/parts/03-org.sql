-- ข้อบังคับของตารางองค์กร — แผนก ตำแหน่ง พนักงาน
--
-- ทุกคำสั่งรันซ้ำได้ เพราะมันรันใหม่ทุกครั้งที่ `bun run db:push`

-- ============================================================================
-- department
-- ============================================================================

COMMENT ON TABLE department IS 'แผนก — ผู้ใช้ลากจัดลำดับเอง ตารางนี้จึงไม่แบ่งหน้า';
COMMENT ON COLUMN department.sort_order IS 'ลำดับในลิสต์ 0 คือบนสุด · null แปลว่าแถวนี้ถูกลบไปแล้ว';

CREATE UNIQUE INDEX IF NOT EXISTS department_name_live_key
  ON department (name)
  WHERE deleted_at IS NULL;

ALTER TABLE department DROP CONSTRAINT IF EXISTS department_deleted_pair_check;
ALTER TABLE department ADD CONSTRAINT department_deleted_pair_check
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

-- `sort_order` เป็นตำแหน่งในลิสต์: 0, 1, 2 — ไม่ติดลบ และไม่ใหญ่จนแถวถัดไปไม่มีที่แทรก
--
-- **`NULL` ผ่านโดยตั้งใจ** เพราะมันคือแถวที่ถูก soft delete ซึ่งไม่ถือตำแหน่งใด
ALTER TABLE department DROP CONSTRAINT IF EXISTS department_sort_order_check;
ALTER TABLE department ADD CONSTRAINT department_sort_order_check
  CHECK (sort_order >= 0 AND sort_order <= 2000000000);

ALTER TABLE department DROP CONSTRAINT IF EXISTS department_name_not_blank_check;
ALTER TABLE department ADD CONSTRAINT department_name_not_blank_check
  CHECK (btrim(name) <> '');

-- ============================================================================
-- position
-- ============================================================================

COMMENT ON TABLE position IS 'ตำแหน่งงาน — ชื่อห้ามซ้ำทั้งตาราง ไม่ใช่ต่อแผนก';
COMMENT ON COLUMN position.department_id IS 'null แปลว่าไม่สังกัดแผนกไหนเลย ไม่ใช่ใช้ได้ทุกแผนก';

CREATE UNIQUE INDEX IF NOT EXISTS position_name_live_key
  ON position (name)
  WHERE deleted_at IS NULL;

ALTER TABLE position DROP CONSTRAINT IF EXISTS position_deleted_pair_check;
ALTER TABLE position ADD CONSTRAINT position_deleted_pair_check
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

ALTER TABLE position DROP CONSTRAINT IF EXISTS position_sort_order_check;
ALTER TABLE position ADD CONSTRAINT position_sort_order_check
  CHECK (sort_order >= 0 AND sort_order <= 2000000000);

ALTER TABLE position DROP CONSTRAINT IF EXISTS position_name_not_blank_check;
ALTER TABLE position ADD CONSTRAINT position_name_not_blank_check
  CHECK (btrim(name) <> '');

-- ============================================================================
-- employee
-- ============================================================================

COMMENT ON TABLE employee IS 'พนักงานคลินิก — ลบแล้วบัญชีถูกระงับตาม';
COMMENT ON COLUMN employee.code IS 'รหัสพนักงาน ห้ามนำกลับมาใช้ซ้ำแม้แถวเดิมถูกลบไปแล้ว';
COMMENT ON COLUMN employee.work_status IS 'ทำงานอยู่หรือพ้นสภาพ คนละเรื่องกับการลบแถว';
COMMENT ON COLUMN employee.email IS 'ช่องทางติดต่อ ไม่ใช่ตัวระบุตัวตน และไม่เกี่ยวกับการล็อกอิน';

-- **unique เต็มตาราง ไม่มี `WHERE deleted_at IS NULL`** ต่างจากทะเบียนข้างบนทั้งสองตัว
--
-- รหัสของคนที่ลาออกไปแล้วยังถูกจองไว้ตลอดกาล · เอากลับมาใช้ซ้ำเมื่อไหร่ ประวัติของ
-- คนสองคนจะอ่านต่อกันเป็นคนเดียว และไม่มีอะไรในระบบบอกได้ว่ามันเคยเปลี่ยนมือ
CREATE UNIQUE INDEX IF NOT EXISTS employee_code_key
  ON employee (code);

ALTER TABLE employee DROP CONSTRAINT IF EXISTS employee_deleted_pair_check;
ALTER TABLE employee ADD CONSTRAINT employee_deleted_pair_check
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

ALTER TABLE employee DROP CONSTRAINT IF EXISTS employee_code_not_blank_check;
ALTER TABLE employee ADD CONSTRAINT employee_code_not_blank_check
  CHECK (btrim(code) <> '');

ALTER TABLE employee DROP CONSTRAINT IF EXISTS employee_name_not_blank_check;
ALTER TABLE employee ADD CONSTRAINT employee_name_not_blank_check
  CHECK (btrim(first_name) <> '' AND btrim(last_name) <> '');

-- อีเมลต้องมีรูปเป็นอีเมล ถ้ากรอกมา
--
-- ต่างจาก `pet_owner_account.email` ที่มาจาก Google — ช่องนี้คนพิมพ์เอง จึงพิมพ์ผิดได้
-- และ CHECK นี้มีไว้กันตรงนั้นจริง ๆ ไม่ใช่กันโค้ดหยิบฟิลด์ผิด
ALTER TABLE employee DROP CONSTRAINT IF EXISTS employee_email_shape_check;
ALTER TABLE employee ADD CONSTRAINT employee_email_shape_check
  CHECK (email IS NULL OR email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
