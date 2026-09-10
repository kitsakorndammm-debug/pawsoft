---
name: api
description: ขั้น 3 — เปิด service ออกเป็น HTTP route ทีละ operation โดยเขียน api test ให้แดงก่อน route แปลง HTTP เป็นการเรียก service เท่านั้น ไม่ตัดสินอะไรเอง ใช้เมื่อใบสั่งบอกว่าขั้นนี้คือ api หรือจะแตะไฟล์ routes
---

# ขั้น 3 · api

**route ไม่ตัดสินอะไร** — แปลง HTTP เข้า เรียก service แปลงผลออก จบ

กฎธุรกิจอยู่ที่ service ชั้นเดียว (ขั้น 2) · route ที่ตัดสินเองคือกฎที่ seed, service อื่น
และเทส เดินข้ามได้

---

## หนึ่งใบสั่ง = หนึ่ง operation

เหมือนขั้น service — `GET /pet-species` คือหนึ่งใบ · `POST` คืออีกใบ
**ใบสั่งไม่ระบุว่า operation ไหน → ถาม แล้วหยุดรอ**

| operation | route |
|---|---|
| `list` | `GET /<path>` |
| `getById` | `GET /<path>/:id` |
| `create` | `POST /<path>` |
| `update` | `PATCH /<path>/:id` |
| `delete` | `DELETE /<path>/:id` |
| `move` | `PATCH /<path>/:id/move` |

**service ของ operation นั้นต้องมีก่อน** — ไม่มีให้บอกผู้ใช้ว่าต้องทำขั้น 2 ก่อน แล้วรอ

---

## อ่านก่อน ทุกครั้ง

| ไฟล์ | เอาอะไรจากมัน |
|---|---|
| `docs/standards/naming.md` | ชื่อ route · ชื่อไฟล์ · ชื่อเทส |
| `docs/standards/api-conventions.md` | รูป response · ชนิดบนสาย · error code → status |
| `docs/standards/auth.md` | เส้นนี้เป็นของพนักงานหรือของเจ้าของสัตว์ · ใช้ guard ตัวไหน |
| service ของโมดูลนั้น | สัญญาที่ route ต้องพาไปให้ถึง |
| route ของโมดูลข้างเคียง | ตัวที่ทำไปแล้วเขียนไว้ยังไง |

---

## เดินสามด่าน

```
ด่าน 1  เทสแดงก่อน     ยิง HTTP จริงผ่าน app.handle() ไม่ mock
ด่าน 2  เขียนให้เขียว   route + schema + permission key
ด่าน 3  ตรวจว่าครบ      status ถูก · รูป response ถูก · เคสปฏิเสธครบ
```

---

## ด่าน 1 · เทสแดงก่อน

ไฟล์อยู่ที่ `apps/api/test/<module>/<module>.<operation>.api.test.ts`

**ยิงผ่าน `app.handle(new Request(...))`** — ไม่ต้องเปิดพอร์ต ไม่ต้อง mock
เป็นเส้นทางเดียวกับที่ผู้ใช้จริงเดิน รวม middleware และ schema validation

### เทสหนึ่งไฟล์ต้องมีอะไร

```
happy case      status ถูก · รูป response ถูก · ค่าที่ได้ตรง
ชนิดบนสาย       id เป็น number · เงินเป็น string · วันที่เป็น ISO
เคสปฏิเสธ       400 · 404 · 409 ตามที่ service โยน
รูปที่ผิด        ส่ง field ที่ไม่รู้จัก · ชนิดผิด · ขาด field
```

**assert `error.code` ไม่ใช่ข้อความ** — เหมือนขั้น service

---

## ด่าน 2 · เขียนให้เขียว

ไฟล์อยู่ที่ `apps/api/src/modules/<module>/<module>.routes.ts`

### สิ่งที่ route ทำได้

| ทำ | ไม่ทำ |
|---|---|
| แปลง param/body เป็น argument ของ service | ตัดสินว่าค่าถูกกฎธุรกิจไหม |
| แปลง `AppError` เป็น HTTP status | ตัดสินว่าจะโยน error ไหม |
| แปลง row เป็นรูปที่ส่งบนสาย | คำนวณอะไรเพิ่ม |
| ประกาศ permission key | ตรวจสิทธิ์เอง (kit ทำ) |

