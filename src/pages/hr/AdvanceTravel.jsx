// HR › Expense Claim › Employee Advance and Travel Request. HR sees every request with its purpose and details,
// approves it (an advance is then submitted and becomes payable) or rejects it with a remark the employee sees, and can
// raise one on an employee's behalf. Decisions go through the ethx_hr_request_decision server rule
// (advanceTravelSetup.js); stock ERPNext has no approve / reject on either doctype.
import { useMemo, useState } from "react";
import { Ban, Check, Eye, HandCoins, Plane, Plus } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { useAuth } from "../../context/AuthContext";
import { Button, DateField, LinkField } from "../../components/ui/primitives";
import { Async, chipCls, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, StatusPill } from "../../components/employee/EmployeeShell";
import { alertDialog, promptDialog } from "../../components/ui/dialogs";
import { dmy, errMsg, isoDate, listTry, money, stripHtml, useAsync } from "../../lib/employeePortal";

const STATUSES = ["Pending", "Approved", "Rejected", "Cancelled"];
const DECISION_FIELDS = ["custom_decision", "custom_decision_note"];

const statusOf = (r) => (Number(r.docstatus) === 2 ? "Cancelled" : r.custom_decision === "Rejected" ? "Rejected" : Number(r.docstatus) === 1 || r.custom_decision === "Approved" ? "Approved" : "Pending");
const notSetUp = (e) => e?.response?.status === 404 || /not found|not whitelisted|Failed to get method/i.test(String(e?.response?.data?.exception || ""));

const ADVANCE = {
  doctype: "Employee Advance",
  title: "Employee Advances",
  subtitle: "Money employees ask for ahead of expenses. An approved advance becomes payable.",
  icon: HandCoins,
  noun: "advance",
  fields: ["name", "employee", "employee_name", "posting_date", "purpose", "advance_amount", "paid_amount", "claimed_amount", "currency", "status", "docstatus", "creation", "owner"],
  basic: ["name", "employee", "employee_name", "posting_date", "purpose", "advance_amount", "currency", "status", "docstatus", "creation", "owner"],
  types: null,
  summary: (r) => `${money(r.advance_amount, r.currency || undefined)} · ${dmy(r.posting_date)}`,
  columns: [
    { key: "posting_date", label: "Date", render: (r) => dmy(r.posting_date) },
    { key: "advance_amount", label: "Amount", render: (r) => <span>{money(r.advance_amount, r.currency || undefined)}{Number(r.paid_amount) > 0 && <span className="block text-[11px] text-[var(--color-text-faint)]">Paid {money(r.paid_amount, r.currency || undefined)}</span>}</span> },
    { key: "purpose", label: "Purpose", render: (r) => <span className="block max-w-[22rem] whitespace-pre-line break-words">{stripHtml(r.purpose || "") || "—"}</span> },
  ],
  // ERPNext's own state after approval (Unpaid, Paid, Claimed, Returned…), shown under ours.
  subStatus: (r) => (Number(r.docstatus) === 1 && r.erpStatus ? r.erpStatus : ""),
};

const TRAVEL = {
  doctype: "Travel Request",
  title: "Travel Requests",
  subtitle: "Trips employees need approved, with their purpose, itinerary and costs",
  icon: Plane,
  noun: "travel request",
  fields: ["name", "employee", "employee_name", "purpose_of_travel", "travel_type", "travel_funding", "docstatus", "creation", "owner"],
  basic: ["name", "employee", "employee_name", "purpose_of_travel", "docstatus", "creation", "owner"],
  types: (r) => r.travel_type,
  summary: (r) => [r.purpose_of_travel, r.travel_type].filter(Boolean).join(" · ") || "Travel",
  columns: [
    { key: "purpose_of_travel", label: "Purpose", render: (r) => r.purpose_of_travel || "—" },
    { key: "travel_type", label: "Type", render: (r) => <span>{r.travel_type || "—"}{r.travel_funding && <span className="block text-[11px] text-[var(--color-text-faint)]">{r.travel_funding}</span>}</span> },
    { key: "creation", label: "Raised On", render: (r) => dmy(r.creation) },
  ],
  subStatus: () => "",
};

