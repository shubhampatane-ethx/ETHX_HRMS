// Audit Logs (Administrator): who changed what and when, built from ERPNext's own records -
//   Changes  = Version (field-level change history; switched on for the main HR doctypes by ERPNext Setup)
//   Actions  = Info comments the app writes (timesheet approvals / returns, logins created, stage moves…)
//   Sign-ins = Activity Log (login, logout, failed attempts with IP address)
import { useMemo, useState } from "react";
import { Download, ScrollText } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button, DateField } from "../../components/ui/primitives";
import { Async, Field, Grid, inputCls, Modal, PageHeader, Panel, Tabs } from "../../components/employee/EmployeeShell";
import { clientUsers } from "../../lib/clientPeople";
import { addDays, dmyHm, isoDate, stripHtml, useAsync } from "../../lib/employeePortal";
import { downloadCsv } from "../../lib/recruitment";

const PAGE = 200;
const DOCTYPES = ["Employee", "User", "User Permission", "Timesheet", "Leave Application", "Attendance", "Expense Claim", "Job Applicant", "Job Offer", "Job Requisition", "Job Opening", "Project", "Salary Structure Assignment"];

function parseVersion(v) {
  try {
    const d = JSON.parse(v.data || "{}");
    const changed = (d.changed || []).filter(([f]) => f !== "modified");
    const rows = (d.row_changed || []).flatMap(([table, idx, , ch]) => (ch || []).map(([f, a, b]) => [`${table} #${idx} ${f}`, a, b]));
    const added = (d.added || []).map(([table]) => table);
    const removed = (d.removed || []).map(([table]) => table);
    return { changed: [...changed, ...rows], added, removed, created: Boolean(d.creation || (!changed.length && !rows.length && !added.length && !removed.length)) };
  } catch {
    return { changed: [], added: [], removed: [], created: false };
  }
}
const summary = (p) => [p.changed.length ? p.changed.slice(0, 3).map(([f]) => f.replace(/^custom_/, "").replace(/_/g, " ")).join(", ") + (p.changed.length > 3 ? ` +${p.changed.length - 3}` : "") : "", p.added.length ? `rows added: ${[...new Set(p.added)].join(", ")}` : "", p.removed.length ? `rows removed: ${[...new Set(p.removed)].join(", ")}` : ""].filter(Boolean).join(" · ") || (p.created ? "created" : "—");

