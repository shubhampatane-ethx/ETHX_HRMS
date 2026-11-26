// HR › Lifecycle: promotions, transfers and exits on HRMS's own records (Employee Promotion, Employee Transfer,
// Employee Separation). Submitting a promotion / transfer updates the Employee record (HRMS does this on its
// effective date), and can be edited while a draft, revised or withdrawn after; an exit runs the separation checklist, then HR marks the employee as Left. HR can cancel an exit
// (the employee withdraws their resignation), which puts the Employee record back to Active.
//
// The Overview and Employee History tabs put those records together per employee: a career timeline from joining to
// today, with every change shown as before → after, so HR can see how anyone got to where they are.
import { useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowRightLeft, CalendarClock, ExternalLink, FileDown, FilePen, History, LogOut, Paperclip, Pencil, Plus, Search, Trash2, TrendingUp, Undo2, Upload, UserCheck, UserMinus } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button, DateField, LinkField } from "../../components/ui/primitives";
import { Async, Empty, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, Stat, StatusPill, Tabs } from "../../components/employee/EmployeeShell";
import { dmy, errMsg, isoDate, listTry, money, useAsync } from "../../lib/employeePortal";
import { confirmDialog } from "../../components/ui/dialogs";

// Employee fields a promotion or transfer can change, with the doctype they link to.
const PROPS = [
  { fieldname: "designation", label: "Designation", link: "Designation" },
  { fieldname: "department", label: "Department", link: "Department" },
  { fieldname: "grade", label: "Grade", link: "Employee Grade" },
  { fieldname: "branch", label: "Branch", link: "Branch" },
  { fieldname: "reports_to", label: "Reports To", link: "Employee", title: "employee_name" },
];
const statusOf = (d) => (d.docstatus === 2 ? "Cancelled" : d.docstatus === 1 ? "Submitted" : "Draft");
const DT = { promotion: "Employee Promotion", transfer: "Employee Transfer" };
const DATE_FIELD = { promotion: "promotion_date", transfer: "transfer_date" };

// How each kind of event looks on the timeline and in the feed.
const KIND = {
  joined: { label: "Joined", icon: UserCheck, tone: "var(--color-green)" },
  promotion: { label: "Promotion", icon: TrendingUp, tone: "var(--color-red-hover)" },
  transfer: { label: "Transfer", icon: ArrowRightLeft, tone: "#2563eb" },
  exit: { label: "Resignation", icon: LogOut, tone: "var(--color-amber)" },
  left: { label: "Left", icon: UserMinus, tone: "var(--color-text-muted)" },
};

const EMP_FIELDS = ["name", "employee_name", "designation", "department", "branch", "grade", "reports_to", "date_of_joining", "status", "company", "relieving_date", "image", "ctc"];
const EMP_BASIC = ["name", "employee_name", "designation", "department", "branch", "reports_to", "date_of_joining", "status", "company", "relieving_date"];

/** Every lifecycle record, with each promotion's / transfer's property changes, plus the employees they're about. */
async function loadLifecycle() {
  const moves = async (kind) => {
    const dt = DT[kind];
    const date = DATE_FIELD[kind];
    const rows = await listTry(dt, { filters: [["docstatus", "<", 2]], fields: ["name", "employee", "employee_name", date, "docstatus", "company", ...(kind === "promotion" ? ["revised_ctc", "current_ctc"] : ["new_company"])], orderBy: `${date} desc` }, ["name", "employee", "employee_name", date, "docstatus"]).catch(() => []);
    const names = rows.map((r) => r.name);
    const props = names.length ? await frappe.getList("Employee Property History", { parent: dt, filters: [["parent", "in", names]], fields: ["parent", "property", "fieldname", "current", "new"], limit: 0 }).catch(() => []) : [];
    const by = {};
    props.forEach((p) => { (by[p.parent] ||= []).push(p); });
    return rows.map((r) => ({ ...r, kind, date: r[date], changes: by[r.name] || [] }));
  };
  const [promotions, transfers, exits, employees] = await Promise.all([
    moves("promotion"),
    moves("transfer"),
    listTry("Employee Separation", { filters: [["docstatus", "<", 2]], fields: ["name", "employee", "employee_name", "resignation_letter_date", "boarding_begins_on", "boarding_status", "docstatus"], orderBy: "creation desc" }, ["name", "employee", "employee_name", "boarding_begins_on", "docstatus"]).catch(() => []),
    listTry("Employee", { fields: EMP_FIELDS, orderBy: "employee_name asc" }, EMP_BASIC),
  ]);
  return { promotions, transfers, exits, employees, byId: Object.fromEntries(employees.map((e) => [e.name, e])) };
}

/** One employee's career events, newest first. */
function eventsFor(data, emp) {
  const out = [];
  const moves = [...data.promotions, ...data.transfers].filter((m) => m.employee === emp.name);
  // The role they joined in: the "current" side of their earliest designation change, else today's designation.
  const firstDesig = [...moves].sort((a, b) => String(a.date).localeCompare(String(b.date))).flatMap((m) => m.changes).find((c) => c.fieldname === "designation" || c.property === "Designation")?.current;
  if (emp.date_of_joining) out.push({ key: `${emp.name}-joined`, kind: "joined", date: emp.date_of_joining, emp, title: `Joined${firstDesig || emp.designation ? ` as ${firstDesig || emp.designation}` : ""}`, sub: [emp.department, emp.branch].filter(Boolean).join(" · ") });
  moves.forEach((m) => out.push({ key: m.name, kind: m.kind, date: m.date, emp, record: m, draft: m.docstatus === 0, changes: m.changes, ctc: m.kind === "promotion" && Number(m.revised_ctc) ? { from: Number(m.current_ctc) || 0, to: Number(m.revised_ctc) } : null, newCompany: m.kind === "transfer" && m.new_company && m.new_company !== m.company ? m.new_company : "" }));
  data.exits.filter((x) => x.employee === emp.name).forEach((x) => out.push({ key: x.name, kind: "exit", date: x.resignation_letter_date || x.boarding_begins_on, emp, record: x, draft: x.docstatus === 0, title: "Resigned", sub: `Last working day ${dmy(x.boarding_begins_on) || "not set"} · Checklist ${x.docstatus === 0 ? "not started" : String(x.boarding_status || "Pending").toLowerCase()}` }));
  if (emp.status === "Left" && emp.relieving_date) out.push({ key: `${emp.name}-left`, kind: "left", date: emp.relieving_date, emp, title: "Left the company", sub: `Relieved on ${dmy(emp.relieving_date)}` });
  return out.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || (a.kind === "joined" ? 1 : b.kind === "joined" ? -1 : 0));
}

/** "3 yrs 2 mos" between two ISO dates. */
function span(from, to = isoDate()) {
  if (!from) return "";
  const a = new Date(from);
  const b = new Date(to);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) - (b.getDate() < a.getDate() ? 1 : 0);
  if (months < 0) return "";
  const y = Math.floor(months / 12);
  months %= 12;
  const parts = [y && `${y} yr${y > 1 ? "s" : ""}`, months && `${months} mo${months > 1 ? "s" : ""}`].filter(Boolean);
  return parts.join(" ") || "Under a month";
}

