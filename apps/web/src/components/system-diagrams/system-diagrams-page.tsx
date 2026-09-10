'use client'

import {
  ArrowDown,
  ArrowRight,
  Banknote,
  BookOpen,
  Boxes,
  CalendarDays,
  CheckCircle2,
  CircleUserRound,
  ClipboardList,
  Database,
  FileText,
  GitBranch,
  KeyRound,
  LockKeyhole,
  Network,
  PawPrint,
  ShieldCheck,
  Stethoscope,
  Users,
} from 'lucide-react'
import { useState } from 'react'

type DiagramTab = 'overview' | 'flow' | 'erd' | 'workflow' | 'permissions'

const TABS: { id: DiagramTab; label: string; icon: typeof Network }[] = [
  { id: 'overview', label: 'ภาพรวม', icon: Network },
  { id: 'flow', label: 'Data Flow', icon: ArrowRight },
  { id: 'erd', label: 'ER Diagram', icon: Database },
  { id: 'workflow', label: 'Workflow', icon: GitBranch },
  { id: 'permissions', label: 'Permissions', icon: ShieldCheck },
]

const domains = [
  { id: 'auth', title: 'ตัวตนและสิทธิ์', detail: 'พนักงาน · เจ้าของสัตว์ · session', icon: LockKeyhole },
  { id: 'registry', title: 'ทะเบียน', detail: 'เจ้าของ · สัตว์ · ชนิด · สายพันธุ์', icon: PawPrint },
  { id: 'frontdesk', title: 'หน้างาน', detail: 'นัดหมาย · คิว · การตรวจ', icon: ClipboardList },
  { id: 'clinic', title: 'คลินิก', detail: 'ยา · รายการรักษา · ราคา', icon: Stethoscope },
  { id: 'billing', title: 'การเงิน', detail: 'ใบเสร็จ · รับเงิน · ตรวจสอบยอด', icon: Banknote },
]

const tables = [
  { id: 'user', name: 'user', group: 'auth', fields: 'id · username · roleId · employeeId' },
  { id: 'role', name: 'role', group: 'auth', fields: 'id · name · isSystem' },
  { id: 'account', name: 'pet_owner_account', group: 'auth', fields: 'id · googleSub · ownerId' },
  { id: 'employee', name: 'employee', group: 'registry', fields: 'id · code · workStatus' },
  { id: 'owner', name: 'owner', group: 'registry', fields: 'id · code · name · phone' },
  { id: 'pet', name: 'pet', group: 'registry', fields: 'id · ownerId · speciesId · breedId' },
  { id: 'appointment', name: 'appointment', group: 'frontdesk', fields: 'id · ownerId · petId · status' },
  { id: 'visit', name: 'visit', group: 'frontdesk', fields: 'id · queueNumber · status · triage' },
  { id: 'service', name: 'service_item', group: 'clinic', fields: 'id · categoryId · name · price' },
  { id: 'drug', name: 'drug', group: 'clinic', fields: 'id · categoryId · name · price' },
  { id: 'invoice', name: 'invoice', group: 'billing', fields: 'id · visitId · total · status' },
  { id: 'payment', name: 'payment', group: 'billing', fields: 'id · invoiceId · method · amount' },
]

const flowSteps = [
  { title: 'ผู้ใช้งาน', detail: 'พนักงานหรือเจ้าของสัตว์เริ่มคำสั่ง', icon: Users },
  { title: 'Next.js Web', detail: 'หน้าและ feature hooks จัดการสถานะ', icon: BookOpen },
  { title: 'Elysia API', detail: 'ตรวจ session, permission และรูปแบบข้อมูล', icon: Network },
  { title: 'Service', detail: 'กฎธุรกิจและ transaction อยู่ชั้นเดียว', icon: GitBranch },
  { title: 'PostgreSQL', detail: 'ข้อมูลหลัก, ประวัติ และ audit', icon: Database },
]

