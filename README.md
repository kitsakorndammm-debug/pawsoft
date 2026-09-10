# Paw Soft — ระบบจัดการคลินิกรักษาสัตว์

ระบบสำหรับคลินิกสัตว์ · แบ่งเป็นสองฝั่ง: **พนักงาน** (คิว · รักษา · เก็บเงิน) และ
**ลูกค้า** (จองคิว · ดูประวัติ · จ่ายบิลเอง)

---

## เริ่มใช้งาน

ต้องมี [Bun](https://bun.sh) กับ PostgreSQL 16+ ก่อน (หรือใช้ Docker ที่ให้มา)

```bash
# 1. ติดตั้ง
bun install

# 2. ตั้งค่า — คัดลอกแล้วแก้ค่าในไฟล์
cp .env.example .env
cp .env.example apps/api/.env

# 3. ฐานข้อมูล (ถ้าใช้ Docker)
bun run docker:dev

# 4. สร้างตารางกับข้อมูลตั้งต้น
cd apps/api && bun run db:generate && cd ../..
bun run db:push
bun run db:seed

# 5. รัน
bun run dev
```

เปิด **http://localhost:3200** — เข้าด้วย `admin` / รหัสที่ตั้งใน `SEED_ADMIN_PASSWORD`

> **`.env` ไม่ได้มากับ zip** — มี secret อยู่ข้างใน · คัดลอกจาก `.env.example`
> แล้วกรอกค่าของเครื่องตัวเอง

---

## สิ่งที่ต้องตั้งเพิ่มถ้าจะใช้ฝั่งลูกค้า

| ต้องมี | ไว้ทำอะไร | คู่มือ |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `SECRET` | ลูกค้าล็อกอินด้วย Google | [google-oauth-setup.md](docs/standards/google-oauth-setup.md) |
| `PROMPTPAY_TARGET` | สร้าง QR ให้ลูกค้าสแกนจ่าย | เบอร์พร้อมเพย์ของคลินิก |

ไม่ตั้งก็บูตได้ — ฝั่งพนักงานทำงานเต็มที่ · ปุ่มที่ใช้ไม่ได้จะไม่ถูกวาดออกมา

---

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
|---|---|
| `bun run dev` | รันทั้งเว็บ (3200) และ API (3201) |
| `bun run typecheck` · `typecheck:web` | ตรวจชนิดข้อมูล |
| `bun run test` | unit test — เร็ว ไม่แตะฐาน dev |
| `bun run e2e:prep` → `bun run e2e` | เทสผ่านเบราว์เซอร์จริง |
| `bun run db:push` | อัปเดตตารางตาม schema |
| `bun run db:studio` | เปิดหน้าจอดูฐานข้อมูล |

**ก่อนส่งงานทุกครั้ง** ต้องผ่านครบ: typecheck สองฝั่ง · `test` · `e2e` · `build:web`

---

## โครงโปรเจค

```
apps/api     Elysia + Prisma — กฎธุรกิจอยู่ที่ service ชั้นเดียว
apps/web     Next.js App Router — (staff) กับ owner แยกกลุ่มกัน
e2e          Playwright — staff (จอคอม) · owner (มือถือ)
docs         มาตรฐานของโปรเจค — อ่าน docs/standards/README.md ก่อน
docker       PostgreSQL สำหรับ dev
```

---

## เอกสาร

เริ่มที่ **[docs/standards/README.md](docs/standards/README.md)** — เป็นสารบัญของทุกเรื่อง

| ไฟล์ | ตอบคำถามว่า |
|---|---|
| [db-conventions.md](docs/standards/db-conventions.md) | ตารางหน้าตายังไง · กฎเหล็กของฐาน |
| [auth.md](docs/standards/auth.md) | ใครเข้าอะไรได้ · เซสชันสองฝั่ง |
| [api-conventions.md](docs/standards/api-conventions.md) | BE กับ FE คุยกันด้วยรูปไหน |
| [e2e.md](docs/standards/e2e.md) | เทสรันยังไง · บั๊กที่ชุดเทสเคยจับได้ |

---

## เรื่องที่ควรรู้ก่อนแก้โค้ด

**เงินเป็น `string` บนสาย ไม่ใช่ `number`** — `Decimal` ที่ผ่าน JSON เสียความแม่น
และนี่คือใบเสร็จ

**กฎสำคัญบังคับที่ฐานด้วย ไม่ใช่แค่ที่ service** — เช่น คนยืนยันยอดต้องไม่ใช่คนที่ส่งยอด
(`invoice_verifier_not_submitter_check`) · เส้นนำเข้าข้อมูลในอนาคตจะไม่ผ่านโค้ด TypeScript

**หนึ่งตารางเขียนสองไฟล์** — `.prisma` (ฟิลด์) + `sql/parts/NN-*.sql` (partial unique ·
CHECK · คอมเมนต์ภาษาไทย) · ดู `db-conventions.md`

**ยังไม่มี git** — โปรเจคนี้ส่งมาเป็น zip · ผู้รับควร `git init` เป็นอย่างแรก