const initialsOf = (name) => String(name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

function Avatar({ emp, size = 36 }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-red-wash)] font-semibold text-[var(--color-red-hover)]" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {emp?.image && !failed ? <img src={emp.image} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} /> : initialsOf(emp?.employee_name || emp?.name)}
    </span>
  );
}

/** A property value as people read it: an employee ID becomes their name. */
function useShow(byId) {
  return (c, v) => ((c.fieldname === "reports_to" || c.property === "Reports To") && byId?.[v] ? byId[v].employee_name : v) || "—";
}

/** Before → after rows for a promotion / transfer. */
function ChangeList({ changes, ctc, newCompany, byId, compact = false }) {
  const show = useShow(byId);
  const rows = [...changes.map((c) => ({ key: c.property, label: c.property, from: show(c, c.current), to: show(c, c.new) }))];
  if (newCompany) rows.push({ key: "company", label: "Company", from: "", to: newCompany });
  if (ctc) {
    const pct = ctc.from ? ((ctc.to - ctc.from) / ctc.from) * 100 : null;
    rows.push({ key: "ctc", label: "CTC", from: ctc.from ? money(ctc.from) : "—", to: money(ctc.to), note: pct != null && Number.isFinite(pct) ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` : "" });
  }
  if (!rows.length) return <span className="text-[12px] text-[var(--color-text-faint)]">No details recorded</span>;
  return (
    <dl className={`grid grid-cols-[auto_1fr] items-baseline gap-x-4 ${compact ? "gap-y-1" : "gap-y-1.5"} text-[12.5px]`}>
      {rows.map((r) => (
        <div key={r.key} className="contents">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-faint)]">{r.label}</dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-x-1.5">
            {r.from && <span className={`text-[var(--color-text-muted)] ${r.from === "—" ? "" : "line-through decoration-[var(--color-text-faint)]"}`}>{r.from}</span>}
            {r.from && <ArrowRight size={12} className="shrink-0 text-[var(--color-text-faint)]" />}
            <span className="font-medium text-[var(--color-text)]">{r.to}</span>
            {r.note && <span className="rounded bg-[color-mix(in_srgb,var(--color-green)_14%,transparent)] px-1.5 py-px text-[10.5px] font-semibold text-[var(--color-green)]">{r.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function KindBadge({ kind }) {
  const k = KIND[kind];
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide" style={{ background: `color-mix(in srgb, ${k.tone} 14%, transparent)`, color: k.tone }}><k.icon size={11} />{k.label}</span>;
}

/* ------------------------------------ page ------------------------------------ */

export default function Lifecycle() {
  const data = useAsync(loadLifecycle, []);
  const [tab, setTab] = useState("overview");
  const [person, setPerson] = useState("");
  const open = (id) => { setPerson(id); setTab("history"); };
  const d = data.data;
  const year = String(new Date().getFullYear());
  const thisYear = (rows) => (rows || []).filter((r) => r.docstatus === 1 && String(r.date || "").startsWith(year)).length;
  const drafts = d ? [...d.promotions, ...d.transfers].filter((r) => r.docstatus === 0).length : null;
  const activeExits = d ? d.exits.filter((x) => d.byId[x.employee]?.status !== "Left").length : null;

  return (
    <div className="space-y-5">
      <PageHeader icon={TrendingUp} title="Employee Lifecycle" subtitle="Every promotion, transfer and exit, and how each one changed the employee's record" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={TrendingUp} label="Promotions" value={d ? thisYear(d.promotions) : null} sub={`Submitted in ${year}`} />
        <Stat icon={ArrowRightLeft} label="Transfers" value={d ? thisYear(d.transfers) : null} sub={`Submitted in ${year}`} accent="#2563eb" />
        <Stat icon={LogOut} label="Exits in Progress" value={activeExits} sub="Resigned, not yet left" accent="var(--color-amber)" />
        <Stat icon={FilePen} label="Awaiting Submission" value={drafts} sub="Draft promotions and transfers" accent="var(--color-text-muted)" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: "overview", label: "Overview" },
        { id: "history", label: "Employee History" },
        { id: "promotions", label: "Promotions", count: d?.promotions.length },
        { id: "transfers", label: "Transfers", count: d?.transfers.length },
        { id: "exits", label: "Exits", count: d?.exits.length },
      ]} />
      {tab === "overview" && <Async state={data}>{(v) => <Overview data={v} onOpen={open} />}</Async>}
      {tab === "history" && <Async state={data}>{(v) => <EmployeeHistory data={v} selected={person} onSelect={setPerson} />}</Async>}
      {tab === "promotions" && <Moves kind="promotion" byId={d?.byId} onOpen={open} onChanged={data.reload} />}
      {tab === "transfers" && <Moves kind="transfer" byId={d?.byId} onOpen={open} onChanged={data.reload} />}
      {tab === "exits" && <Exits onChanged={data.reload} />}
    </div>
  );
}

/* ---------------------------------- overview ---------------------------------- */

function Overview({ data, onOpen }) {
  const today = isoDate();
  const all = useMemo(() => data.employees.flatMap((e) => eventsFor(data, e)).filter((ev) => ev.kind !== "joined" || ev.date >= `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`).sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))), [data, today]);
  const recent = all.filter((ev) => ev.date && ev.date <= today).slice(0, 12);
  const upcoming = [
    ...all.filter((ev) => ev.date && ev.date > today && ev.kind !== "exit"),
    ...data.exits.filter((x) => x.boarding_begins_on >= today && data.byId[x.employee]?.status !== "Left").map((x) => ({ key: `${x.name}-lwd`, kind: "exit", date: x.boarding_begins_on, emp: data.byId[x.employee] || { name: x.employee, employee_name: x.employee_name }, title: "Last working day" })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <Panel title="Recent Changes" hint="The latest promotions, transfers, exits and joiners. Choose one to see that employee's full history." className="xl:col-span-2">
        {recent.length === 0 ? <Empty icon={History} text="No changes recorded yet." /> : (
          <ul className="divide-y divide-[var(--color-border)]">
            {recent.map((ev) => (
              <li key={ev.key}>
                <button type="button" onClick={() => onOpen(ev.emp.name)} className="flex w-full items-start gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-[var(--color-surface-2)]">
                  <Avatar emp={ev.emp} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold text-[var(--color-text)]">{ev.emp.employee_name}</span>
                      <KindBadge kind={ev.kind} />
                      {ev.draft && <StatusPill status="Draft" />}
                      <span className="ml-auto text-[11.5px] text-[var(--color-text-faint)]">{dmy(ev.date)}</span>
                    </div>
                    <div className="mt-1.5">{ev.record && (ev.kind === "promotion" || ev.kind === "transfer") ? <ChangeList compact changes={ev.changes} ctc={ev.ctc} newCompany={ev.newCompany} byId={data.byId} /> : <p className="text-[12.5px] text-[var(--color-text-muted)]">{[ev.title, ev.sub].filter(Boolean).join(" · ")}</p>}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Coming Up" hint="Changes that take effect, and last working days, from today onwards">
        {upcoming.length === 0 ? <Empty icon={CalendarClock} text="Nothing scheduled." /> : (
          <ul className="space-y-2">
            {upcoming.map((ev) => (
              <li key={ev.key}>
                <button type="button" onClick={() => onOpen(ev.emp.name)} className="flex w-full items-center gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-left transition-colors hover:border-[var(--color-border-strong)]">
                  <div className="w-11 shrink-0 text-center leading-tight"><div className="text-[17px] font-semibold text-[var(--color-text)]">{ev.date.slice(8, 10)}</div><div className="text-[10px] uppercase text-[var(--color-text-faint)]">{new Date(ev.date).toLocaleString("en", { month: "short" })}</div></div>
                  <div className="min-w-0 flex-1"><div className="truncate text-[12.5px] font-medium text-[var(--color-text)]">{ev.emp.employee_name}</div><div className="mt-0.5"><KindBadge kind={ev.kind} /></div></div>
                  {ev.draft && <StatusPill status="Draft" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------ employee history ------------------------------ */

function EmployeeHistory({ data, selected, onSelect }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("Active");
  const counts = useMemo(() => {
    const c = {};
    [...data.promotions, ...data.transfers, ...data.exits].forEach((r) => { c[r.employee] = (c[r.employee] || 0) + 1; });
    return c;
  }, [data]);
  const needle = q.trim().toLowerCase();
  const people = data.employees.filter((e) => (status === "All" || e.status === status || e.name === selected) && (!needle || [e.employee_name, e.name, e.designation, e.department].some((v) => String(v || "").toLowerCase().includes(needle))));
  const emp = data.byId[selected] || null;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr]">
      <section className="flex max-h-[calc(100vh-220px)] min-h-[420px] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="space-y-2 border-b border-[var(--color-border)] p-3">
          <div className="relative"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" /><input className={`${inputCls} pl-8`} placeholder="Search name, ID, role…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="flex gap-1">{["Active", "Left", "All"].map((s) => <button key={s} type="button" onClick={() => setStatus(s)} className={`flex-1 rounded-md border px-2 py-1 text-[11.5px] ${status === s ? "border-[var(--color-red)] bg-[var(--color-red-wash)] text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"}`}>{s}</button>)}</div>
        </div>
        <ul className="flex-1 overflow-y-auto p-1.5">
          {people.length === 0 && <li className="p-4 text-center text-[12.5px] text-[var(--color-text-muted)]">No employees match.</li>}
          {people.map((e) => (
            <li key={e.name}>
              <button type="button" onClick={() => onSelect(e.name)} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${selected === e.name ? "bg-[var(--color-red-wash)]" : "hover:bg-[var(--color-surface-2)]"}`}>
                <Avatar emp={e} size={32} />
                <span className="min-w-0 flex-1"><span className="block truncate text-[12.5px] font-medium text-[var(--color-text)]">{e.employee_name}</span><span className="block truncate text-[11px] text-[var(--color-text-faint)]">{e.designation || e.name}</span></span>
                {counts[e.name] > 0 && <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)]" title="Lifecycle records">{counts[e.name]}</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
      {emp ? <EmployeeCareer data={data} emp={emp} /> : (
        <section className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]"><Empty icon={History} text="Choose an employee to see their journey: when they joined, every promotion and transfer, and any exit." /></section>
      )}
    </div>
  );
}