async function load(cfg) {
  const [rows, employees] = await Promise.all([
    // Before System Setup adds the decision fields, read without them (every draft then shows as Pending).
    listTry(cfg.doctype, { fields: [...cfg.fields, ...DECISION_FIELDS], orderBy: "creation desc" }, cfg.basic),
    frappe.getList("Employee", { fields: ["name", "employee_name", "user_id", "department", "company"], limit: 0 }).catch(() => []),
  ]);
  const byId = new Map(employees.map((e) => [e.name, e]));
  return rows.map((r) => ({ ...r, status: statusOf(r), erpStatus: r.status, department: byId.get(r.employee)?.department, ownerUser: byId.get(r.employee)?.user_id }));
}

function RequestReview({ cfg }) {
  const { user } = useAuth();
  const q = useAsync(() => load(cfg), [cfg.doctype]);
  const [status, setStatus] = useState("Pending");
  const [type, setType] = useState("all");
  const [busy, setBusy] = useState("");
  const [viewing, setViewing] = useState(null);
  const [creating, setCreating] = useState(false);

  const all = useMemo(() => q.data || [], [q.data]);
  const types = useMemo(() => (cfg.types ? [...new Set(all.map(cfg.types).filter(Boolean))].sort() : []), [all, cfg]);
  const rows = useMemo(() => all.filter((r) => (status === "all" || r.status === status) && (type === "all" || cfg.types?.(r) === type)), [all, status, type, cfg]);
  const count = (s) => all.filter((r) => r.status === s).length;

  async function decide(r, approve) {
    const who = r.employee_name || r.employee;
    const note = await promptDialog({
      title: `${approve ? "Approve" : "Reject"} ${who}'s ${cfg.noun}`,
      message: `${cfg.summary(r)}${approve && cfg.doctype === "Employee Advance" ? "\nApproving submits the advance so it can be paid." : ""}`,
      label: approve ? "Note (Optional, Visible to the Employee)" : "Remark (Required, Visible to the Employee)",
      required: !approve,
      placeholder: approve ? "" : "Why it is being rejected",
      confirmLabel: approve ? "Approve" : "Reject",
    });
    if (note === null) return;
    if (!approve && note.trim().length < 3) {
      await alertDialog({ tone: "error", message: "Please give a remark of at least 3 characters for the rejection." });
      return;
    }
    setBusy(r.name);
    try {
      await frappe.callMethod("ethx_hr_request_decision", { doctype: cfg.doctype, request: r.name, status: approve ? "Approved" : "Rejected", note: note.trim() });
    } catch (e) {
      await alertDialog({ tone: "error", message: notSetUp(e) ? "Approving and rejecting isn't set up on the server yet. It's installed automatically the next time the Administrator signs in." : errMsg(e, "Couldn't save the decision.") });
    } finally {
      setBusy("");
      q.reload();
    }
  }

  const Icon = cfg.icon;
  return (
    <div className="space-y-5">
      <PageHeader icon={Icon} title={cfg.title} subtitle={cfg.subtitle} actions={<Button onClick={() => setCreating(true)}><Plus size={14} /> New {cfg.doctype}</Button>} />
      <Panel>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {STATUSES.map((s) => <button key={s} type="button" onClick={() => setStatus(s)} className={chipCls(status === s)}>{s}{q.data ? ` (${count(s)})` : ""}</button>)}
          <button type="button" onClick={() => setStatus("all")} className={chipCls(status === "all")}>All{q.data ? ` (${all.length})` : ""}</button>
          {types.length > 0 && <select aria-label="Type" className={`${inputCls} !w-48 !py-1`} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All Types</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>}
        </div>
        <Async state={q}>
          {() => <Grid rows={rows} empty={status === "Pending" ? `No ${cfg.noun}s are waiting.` : "No requests here."} columns={[
            { key: "employee_name", label: "Employee", render: (r) => <span>{r.employee_name || r.employee}<span className="block text-[11px] text-[var(--color-text-faint)]">{[r.employee, r.department].filter(Boolean).join(" · ")}</span></span> },
            ...cfg.columns,
            { key: "status", label: "Status", render: (r) => <span><StatusPill status={r.status} />{cfg.subStatus(r) && <span className="mt-1 block text-[11px] text-[var(--color-text-faint)]">{cfg.subStatus(r)}</span>}{r.custom_decision_note && <span className="mt-1 block max-w-[14rem] break-words text-[11px] text-[var(--color-text-muted)]">Remark: {stripHtml(r.custom_decision_note)}</span>}</span> },
            { key: "_a", label: "", render: (r) => {
              const own = r.ownerUser && r.ownerUser === user?.email;
              const hint = own ? "You can't decide on your own request" : undefined;
              return (
                <div className="flex justify-end gap-3 whitespace-nowrap text-[12px]">
                  <button type="button" onClick={() => setViewing(r)} className="flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><Eye size={13} /> Details</button>
                  {r.status === "Pending" && <>
                    <button type="button" disabled={own || busy === r.name} title={hint} onClick={() => decide(r, true)} className="flex items-center gap-1 text-[var(--color-green)] hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"><Check size={13} /> Approve</button>
                    <button type="button" disabled={own || busy === r.name} title={hint} onClick={() => decide(r, false)} className="flex items-center gap-1 text-[var(--color-red-hover)] hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"><Ban size={13} /> Reject</button>
                  </>}
                </div>
              );
            } },
          ]} />}
        </Async>
      </Panel>
      {viewing && <DetailsModal cfg={cfg} row={viewing} onClose={() => setViewing(null)} />}
      {creating && (cfg.doctype === "Employee Advance"
        ? <NewAdvance onClose={() => setCreating(false)} onSaved={() => { setCreating(false); q.reload(); }} />
        : <NewTravel onClose={() => setCreating(false)} onSaved={() => { setCreating(false); q.reload(); }} />)}
    </div>
  );
}

