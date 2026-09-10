-- ข้อบังคับของตารางฝั่งตัวตน — ครึ่งที่ schema.prisma เขียนไม่ได้
--
-- ทุกคำสั่งในไฟล์นี้รันซ้ำได้ เพราะมันรันใหม่ทุกครั้งที่ `bun run db:push`

-- ============================================================================
-- role
-- ============================================================================

COMMENT ON TABLE role IS 'บทบาท — ชุดสิทธิ์ที่ผู้ใช้หลังบ้านคนหนึ่งถืออยู่';
COMMENT ON COLUMN role.is_system IS 'บทบาทระบบ ถือทุก key ที่ประกาศในโค้ดโดยไม่ผ่าน role_permission';

-- ชื่อบทบาทห้ามซ้ำ **เฉพาะในกลุ่มที่ยังไม่ถูกลบ**
--
-- unique เปล่า ๆ จะทำให้ชื่อที่เคยลบไปแล้วถูกจองไว้ตลอดกาล · คนที่ลบบทบาท
-- "สัตวแพทย์" ทิ้งเพราะพิมพ์ผิด จะสร้างชื่อเดิมที่ถูกต้องอีกไม่ได้
CREATE UNIQUE INDEX IF NOT EXISTS role_name_live_key
  ON role (name)
  WHERE deleted_at IS NULL;

-- บทบาทระบบมีได้ตัวเดียวในระบบ
--
-- มันคือบทบาทที่ข้ามการตรวจสิทธิ์ทั้งหมด · สองตัวแปลว่ามีสองเส้นทางที่ทำแบบนั้นได้
-- และหน้าจอที่ซ่อนบทบาทระบบไว้จะซ่อนได้แค่ตัวเดียว
CREATE UNIQUE INDEX IF NOT EXISTS role_single_system_key
  ON role ((true))
  WHERE is_system AND deleted_at IS NULL;

-- คู่ At/By มาด้วยกันหรือไม่มาเลย
ALTER TABLE role DROP CONSTRAINT IF EXISTS role_deleted_pair_check;
ALTER TABLE role ADD CONSTRAINT role_deleted_pair_check
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

-- ============================================================================
-- permission
-- ============================================================================

COMMENT ON TABLE permission IS 'สิทธิ์หนึ่งข้อ ประกาศในโค้ดที่ kit/permissions.ts ไม่ใช่ของที่ผู้ใช้เพิ่มเองได้';
COMMENT ON COLUMN permission.key IS 'รูป <ส่วนของระบบ>:<เมนู>:<การกระทำ> เช่น main:master:read';

-- รูปของ key ที่ระบบยอมรับ
--
-- `syncPermissions()` ใช้รูปเดียวกันนี้แยกว่าแถวไหนเป็น key จริง และแถวไหนเป็นของ
-- ไฟล์เทสที่รันขนานกันอยู่ · บังคับที่ฐานด้วย เพื่อให้แถวที่ผิดรูปเข้าไปไม่ได้เลย
-- ไม่ว่าจะเข้ามาทางไหน
ALTER TABLE permission DROP CONSTRAINT IF EXISTS permission_key_shape_check;
ALTER TABLE permission ADD CONSTRAINT permission_key_shape_check
  CHECK (key ~ '^[a-z-]+:[a-z-]+:[a-z]+(_[a-z]+)*$');

-- ============================================================================
-- role_permission
-- ============================================================================

COMMENT ON TABLE role_permission IS 'บทบาทนี้ถือ key นี้ — junction ล้วน hard delete';

-- ============================================================================
-- "user" — ต้องใส่เครื่องหมายคำพูดเสมอ เป็นคำสงวนของ SQL
-- ============================================================================

COMMENT ON TABLE "user" IS 'บัญชีผู้ใช้หลังบ้าน (พนักงานคลินิก) — ระงับได้ ลบไม่ได้';
COMMENT ON COLUMN "user".must_change_password IS 'ยังใช้รหัสที่ผู้ดูแลออกให้อยู่ ทำได้อย่างเดียวคือเปลี่ยนรหัส';
COMMENT ON COLUMN "user".locked_at IS 'ถูกล็อกเพราะรหัสผิดครบจำนวน ไม่ปลดเอง ต้องมีผู้ดูแลมาปลด';
COMMENT ON COLUMN "user".lock_count IS 'ถูกล็อกมากี่ครั้งตั้งแต่เปิดบัญชี ไม่เคยรีเซ็ต';
COMMENT ON COLUMN "user".created_by IS 'null ได้แถวเดียวในระบบ คือบัญชีแรกที่ seed สร้าง';

ALTER TABLE "user" DROP CONSTRAINT IF EXISTS user_suspended_pair_check;
ALTER TABLE "user" ADD CONSTRAINT user_suspended_pair_check
  CHECK ((suspended_at IS NULL) = (suspended_by IS NULL));

