-- ─────────────────────────────────────────────────────────────────────────────
-- catalogue — ทะเบียนที่มีแค่ชื่อกับลำดับ
--
-- ทะเบียนพวกนี้หน้าตาเหมือนกันหมด ลูปเดียวจึงแจกของสี่อย่างให้ทุกตัวเท่ากัน:
-- partial unique บน `name` · `deleted_pair` CHECK · ขอบของ `sort_order` ·
-- และ `COMMENT ON TABLE` ภาษาไทย
--
-- **เติมชื่อตารางเข้าลิสต์เมื่อขั้นสคีมาของมันเสร็จ** — และอย่าเขียน
-- `CREATE UNIQUE INDEX` ซ้ำเองอีก เพราะจะได้ index สองตัวที่ทำงานเดียวกัน
--
-- **ทะเบียนที่ชื่อไม่ซ้ำ "ต่อขอบเขต" ไม่เข้าลูปนี้** — ลูปนี้ทำได้แค่ unique ทั้งตาราง
-- ตัวที่ unique ต่อขอบเขต (เช่น ชื่อสายพันธุ์ห้ามซ้ำภายในชนิดสัตว์เดียวกัน)
-- ต้องเขียน index ของตัวเองแยก แบบเดียวกับ `role` ใน 01-auth.sql
--
-- `sort_order` คือตำแหน่งในลิสต์: 0, 1, 2 — ไม่ติดลบ และไม่ใหญ่จนแถวถัดไป
-- ไม่มีที่ให้แทรก · **`NULL` ผ่าน CHECK โดยตั้งใจ** เพราะมันคือแถวที่ถูก soft delete
-- ซึ่งไม่ถือตำแหน่งใด และคืนเลขของมันให้แถวที่ยังอยู่ในลิสต์
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  entry text[];
  -- ยังไม่มีทะเบียนสักตัวในระบบ — โครงนี้ว่างไว้รอขั้นสคีมาของทะเบียนแรก
  --
  -- ลูปที่วนบนอาเรย์ว่างไม่ทำอะไรเลย ซึ่งถูกต้อง · มีไฟล์นี้อยู่ก่อนเพราะกลไก
  -- ที่มาทีหลังตอนมีตารางสิบตัวแล้ว คือกลไกที่ต้องไล่แก้ตารางสิบตัวย้อนหลัง
  catalogue text[][] := ARRAY[]::text[][];
  t text;
BEGIN
  -- **ต้องกันอาเรย์ว่างก่อนเข้าลูป** — `FOREACH ... SLICE 1` อ่านมิติของอาเรย์จริง
  -- และอาเรย์ว่างมี 0 มิติ ไม่ใช่ 2 · มันจึงโยน `2202E slice dimension (1) is out of
  -- the valid range 0..0` แทนที่จะวนศูนย์รอบเงียบ ๆ (2026-08-31)
  --
  -- บรรทัดนี้จะไม่มีความหมายอีกเมื่อทะเบียนตัวแรกเข้าลิสต์ แต่ต้องอยู่ต่อ เพราะวันที่
  -- ทะเบียนตัวสุดท้ายถูกถอดออกไป มันคือสิ่งเดียวที่กันไม่ให้ push พังทั้งไฟล์
  IF array_length(catalogue, 1) IS NULL THEN
    RETURN;
  END IF;

  FOREACH entry SLICE 1 IN ARRAY catalogue LOOP
    t := entry[1];

    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I ("name") WHERE "deleted_at" IS NULL',
      t || '_name_uniq', t);

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_deleted_pair_chk') THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I CHECK (("deleted_at" IS NULL) = ("deleted_by" IS NULL))',
        t, t || '_deleted_pair_chk');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_sort_order_chk') THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I CHECK ("sort_order" >= 0 AND "sort_order" <= 2000000000)',
        t, t || '_sort_order_chk');
    END IF;

    EXECUTE format('COMMENT ON TABLE %I IS %L', t, entry[2]);
  END LOOP;
END $$;