/* --------------------------------- details --------------------------------- */

const SKIP = new Set(["name", "owner", "creation", "modified", "modified_by", "docstatus", "idx", "doctype", "naming_series", "amended_from", "employee", "employee_name", "company", "custom_decision", "custom_decision_note", "currency", "exchange_rate"]);
const nice = (k) => k.replace(/^custom_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const shown = (v) => (v === null || v === undefined || v === "" || v === 0 || v === "0" ? "" : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? dmy(v) : stripHtml(String(v)));

function DetailsModal({ cfg, row, onClose }) {
  const doc = useAsync(() => frappe.getDoc(cfg.doctype, row.name), [row.name]);
  return (
    <Modal title={`${row.employee_name || row.employee} · ${row.name}`} onClose={onClose} wide>
      <Async state={doc}>
        {(d) => {
          const plain = Object.entries(d).filter(([k, v]) => !SKIP.has(k) && !k.startsWith("_") && !Array.isArray(v) && typeof v !== "object" && shown(v));
          const tables = Object.entries(d).filter(([, v]) => Array.isArray(v) && v.length);
          return (
            <div className="space-y-4 text-[13px] text-[var(--color-text)]">
              <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {plain.map(([k, v]) => <p key={k}><span className="block text-[11px] text-[var(--color-text-faint)]">{nice(k)}</span><span className="whitespace-pre-line break-words">{/amount/.test(k) ? money(v, d.currency || undefined) : shown(v)}</span></p>)}
              </div>
              {tables.map(([k, list]) => {
                const cols = Object.keys(list[0]).filter((c) => !SKIP.has(c) && !["parent", "parentfield", "parenttype"].includes(c) && !c.startsWith("_") && list.some((x) => shown(x[c])));
                return (
                  <div key={k}>
                    <p className="mb-1 font-medium">{nice(k)}</p>
                    <Grid rows={list} rowKey={(x, i) => x.name || i} columns={cols.map((c) => ({ key: c, label: nice(c), render: (x) => shown(x[c]) || "—" }))} />
                  </div>
                );
              })}
              {row.custom_decision_note && <Notice tone="info">HR remark: {stripHtml(row.custom_decision_note)}</Notice>}
              <p className="text-[11px] text-[var(--color-text-faint)]">Raised {dmy(d.creation)} by {d.owner}.</p>
            </div>
          );
        }}
      </Async>
    </Modal>
  );
}

/* ------------------------------- new requests ------------------------------- */

async function employeeCompany(employee) {
  const emp = await frappe.getDoc("Employee", employee);
  if (!emp.company) throw new Error("This employee has no company set. Add it in HR › Employees first.");
  return emp;
}

function NewAdvance({ onClose, onSaved }) {
  const [f, setF] = useState({ employee: "", posting_date: isoDate(), advance_amount: "", purpose: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!(Number(f.advance_amount) > 0)) { setErr("Enter an amount greater than zero."); return; }
    setBusy(true);
    try {
      const emp = await employeeCompany(f.employee);
      const company = await frappe.getDoc("Company", emp.company);
      // ERPNext needs the ledger the advance is booked against; it comes from the company's default.
      if (!company.default_employee_advance_account) throw new Error(`Set the Default Employee Advance Account on company ${emp.company} in ERPNext first.`);
      await frappe.createDoc("Employee Advance", { employee: f.employee, company: emp.company, posting_date: f.posting_date, purpose: f.purpose, advance_amount: Number(f.advance_amount), currency: company.default_currency, exchange_rate: 1, advance_account: company.default_employee_advance_account });
      onSaved();
    } catch (x) {
      setErr(x?.response ? errMsg(x, "Couldn't create the advance.") : x.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="New Employee Advance" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <LinkField label="Employee" linkDoctype="Employee" value={f.employee} onChange={set("employee")} frappe={frappe} required />
        <div className="grid grid-cols-2 gap-3">
          <DateField label="Date" value={f.posting_date} onChange={set("posting_date")} required />
          <Field label="Amount"><input type="number" min="0" step="0.01" required className={inputCls} value={f.advance_amount} onChange={(e) => set("advance_amount")(e.target.value)} /></Field>
        </div>
        <Field label="Purpose"><textarea required rows={3} className={inputCls} value={f.purpose} onChange={(e) => set("purpose")(e.target.value)} /></Field>
        <p className="text-[11px] text-[var(--color-text-faint)]">It starts as Pending; approve it from the list to make it payable.</p>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !f.employee}>{busy ? "Saving…" : "Create Advance"}</Button></div>
      </form>
    </Modal>
  );
}

// ERPNext's purpose is a link to the Purpose of Travel list, but people describe the purpose in their own words:
// add what they typed to that list when it isn't there yet, and use it.
async function ensureTravelPurpose(text) {
  const purpose = text.replace(/\s+/g, " ").trim();
  const known = await frappe.getList("Purpose of Travel", { filters: [["name", "=", purpose]], fields: ["name"], limit: 1 });
  if (known.length) return known[0].name;
  try {
    return (await frappe.createDoc("Purpose of Travel", { purpose_of_travel: purpose })).name || purpose;
  } catch (x) {
    // Someone added the same purpose a moment ago.
    if (/Duplicate/i.test(`${x?.response?.data?.exc_type || ""}${x?.response?.data?.exception || ""}`)) return purpose;
    throw x;
  }
}

function NewTravel({ onClose, onSaved }) {
  const [f, setF] = useState({ employee: "", purpose_of_travel: "", travel_type: "Domestic" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const emp = await employeeCompany(f.employee);
      const purpose = await ensureTravelPurpose(f.purpose_of_travel);
      await frappe.createDoc("Travel Request", { employee: f.employee, company: emp.company, purpose_of_travel: purpose, travel_type: f.travel_type });
      onSaved();
    } catch (x) {
      setErr(x?.response ? errMsg(x, "Couldn't create the travel request.") : x.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="New Travel Request" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <LinkField label="Employee" linkDoctype="Employee" value={f.employee} onChange={set("employee")} frappe={frappe} required />
        <Field label="Purpose of Travel"><input required maxLength={140} className={inputCls} value={f.purpose_of_travel} onChange={(e) => set("purpose_of_travel")(e.target.value)} placeholder="In the employee's words, e.g. Client meeting in Mumbai" /></Field>
        <Field label="Travel Type"><select className={inputCls} value={f.travel_type} onChange={(e) => set("travel_type")(e.target.value)}><option>Domestic</option><option>International</option></select></Field>
        <p className="text-[11px] text-[var(--color-text-faint)]">It starts as Pending; approve it from the list.</p>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !f.employee || !f.purpose_of_travel.trim()}>{busy ? "Saving…" : "Create Request"}</Button></div>
      </form>
    </Modal>
  );
}

export function EmployeeAdvances() {
  return <RequestReview cfg={ADVANCE} />;
}

export function TravelRequests() {
  return <RequestReview cfg={TRAVEL} />;
}
