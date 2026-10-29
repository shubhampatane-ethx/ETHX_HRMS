// Employee portal: Timesheet page and the weekly timesheet editor (one timesheet per week, Monday to Sunday).
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Pencil, Plus, Send, Trash2, Upload, Wand2, X } from "lucide-react";
import { Async, Grid, Modal, Notice, PageHeader, Panel, StatusPill, useEmployee } from "../../components/employee/EmployeeShell";
import { Button } from "../../components/ui/primitives";
import { useAuth } from "../../context/AuthContext";
import { frappe } from "../../lib/api/frappeClient";
import { dmy, errMsg, friendlyError, getAssignedTasks, getHolidays, getTimesheets, isoDate, MONTHS_LONG, pad, parseWorkNote, useAsync, WEEKDAYS } from "../../lib/employeePortal";
import { getMyAssignments, parseAssignment } from "../../lib/assignments";
import { composeDescription, csvToEntries, DAY_MINUTES, getEntriesBetween, getLeaveDays, getProjects, matchTask, minutesOf, parseCsv, projectResolver, roundHours, slotDay, submitTimesheet, withActivityType } from "../../lib/timesheets";
import { confirmDialog } from "../../components/ui/dialogs";

/** Review state pill: Draft / Returned / Pending Review / Approved (+ ERPNext's own status when it says more). */
export function ReviewPill({ review }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {review.key === "returned"
        ? <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: "color-mix(in srgb, var(--color-red-hover) 16%, transparent)", color: "var(--color-red-hover)" }}>Returned</span>
        : <StatusPill status={review.label} />}
      {review.erp && <span className="text-[10px] text-[var(--color-text-faint)]">{review.erp}</span>}
    </span>
  );
}