const workflow = [
  ['01', 'รับนัดหรือ walk-in', 'นัดออนไลน์เริ่ม PENDING · โทรจองเป็น BOOKED · walk-in เปิดคิวได้ทันที'],
  ['02', 'ยืนยันและ check-in', 'พนักงานยืนยันนัด แล้วกด “มาถึงแล้ว” เพื่อสร้าง Visit และเลขคิว'],
  ['03', 'เรียกและคัดกรอง', 'เรียกคิว · เปลี่ยนระดับ NORMAL / URGENT / EMERGENCY · ผูกสัตว์ภายหลังได้'],
  ['04', 'ตรวจรักษา', 'สัตวแพทย์บันทึกน้ำหนัก ผลวินิจฉัย หมายเหตุ รายการรักษา และยา'],
  ['05', 'ออกบิลและรับเงิน', 'เคาน์เตอร์ออก invoice ใช้เงินสด โอน PromptPay บัตร หรือแนบสลิป'],
  ['06', 'บัญชีตรวจสอบ', 'ส่งยอดเป็น AWAITING_VERIFY · บัญชียืนยันหรือตีกลับ · ผ่านแล้วปิดเป็น DONE'],
]

const permissions = [
  ['main:reception:read', 'ดูหน้างาน', 'คิว · ตารางจอง · เจ้าของ · สัตว์เลี้ยง'],
  ['main:reception:write', 'จัดการหน้างาน', 'ลงทะเบียน · check-in · เรียกคิว · ยกเลิก'],
  ['main:medical:write', 'งานแพทย์', 'ผลวินิจฉัย · ยา · รายการรักษา · จบการตรวจ'],
  ['main:billing:read', 'ดูการเงิน', 'ใบเสร็จ · ยอด · payment · สลิป'],
  ['main:billing:collect', 'รับเงิน', 'ออกบิล · เพิ่ม payment · ส่งบัญชี · void'],
  ['main:billing:verify', 'ตรวจยอด', 'ยืนยันหรือตีกลับ invoice'],
  ['main:master:read/write', 'ข้อมูลหลัก', 'องค์กร · ยา · รายการรักษา · role'],
  ['main:hr:read/write', 'บุคลากร', 'พนักงาน · เปิดบัญชี · reset · suspend'],
]

function SectionTitle({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">{detail}</p>
    </div>
  )
}