-- ตัวนับไม่ติดลบ
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS user_counters_check;
ALTER TABLE "user" ADD CONSTRAINT user_counters_check
  CHECK (failed_attempts >= 0 AND lock_count >= 0);

-- ชื่อผู้ใช้ห้ามเป็นช่องว่าง
--
-- `login()` ตัดช่องว่างหัวท้ายก่อนค้นหา ฉะนั้นชื่อที่เป็นช่องว่างล้วนคือชื่อที่ล็อกอินไม่ได้
-- และไม่มีใครตั้งใจสร้าง
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS user_username_not_blank_check;
ALTER TABLE "user" ADD CONSTRAINT user_username_not_blank_check
  CHECK (btrim(username) <> '');

-- ============================================================================
-- user_session
-- ============================================================================

COMMENT ON TABLE user_session IS 'เซสชันของผู้ใช้หลังบ้าน — hard delete เท่านั้น แถวมีอยู่แปลว่ายังใช้ได้';
COMMENT ON COLUMN user_session.token_hash IS 'sha256 ของ token ตัว token ดิบอยู่ใน cookie ของเจ้าตัวที่เดียว';
COMMENT ON COLUMN user_session.expires_at IS 'นับจากตอนล็อกอิน ไม่ต่ออายุแม้จะใช้งานอยู่';

