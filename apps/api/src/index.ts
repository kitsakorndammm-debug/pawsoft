import { app } from './app.ts'
import { seed } from './kit/seed.ts'

/**
 * จุดเริ่มของโปรเซส
 *
 * **`seed()` ทำงานก่อนผูกพอร์ต และไม่มี try/catch** — request ที่เข้ามาก่อนตาราง
 * `permission` ตรงกับที่โค้ดประกาศ จะได้ 403 ที่ผิด · และ seed ที่ล้มเหลวต้องหยุด
 * การบูต ไม่ใช่ปล่อยให้ระบบขึ้นมาแบบครึ่ง ๆ
 */
await seed()

const port = Number(process.env['PORT'] ?? 3201)

app.listen(port)

console.log(`pawsoft api — http://localhost:${port}`)