function EmployeeCareer({ data, emp }) {
  const events = eventsFor(data, emp);
  const show = useShow(data.byId);
  const submitted = events.filter((ev) => !ev.draft);
  const promotions = submitted.filter((ev) => ev.kind === "promotion").length;
  const transfers = submitted.filter((ev) => ev.kind === "transfer").length;
  const today = isoDate();
  // When they took their current role: the latest submitted change to their designation, else joining.
  const roleSince = submitted.find((ev) => ev.date <= today && (ev.changes || []).some((c) => c.fieldname === "designation" || c.property === "Designation"))?.date || emp.date_of_joining;
  const facts = [
    ["Employee ID", emp.name],
    ["Department", emp.department],
    ["Branch", emp.branch],
    ["Grade", emp.grade],
    ["Reports To", emp.reports_to ? show({ fieldname: "reports_to" }, emp.reports_to) : ""],
    ["Company", emp.company],
    ["Date of Joining", dmy(emp.date_of_joining)],
    ["Current CTC", Number(emp.ctc) ? money(emp.ctc) : ""],
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar emp={emp} size={56} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-[17px] font-semibold text-[var(--color-text)]">{emp.employee_name}</h2><StatusPill status={emp.status} /></div>
            <p className="mt-0.5 text-[13px] text-[var(--color-text-muted)]">{[emp.designation, emp.department].filter(Boolean).join(" · ") || "—"}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["Tenure", span(emp.date_of_joining, emp.status === "Left" && emp.relieving_date ? emp.relieving_date : today) || "—"], ["In Current Role", span(roleSince) || "—"], ["Promotions", promotions], ["Transfers", transfers]].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-[var(--color-surface-2)] px-3 py-2"><div className="text-[10.5px] uppercase tracking-wide text-[var(--color-text-faint)]">{k}</div><div className="mt-0.5 text-[13.5px] font-semibold text-[var(--color-text)]">{v}</div></div>
            ))}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[var(--color-border)] pt-4 sm:grid-cols-4">
          {facts.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-[10.5px] uppercase tracking-wide text-[var(--color-text-faint)]">{k}</dt><dd className="mt-0.5 truncate text-[13px] text-[var(--color-text)]">{v || "—"}</dd></div>)}
        </dl>
      </section>

      <Panel title="Career Timeline" hint="Newest first. Struck-through values are what changed; drafts haven't touched the employee record yet.">
        {events.length === 0 ? <Empty icon={History} text="No history recorded for this employee." /> : (
          <ol className="relative">
            {events.map((ev, i) => {
              const k = KIND[ev.kind];
              const future = ev.date > today;
              return (
                <li key={ev.key} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < events.length - 1 && <span className="absolute left-[17px] top-9 bottom-0 w-px bg-[var(--color-border)]" />}
                  <span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 bg-[var(--color-surface)]" style={{ borderColor: ev.draft ? "var(--color-border-strong)" : k.tone, color: k.tone }}><k.icon size={15} /></span>
                  <div className={`min-w-0 flex-1 rounded-lg border p-3.5 ${ev.draft ? "border-dashed border-[var(--color-border-strong)]" : "border-[var(--color-border)]"}`}>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <KindBadge kind={ev.kind} />
                      <span className="text-[12.5px] font-medium text-[var(--color-text)]">{dmy(ev.date) || "No date"}</span>
                      {future && <span className="text-[11px] text-[var(--color-text-faint)]">· takes effect in {span(today, ev.date) === "Under a month" ? "under a month" : span(today, ev.date)}</span>}
                      {ev.draft && <StatusPill status="Draft" />}
                      {ev.record && <span className="ml-auto text-[11px] text-[var(--color-text-faint)]">{ev.record.name}{ev.record.amended_from ? ` · revises ${ev.record.amended_from}` : ""}</span>}
                    </div>
                    {ev.kind === "promotion" || ev.kind === "transfer" ? <ChangeList changes={ev.changes} ctc={ev.ctc} newCompany={ev.newCompany} byId={data.byId} /> : <p className="text-[13px] text-[var(--color-text)]">{ev.title}{ev.sub && <span className="block text-[12px] text-[var(--color-text-muted)]">{ev.sub}</span>}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------ promotions / transfers ------------------------------ */

function Moves({ kind, byId, onOpen, onChanged }) {
  const dt = DT[kind];
  const date = DATE_FIELD[kind];
  const list = useAsync(() => listTry(dt, { fields: ["name", "employee", "employee_name", date, "docstatus", "company", "amended_from", ...(kind === "promotion" ? ["revised_ctc", "current_ctc"] : ["new_company"])], orderBy: `${date} desc` }, ["name", "employee", "employee_name", date, "docstatus"]), [dt]);
  const details = useAsync(async () => {
    const names = (list.data || []).map((r) => r.name);
    if (!names.length) return {};
    const rows = await frappe.getList("Employee Property History", { parent: dt, filters: [["parent", "in", names]], fields: ["parent", "property", "fieldname", "current", "new"], limit: 0 }).catch(() => []);
    const m = {};
    rows.forEach((r) => { (m[r.parent] ||= []).push(r); });
    return m;
  }, [list.data]);
  const [modal, setModal] = useState(null); // { record?, revise? }
  const [msg, setMsg] = useState(null);
  const [filter, setFilter] = useState("all");
  const done = (text) => { setMsg({ ok: true, text }); list.reload(); onChanged?.(); };
  const Label = kind === "promotion" ? "Promotion" : "Transfer";

  async function submit(r) {
    if (r[date] > isoDate()) return setMsg({ ok: false, text: `A ${kind} can only be submitted on or after its effective date (${dmy(r[date])}). Submit it then.` });
    if (!(await confirmDialog(`Submit this ${kind}? The employee record is updated now.`))) return;
    try {
      await frappe.submitDoc(await frappe.getDoc(dt, r.name));
      done(`${r.employee_name}: ${kind} submitted.`);
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, `Couldn't submit the ${kind}.`) });
    }
  }

  // A draft is simply deleted; a submitted one is cancelled, which makes HRMS put the employee record back.
  async function withdraw(r) {
    const submitted = r.docstatus === 1;
    const ok = await confirmDialog({
      title: `Withdraw ${Label}`,
      message: submitted ? `Cancel ${r.employee_name}'s ${kind}? The employee record goes back to what it was before (${(details.data?.[r.name] || []).map((p) => `${p.property}: ${p.current || "—"}`).join(", ") || "previous details"}).` : `Delete ${r.employee_name}'s draft ${kind}? Nothing on the employee record has changed yet.`,
      confirmLabel: submitted ? "Cancel It" : "Delete Draft",
      danger: true,
    });
    if (!ok) return;
    try {
      if (submitted) await frappe.cancelDoc(dt, r.name);
      else await frappe.deleteDoc(dt, r.name);
      done(submitted ? `${r.employee_name}: ${kind} cancelled and the employee record restored.` : `${r.employee_name}: draft ${kind} deleted.`);
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, `Couldn't withdraw the ${kind}.`) });
    }
  }

  async function letter(r) {
    setMsg(null);
    try {
      const [doc, emp] = await Promise.all([frappe.getDoc(dt, r.name), frappe.getDoc("Employee", r.employee)]);
      downloadLetter(kind, doc, emp);
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, "Couldn't prepare the letter.") });
    }
  }

  const act = "flex items-center gap-1 rounded px-1.5 py-1 text-[11.5px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]";
  const FILTERS = [["all", "All"], ["draft", "Drafts"], ["submitted", "Submitted"], ["cancelled", "Cancelled"]];
  const match = (r) => filter === "all" || statusOf(r).toLowerCase() === filter;
  return (
    <Panel action={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => downloadTemplate(kind)}><FileDown size={14} /> Letter Template</Button><Button onClick={() => setModal({})}><Plus size={14} /> New {Label}</Button></div>} title={`${Label}s`} hint={kind === "promotion" ? "Role, grade and pay changes. Submitting updates the employee record." : "Moves between departments, branches, managers or companies. Submitting updates the employee record."}>
      {msg && <div className="mb-3"><Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice></div>}
      <div className="mb-3 flex flex-wrap gap-1.5">{FILTERS.map(([id, l]) => <button key={id} type="button" onClick={() => setFilter(id)} className={`rounded-md border px-2.5 py-1 text-[12px] ${filter === id ? "border-[var(--color-red)] bg-[var(--color-red-wash)] text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"}`}>{l}{list.data && <span className="ml-1.5 text-[var(--color-text-faint)]">{(list.data || []).filter((r) => id === "all" || statusOf(r).toLowerCase() === id).length}</span>}</button>)}</div>
      <Async state={list}>
        {(rows) => <Grid rows={rows.filter(match)} empty={filter === "all" ? `No ${kind}s yet.` : `No ${filter} ${kind}s.`} columns={[
          { key: "employee_name", label: "Employee", className: "w-[24%] align-top !py-3", render: (r) => {
            const e = byId?.[r.employee];
            return (
              <button type="button" onClick={() => onOpen?.(r.employee)} title="See this employee's full history" className="group flex items-start gap-2.5 text-left">
                <Avatar emp={e || { employee_name: r.employee_name }} size={34} />
                <span className="min-w-0"><span className="block font-medium text-[var(--color-text)] group-hover:underline">{r.employee_name}</span><span className="block text-[11px] text-[var(--color-text-faint)]">{r.employee}</span>{e?.designation && <span className="block text-[11px] text-[var(--color-text-muted)]">Now: {e.designation}</span>}</span>
              </button>
            );
          } },
          { key: date, label: "Effective", className: "align-top !py-3 whitespace-nowrap", render: (r) => <span>{dmy(r[date])}<span className="block text-[11px] text-[var(--color-text-faint)]">{r.name}</span>{r.amended_from && <span className="block text-[10.5px] text-[var(--color-text-faint)]">revises {r.amended_from}</span>}</span> },
          { key: "changes", label: "What Changes", className: "align-top !py-3", render: (r) => <ChangeList compact byId={byId} changes={details.data?.[r.name] || []} ctc={kind === "promotion" && Number(r.revised_ctc) ? { from: Number(r.current_ctc) || 0, to: Number(r.revised_ctc) } : null} newCompany={kind === "transfer" && r.new_company && r.new_company !== r.company ? r.new_company : ""} /> },
          { key: "status", label: "Status", className: "align-top !py-3", render: (r) => <StatusPill status={statusOf(r)} /> },
          { key: "_a", label: "", className: "align-top !py-2.5", render: (r) => (
            <div className="flex flex-col items-end gap-1">
              {r.docstatus === 0 && (r[date] > isoDate() ? <span className="text-[11px] text-[var(--color-text-faint)]">Submit on {dmy(r[date])}</span> : <Button variant="secondary" className="!px-2.5 !py-1 text-[11px]" onClick={() => submit(r)}>Submit</Button>)}
              <div className="flex flex-wrap justify-end gap-0.5">
                {r.docstatus === 0 && <button type="button" className={act} onClick={() => setModal({ record: r })}><Pencil size={12} /> Edit</button>}
                {r.docstatus === 1 && <button type="button" className={act} title="Cancel this one and save a corrected copy" onClick={() => setModal({ record: r, revise: true })}><Pencil size={12} /> Revise</button>}
                {r.docstatus < 2 && <button type="button" className={act} onClick={() => letter(r)}><FileDown size={12} /> Letter</button>}
                {r.docstatus < 2 && <button type="button" className={`${act} hover:!text-[var(--color-red-hover)]`} onClick={() => withdraw(r)}><Undo2 size={12} /> Withdraw</button>}
              </div>
            </div>
          ) },
        ]} />}
      </Async>
      {modal && <MoveModal kind={kind} record={modal.record} revise={modal.revise} onClose={() => setModal(null)} onSaved={(text) => { setModal(null); done(text); }} />}
    </Panel>
  );
}