### ปฏิเสธคีย์ที่ไม่รู้จัก — ต้องเขียนเอง และเขียนให้ถูกที่

**`additionalProperties: false` ไม่บังคับอะไรเลยใน Elysia** ทั้ง query และ body
(วัดแล้ว 2026-08-26) · คีย์แปลกปลอมถูกตัดทิ้งเงียบ ๆ แล้ว handler ทำงานต่อ ตอบ 200/201
คนพิมพ์ชื่อฟิลด์ผิดจึงได้คำตอบว่าสำเร็จ ทั้งที่ค่าที่ส่งไม่ได้ถูกบันทึก

| ที่ | ตรวจยังไง |
|---|---|
| query | อ่าน `new URL(request.url).searchParams` ใน handler |
| **body** | **ตรวจใน `transform` เท่านั้น** |

**ทำไม body ต้องเป็น `transform`** — พอถึง handler คีย์แปลกปลอมถูกตัดไปแล้ว
(`{name, sortOrder}` → `ctx.body` เหลือ `{name}`) และ `request.clone().json()` ก็อ่านไม่ได้
เพราะ body ถูกใช้ไปตอน parse (โยน `Unexpected end of JSON input`)
**`transform` ทำงานก่อน validate และเห็น body ดิบครบทุกคีย์**

### ชนิดบนสาย

**`id` เป็น number · เงินเป็น string** (ผู้ใช้ตัดสิน 2026-08-26)
เหตุผลอยู่ใน `docs/standards/api-conventions.md` — เงินเป็น JSON number คือ float
แล้ว `0.1 + 0.2` ไม่เท่ากับ `0.3`

`BigInt` ส่งตรง ๆ ไม่ได้ — `JSON.stringify` โยน error · แปลงที่ชั้น route เสมอ

### permission key

ทุก route ประกาศ key ที่มันต้องการ แม้ยังไม่มีคนบังคับ

**key แบ่งตามเมนูบนหน้าจอ ไม่ใช่ตามตาราง** — ทะเบียนในเมนูตั้งค่าทั้งหมดใช้
`main:master:read` / `main:master:write` ร่วมกัน · `write` คลุม create, update, delete, move

รูปเต็มและเหตุผลอยู่ใน `docs/standards/api-conventions.md`
**ตารางใหม่ไม่ได้แปลว่า key ใหม่** — ดูก่อนว่าเมนูไหน แล้วใช้ key ของเมนูนั้น

**เส้นของฝั่งเจ้าของสัตว์ไม่มี permission key เลย** — มันกรองด้วย account id จากเซสชัน
ที่ชั้น service · ใส่ key ให้มันคือการตอบคำถามผิดข้อ (`docs/standards/auth.md`)

---

## ด่าน 3 · ตรวจว่าครบ

```bash
bun test ./test/<module>/<module>.<operation>.api.test.ts
bun run typecheck
```

**รันเฉพาะไฟล์ที่ตัวเองแตะ** — ชุดเต็มรันเมื่อผู้ใช้สั่งด้วยคำพูดเท่านั้น

---

## เสร็จเมื่อ

- [ ] ผู้ใช้ระบุแล้วว่า operation ไหน
- [ ] เทสแดงก่อน แล้วเขียวจากโค้ดที่เขียน
- [ ] status ถูกทุกเคส รวมเคสปฏิเสธ
- [ ] `id` เป็น number · เงินเป็น string · ไม่มี BigInt หลุดออกไป
- [ ] field ที่ไม่รู้จักถูกปฏิเสธด้วย 400
- [ ] ประกาศ permission key แล้ว (หรือบอกได้ว่าทำไมเส้นนี้ไม่มี)
- [ ] `typecheck` ผ่าน

## ห้าม

- **ตัดสินกฎธุรกิจที่ route** — ซ้ำกับ service แล้ววันหนึ่งจะไม่ตรงกัน
- ทำหลาย operation ในใบเดียว
- เขียน route ก่อนมีเทสแดง
- ส่ง `BigInt` ออกทาง JSON
- ปล่อยให้ field ที่ไม่รู้จักผ่าน
- แตะ service — ผิดกฎแล้วให้กลับไปขั้น 2 เป็นใบใหม่
- แตะหน้าเว็บ — คนละขั้น