-- hash ของ sha256 คือเลขฐานสิบหก 64 ตัวเสมอ
--
-- ค่าที่ยาวไม่ถึงแปลว่ามีใครเขียนแถวเซสชันด้วยมือ หรือฟังก์ชัน hash ถูกเปลี่ยนไป
-- โดยไม่ได้ตั้งใจ · ทั้งสองอย่างควรถูกปฏิเสธที่ฐาน
ALTER TABLE user_session DROP CONSTRAINT IF EXISTS user_session_token_hash_shape_check;
ALTER TABLE user_session ADD CONSTRAINT user_session_token_hash_shape_check
  CHECK (token_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE user_session DROP CONSTRAINT IF EXISTS user_session_expiry_after_creation_check;
ALTER TABLE user_session ADD CONSTRAINT user_session_expiry_after_creation_check
  CHECK (expires_at > created_at);

-- ============================================================================
-- pet_owner_account
-- ============================================================================

COMMENT ON TABLE pet_owner_account IS 'บัญชีเจ้าของสัตว์ — เข้าด้วย Google เท่านั้น ไม่มีคอลัมน์รหัสผ่าน สร้างตัวเองตอนล็อกอินครั้งแรก';
COMMENT ON COLUMN pet_owner_account.google_sub IS 'รหัสผู้ใช้ของ Google นี่คือตัวตน ไม่ใช่ email ซึ่งเปลี่ยนได้';
COMMENT ON COLUMN pet_owner_account.email IS 'อัปเดตตามทุกครั้งที่ล็อกอิน เพราะ google_sub คือตัวตน ไม่ใช่ตัวนี้';

ALTER TABLE pet_owner_account DROP CONSTRAINT IF EXISTS pet_owner_account_suspended_pair_check;
ALTER TABLE pet_owner_account ADD CONSTRAINT pet_owner_account_suspended_pair_check
  CHECK ((suspended_at IS NULL) = (suspended_by IS NULL));

-- อีเมลต้องมีรูปเป็นอีเมล
--
-- ค่านี้มาจาก Google ไม่ใช่จากฟอร์มที่คนพิมพ์ ฉะนั้นมันควรถูกรูปอยู่แล้ว · ข้อบังคับนี้
-- จึงไม่ได้มีไว้กันคนพิมพ์ผิด แต่มีไว้กันวันที่โค้ดหยิบฟิลด์ผิดตัวจาก payload ของ Google
-- แล้วเอา `sub` หรือชื่อคนไปใส่ในช่องอีเมล
ALTER TABLE pet_owner_account DROP CONSTRAINT IF EXISTS pet_owner_account_email_shape_check;
ALTER TABLE pet_owner_account ADD CONSTRAINT pet_owner_account_email_shape_check
  CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

ALTER TABLE pet_owner_account DROP CONSTRAINT IF EXISTS pet_owner_account_google_sub_not_blank_check;
ALTER TABLE pet_owner_account ADD CONSTRAINT pet_owner_account_google_sub_not_blank_check
  CHECK (btrim(google_sub) <> '');

-- `suspended_by` ชี้ไปที่พนักงาน ไม่ใช่เจ้าของสัตว์ด้วยกัน
--
-- Prisma ไม่ได้ประกาศความสัมพันธ์นี้ไว้ เพราะประกาศแล้วจะได้ฟิลด์ `suspendedByUser`
-- โผล่มาในทุก query ของตารางนี้ ทั้งที่แทบไม่มีใครอ่าน · แต่ข้อบังคับต้องมีจริงที่ฐาน
ALTER TABLE pet_owner_account DROP CONSTRAINT IF EXISTS pet_owner_account_suspended_by_fkey;
ALTER TABLE pet_owner_account ADD CONSTRAINT pet_owner_account_suspended_by_fkey
  FOREIGN KEY (suspended_by) REFERENCES "user" (id);

-- ============================================================================
-- pet_owner_session
-- ============================================================================

COMMENT ON TABLE pet_owner_session IS 'เซสชันของเจ้าของสัตว์ — อายุ 30 วัน ต่างจากฝั่งหลังบ้านที่ 10 ชั่วโมง';

ALTER TABLE pet_owner_session DROP CONSTRAINT IF EXISTS pet_owner_session_token_hash_shape_check;
ALTER TABLE pet_owner_session ADD CONSTRAINT pet_owner_session_token_hash_shape_check
  CHECK (token_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE pet_owner_session DROP CONSTRAINT IF EXISTS pet_owner_session_expiry_after_creation_check;
ALTER TABLE pet_owner_session ADD CONSTRAINT pet_owner_session_expiry_after_creation_check
  CHECK (expires_at > created_at);

-- ============================================================================
-- login_log
-- ============================================================================

COMMENT ON TABLE login_log IS 'ประวัติการเข้าระบบทั้งสองฝั่ง — ระบบเขียนอย่างเดียว ไม่มีใครแก้ ไม่มีใครลบ';
COMMENT ON COLUMN login_log.identifier IS 'ชื่อผู้ใช้ที่พิมพ์เข้ามาหรืออีเมลจาก Google เก็บดิบแม้ไม่มีบัญชีตรง';

-- แถวหนึ่งชี้ได้ฝั่งเดียว หรือไม่ชี้เลย
--
-- ไม่ชี้เลยคือ `FAILED_NO_USER` — มีคนพิมพ์ชื่อผู้ใช้ที่ไม่มีในระบบ ซึ่งเป็นแถวที่
-- ตารางนี้มีไว้เก็บโดยเฉพาะ · แต่ชี้สองฝั่งพร้อมกันไม่มีความหมาย เพราะการล็อกอิน
-- หนึ่งครั้งเป็นของคนคนเดียว
ALTER TABLE login_log DROP CONSTRAINT IF EXISTS login_log_single_side_check;
ALTER TABLE login_log ADD CONSTRAINT login_log_single_side_check
  CHECK (NOT (user_id IS NOT NULL AND pet_owner_account_id IS NOT NULL));

-- ผลแต่ละแบบชี้ฝั่งที่สมเหตุสมผลกับตัวมันเอง
--
-- `SUCCESS_GOOGLE` ที่ไม่มี `pet_owner_account_id` แปลว่าล็อกอินสำเร็จโดยไม่มีบัญชี
-- ซึ่งเป็นไปไม่ได้ · `FAILED_PASSWORD` ฝั่งเจ้าของสัตว์ก็เช่นกัน — ไม่มีรหัสให้ผิด
ALTER TABLE login_log DROP CONSTRAINT IF EXISTS login_log_result_side_check;
ALTER TABLE login_log ADD CONSTRAINT login_log_result_side_check
  CHECK (
    CASE result
      WHEN 'SUCCESS'        THEN user_id IS NOT NULL
      WHEN 'SUCCESS_GOOGLE' THEN pet_owner_account_id IS NOT NULL
      WHEN 'FAILED_NO_USER' THEN user_id IS NULL AND pet_owner_account_id IS NULL
      WHEN 'FAILED_PASSWORD' THEN user_id IS NOT NULL
      ELSE true
    END
  );

-- ============================================================================
-- audit_log
-- ============================================================================

COMMENT ON TABLE audit_log IS 'ใครแก้อะไร จากค่าอะไรเป็นอะไร — เขียนในทรานแซกชันเดียวกับการเปลี่ยนแปลงเสมอ';
COMMENT ON COLUMN audit_log.record_id IS 'แถวไหนที่ถูกแก้ ไม่ใช่ FK เพราะตารางปลายทางต่างกันในแต่ละแถว';

-- ต้องมีอย่างน้อยด้านหนึ่ง
--
-- แถวที่ทั้ง before และ after เป็น null คือแถวที่บอกว่ามีการเปลี่ยนแปลงเกิดขึ้น
-- แต่ไม่บอกว่าอะไรเปลี่ยน · `diffFields()` คืน null ทั้งคู่เมื่อไม่มีอะไรต่าง และผู้เรียก
-- ต้องใช้ค่านั้นตัดสินใจว่าจะไม่เขียนบันทึกเลย ไม่ใช่เขียนแถวว่างไว้
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_has_payload_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_has_payload_check
  CHECK (before IS NOT NULL OR after IS NOT NULL);