/* --------------------------- promotion / transfer letters --------------------------- */

const LETTER = {
  promotion: { title: "Letter of Promotion", body: "We are pleased to inform you that, in recognition of your performance and contribution, you have been promoted with effect from {date}." },
  transfer: { title: "Letter of Transfer", body: "This is to inform you that you are being transferred with effect from {date}, as detailed below." },
};
const escapeHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A Word-compatible letter (HTML saved as .doc opens in Word for edits and printing on letterhead).
function letterHtml(kind, v) {
  const L = LETTER[kind];
  const rows = v.changes.map((c) => `<tr><td style="padding:4px 12px 4px 0">${escapeHtml(c.property)}</td><td style="padding:4px 12px">${escapeHtml(c.current || "—")}</td><td style="padding:4px 12px"><b>${escapeHtml(c.new)}</b></td></tr>`).join("");
  return `<html><head><meta charset="utf-8"><title>${L.title}</title></head><body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5">
<p style="text-align:right">Date: ${escapeHtml(v.today)}</p>
<p>To,<br><b>${escapeHtml(v.name)}</b><br>Employee ID: ${escapeHtml(v.id)}<br>${escapeHtml(v.designation)}${v.department ? `, ${escapeHtml(v.department)}` : ""}</p>
<p style="text-align:center"><b><u>${L.title.toUpperCase()}</u></b></p>
<p>Dear ${escapeHtml(v.first)},</p>
<p>${escapeHtml(L.body.replace("{date}", v.date))}</p>
${rows ? `<table style="border-collapse:collapse;margin:8px 0"><tr><th style="text-align:left;padding:4px 12px 4px 0">Detail</th><th style="text-align:left;padding:4px 12px">Current</th><th style="text-align:left;padding:4px 12px">New</th></tr>${rows}</table>` : ""}
${v.ctc ? `<p>Your revised annual CTC will be <b>${escapeHtml(v.ctc)}</b>. All other terms of your employment remain unchanged.</p>` : "<p>All other terms of your employment remain unchanged.</p>"}
${kind === "transfer" && v.newCompany ? `<p>You will now be part of <b>${escapeHtml(v.newCompany)}</b>.</p>` : ""}
<p>We wish you continued success in your ${kind === "promotion" ? "new role" : "new assignment"}.</p>
<p>Yours sincerely,<br><br><br>For <b>${escapeHtml(v.company)}</b><br>Authorised Signatory<br>Human Resources</p>
</body></html>`;
}