export function EmpTimesheet() {
  const { user } = useAuth();
  const { employee } = useEmployee();
  const tasks = useAsync(() => getAssignedTasks(user.email), [user.email]);
  const sheets = useAsync(() => getTimesheets(employee.name), [employee.name]);
  const [editor, setEditor] = useState(null); // null | { name?: string }
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  async function act(name, fn, failMsg) {
    setBusy(name);
    setErr("");
    try {
      await fn();
      sheets.reload();
    } catch (e) {
      setErr(errMsg(e, failMsg));
    } finally {
      setBusy("");
    }
  }
  const submitSheet = async (name) => (await confirmDialog(`Submit ${name} to HR? You won't be able to edit it unless HR returns it to you.`)) && act(name, () => submitTimesheet(name), "Couldn't submit this timesheet.");
  const deleteSheet = async (name) => (await confirmDialog(`Delete draft ${name}? This can't be undone.`)) && act(name, () => frappe.deleteDoc("Timesheet", name), "Couldn't delete this timesheet.");

  const recentNames = (sheets.data || []).slice(0, 6).map((r) => r.name);

  return (
    <>
      <PageHeader icon={CalendarDays} title="Timesheet" subtitle="Fill in your hours for the week - projects and the work you did - and submit it for review" actions={<Button onClick={() => setEditor({})}><CalendarDays size={14} /> Weekly timesheet</Button>} />
      {err && <Notice>{err}</Notice>}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="Assigned tasks" hint="Open tasks assigned to you" className="lg:col-span-1">
          <Async state={tasks}>
            {(rows) => rows.length === 0 ? <p className="text-[13px] text-[var(--color-text-muted)]">No open tasks assigned to you.</p> : (
              <ul className="space-y-2.5">{rows.map((t) => <li key={t.name} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"><p className="text-[13px] text-[var(--color-text)]">{t.subject}</p><p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{t.project || "No project"}{t.exp_end_date ? ` · due ${dmy(t.exp_end_date)}` : ""}</p><div className="mt-1.5"><StatusPill status={t.status} /></div></li>)}</ul>
            )}
          </Async>
        </Panel>
        <Panel title="My timesheets" className="lg:col-span-2">
          <Async state={sheets}>
            {(rows) => (
              <>
                {rows.reviewsError && <div className="mb-3"><Notice tone="info">HR review status couldn't be loaded - ask your administrator to allow the Employee role to read Comments.</Notice></div>}
                <Grid rows={rows} empty="No timesheets yet." columns={[
                  { key: "name", label: "Timesheet", render: (r) => <span>{r.name}{r.amended_from && <span className="block text-[10px] text-[var(--color-text-faint)]">corrects {r.amended_from}</span>}</span> },
                  { key: "start_date", label: "Period", render: (r) => `${dmy(r.start_date)}${r.end_date && r.end_date !== r.start_date ? ` – ${dmy(r.end_date)}` : ""}` },
                  { key: "total_hours", label: "Hours", render: (r) => Number(r.total_hours || 0).toFixed(2) },
                  { key: "status", label: "Status", render: (r) => <span><ReviewPill review={r.review} />{r.review.note && <span className="mt-0.5 block max-w-[16rem] text-[11px] text-[var(--color-text-muted)]">HR: {r.review.note}</span>}</span> },
                  {
                    key: "_a", label: "", render: (r) => r.docstatus === 0 ? (
                      <span className="flex items-center gap-3 text-[11px]">
                        <button type="button" disabled={Boolean(busy)} onClick={() => setEditor({ name: r.name })} className="flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-50"><Pencil size={12} /> Edit</button>
                        <button type="button" disabled={Boolean(busy)} onClick={() => submitSheet(r.name)} className="flex items-center gap-1 text-[var(--color-red-hover)] hover:underline disabled:opacity-50"><Send size={12} /> {busy === r.name ? "Working…" : "Submit"}</button>
                        <button type="button" disabled={Boolean(busy)} onClick={() => deleteSheet(r.name)} title="Delete draft" className="text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)] disabled:opacity-50"><Trash2 size={12} /></button>
                      </span>
                    ) : null,
                  },
                ]} />
              </>
            )}
          </Async>
        </Panel>
      </div>
      {editor && (
        <WeeklyModal
          employee={employee}
          tasks={tasks.data || []}
          editName={editor.name}
          recentNames={recentNames}
          onClose={() => setEditor(null)}
          onChanged={() => sheets.reload()}
          onSaved={() => { setEditor(null); sheets.reload(); }}
        />
      )}
    </>
  );
}

const readList = (key) => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } };
const saveList = (key, list) => { try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* ignore */ } };
const KEEP_FIELDS = ["activity_type", "is_billable"];
const DAY_HOURS = 8;
let rowSeq = 0;
const newRow = (r = {}) => ({ id: `r${++rowSeq}`, project: "", task: "", notes: "", hours: {}, keep: {}, ...r });
const rowKey = (project, task) => `${String(project || "").trim().toLowerCase()}|${String(task || "").trim().toLowerCase()}`;
const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(1);