export default function AuditLogs() {
  const [tab, setTab] = useState("changes");
  const [from, setFrom] = useState(addDays(isoDate(), -30));
  const [to, setTo] = useState(isoDate());
  const [doctype, setDoctype] = useState("");
  const [user, setUser] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState(null);
  const range = [[`creation`, ">=", `${from} 00:00:00`], ["creation", "<=", `${to} 23:59:59`]];
  // Viewing one client: only what that client's people did. Nothing is fetched until their accounts are known.
  const scope = useAsync(async () => { const s = await clientUsers(); return s ? [...s] : "all"; }, []);
  const who = scope.data;
  const byClient = (field) => (Array.isArray(who) ? [[field, "in", who.length ? who : ["-"]]] : []);

  const changes = useAsync(() => (tab !== "changes" || !who ? Promise.resolve([]) : frappe.getList("Version", {
    filters: [...range, ...(doctype ? [["ref_doctype", "=", doctype]] : [["ref_doctype", "in", DOCTYPES]]), ...(user ? [["owner", "like", `%${user}%`]] : []), ...byClient("owner"), ...(search ? [["docname", "like", `%${search}%`]] : [])],
    fields: ["name", "ref_doctype", "docname", "data", "owner", "creation"], orderBy: "creation desc", limit,
  }).then((rows) => rows.map((r) => ({ ...r, parsed: parseVersion(r) })))), [tab, from, to, doctype, user, search, limit, who]);

  const actions = useAsync(() => (tab !== "actions" || !who ? Promise.resolve([]) : frappe.getList("Comment", {
    filters: [...range, ["comment_type", "=", "Info"], ...(doctype ? [["reference_doctype", "=", doctype]] : []), ...(user ? [["owner", "like", `%${user}%`]] : []), ...byClient("owner"), ...(search ? [["content", "like", `%${search}%`]] : [])],
    fields: ["name", "reference_doctype", "reference_name", "content", "owner", "creation"], orderBy: "creation desc", limit,
  })), [tab, from, to, doctype, user, search, limit, who]);

  const signins = useAsync(() => (tab !== "signins" || !who ? Promise.resolve([]) : frappe.getList("Activity Log", {
    filters: [...range, ["operation", "in", ["Login", "Logout"]], ...(user ? [["user", "like", `%${user}%`]] : []), ...byClient("user")],
    fields: ["name", "user", "full_name", "operation", "status", "ip_address", "subject", "creation"], orderBy: "creation desc", limit,
  })), [tab, from, to, user, limit, who]);

  const failed = useMemo(() => (signins.data || []).filter((s) => s.status === "Failed").length, [signins.data]);

  function exportCsv() {
    if (tab === "changes") downloadCsv(`audit-changes-${from}-${to}.csv`, ["When", "User", "Record type", "Record", "Field", "From", "To"],
      (changes.data || []).flatMap((v) => (v.parsed.changed.length ? v.parsed.changed : [["(created / rows changed)", "", ""]]).map(([f, a, b]) => [v.creation, v.owner, v.ref_doctype, v.docname, f, stripHtml(String(a ?? "")), stripHtml(String(b ?? ""))])));
    else if (tab === "actions") downloadCsv(`audit-actions-${from}-${to}.csv`, ["When", "User", "Record type", "Record", "Action"], (actions.data || []).map((c) => [c.creation, c.owner, c.reference_doctype, c.reference_name, stripHtml(c.content)]));
    else downloadCsv(`audit-signins-${from}-${to}.csv`, ["When", "User", "Event", "Status", "IP address"], (signins.data || []).map((s) => [s.creation, s.user, s.operation, s.status, s.ip_address]));
  }

  const state = tab === "changes" ? changes : tab === "actions" ? actions : signins;
  return (
    <div className="space-y-5">
      <PageHeader icon={ScrollText} title="Audit Logs" subtitle="Who changed what, and when - from change history, the app's action log and sign-in records" actions={<Button variant="secondary" onClick={exportCsv} disabled={!(state.data || []).length}><Download size={14} /> CSV</Button>} />
      <Tabs value={tab} onChange={(t) => { setTab(t); setLimit(PAGE); }} tabs={[{ id: "changes", label: "Record Changes" }, { id: "actions", label: "App Actions" }, { id: "signins", label: "Sign-Ins", count: failed || undefined }]} />
      <Panel>
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <DateField label="From" value={from} onChange={(v) => v && setFrom(v)} />
          <DateField label="To" value={to} onChange={(v) => v && setTo(v)} />
          {tab !== "signins" && <Field label="Record Type"><select className={inputCls} value={doctype} onChange={(e) => setDoctype(e.target.value)}><option value="">All tracked</option>{DOCTYPES.map((d) => <option key={d}>{d}</option>)}</select></Field>}
          <Field label="User"><input className={inputCls} value={user} onChange={(e) => setUser(e.target.value)} placeholder="email contains…" /></Field>
          {tab !== "signins" && <Field label={tab === "changes" ? "Record ID" : "Text"}><input className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="contains…" /></Field>}
        </div>
        <Async state={state}>
          {(rows) => (
            <>
              {tab === "changes" && <Grid rows={rows} empty="No changes in this period." columns={[
                { key: "creation", label: "When", render: (v) => dmyHm(v.creation) },
                { key: "owner", label: "User" },
                { key: "ref_doctype", label: "Record", render: (v) => <span>{v.ref_doctype}<span className="block text-[11px] text-[var(--color-text-faint)]">{v.docname}</span></span> },
                { key: "what", label: "What Changed", render: (v) => <button type="button" onClick={() => setOpen(v)} className="text-left hover:underline">{summary(v.parsed)}</button> },
              ]} />}
              {tab === "actions" && <Grid rows={rows} empty="No app actions in this period." columns={[
                { key: "creation", label: "When", render: (c) => dmyHm(c.creation) },
                { key: "owner", label: "User" },
                { key: "ref", label: "Record", render: (c) => <span>{c.reference_doctype}<span className="block text-[11px] text-[var(--color-text-faint)]">{c.reference_name}</span></span> },
                { key: "content", label: "Action", render: (c) => <span className="text-[12px]">{stripHtml(c.content)}</span> },
              ]} />}
              {tab === "signins" && <Grid rows={rows} empty="No sign-ins in this period." columns={[
                { key: "creation", label: "When", render: (s) => dmyHm(s.creation) },
                { key: "user", label: "User", render: (s) => <span>{s.full_name || s.user}<span className="block text-[11px] text-[var(--color-text-faint)]">{s.user}</span></span> },
                { key: "operation", label: "Event" },
                { key: "status", label: "Status", render: (s) => <span className={s.status === "Failed" ? "text-[var(--color-red-hover)]" : "text-[var(--color-green)]"}>{s.status}</span> },
                { key: "ip_address", label: "IP Address", render: (s) => s.ip_address || "—" },
              ]} />}
              {rows.length >= limit && <div className="mt-3 flex justify-center"><Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>Load More</Button></div>}
            </>
          )}
        </Async>
        <p className="mt-3 text-[11px] text-[var(--color-text-faint)]">Change history is recorded for the record types switched on by the automatic setup (Admin › Roles &amp; Permissions). Older changes, before it was switched on, aren't available.</p>
      </Panel>
      {open && (
        <Modal title={`${open.ref_doctype} · ${open.docname}`} onClose={() => setOpen(null)} wide>
          <p className="mb-3 text-[12px] text-[var(--color-text-muted)]">{dmyHm(open.creation)} by {open.owner}</p>
          <Grid rows={open.parsed.changed.map(([f, a, b], i) => ({ i, f, a, b }))} rowKey={(r) => r.i} empty={open.parsed.created ? "Record created." : "Only table rows were added or removed."} columns={[
            { key: "f", label: "Field", render: (r) => r.f.replace(/^custom_/, "").replace(/_/g, " ") },
            { key: "a", label: "Before", render: (r) => <span className="text-[var(--color-text-muted)]">{stripHtml(String(r.a ?? "—")) || "—"}</span> },
            { key: "b", label: "After", render: (r) => stripHtml(String(r.b ?? "—")) || "—" },
          ]} />
          {(open.parsed.added.length > 0 || open.parsed.removed.length > 0) && <p className="mt-3 text-[12px] text-[var(--color-text-muted)]">{open.parsed.added.length ? `Rows added to ${[...new Set(open.parsed.added)].join(", ")}. ` : ""}{open.parsed.removed.length ? `Rows removed from ${[...new Set(open.parsed.removed)].join(", ")}.` : ""}</p>}
        </Modal>
      )}
    </div>
  );
}