function save(filename, html) {
  const url = URL.createObjectURL(new Blob(["﻿", html], { type: "application/msword" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadLetter(kind, doc, emp) {
  const rows = (kind === "promotion" ? doc.promotion_details : doc.transfer_details) || [];
  save(`${kind}-letter-${emp.employee_name || emp.name}.doc`.replace(/\s+/g, "-"), letterHtml(kind, {
    today: dmy(isoDate()), name: emp.employee_name || emp.name, first: emp.first_name || String(emp.employee_name || "").split(" ")[0], id: emp.employee_number || emp.name,
    designation: rows.find((r) => r.fieldname === "designation")?.current || emp.designation || "", department: emp.department || "",
    date: dmy(doc.promotion_date || doc.transfer_date), changes: rows.map((r) => ({ property: r.property, current: r.current, new: r.new })),
    ctc: Number(doc.revised_ctc) ? money(doc.revised_ctc) : "", company: doc.company || emp.company || "", newCompany: doc.new_company && doc.new_company !== doc.company ? doc.new_company : "",
  }));
}

/** The letter with placeholders, for HR to adapt in Word. */
function downloadTemplate(kind) {
  save(`${kind}-letter-template.doc`, letterHtml(kind, {
    today: "{Letter Date}", name: "{Employee Name}", first: "{First Name}", id: "{Employee ID}", designation: "{Current Designation}", department: "{Department}", date: "{Effective Date}",
    changes: [{ property: "{Detail, e.g. Designation}", current: "{Current}", new: "{New}" }], ctc: kind === "promotion" ? "{Revised CTC}" : "", company: "{Company}", newCompany: kind === "transfer" ? "{New Company, if changing}" : "",
  }));
}

// Grades are a short list HR manages; one that's missing can be added straight from the picker.
const createGrade = async (text) => (await frappe.createDoc("Employee Grade", { __newname: text, name: text })).name || text;

function MoveModal({ kind, record, revise, onClose, onSaved }) {
  const dt = DT[kind];
  const editing = Boolean(record);
  const full = useAsync(() => (record ? frappe.getDoc(dt, record.name) : Promise.resolve(null)), [record?.name]);
  const [employee, setEmployee] = useState(record?.employee || "");
  const emp = useAsync(() => (employee ? frappe.getDoc("Employee", employee) : Promise.resolve(null)), [employee]);
  const [values, setValues] = useState(null); // null until loaded from the record (editing) or first change
  const [f, setF] = useState({ date: record ? record[kind === "promotion" ? "promotion_date" : "transfer_date"] : isoDate(), revised_ctc: "", new_company: "", submitNow: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const e = emp.data;
  // When editing, start from the record's own changes (and CTC / new company) once it has loaded.
  const loaded = full.data;
  const startValues = loaded ? Object.fromEntries(((kind === "promotion" ? loaded.promotion_details : loaded.transfer_details) || []).map((r) => [r.fieldname, r.new])) : {};
  const vals = values ?? startValues;
  const ctc = f.revised_ctc !== "" ? f.revised_ctc : loaded && Number(loaded.revised_ctc) ? String(loaded.revised_ctc) : "";
  const newCompany = f.new_company || (loaded?.new_company && loaded.new_company !== loaded.company ? loaded.new_company : "");
  // The "current" side: the record's own values when revising a submitted one (the employee already shows the new ones).
  const currentOf = (p) => {
    const row = ((kind === "promotion" ? loaded?.promotion_details : loaded?.transfer_details) || []).find((r) => r.fieldname === p.fieldname);
    return revise && row ? row.current || "" : e?.[p.fieldname] || "";
  };
  const changes = e ? PROPS.filter((p) => vals[p.fieldname] && vals[p.fieldname] !== currentOf(p)) : [];
  const setValue = (k, v) => setValues({ ...vals, [k]: v });

  async function submit(ev) {
    ev.preventDefault();
    if (!changes.length && !(kind === "promotion" && ctc) && !(kind === "transfer" && newCompany && newCompany !== e.company)) return setErr("Change at least one detail.");
    // ERPNext requires at least one property row on a transfer (e.g. the department in the new company)
    if (kind === "transfer" && !changes.length) return setErr("Also choose what changes with the transfer (for example the department or designation in the new company).");
    if (f.submitNow && f.date > isoDate()) return setErr(`A ${kind} can only be submitted on or after its effective date - save it now and submit it on ${dmy(f.date)}.`);
    if (revise && !(await confirmDialog({ title: `Revise ${kind === "promotion" ? "Promotion" : "Transfer"}`, message: `${record.name} is cancelled (the employee record goes back first) and a corrected copy is saved${f.submitNow ? " and submitted" : " as a draft"}.`, confirmLabel: "Revise" }))) return;
    setBusy(true);
    setErr("");
    try {
      const details = changes.map((p) => ({ property: p.label, fieldname: p.fieldname, current: currentOf(p), new: vals[p.fieldname] }));
      const doc = kind === "promotion"
        ? { employee, promotion_date: f.date, company: e.company, promotion_details: details, revised_ctc: ctc ? Number(ctc) : 0, ...(ctc ? { current_ctc: loaded?.current_ctc || e.ctc || 0, salary_currency: e.salary_currency || undefined } : {}) }
        : { employee, transfer_date: f.date, company: e.company, new_company: newCompany || e.company, transfer_details: details };
      let name;
      if (editing && !revise) {
        await frappe.updateDoc(dt, record.name, doc);
        name = record.name;
      } else {
        if (revise) await frappe.cancelDoc(dt, record.name);
        name = (await frappe.createDoc(dt, { ...doc, ...(revise ? { amended_from: record.name } : {}) })).name;
      }
      if (f.submitNow) await frappe.submitDoc(await frappe.getDoc(dt, name));
      const who = e.employee_name || employee;
      onSaved(revise ? `${who}: ${record.name} cancelled and revised as ${name}${f.submitNow ? " (submitted)" : " (draft)"}.` : editing ? `${who}: ${kind} updated${f.submitNow ? " and submitted" : ""}.` : `${who}: ${kind} saved${f.submitNow ? " and submitted" : " as a draft"}.`);
    } catch (x) {
      setErr(errMsg(x, `Couldn't save the ${kind}.`));
      setBusy(false);
    }
  }

  const title = `${revise ? "Revise" : editing ? "Edit" : "New"} ${kind === "promotion" ? "Promotion" : "Transfer"}${record ? ` · ${record.employee_name}` : ""}`;
  return (
    <Modal title={title} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        {revise && <Notice tone="info">This {kind} is already submitted. Revising cancels it (the employee record goes back) and saves a corrected copy.</Notice>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {editing ? <Field label="Employee"><input readOnly className={inputCls} value={record.employee_name || record.employee} /></Field> : <LinkField label="Employee" linkDoctype="Employee" value={employee} onChange={(v) => { setEmployee(v); setValues({}); }} required frappe={frappe} />}
          <DateField label={kind === "promotion" ? "Promotion Date" : "Transfer Date"} value={f.date} onChange={(v) => setF({ ...f, date: v })} required />
        </div>
        {e && (!editing || loaded) && (
          <>
            <table className="w-full text-left text-[12.5px]">
              <thead><tr className="text-[var(--color-text-muted)]"><th className="py-1.5 font-medium">Detail</th><th className="py-1.5 font-medium">Current</th><th className="py-1.5 font-medium">New (Leave Empty to Keep)</th></tr></thead>
              <tbody>
                {PROPS.map((p) => (
                  <tr key={p.fieldname} className="border-t border-[var(--color-border)]">
                    <td className="py-1.5 pr-3 text-[var(--color-text)]">{p.label}</td>
                    <td className="py-1.5 pr-3 text-[var(--color-text-muted)]">{currentOf(p) || "—"}</td>
                    <td className="py-1.5"><LinkField label="" linkDoctype={p.link} titleField={p.title} value={vals[p.fieldname] || ""} onChange={(v) => setValue(p.fieldname, v)} frappe={frappe} onCreate={p.fieldname === "grade" ? createGrade : undefined} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-[var(--color-text-faint)]">Grade not in the list? Type it and choose "+ Create" to add it.</p>
            {kind === "promotion" && <Field label={`Revised CTC (₹/yr)${e.ctc ? ` - current ${money(e.ctc)}` : ""}`}><input type="number" min="0" className={inputCls} value={ctc} onChange={(x) => setF({ ...f, revised_ctc: x.target.value })} /></Field>}
            {kind === "transfer" && <LinkField label={`New company (current: ${e.company})`} linkDoctype="Company" value={newCompany} onChange={(v) => setF({ ...f, new_company: v })} frappe={frappe} />}
          </>
        )}
        {editing && !loaded && !full.error && <p className="text-[13px] text-[var(--color-text-muted)]">Loading…</p>}
        {full.error && <Notice>{errMsg(full.error, `Couldn't open this ${kind}.`)}</Notice>}
        <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={f.submitNow} onChange={(x) => setF({ ...f, submitNow: x.target.checked })} /> Submit now (otherwise saved as a draft to review)</label>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !e || (editing && !loaded)}>{busy ? "Saving…" : revise ? "Revise" : editing ? "Save Changes" : "Save"}</Button></div>
      </form>
    </Modal>
  );
}

/* ---------------------------------- exits ---------------------------------- */

function Exits({ onChanged }) {
  const list = useAsync(() => listTry("Employee Separation", { filters: [["docstatus", "<", 2]], fields: ["name", "employee", "employee_name", "resignation_letter_date", "boarding_begins_on", "boarding_status", "docstatus", "department", "designation"], orderBy: "creation desc" }, ["name", "employee", "employee_name", "boarding_begins_on", "boarding_status", "docstatus"]), []);
  const emps = useAsync(async () => {
    const ids = [...new Set((list.data || []).map((r) => r.employee))];
    if (!ids.length) return {};
    const rows = await frappe.getList("Employee", { filters: [["name", "in", ids]], fields: ["name", "status", "relieving_date", "user_id"], limit: 0 });
    return Object.fromEntries(rows.map((r) => [r.name, r]));
  }, [list.data]);
  const [modal, setModal] = useState(null);
  const refresh = () => { list.reload(); emps.reload(); onChanged?.(); };
  const [msg, setMsg] = useState(null);

  return (
    <Panel action={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setModal({ kind: "templates" })}><Paperclip size={14} /> Template Documents</Button><Button onClick={() => setModal({ kind: "new" })}><Plus size={14} /> Start Exit</Button></div>}>
      {msg && <div className="mb-3"><Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice></div>}
      <Async state={list}>
        {(rows) => <Grid rows={rows} empty="No exits in progress." columns={[
          { key: "employee_name", label: "Employee", render: (r) => <span>{r.employee_name}<span className="block text-[11px] text-[var(--color-text-faint)]">{[r.designation, r.department].filter(Boolean).join(" · ")}</span></span> },
          { key: "resignation_letter_date", label: "Resigned", render: (r) => dmy(r.resignation_letter_date) || "—" },
          { key: "boarding_begins_on", label: "Last Working Day", render: (r) => dmy(r.boarding_begins_on) },
          { key: "boarding_status", label: "Checklist", render: (r) => <StatusPill status={r.docstatus === 0 ? "Draft" : r.boarding_status} /> },
          { key: "emp", label: "Employee Status", render: (r) => { const e = emps.data?.[r.employee]; return e ? <span><StatusPill status={e.status} />{e.relieving_date && <span className="block text-[10.5px] text-[var(--color-text-faint)]">relieved {dmy(e.relieving_date)}</span>}</span> : "…"; } },
          { key: "_a", label: "", render: (r) => {
            const e = emps.data?.[r.employee];
            return <div className="flex justify-end gap-1">
              {r.docstatus === 0 && <Button variant="secondary" className="!px-2 !py-1 text-[11px]" onClick={async () => { if (!(await confirmDialog(`Start the separation checklist for ${r.employee_name || r.employee}?`))) return; try { await frappe.submitDoc(await frappe.getDoc("Employee Separation", r.name)); refresh(); } catch (x) { setMsg({ ok: false, text: errMsg(x, "Couldn't start the checklist.") }); } }}>Start Checklist</Button>}
              <Button variant="ghost" className="!px-2 !py-1 text-[11px]" onClick={() => setModal({ kind: "documents", row: r })}><Paperclip size={12} /> Documents</Button>
              {e && e.status !== "Left" && <Button variant="ghost" className="!px-2 !py-1 text-[11px]" onClick={() => setModal({ kind: "left", row: r, emp: e })}><LogOut size={12} /> Mark as Left</Button>}
              {e && <Button variant="ghost" className="!px-2 !py-1 text-[11px]" onClick={() => setModal({ kind: "cancel", row: r, emp: e })}><Undo2 size={12} /> Cancel Exit</Button>}
            </div>;
          } },
        ]} />}
      </Async>
      {modal?.kind === "new" && <ExitModal onClose={() => setModal(null)} onSaved={(warning) => { setModal(null); if (warning) setMsg({ ok: false, text: warning }); refresh(); }} />}
      {modal?.kind === "documents" && <Modal title={`Exit Documents · ${modal.row.employee_name || modal.row.employee}`} onClose={() => setModal(null)} wide><AttachedDocuments doctype="Employee Separation" name={modal.row.name} empty="No documents on this exit yet." /></Modal>}
      {modal?.kind === "templates" && <TemplateDocumentsModal onClose={() => setModal(null)} />}
      {modal?.kind === "cancel" && <CancelExitModal row={modal.row} emp={modal.emp} onClose={() => setModal(null)} onSaved={(text, ok) => { setModal(null); setMsg({ ok, text }); refresh(); }} />}
      {modal?.kind === "left" && <LeftModal row={modal.row} emp={modal.emp} onClose={() => setModal(null)} onSaved={(text) => { setModal(null); setMsg({ ok: true, text }); refresh(); }} />}
    </Panel>
  );
}

const MAX_ATTACHMENT_MB = 10;

const listAttached = (doctype, name) => frappe.getList("File", { filters: [["attached_to_doctype", "=", doctype], ["attached_to_name", "=", name]], fields: ["name", "file_name", "file_url", "is_private", "creation"], orderBy: "creation asc", limit: 0 });
const tooLarge = (file) => file.size > MAX_ATTACHMENT_MB * 1024 * 1024;

/** The files on a record: open, add and remove. */
function AttachedDocuments({ doctype, name, empty }) {
  const files = useAsync(() => listAttached(doctype, name), [doctype, name]);
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function upload(list) {
    const picked = [...(list || [])];
    if (input.current) input.current.value = "";
    if (!picked.length) return;
    setErr("");
    if (picked.some(tooLarge)) return setErr(`Each document must be ${MAX_ATTACHMENT_MB} MB or smaller.`);
    setBusy(true);
    try {
      for (const file of picked) await frappe.uploadFile(file, { doctype, docname: name, isPrivate: true });
      files.reload();
    } catch (x) {
      setErr(errMsg(x, "Couldn't upload this document."));
    }
    setBusy(false);
  }

  async function remove(file) {
    if (!(await confirmDialog({ message: `Remove "${file.file_name}"?`, danger: true, confirmLabel: "Remove" }))) return;
    setErr("");
    try {
      await frappe.deleteDoc("File", file.name);
      files.reload();
    } catch (x) {
      setErr(errMsg(x, "Couldn't remove this document."));
    }
  }

  return (
    <div className="space-y-3">
      <input ref={input} type="file" multiple className="hidden" aria-label="Choose documents" onChange={(e) => upload(e.target.files)} />
      <Button type="button" variant="secondary" disabled={busy} onClick={() => input.current?.click()}><Upload size={14} /> {busy ? "Uploading…" : "Add Documents"}</Button>
      {err && <Notice>{err}</Notice>}
      <Async state={files}>
        {(rows) => (rows.length === 0 ? <p className="text-[13px] text-[var(--color-text-muted)]">{empty}</p> : (
          <ul className="divide-y divide-[var(--color-border)]">
            {rows.map((d) => (
              <li key={d.name} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[13px]">
                <span className="flex min-w-0 items-center gap-2 text-[var(--color-text)]"><Paperclip size={14} className="shrink-0 text-[var(--color-text-muted)]" /><span className="truncate">{d.file_name}</span><span className="shrink-0 text-[11px] text-[var(--color-text-faint)]">{dmy(d.creation)}</span></span>
                <span className="flex shrink-0 items-center gap-3 text-[12px]">
                  <a href={d.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><ExternalLink size={13} /> Open</a>
                  <button type="button" onClick={() => remove(d)} className="flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><Trash2 size={13} /> Remove</button>
                </span>
              </li>
            ))}
          </ul>
        ))}
      </Async>
    </div>
  );
}

/** Documents kept on an exit checklist template. Each new exit that uses the template gets a copy of them. */
function TemplateDocumentsModal({ onClose }) {
  const [template, setTemplate] = useState("");
  return (
    <Modal title="Exit Checklist Template Documents" onClose={onClose} wide>
      <div className="space-y-4">
        <LinkField label="Exit Checklist Template" linkDoctype="Employee Separation Template" value={template} onChange={setTemplate} frappe={frappe} />
        {template ? <AttachedDocuments key={template} doctype="Employee Separation Template" name={template} empty="No documents on this template yet." /> : <p className="text-[13px] text-[var(--color-text-muted)]">Choose a template to add its documents. Every new exit that uses it gets a copy.</p>}
      </div>
    </Modal>
  );
}

function ExitModal({ onClose, onSaved }) {
  const [f, setF] = useState({ employee: "", resigned: isoDate(), last: "", template: "", reason: "" });
  const [files, setFiles] = useState([]);
  const templateFiles = useAsync(() => (f.template ? listAttached("Employee Separation Template", f.template) : Promise.resolve([])), [f.template]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const emp = await frappe.getDoc("Employee", f.employee);
      let activities;
      if (f.template) {
        const t = await frappe.getDoc("Employee Separation Template", f.template);
        activities = (t.activities || []).map(({ activity_name, user, role, required_for_employee_creation, description, duration, begin_on, task_weight }) => ({ activity_name, user, role, required_for_employee_creation, description, duration, begin_on, task_weight }));
      }
      // Record the notice on the employee first: the separation copies the resignation date from the employee.
      try { await frappe.updateDoc("Employee", f.employee, { resignation_letter_date: f.resigned, relieving_date: f.last, reason_for_leaving: f.reason || undefined }); } catch { /* not allowed - HR can set it later */ }
      const exit = await frappe.createDoc("Employee Separation", { employee: f.employee, company: emp.company, department: emp.department, designation: emp.designation, resignation_letter_date: f.resigned, boarding_begins_on: f.last, employee_separation_template: f.template || undefined, activities });
      // The exit is saved by now, so a document that fails is reported rather than undoing it.
      let failed = 0;
      for (const file of files) await frappe.uploadFile(file, { doctype: "Employee Separation", docname: exit.name, isPrivate: true }).catch(() => { failed += 1; });
      for (const d of templateFiles.data || []) await frappe.createDoc("File", { file_name: d.file_name, file_url: d.file_url, is_private: d.is_private, attached_to_doctype: "Employee Separation", attached_to_name: exit.name }).catch(() => { failed += 1; });
      onSaved(failed ? `The exit was started, but ${failed} document(s) couldn't be attached. Add them from Documents on the exit.` : "");
    } catch (x) {
      setErr(errMsg(x, "Couldn't start the exit."));
      setBusy(false);
    }
  }
  return (
    <Modal title="Start an Exit" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <LinkField label="Employee" linkDoctype="Employee" value={f.employee} onChange={(v) => setF({ ...f, employee: v })} required frappe={frappe} />
        <div className="grid grid-cols-2 gap-3"><DateField label="Resignation Date" value={f.resigned} onChange={(v) => setF({ ...f, resigned: v })} required /><DateField label="Last Working Day" value={f.last} onChange={(v) => setF({ ...f, last: v })} required /></div>
        <LinkField label="Exit Checklist Template (Optional)" linkDoctype="Employee Separation Template" value={f.template} onChange={(v) => setF({ ...f, template: v })} frappe={frappe} />
        {templateFiles.data?.length > 0 && <p className="text-[11px] text-[var(--color-text-faint)]">From the template: {templateFiles.data.map((d) => d.file_name).join(", ")}</p>}
        <Field label="Attach Documents (Optional)"><input type="file" multiple className={inputCls} onChange={(e) => { const picked = [...e.target.files]; if (picked.some(tooLarge)) { setErr(`Each document must be ${MAX_ATTACHMENT_MB} MB or smaller.`); e.target.value = ""; setFiles([]); } else { setErr(""); setFiles(picked); } }} /></Field>
        <Field label="Reason for Leaving"><input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Start Exit"}</Button></div>
      </form>
    </Modal>
  );
}

// The employee withdrew their resignation: drop the separation and put the Employee record back as it was before the exit.
function CancelExitModal({ row, emp, onClose, onSaved }) {
  const submitted = Number(row.docstatus) === 1;
  const wasLeft = emp.status === "Left";
  const [enableLogin, setEnableLogin] = useState(Boolean(emp.user_id) && wasLeft);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const name = row.employee_name || row.employee;
  const lastDay = emp.relieving_date || row.boarding_begins_on;
  const missed = Boolean(lastDay) && lastDay < isoDate();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      // Re-read: the checklist may have been started (or the exit cancelled) since this page loaded.
      const current = await frappe.getDoc("Employee Separation", row.name);
      if (Number(current.docstatus) === 1) await frappe.cancelDoc("Employee Separation", row.name);
      else if (Number(current.docstatus) === 0) await frappe.deleteDoc("Employee Separation", row.name);
    } catch (x) {
      setErr(`${errMsg(x, "Couldn't cancel the exit.")} Nothing was changed.`);
      setBusy(false);
      return;
    }
    const problems = [];
    try {
      await frappe.updateDoc("Employee", row.employee, { status: "Active", relieving_date: null, resignation_letter_date: null, reason_for_leaving: null });
    } catch (x) {
      problems.push(`The employee record wasn't updated (${errMsg(x, "unknown error")}): clear the relieving date and set the status to Active from HR › Employees.`);
    }
    if (enableLogin && emp.user_id) {
      try { await frappe.callMethod("ethx_employee_login_access", { employee: row.employee, enable: 1 }); } catch { problems.push("The portal login wasn't re-enabled: do it from HR › Employees."); }
    }
    const attendance = missed ? ` Attendance after ${dmy(lastDay)} isn't marked automatically: add it from Attendance, or ask ${name} to raise attendance requests.` : "";
    onSaved(`Exit cancelled for ${name}. ${problems.join(" ")}${attendance}`.replace(/\s+/g, " ").trim(), problems.length === 0);
  }

  return (
    <Modal title={`Cancel Exit · ${name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3 text-[13px] text-[var(--color-text)]">
        <p>Use this when {name} withdraws their resignation. This will:</p>
        <ul className="list-disc space-y-1 pl-5 text-[var(--color-text-muted)]">
          <li>{submitted ? "Cancel the exit and its checklist" : "Delete the draft exit"} ({row.name})</li>
          <li>Set the employee status to Active{wasLeft ? " (currently Left)" : ""}</li>
          <li>Clear the resignation date{lastDay ? `, the last working day (${dmy(lastDay)})` : ""} and the reason for leaving</li>
        </ul>
        {emp.user_id && <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={enableLogin} onChange={(e) => setEnableLogin(e.target.checked)} /> Re-enable their portal login ({emp.user_id})</label>}
        {missed && <Notice tone="info">The last working day has passed. Attendance for the days after {dmy(lastDay)} will need to be added afterwards.</Notice>}
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Keep Exit</Button><Button type="submit" disabled={busy}>{busy ? "Cancelling…" : "Cancel Exit"}</Button></div>
      </form>
    </Modal>
  );
}

function LeftModal({ row, emp, onClose, onSaved }) {
  const [date, setDate] = useState(emp.relieving_date || row.boarding_begins_on || isoDate());
  const [disable, setDisable] = useState(Boolean(emp.user_id));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await frappe.updateDoc("Employee", row.employee, { status: "Left", relieving_date: date });
      let note = "";
      if (disable && emp.user_id) {
        try { await frappe.callMethod("ethx_employee_login_access", { employee: row.employee, enable: 0 }); note = " Portal login disabled."; } catch { note = " Disable the portal login from HR › Employees."; }
      }
      onSaved(`${row.employee_name} marked as Left from ${dmy(date)}.${note}`);
    } catch (x) {
      setErr(errMsg(x, "Couldn't update the employee."));
      setBusy(false);
    }
  }
  return (
    <Modal title={`Mark ${row.employee_name} as Left`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <DateField label="Relieving Date" value={date} onChange={setDate} required />
        {emp.user_id && <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={disable} onChange={(e) => setDisable(e.target.checked)} /> Disable their portal login ({emp.user_id})</label>}
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Mark as Left"}</Button></div>
      </form>
    </Modal>
  );
}