function Overview() {
  return (
    <div className="flex flex-col gap-6">
      <SectionTitle eyebrow="SYSTEM MAP / 01" title="แผนที่ระบบ Paw Soft" detail="ภาพเดียวสำหรับทำความเข้าใจว่าข้อมูลเริ่มจากใคร เดินทางผ่านอะไร และจบที่ไหน" />
      <div className="grid gap-3 md:grid-cols-5">
        {domains.map((domain) => {
          const Icon = domain.icon
          return <div key={domain.id} className="flex min-h-32 flex-col justify-between border-l-4 border-primary bg-card p-4 shadow-sm"><Icon className="size-5 text-primary" /><div><h2 className="font-semibold">{domain.title}</h2><p className="text-xs text-muted-foreground">{domain.detail}</p></div></div>
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="border bg-card p-5"><div className="mb-4 flex items-center gap-2"><Network className="size-5 text-primary" /><h2 className="font-semibold">เส้นทางข้อมูลหลัก</h2></div><div className="flex flex-col items-center gap-2 sm:flex-row sm:items-stretch"><FlowBox icon={Users} title="ผู้ใช้" detail="พนักงาน / ลูกค้า" /><ArrowRight className="hidden self-center text-muted-foreground sm:block" /><ArrowDown className="sm:hidden text-muted-foreground" /><FlowBox icon={BookOpen} title="Web" detail="Next.js + hooks" /><ArrowRight className="hidden self-center text-muted-foreground sm:block" /><ArrowDown className="sm:hidden text-muted-foreground" /><FlowBox icon={Network} title="API" detail="Elysia routes" /><ArrowRight className="hidden self-center text-muted-foreground sm:block" /><ArrowDown className="sm:hidden text-muted-foreground" /><FlowBox icon={Database} title="ข้อมูล" detail="PostgreSQL + files" /></div></div>
        <div className="border bg-foreground p-5 text-background"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">QUICK READ</p><p className="mt-3 text-lg font-semibold">ระบบแบ่งตัวตนเป็นสองโลก</p><p className="mt-2 text-sm text-background/70">พนักงานใช้ username/password และ permission ส่วนเจ้าของสัตว์ใช้ Google session และเห็นเฉพาะข้อมูลของตัวเอง</p><div className="mt-5 flex items-center gap-2 text-xs text-background/70"><CircleUserRound className="size-4 text-primary" />สอง session · สองขอบเขตข้อมูล</div></div>
      </div>
    </div>
  )
}

function FlowBox({ icon: Icon, title, detail }: { icon: typeof Network; title: string; detail: string }) {
  return <div className="flex min-w-0 flex-1 items-center gap-3 border bg-muted/50 p-3 sm:flex-col sm:items-start"><Icon className="size-5 shrink-0 text-primary" /><div><p className="font-semibold">{title}</p><p className="text-xs text-muted-foreground">{detail}</p></div></div>
}

function DataFlow() {
  return <div className="flex flex-col gap-6"><SectionTitle eyebrow="DATA FLOW / 02" title="ข้อมูลไหลผ่านระบบอย่างไร" detail="ทุกคำสั่งเดินทางจากหน้าจอผ่าน feature layer ไปยัง API และ service ก่อนเขียนฐานข้อมูล" /><div className="grid gap-3 md:grid-cols-5">{flowSteps.map((step, index) => { const Icon = step.icon; return <div key={step.title} className="relative flex flex-col gap-3 border bg-card p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-primary">0{index + 1}</span><Icon className="size-5 text-primary" /></div><div><h2 className="font-semibold">{step.title}</h2><p className="text-xs text-muted-foreground">{step.detail}</p></div>{index < flowSteps.length - 1 ? <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden size-5 bg-background text-primary md:block" /> : null}</div> })}</div><div className="grid gap-4 md:grid-cols-3"><InfoPanel icon={LockKeyhole} title="Auth boundary" detail="cookie HttpOnly แยกเป็น pawsoft_session และ pawsoft_owner" /><InfoPanel icon={KeyRound} title="Business boundary" detail="route แปลง HTTP เท่านั้น ส่วนกฎอยู่ใน service" /><InfoPanel icon={FileText} title="File boundary" detail="รูปสัตว์และสลิปเก็บใน filesystem ผ่าน storage layer" /></div></div>
}

function InfoPanel({ icon: Icon, title, detail }: { icon: typeof Network; title: string; detail: string }) { return <div className="border-l-4 border-primary bg-muted/50 p-4"><Icon className="size-5 text-primary" /><p className="mt-3 font-semibold">{title}</p><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div> }

function ERDiagram() {
  const [selected, setSelected] = useState(tables[0]!)
  return <div className="flex flex-col gap-6"><SectionTitle eyebrow="ENTITY RELATIONSHIP / 03" title="ความสัมพันธ์ของข้อมูล" detail="เลือกตารางเพื่อดูฟิลด์สำคัญ ความสัมพันธ์ใช้ชื่อเดียวกับ Prisma model ในฐานข้อมูลจริง" /><div className="grid gap-4 lg:grid-cols-[1fr_280px]"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{tables.map((table) => <button key={table.id} type="button" onClick={() => setSelected(table)} className={`text-left border bg-card p-4 transition-colors hover:border-primary ${selected.id === table.id ? 'border-primary ring-2 ring-primary/20' : ''}`}><div className="flex items-center justify-between gap-2"><span className="font-mono text-sm font-semibold">{table.name}</span><Database className="size-4 text-primary" /></div><p className="mt-3 text-xs text-muted-foreground">{table.fields}</p><span className="mt-3 inline-block text-[10px] uppercase tracking-wider text-primary">{table.group}</span></button>)}</div><aside className="h-fit border bg-foreground p-5 text-background lg:sticky lg:top-4"><Database className="size-6 text-primary" /><p className="mt-4 font-mono text-lg font-semibold">{selected.name}</p><p className="mt-2 text-sm text-background/70">{selected.fields}</p><div className="mt-6 border-t border-background/20 pt-4"><p className="text-xs uppercase tracking-wider text-background/50">ความสัมพันธ์โดยสรุป</p><p className="mt-2 text-sm">{selected.id === 'owner' || selected.id === 'pet' ? 'เจ้าของเชื่อมกับสัตว์ นัดหมาย และประวัติการรักษา' : selected.id === 'visit' || selected.id === 'invoice' ? 'ข้อมูลการรักษาเดินต่อไปยังใบเสร็จและ payment' : 'ตารางนี้เป็นส่วนหนึ่งของโครงสร้างระบบและ audit'}</p></div></aside></div><div className="border bg-muted/50 p-4 text-sm text-muted-foreground"><span className="font-semibold text-foreground">อ่านเส้นทางหลัก:</span> owner 1—หลาย pet · pet 1—หลาย appointment/visit · visit 1—1 invoice · invoice 1—หลาย payment · user หลายคนอยู่ใต้ role</div></div>
}

function Workflow() { return <div className="flex flex-col gap-6"><SectionTitle eyebrow="OPERATING WORKFLOW / 04" title="ตั้งแต่รับลูกค้าจนปิดการรักษา" detail="ลำดับปฏิบัติงานจริงของคลินิก พร้อมจุดรับผิดชอบของแต่ละบทบาท" /><div className="relative flex flex-col gap-3">{workflow.map(([number, title, detail], index) => <div key={number} className="relative flex gap-4 border bg-card p-4 shadow-sm"><div className="flex size-10 shrink-0 items-center justify-center bg-primary text-sm font-semibold text-primary-foreground">{number}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{title}</h2>{index === 0 || index === 3 ? <span className="bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">human decision</span> : null}</div><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div>{index < workflow.length - 1 ? <ArrowDown className="absolute -bottom-4 left-7 z-10 size-5 bg-background text-primary" /> : null}</div>)}</div><div className="grid gap-3 md:grid-cols-3"><InfoPanel icon={CheckCircle2} title="ตรวจเสร็จ" detail="เปลี่ยน Visit เป็น AWAITING_PAYMENT ยังไม่ใช่ DONE" /><InfoPanel icon={Banknote} title="เก็บครบ" detail="ยอดรับต้องครบก่อนส่งให้บัญชีตรวจ" /><InfoPanel icon={ShieldCheck} title="แยกหน้าที่" detail="ผู้ส่งยอดและผู้ยืนยันต้องเป็นคนละคน" /></div></div> }

function Permissions() { return <div className="flex flex-col gap-6"><SectionTitle eyebrow="ACCESS CONTROL / 05" title="สิทธิ์กำหนดสิ่งที่พนักงานเห็นและทำได้" detail="เมนูและปุ่มถูกกรองที่ Web และตรวจซ้ำที่ API เพื่อไม่ให้การซ่อนหน้าจอเป็นด่านเดียว" /><div className="overflow-x-auto border bg-card"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-3 font-medium">Permission key</th><th className="p-3 font-medium">ความหมาย</th><th className="p-3 font-medium">ขอบเขต</th></tr></thead><tbody>{permissions.map(([key, label, scope]) => <tr key={key} className="border-b last:border-0"><td className="p-3 font-mono text-xs text-primary">{key}</td><td className="p-3 font-medium">{label}</td><td className="p-3 text-muted-foreground">{scope}</td></tr>)}</tbody></table></div><div className="grid gap-3 md:grid-cols-2"><InfoPanel icon={Users} title="พนักงาน" detail="ตรวจ role และ permission จาก session ทุก request" /><InfoPanel icon={CircleUserRound} title="เจ้าของสัตว์" detail="ไม่มี permission key ใช้ account id กรองข้อมูลของตัวเองแทน" /></div></div> }

export function SystemDiagramsPage({ publicView = false }: { publicView?: boolean }) {
  const [tab, setTab] = useState<DiagramTab>('overview')
  const content = { overview: <Overview />, flow: <DataFlow />, erd: <ERDiagram />, workflow: <Workflow />, permissions: <Permissions /> }[tab]
  return <main className={`min-h-screen ${publicView ? 'bg-muted/30' : ''}`}><div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-5 sm:p-8"><header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5"><div><div className="flex items-center gap-2 text-sm font-semibold"><Boxes className="size-5 text-primary" />Paw Soft <span className="text-muted-foreground">/ system diagrams</span></div><p className="mt-2 text-xs text-muted-foreground">เอกสารภาพรวมระบบ · อัปเดตตามโครงสร้างปัจจุบัน</p></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="size-4" />single clinic · PostgreSQL</div></header><nav className="flex gap-1 overflow-x-auto border-b" aria-label="ส่วนของเอกสาร">{TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm ${tab === id ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`} aria-current={tab === id ? 'page' : undefined}><Icon className="size-4" />{label}</button>)}</nav>{content}</div></main>
}