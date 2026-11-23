// HR › Analytics & MIS: the monthly MIS (headcount, joiners, leavers, attrition, attendance, leave, expenses, hiring,
// with a 12-month trend) and a report builder (any dataset, grouped by any dimension or by month, a count or a sum,
// over a period) whose reports can be saved for the HR team. Data and rules live in lib/analytics.js.
import { useMemo, useState } from "react";
import { BarChart3, Briefcase, CalendarCheck, CalendarClock, Download, Receipt, Save, Table2, Trash2, TrendingDown, UserMinus, UserPlus, Users } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { frappe } from "../../lib/api/frappeClient";
import { Button } from "../../components/ui/primitives";
import { Async, chipCls, Grid, inputCls, Notice, PageHeader, Panel, Stat, Tabs } from "../../components/employee/EmployeeShell";
import { confirmDialog, promptDialog } from "../../components/ui/dialogs";
import { errMsg, money, useAsync } from "../../lib/employeePortal";
import { downloadCsv } from "../../lib/recruitment";
import { isPageBlocked } from "../../permissions/pageAccess";
import { BarList, ColumnChart } from "../../components/charts/Charts";
import { DATASETS, loadMis, MONTH_DIM, monthLabel, PERIODS, periodRange, runReport, SAVED_REPORTS, thisMonth } from "../../lib/analytics";

export default function Analytics() {
  const [tab, setTab] = useState("mis");
  return (
    <div className="space-y-5">
      <PageHeader icon={BarChart3} title="Analytics & MIS" subtitle="The monthly MIS with a 12-month trend, and a report builder for any HR question - with charts, tables and CSV export" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "mis", label: "Monthly MIS" }, { id: "builder", label: "Report Builder" }]} />
      {tab === "mis" ? <Mis /> : <Builder />}
    </div>
  );
}

/* ---------------------------------- MIS ---------------------------------- */

const dash = (v, f = (x) => x) => (v == null ? "—" : f(v));
const pct = (v) => `${v}%`;

function Mis() {
  const [month, setMonth] = useState(thisMonth());
  const q = useAsync(() => loadMis(month), [month]);
  const d = q.data;

  function exportCsv() {
    downloadCsv(`mis-${month}.csv`, ["Month", "Headcount (Month End)", "Joiners", "Leavers", "Attrition %"], d.trend.map((t) => [t.label, t.headcount, t.joiners, t.leavers, t.attrition]));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-text-muted)]">
          Month
          <input type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} className={`${inputCls} !w-44`} />
        </label>
        <Button variant="secondary" disabled={!d} onClick={exportCsv}><Download size={14} /> MIS CSV</Button>
      </div>
      <Async state={q}>
        {() => (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat icon={Users} label="Headcount" value={d.headcount} sub={`${d.headcountChange >= 0 ? "+" : ""}${d.headcountChange} vs last month`} accent="#4f8cff" />
              <Stat icon={UserPlus} label="Joiners" value={d.joiners} sub={`In ${monthLabel(month)}`} accent="var(--color-green)" />
              <Stat icon={UserMinus} label="Leavers" value={d.leavers} sub={`Attrition ${d.attrition}% this month`} accent="var(--color-red-hover)" />
              <Stat icon={TrendingDown} label="Attrition (12 Months)" value={pct(d.rolling)} sub="Leavers ÷ average headcount" accent="var(--color-amber)" />
              <Stat icon={CalendarCheck} label="Attendance Rate" value={dash(d.attendance?.rate, pct)} sub={d.attendance ? `${d.attendance.marked} days marked · ${d.attendance.absent} absent` : "No attendance data"} accent="var(--color-green)" />
              <Stat icon={CalendarClock} label="Leave Taken" value={d.leaveDays == null ? "—" : `${d.leaveDays} days`} sub={d.leaveApplications == null ? "No leave data" : `${d.leaveApplications} approved applications`} accent="#4f8cff" />
              <Stat icon={Receipt} label="Expenses Claimed" value={d.expenseAmount == null ? "—" : money(d.expenseAmount)} sub={d.expenseClaims == null ? "No expense data" : `${d.expenseClaims} claims`} accent="var(--color-amber)" />
              <Stat icon={Briefcase} label="Open Positions" value={dash(d.openPositions)} sub={d.openings == null ? "No recruitment data" : `${d.openings} openings · ${d.candidates ?? 0} new candidates`} accent="var(--color-red-hover)" />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Panel title="Headcount" hint="At each month end, last 12 months">
                <ColumnChart rows={d.trend.map((t) => ({ key: t.key, label: t.label, value: t.headcount }))} highlight={month} />
              </Panel>
              <Panel title="Attrition %" hint="Leavers in the month ÷ average headcount">
                <ColumnChart rows={d.trend.map((t) => ({ key: t.key, label: t.label, value: t.attrition }))} format={pct} highlight={month} />
              </Panel>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Panel title="Joiners & Leavers" hint="By month" className="xl:col-span-1">
                <Grid rows={[...d.trend].reverse()} rowKey={(t) => t.key} columns={[
                  { key: "label", label: "Month" },
                  { key: "joiners", label: "Joiners" },
                  { key: "leavers", label: "Leavers" },
                  { key: "headcount", label: "Headcount" },
                ]} />
              </Panel>
              <Panel title="Headcount by Department" hint="Active employees today">
                <BarList rows={d.byDepartment} max={10} />
              </Panel>
              <Panel title={`Attendance in ${monthLabel(month)}`} hint="Marked days by status">
                {d.attendance ? <BarList rows={Object.entries(d.attendance.by).map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value)} /> : <p className="text-[13px] text-[var(--color-text-muted)]">No attendance data.</p>}
                <div className="mt-5 border-t border-[var(--color-border)] pt-4">
                  <p className="mb-2 text-[12px] font-medium text-[var(--color-text-muted)]">Gender (Active)</p>
                  <BarList rows={d.byGender} />
                </div>
              </Panel>
            </div>
          </>
        )}
      </Async>
    </div>
  );
}