/* ---- week helpers (local dates, ISO yyyy-mm-dd; weeks run Monday to Sunday) ---- */
const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (iso, n) => { const d = fromIso(iso); d.setDate(d.getDate() + n); return toIso(d); };
const mondayOf = (iso) => { const d = fromIso(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toIso(d); };
const short = (iso) => { const d = fromIso(iso); return `${d.getDate()} ${MONTHS_LONG[d.getMonth()].slice(0, 3)}`; };
const weekLabel = (ws) => { const we = addDays(ws, 6); return `${short(ws)} – ${short(we)} ${fromIso(we).getFullYear()}`; };

/** Time logs -> grid rows: one row per project + task, hours per day (several logs on one day add up). */
function logsToRows(logs, ws) {
  const we = addDays(ws, 6);
  const rows = [];
  const outside = [];
  (logs || []).forEach((l) => {
    const date = String(l.from_time).slice(0, 10);
    if (date < ws || date > we) { outside.push(l); return; } // e.g. older monthly drafts: kept as they are
    const w = parseWorkNote(l.description, { project: l.project, task: l.task });
    const key = rowKey(w.project, w.task);
    let r = rows.find((x) => rowKey(x.project, x.task) === key);
    if (!r) { r = newRow({ project: w.project, task: w.task, notes: w.notes }); rows.push(r); }
    else if (w.notes && !r.notes.includes(w.notes)) r.notes = [r.notes, w.notes].filter(Boolean).join("; ");
    r.hours[date] = String(roundHours((Number(r.hours[date]) || 0) + Number(l.hours || 0)));
    r.keep[date] = Object.fromEntries(KEEP_FIELDS.filter((k) => l[k] != null).map((k) => [k, l[k]]));
  });
  return { rows, outside };
}

/** Loads the draft being edited (if any), then opens the editor on its week. */
function WeeklyModal(props) {
  const { editName, onClose } = props;
  const doc = useAsync(() => (editName ? frappe.getDoc("Timesheet", editName) : Promise.resolve(null)), [editName]);
  if (editName && !doc.data) {
    return (
      <Modal title={`Edit ${editName}`} onClose={onClose} wide="xl">
        {doc.error ? <Notice>{friendlyError(doc.error)}</Notice> : <p className="py-6 text-center text-[13px] text-[var(--color-text-muted)]">Loading timesheet…</p>}
      </Modal>
    );
  }
  return <WeeklyEditor {...props} doc={doc.data} />;
}

function initialState(doc) {
  if (!doc) return { ws: mondayOf(isoDate()), rows: [], outside: [] };
  const start = String(doc.start_date || (doc.time_logs || [])[0]?.from_time || isoDate()).slice(0, 10);
  const ws = mondayOf(start);
  return { ws, ...logsToRows(doc.time_logs, ws) };
}

/**
 * Weekly timesheet grid (Capgemini / Oracle style): one line per project + task, a column per day,
 * daily and weekly totals against the expected hours. Leave, holidays and weekly offs are greyed out;
 * hours already in another timesheet are counted and new entries are placed after them.
 */
function WeeklyEditor({ employee, tasks, editName, doc, recentNames, onClose, onChanged, onSaved }) {
  const emp = employee.name;
  const storeKey = `ts-projects:${emp}`;
  const today = isoDate();
  const [init] = useState(() => initialState(doc));
  const [ws, setWs] = useState(init.ws);
  const [rows, setRows] = useState(() => (init.rows.length ? init.rows : [newRow()]));
  const [dirty, setDirty] = useState(false);
  const [savedName, setSavedName] = useState(editName || null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const fileInput = useRef(null);

  const from = ws;
  const to = addDays(ws, 6);

  const holidays = useAsync(() => getHolidays(employee), [emp]);
  const projects = useAsync(() => getProjects(), []);
  const leave = useAsync(() => getLeaveDays(emp, from, to), [emp, from]);
  const existing = useAsync(async () => {
    const sheets = await frappe.getList("Timesheet", { filters: [["employee", "=", emp], ["docstatus", "<", 2], ["end_date", ">=", from], ["start_date", "<=", to]], fields: ["name"], limit: 0 });
    const names = sheets.map((s) => s.name).filter((n) => n !== savedName);
    const byParent = await getEntriesBetween(from, to, names);
    const map = {};
    byParent.forEach((logs, sheet) => logs.forEach((l) => {
      const day = String(l.from_time).slice(0, 10);
      const d = (map[day] = map[day] || { hours: 0, end: 0, sheets: [] });
      d.hours += Number(l.hours || 0);
      const endDay = String(l.to_time || "").slice(0, 10);
      d.end = Math.max(d.end, endDay && endDay > day ? DAY_MINUTES : l.to_time ? minutesOf(l.to_time) : minutesOf(l.from_time) + Number(l.hours || 0) * 60);
      if (!d.sheets.includes(sheet)) d.sheets.push(sheet);
    }));
    return map;
  }, [emp, from, savedName]);
  const recent = useAsync(async () => {
    if (!recentNames.length) return [];
    const rows = await frappe.getList("Timesheet Detail", { parent: "Timesheet", filters: [["parent", "in", recentNames]], fields: ["project", "description"], limit: 0 }).catch(() => []);
    return [...new Set(rows.map((r) => parseWorkNote(r.description, { project: r.project }).project).filter(Boolean))];
  }, [recentNames.join(",")]);
  const assigned = useAsync(() => getMyAssignments(employee.user_id, from, to), [emp, from]);
  const assignments = useMemo(() => (assigned.data || []).map(parseAssignment), [assigned.data]);
  const resolveProject = useMemo(() => projectResolver(projects.data || []), [projects.data]);
  const holidayMap = useMemo(() => Object.fromEntries((holidays.data?.holidays || []).map((h) => [h.date, h])), [holidays.data]);
  const listHasWeeklyOffs = (holidays.data?.holidays || []).some((h) => h.weeklyOff);
  const projectLabel = (p) => (p.project_name && p.project_name !== p.name ? p.project_name : p.name);
  const labelOf = (id) => { const p = (projects.data || []).find((x) => x.name === id); return p ? projectLabel(p) : id; };

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(ws, i);
    const wd = fromIso(date).getDay();
    const h = holidayMap[date];
    const off = Boolean(h) || (!listHasWeeklyOffs && (wd === 0 || wd === 6));
    const lv = leave.data?.[date] || null;
    const label = h ? (h.weeklyOff ? "Weekly off" : h.description) : off ? "Weekend" : lv ? (lv.half ? "Half-day leave" : "On leave") : "";
    return { date, wd, off, label, leave: lv, logged: existing.data?.[date] || null, future: date > today };
  });
  const expected = days.reduce((s, d) => s + (d.off ? 0 : d.leave ? (d.leave.half ? DAY_HOURS / 2 : 0) : DAY_HOURS), 0);
  const cell = (r, date) => Number(r.hours[date]) || 0;
  const dayTotal = (date) => rows.reduce((s, r) => s + cell(r, date), 0);
  const rowTotal = (r) => days.reduce((s, d) => s + cell(r, d.date), 0);
  const weekTotal = rows.reduce((s, r) => s + rowTotal(r), 0);
  const elsewhere = days.reduce((s, d) => s + (d.logged?.hours || 0), 0);

  const change = (fn) => { setRows(fn); setDirty(true); };
  const patchRow = (id, patch) => change((v) => v.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const setHours = (id, date, value) => change((v) => v.map((r) => (r.id === id ? { ...r, hours: { ...r.hours, [date]: value } } : r)));
  const removeRow = (id) => change((v) => { const n = v.filter((r) => r.id !== id); return n.length ? n : [newRow()]; });
  const remember = (list) => {
    const stored = readList(storeKey);
    const merged = [...stored];
    list.filter(Boolean).forEach((p) => { if (!merged.some((x) => x.toLowerCase() === p.toLowerCase())) merged.push(p); });
    if (merged.length !== stored.length) saveList(storeKey, merged);
  };
  /** Add rows unless the same project + task line is already there (then merge hours into it). */
  const mergeRows = (incoming, replaceHours = false) => change((v) => {
    const out = v.filter((r) => r.project || r.task || Object.values(r.hours).some((h) => Number(h) > 0));
    incoming.forEach((x) => {
      const hit = out.find((r) => rowKey(r.project, r.task) === rowKey(x.project, x.task));
      if (hit) Object.entries(x.hours || {}).forEach(([d, h]) => { if (replaceHours || !(Number(hit.hours[d]) > 0)) hit.hours[d] = h; });
      else out.push(newRow(x));
    });
    return out.length ? out.map((r) => ({ ...r, hours: { ...r.hours } })) : [newRow()];
  });

  async function move(delta) {
    if (dirty && !(await confirmDialog("You have unsaved entries for this week. Switch week and discard them?"))) return;
    setWs(addDays(ws, delta * 7));
    setRows([newRow()]);
    setDirty(false);
    setSavedName(null);
    setErr("");
    setInfo("");
  }

  /** Fill one line's empty working days (not leave, not future) with the standard day minus hours logged elsewhere. */
  function fillRow(r) {
    const hours = { ...r.hours };
    let n = 0;
    days.filter((d) => !d.off && !d.future && !(d.leave && !d.leave.half)).forEach((d) => {
      if (Number(hours[d.date]) > 0) return;
      const want = roundHours((d.leave?.half ? DAY_HOURS / 2 : DAY_HOURS) - (d.logged?.hours || 0) - (dayTotal(d.date) - cell(r, d.date)));
      if (want > 0) { hours[d.date] = String(want); n += 1; }
    });
    patchRow(r.id, { hours });
    setInfo(n ? `Filled ${n} working day(s) on this line.` : "Nothing to fill - those days are full, on leave or in the future.");
  }

  /** Lines from the Project Manager's assignments for this week, with the assigned hours per day. */
  function fillFromAssignments(auto = false) {
    if (!assignments.length) return setInfo("You have no project assignments for this week.");
    const incoming = assignments.filter((a) => a.status !== "Cancelled").map((a) => {
      const hours = {};
      days.filter((d) => !d.off && !d.future && !(d.leave && !d.leave.half) && a.start <= d.date && d.date <= a.end).forEach((d) => {
        hours[d.date] = String(roundHours(d.leave?.half ? a.hoursPerDay / 2 : a.hoursPerDay));
      });
      return { project: labelOf(a.project), task: a.role, notes: `ETA ${dmy(a.eta)}`, hours };
    });
    remember(incoming.map((x) => x.project));
    mergeRows(incoming);
    setInfo(`${auto ? "Filled automatically" : "Filled"} from your project assignments (${incoming.length} line${incoming.length === 1 ? "" : "s"}). Review before submitting.`);
  }

  /** Same project + task lines as the previous week's timesheet, without the hours. */
  async function copyLastWeek() {
    setBusy("copy");
    setErr("");
    try {
      const pf = addDays(ws, -7);
      const pt = addDays(ws, -1);
      const sheets = await frappe.getList("Timesheet", { filters: [["employee", "=", emp], ["docstatus", "<", 2], ["end_date", ">=", pf], ["start_date", "<=", pt]], fields: ["name"], limit: 0 });
      const byParent = sheets.length ? await getEntriesBetween(pf, pt, sheets.map((s) => s.name)) : new Map();
      const prev = [];
      byParent.forEach((logs) => logs.forEach((l) => {
        const w = parseWorkNote(l.description, { project: l.project, task: l.task });
        if (!prev.some((x) => rowKey(x.project, x.task) === rowKey(w.project, w.task))) prev.push({ project: w.project, task: w.task, notes: "", hours: {} });
      }));
      if (!prev.length) setInfo("Last week has no timesheet lines to copy.");
      else { mergeRows(prev); setInfo(`Copied ${prev.length} line(s) from last week - enter this week's hours.`); }
    } catch (e) {
      setErr(errMsg(e, "Couldn't read last week's timesheet."));
    }
    setBusy("");
  }

  const autoFor = useRef(null);
  const ready = !holidays.loading && !leave.loading && !existing.loading && !assigned.loading && !projects.loading;
  useEffect(() => {
    if (editName || !ready || autoFor.current === from) return;
    autoFor.current = from;
    const empty = !rows.some((r) => Object.values(r.hours).some((h) => Number(h) > 0));
    if (assignments.length && empty) fillFromAssignments(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, from]);

  function importCsv(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { entries, invalid, order, ambiguous } = csvToEntries(parseCsv(reader.result));
      const incoming = [];
      let other = 0;
      let future = 0;
      entries.forEach((x) => {
        if (x.date < from || x.date > to) { other += 1; return; }
        if (x.date > today) { future += 1; return; }
        let r = incoming.find((y) => rowKey(y.project, y.task) === rowKey(x.project, x.task));
        if (!r) { r = { project: x.project, task: x.task, notes: x.notes || "", hours: {} }; incoming.push(r); }
        r.hours[x.date] = String(roundHours((Number(r.hours[x.date]) || 0) + Number(x.hours)));
      });
      remember(incoming.map((x) => x.project));
      mergeRows(incoming, true);
      const used = incoming.reduce((s, r) => s + Object.keys(r.hours).length, 0);
      setErr("");
      setInfo([
        `Imported ${used} entr${used === 1 ? "y" : "ies"} for ${weekLabel(ws)}`,
        other && `${other} from other weeks skipped`,
        future && `${future} future-dated skipped`,
        invalid && `${invalid} row(s) without a valid date/hours skipped`,
        order === "mdy" ? "dates read as month/day (US format)" : ambiguous ? "dates read as day/month" : null,
      ].filter(Boolean).join("; ") + ".");
    };
    reader.readAsText(file);
  }

  /** Grid -> ERPNext time_logs (slotted one after another each day, after hours logged elsewhere). */
  function buildLogs() {
    const logs = [];
    const onLeave = [];
    for (const r of rows) {
      const any = Object.values(r.hours).some((h) => Number(h) > 0);
      if (any && !String(r.project || "").trim()) return { error: "Choose a project on every line that has hours." };
      if (Object.values(r.hours).some((h) => Number(h) < 0)) return { error: "Hours can't be negative." };
    }
    for (const d of days.filter((x) => !x.future)) {
      const entries = rows.filter((r) => roundHours(r.hours[d.date]) > 0);
      if (!entries.length) continue;
      const total = entries.reduce((s, r) => s + roundHours(r.hours[d.date]), 0);
      if (total + (d.logged?.hours || 0) > 24) return { error: `${dmy(d.date)} would have more than 24 hours${d.logged ? ` (${d.logged.hours.toFixed(2)} h already in ${d.logged.sheets.join(", ")})` : ""}.` };
      const slots = slotDay(d.date, entries.map((r) => r.hours[d.date]), d.logged?.end || 0);
      if (slots.error) return { error: `${dmy(d.date)}: ${slots.error}.` };
      if (d.leave && !d.leave.half) onLeave.push(dmy(d.date));
      entries.forEach((r, i) => {
        const project = r.project.trim();
        const projectId = resolveProject(project);
        logs.push({
          ...(r.keep[d.date] || {}),
          from_time: slots.times[i],
          hours: roundHours(r.hours[d.date]),
          project: projectId || undefined,
          task: matchTask(tasks, r.task, projectId) || undefined,
          description: composeDescription({ project, task: (r.task || "").trim(), notes: (r.notes || "").trim() }),
        });
      });
    }
    return { logs, onLeave };
  }

  async function save(submit) {
    setErr("");
    setInfo("");
    const built = buildLogs();
    if (built.error) return setErr(built.error);
    if (!built.logs.length) return setErr(savedName ? "This timesheet has no hours left for this week - use Delete on the list instead." : "Enter hours for at least one day.");
    if (built.onLeave.length && !(await confirmDialog(`You entered hours on leave day(s): ${built.onLeave.join(", ")}. Save anyway?`))) return;
    if (submit && !(await confirmDialog(`Submit the week of ${weekLabel(ws)} (${fmt(weekTotal)} h of ${fmt(expected)} h expected)? You won't be able to edit it unless it's returned to you.`))) return;
    if (!submit && !(await confirmDialog(`Save the week of ${weekLabel(ws)} as a draft (${fmt(weekTotal)} h)? You can still edit it before submitting.`))) return;
    remember(rows.map((r) => r.project.trim()));
    setBusy(submit ? "submit" : "draft");
    let name = savedName;
    try {
      const timeLogs = await withActivityType([...init.outside, ...built.logs]);
      if (name) await frappe.updateDoc("Timesheet", name, { time_logs: timeLogs });
      else {
        const created = await frappe.createDoc("Timesheet", { employee: emp, company: employee.company, time_logs: timeLogs });
        name = created.name;
        setSavedName(name);
      }
      setDirty(false);
    } catch (x) {
      setErr(errMsg(x, "Couldn't save the timesheet."));
      setBusy("");
      return;
    }
    if (submit) {
      try {
        await submitTimesheet(name);
      } catch (x) {
        setErr(`Saved as draft ${name}, but it couldn't be submitted: ${errMsg(x, "unknown error")} Fix the problem and press "Submit week" again - the same draft will be updated, not duplicated.`);
        setBusy("");
        onChanged();
        return;
      }
    }
    onSaved();
  }

  const known = [...new Set([...readList(storeKey), ...(recent.data || []), ...(projects.data || []).map(projectLabel)])];
  const waiting = existing.loading && !existing.data;
  const pct = expected ? Math.min((weekTotal + elsewhere) / expected, 1) : 0;
  const inp = "w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 py-1.5 text-[12.5px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]";
  const status = savedName ? "Draft" : "New";

  return (
    <Modal title={editName ? `Edit timesheet ${editName}` : "Weekly timesheet"} onClose={async () => { if (!dirty || (await confirmDialog("Close without saving your changes?"))) onClose(); }} wide="xl">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {!editName && <button type="button" title="Previous week" onClick={() => move(-1)} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"><ChevronLeft size={16} /></button>}
            <span className="min-w-[11rem] text-center text-[14px] font-semibold text-[var(--color-text)]">{weekLabel(ws)}</span>
            {!editName && <button type="button" title="Next week" onClick={() => move(1)} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"><ChevronRight size={16} /></button>}
            {!editName && ws !== mondayOf(today) && <button type="button" onClick={() => move(Math.round((fromIso(mondayOf(today)) - fromIso(ws)) / (7 * 86400000)))} className="text-[11px] text-[var(--color-red-hover)] hover:underline">This week</button>}
            <StatusPill status={status} />
          </div>
          <div className="min-w-[14rem]">
            <p className="text-right text-[12px] text-[var(--color-text-muted)]">Week total <b className="text-[14px] text-[var(--color-text)]">{fmt(weekTotal + elsewhere)}</b> / {fmt(expected)} h{elsewhere ? <span className="text-[var(--color-text-faint)]"> (incl. {fmt(elsewhere)} h in other timesheets)</span> : null}</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]"><div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: weekTotal + elsewhere > expected ? "var(--color-amber)" : "var(--color-green)" }} /></div>
          </div>
        </div>

        {editName && init.outside.length > 0 && <Notice tone="info">This timesheet also has {init.outside.length} entr{init.outside.length === 1 ? "y" : "ies"} outside {weekLabel(ws)}; they are kept unchanged.</Notice>}
        {existing.error && <Notice>Couldn't check the hours you've already logged this week ({friendlyError(existing.error)}). Saving may fail if days overlap with another timesheet.</Notice>}
        {leave.error && <Notice tone="info">Couldn't load your leave for this week, so leave days aren't marked.</Notice>}

        <datalist id="ts-known-projects">{known.map((p) => <option key={p} value={p} />)}</datalist>
        <datalist id="ts-tasks">{tasks.map((t) => <option key={t.name} value={t.subject}>{t.project || ""}</option>)}</datalist>

        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
          {waiting ? <p className="p-4 text-[13px] text-[var(--color-text-muted)]">Checking what you've already logged…</p> : (
            <table className="w-full min-w-[900px] table-fixed text-[12.5px]">
              <colgroup><col className="w-[320px]" />{days.map((d) => <col key={d.date} />)}<col className="w-[64px]" /><col className="w-[64px]" /></colgroup>
              <thead className="bg-[var(--color-surface)]">
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                  <th className="px-3 py-2 text-left font-medium">Project · task · work done</th>
                  {days.map((d) => (
                    <th key={d.date} title={d.label || undefined} className={`px-1 py-2 text-center font-medium ${d.date === today ? "text-[var(--color-red-hover)]" : ""} ${d.off || (d.leave && !d.leave.half) ? "bg-[var(--color-surface-2)]" : ""}`}>
                      <span className="block">{WEEKDAYS[d.wd]} {fromIso(d.date).getDate()}</span>
                      <span className="block h-3.5 truncate text-[10px] font-normal text-[var(--color-text-faint)]">{d.label || (d.logged ? `+${fmt(d.logged.hours)} h logged` : "")}</span>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right font-medium">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const resolved = r.project && projects.data ? resolveProject(r.project) : true;
                  return (
                    <tr key={r.id} className="border-b border-[var(--color-border)] align-top">
                      <td className="space-y-1 px-3 py-2">
                        <div className="grid grid-cols-2 gap-1">
                          <input list="ts-known-projects" value={r.project} onChange={(e) => patchRow(r.id, { project: e.target.value })} placeholder="Project" className={inp} />
                          <input list="ts-tasks" value={r.task} onChange={(e) => patchRow(r.id, { task: e.target.value })} placeholder="Task" className={inp} />
                        </div>
                        {r.project && !resolved && <span className="block text-[10px] text-[var(--color-amber)]">Not in the project list - saved as text only</span>}
                        <input value={r.notes} onChange={(e) => patchRow(r.id, { notes: e.target.value })} placeholder="Work done this week (optional)" className={`${inp} !text-[11.5px]`} />
                      </td>
                      {days.map((d) => {
                        const blocked = d.future;
                        const grey = d.off || (d.leave && !d.leave.half);
                        return (
                          <td key={d.date} className={`px-1 py-2 text-center ${grey ? "bg-[var(--color-surface-2)]" : ""}`}>
                            <input type="number" min="0" max="24" step="0.25" inputMode="decimal" disabled={blocked} value={r.hours[d.date] ?? ""} onChange={(e) => setHours(r.id, d.date, e.target.value)}
                              aria-label={`${r.project || "Line"} ${dmy(d.date)}`} placeholder={blocked ? "" : "0"}
                              className={`w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-1 py-1.5 text-center text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)] disabled:cursor-not-allowed disabled:opacity-40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`} />
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 pt-3 text-right font-semibold text-[var(--color-text)]">{fmt(rowTotal(r))}</td>
                      <td className="px-1 py-2 pt-2.5">
                        <div className="flex flex-col items-center gap-1.5">
                          <button type="button" title="Fill this line's empty working days" onClick={() => fillRow(r)} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><Wand2 size={14} /></button>
                          <button type="button" title="Remove line" onClick={() => removeRow(r.id)} className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><X size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-b border-[var(--color-border)]">
                  <td colSpan={10} className="px-3 py-2"><button type="button" onClick={() => change((v) => [...v, newRow()])} className="flex items-center gap-1 text-[12px] text-[var(--color-red-hover)] hover:underline"><Plus size={13} /> Add line</button></td>
                </tr>
                <tr className="bg-[var(--color-surface)] text-[var(--color-text)]">
                  <td className="px-3 py-2 text-[12px] text-[var(--color-text-muted)]">Daily total</td>
                  {days.map((d) => {
                    const t = dayTotal(d.date) + (d.logged?.hours || 0);
                    const target = d.off ? 0 : d.leave ? (d.leave.half ? DAY_HOURS / 2 : 0) : DAY_HOURS;
                    const tone = t > 24 ? "var(--color-red-hover)" : !d.future && target && t < target ? "var(--color-amber)" : "var(--color-text)";
                    return <td key={d.date} className="px-1 py-2 text-center font-semibold" style={{ color: tone }} title={target ? `Expected ${target} h` : undefined}>{d.future && !t ? "–" : fmt(t)}</td>;
                  })}
                  <td className="px-2 py-2 text-right font-semibold">{fmt(weekTotal + elsewhere)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={copyLastWeek} disabled={Boolean(busy) || waiting}><Copy size={14} /> {busy === "copy" ? "Copying…" : "Copy last week"}</Button>
          <Button type="button" variant="secondary" onClick={() => fillFromAssignments(false)} disabled={waiting || assigned.loading || !assignments.length} title="Lines and hours from the projects your Project Manager assigned to you"><Wand2 size={14} /> From my assignments ({assignments.length})</Button>
          <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv} />
          <Button type="button" variant="ghost" onClick={() => fileInput.current?.click()}><Upload size={14} /> Import CSV</Button>
          <Button type="button" variant="ghost" onClick={async () => { if (!dirty || (await confirmDialog("Clear every line for this week?"))) change(() => [newRow()]); }}>Clear</Button>
          <span className="text-[11px] text-[var(--color-text-faint)]">Amber totals are under the expected {DAY_HOURS} h; greyed days are weekly offs, holidays or leave.</span>
        </div>

        {assignments.length > 0 && (
          <p className="text-[11.5px] text-[var(--color-text-muted)]">Assigned this week: {assignments.map((a) => `${labelOf(a.project)} as ${a.role} (${a.hoursPerDay} h/day, ETA ${dmy(a.eta)})`).join(" · ")}</p>
        )}
        {info && <Notice tone="info">{info}</Notice>}
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-3">
          <Button type="button" variant="ghost" onClick={async () => { if (!dirty || (await confirmDialog("Close without saving your changes?"))) onClose(); }}>Cancel</Button>
          <Button type="button" variant="secondary" disabled={Boolean(busy) || waiting} onClick={() => save(false)}>{busy === "draft" ? "Saving…" : "Save draft"}</Button>
          <Button type="button" disabled={Boolean(busy) || waiting} onClick={() => save(true)}><Send size={14} /> {busy === "submit" ? "Submitting…" : "Submit week"}</Button>
        </div>
      </div>
    </Modal>
  );
}