/* ----------------------------- report builder ----------------------------- */

// Opens on today's headcount by department (all time - the period filters employees by joining date).
const DEFAULT = { dataset: "employees", dim: "department", measure: "count", period: "all", from: "", to: "", view: "chart" };

function Builder() {
  const { user } = useAuth();
  const datasets = useMemo(() => Object.entries(DATASETS).filter(([, ds]) => !isPageBlocked(user, ds.page)), [user]);
  const [cfg, setCfg] = useState(DEFAULT);
  const ds = DATASETS[cfg.dataset] || DATASETS[datasets[0]?.[0]];
  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));
  const pickDataset = (id) => { const next = DATASETS[id]; set({ dataset: id, dim: Object.keys(next.dims)[0], measure: "count", period: next.allTime ? "all" : "12m" }); };

  const [from, to] = periodRange(cfg.period, cfg);
  const run = useAsync(() => runReport({ dataset: cfg.dataset, dim: cfg.dim, measure: cfg.measure, from, to }), [cfg.dataset, cfg.dim, cfg.measure, from, to]);
  const measure = ds.measures[cfg.measure] || ds.measures.count;
  const format = measure.money ? (v) => money(v) : undefined;
  const dimLabel = cfg.dim === MONTH_DIM ? "Month" : ds.dims[cfg.dim];
  const rows = run.data || [];
  const sum = rows.reduce((n, r) => n + r.value, 0);

  const saved = useAsync(() => frappe.getList(SAVED_REPORTS, { fields: ["name", "title", "config", "owner"], orderBy: "modified desc", limit: 50 }).catch(() => null), []);
  const [msg, setMsg] = useState(null);

  async function save() {
    const title = await promptDialog({ title: "Save Report", label: "Report Name", placeholder: `${ds.label} by ${dimLabel}`, confirmLabel: "Save" });
    if (!title?.trim()) return;
    try {
      await frappe.createDoc(SAVED_REPORTS, { title: title.trim(), config: JSON.stringify(cfg) });
      setMsg({ ok: true, text: `Saved "${title.trim()}" for the HR team.` });
      saved.reload();
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, "Couldn't save the report.") });
    }
  }
  async function remove(r) {
    if (!(await confirmDialog({ title: "Delete Report", message: `Delete the saved report "${r.title}"?`, confirmLabel: "Delete" }))) return;
    try { await frappe.deleteDoc(SAVED_REPORTS, r.name); saved.reload(); } catch (e) { setMsg({ ok: false, text: errMsg(e, "Couldn't delete the report.") }); }
  }
  const open = (r) => { try { const c = { ...DEFAULT, ...JSON.parse(r.config || "{}") }; if (DATASETS[c.dataset]) { setCfg(c); setMsg(null); } } catch { /* ignore a broken saved report */ } };

  return (
    <div className="space-y-5">
      {saved.data && saved.data.length > 0 && (
        <Panel title="Saved Reports" hint="Shared by the HR team - click one to open it">
          <div className="flex flex-wrap gap-2">
            {saved.data.map((r) => (
              <span key={r.name} className="group inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] pl-3 pr-1 text-[12.5px]">
                <button type="button" onClick={() => open(r)} className="py-1 text-[var(--color-text)] hover:text-[var(--color-red-hover)]">{r.title}</button>
                <button type="button" onClick={() => remove(r)} title="Delete" className="rounded-full p-1 text-[var(--color-text-faint)] hover:text-[var(--color-red-hover)]"><Trash2 size={12} /></button>
              </span>
            ))}
          </div>
        </Panel>
      )}
      {saved.data === null && <Notice tone="info">Saving reports needs the latest setup - the Administrator's next sign-in installs it. You can still build and export reports.</Notice>}

      <Panel>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium text-[var(--color-text-muted)]">Data</span>
            <select value={cfg.dataset} onChange={(e) => pickDataset(e.target.value)} className={inputCls}>
              {datasets.map(([id, d]) => <option key={id} value={id}>{d.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium text-[var(--color-text-muted)]">Measure</span>
            <select value={cfg.measure} onChange={(e) => set({ measure: e.target.value })} className={inputCls}>
              {Object.entries(ds.measures).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium text-[var(--color-text-muted)]">Period ({ds.dateLabel})</span>
            <select value={cfg.period} onChange={(e) => set({ period: e.target.value })} className={inputCls}>
              {PERIODS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
            </select>
          </label>
          {cfg.period === "custom" ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-[var(--color-text-muted)]">From</span><input type="date" value={cfg.from} onChange={(e) => set({ from: e.target.value })} className={inputCls} /></label>
              <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-[var(--color-text-muted)]">To</span><input type="date" value={cfg.to} onChange={(e) => set({ to: e.target.value })} className={inputCls} /></label>
            </div>
          ) : <p className="self-end pb-2 text-[11.5px] text-[var(--color-text-faint)]">{ds.hint}</p>}
        </div>
        <div className="mt-4">
          <span className="mb-1.5 block text-[11.5px] font-medium text-[var(--color-text-muted)]">Group By</span>
          <div className="flex flex-wrap gap-2">
            {[...Object.entries(ds.dims), [MONTH_DIM, "Month"]].map(([id, l]) => <button key={id} type="button" onClick={() => set({ dim: id })} className={chipCls(cfg.dim === id)}>{l}</button>)}
          </div>
        </div>
      </Panel>

      {msg && <Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice>}

      <Panel title={`${measure.label} by ${dimLabel}`} hint={`${ds.label} · ${PERIODS.find(([id]) => id === cfg.period)?.[1]}${rows.length ? ` · Total ${format ? format(sum) : Math.round(sum * 100) / 100}` : ""}`}
        action={<div className="flex flex-wrap gap-2">
          <div className="flex overflow-hidden rounded-md border border-[var(--color-border-strong)]">
            <button type="button" onClick={() => set({ view: "chart" })} className={`flex items-center gap-1 px-2.5 py-1.5 text-[12px] ${cfg.view === "chart" ? "bg-[var(--color-red-wash)] text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}><BarChart3 size={13} /> Chart</button>
            <button type="button" onClick={() => set({ view: "table" })} className={`flex items-center gap-1 px-2.5 py-1.5 text-[12px] ${cfg.view === "table" ? "bg-[var(--color-red-wash)] text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}><Table2 size={13} /> Table</button>
          </div>
          <Button variant="secondary" disabled={!rows.length} onClick={() => downloadCsv(`${cfg.dataset}-by-${cfg.dim === MONTH_DIM ? "month" : cfg.dim}.csv`, [dimLabel, measure.label], rows.map((r) => [r.label || r.key, r.value]))}><Download size={14} /> CSV</Button>
          <Button variant="secondary" onClick={save} disabled={saved.data === null}><Save size={14} /> Save</Button>
        </div>}>
        <Async state={run}>
          {() => cfg.view === "table" || !rows.length ? (
            <Grid rows={rows} rowKey={(r) => r.key} empty="No data for this period." columns={[
              { key: "key", label: dimLabel, render: (r) => r.label || r.key },
              { key: "value", label: measure.label, render: (r) => (format ? format(r.value) : r.value) },
              { key: "share", label: "Share", render: (r) => (sum ? `${Math.round((r.value / sum) * 1000) / 10}%` : "—") },
            ]} />
          ) : cfg.dim === MONTH_DIM ? <ColumnChart rows={rows} format={format} height={220} /> : <BarList rows={rows} format={format} max={15} />}
        </Async>
      </Panel>
    </div>
  );
}
