// Employee portal: Timesheet page and the weekly timesheet editor (one timesheet per week, Monday to Sunday).
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Send, Trash2, Upload, X } from "lucide-react";
import { Async, Grid, inputCls, Modal, Notice, PageHeader, Panel, StatusPill, useEmployee } from "../../components/employee/EmployeeShell";
import { Button } from "../../components/ui/primitives";
import { useAuth } from "../../context/AuthContext";
import { frappe } from "../../lib/api/frappeClient";
import { dmy, errMsg, friendlyError, getAssignedTasks, getHolidays, getTimesheets, isoDate, MONTHS_LONG, pad, parseWorkNote, useAsync, WEEKDAYS } from "../../lib/employeePortal";
import { getMyAssignments, parseAssignment } from "../../lib/assignments";
import { composeDescription, csvToEntries, DAY_MINUTES, getEntriesBetween, getLeaveDays, getProjects, matchTask, minutesOf, parseCsv, projectResolver, roundHours, slotDay, submitTimesheet, withActivityType } from "../../lib/timesheets";

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
  const submitSheet = (name) => window.confirm(`Submit ${name} to HR? You won't be able to edit it unless HR returns it to you.`) && act(name, () => submitTimesheet(name), "Couldn't submit this timesheet.");
  const deleteSheet = (name) => window.confirm(`Delete draft ${name}? This can't be undone.`) && act(name, () => frappe.deleteDoc("Timesheet", name), "Couldn't delete this timesheet.");

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
const blank = () => ({ project: "", hours: "", task: "", notes: "" });
const KEEP_FIELDS = ["activity_type", "is_billable"];

/* ---- week helpers (local dates, ISO yyyy-mm-dd; weeks run Monday to Sunday) ---- */
const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (iso, n) => { const d = fromIso(iso); d.setDate(d.getDate() + n); return toIso(d); };
const mondayOf = (iso) => { const d = fromIso(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toIso(d); };
const short = (iso) => { const d = fromIso(iso); return `${d.getDate()} ${MONTHS_LONG[d.getMonth()].slice(0, 3)}`; };
const weekLabel = (ws) => { const we = addDays(ws, 6); return `${short(ws)} – ${short(we)} ${fromIso(we).getFullYear()}`; };

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

/** Initial editor state: this week for a new timesheet, or the draft's week with its entries filled in. */
function initialState(doc) {
  if (!doc) return { ws: mondayOf(isoDate()), days: {}, outside: [] };
  const start = String(doc.start_date || (doc.time_logs || [])[0]?.from_time || isoDate()).slice(0, 10);
  const ws = mondayOf(start);
  const we = addDays(ws, 6);
  const days = {};
  const outside = [];
  (doc.time_logs || []).forEach((l) => {
    const date = String(l.from_time).slice(0, 10);
    if (date < ws || date > we) { outside.push(l); return; } // e.g. older monthly drafts: kept as they are
    const w = parseWorkNote(l.description, { project: l.project, task: l.task });
    const keep = Object.fromEntries(KEEP_FIELDS.filter((k) => l[k] != null).map((k) => [k, l[k]]));
    (days[date] = days[date] || []).push({ project: w.project, hours: String(roundHours(l.hours)), task: w.task, notes: w.notes, keep });
  });
  return { ws, days, outside };
}

/** One week in one timesheet: choose your projects, then per day enter hours and the work you did. */
function WeeklyEditor({ employee, tasks, editName, doc, recentNames, onClose, onChanged, onSaved }) {
  const emp = employee.name;
  const storeKey = `ts-projects:${emp}`;
  const today = isoDate();
  const [init] = useState(() => initialState(doc));
  const [ws, setWs] = useState(init.ws); // Monday of the week being edited
  const [days, setDays] = useState(init.days); // iso -> [{ project, hours, task, notes, keep? }]
  const [dirty, setDirty] = useState(false);
  const [savedName, setSavedName] = useState(editName || null); // set after the first save so retries update, never duplicate
  const [myProjects, setMyProjects] = useState(() => {
    const stored = readList(storeKey);
    const fromDoc = Object.values(init.days).flat().map((e) => e.project).filter(Boolean);
    return [...stored, ...fromDoc.filter((p, i) => fromDoc.indexOf(p) === i && !stored.some((x) => x.toLowerCase() === p.toLowerCase()))];
  });
  const [newProject, setNewProject] = useState("");
  const [fill, setFill] = useState("8");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const fileInput = useRef(null);

  const from = ws;
  const to = addDays(ws, 6);

  const holidays = useAsync(() => getHolidays(employee), [emp]);
  const projects = useAsync(() => getProjects(), []);
  const leave = useAsync(() => getLeaveDays(emp, from, to), [emp, from]);
  const recent = useAsync(async () => {
    if (!recentNames.length) return [];
    const rows = await frappe.getList("Timesheet Detail", { parent: "Timesheet", filters: [["parent", "in", recentNames]], fields: ["project", "description"], limit: 0 }).catch(() => []);
    return [...new Set(rows.map((r) => parseWorkNote(r.description, { project: r.project }).project).filter(Boolean))];
  }, [recentNames.join(",")]);

  // Hours already logged in this employee's OTHER timesheets this week, and when they end each day,
  // so new entries are placed after them instead of overlapping (ERPNext rejects overlaps).
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

  const assigned = useAsync(() => getMyAssignments(employee.user_id, from, to), [emp, from]);
  const assignments = useMemo(() => (assigned.data || []).map(parseAssignment), [assigned.data]);
  const resolveProject = useMemo(() => projectResolver(projects.data || []), [projects.data]);
  const holidayMap = useMemo(() => Object.fromEntries((holidays.data?.holidays || []).map((h) => [h.date, h])), [holidays.data]);
  const listHasWeeklyOffs = (holidays.data?.holidays || []).some((h) => h.weeklyOff);
  const defaultProject = myProjects[0] || "";

  const list = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(ws, i);
    const wd = fromIso(date).getDay();
    const h = holidayMap[date];
    // trust the holiday list for weekly offs when it has them, otherwise assume Saturday/Sunday
    const off = Boolean(h) || (!listHasWeeklyOffs && (wd === 0 || wd === 6));
    const lv = leave.data?.[date] || null;
    const label = h ? (h.weeklyOff ? "Weekly off" : h.description) : off ? "Weekend" : "";
    return { date, wd, off, label, leave: lv, logged: existing.data?.[date] || null, future: date > today };
  });

  const entriesOf = (date) => days[date] || [blank()];
  const change = (fn) => { setDays(fn); setDirty(true); };
  const patchEntry = (date, i, patch) => change((v) => { const arr = [...(v[date] || [blank()])]; arr[i] = { ...arr[i], ...patch }; return { ...v, [date]: arr }; });
  const addEntry = (date) => change((v) => ({ ...v, [date]: [...(v[date] || [blank()]), blank()] }));
  const removeEntry = (date, i) => change((v) => { const arr = (v[date] || []).filter((_, k) => k !== i); return { ...v, [date]: arr.length ? arr : [blank()] }; });

  const hoursOf = (date) => entriesOf(date).reduce((s, e) => s + (Number(e.hours) || 0), 0);
  const total = list.reduce((s, d) => s + (d.future ? 0 : hoursOf(d.date)), 0);
  const filled = list.filter((d) => !d.future && hoursOf(d.date) > 0).length;

  function move(delta) {
    if (dirty && !window.confirm("You have unsaved entries for this week. Switch week and discard them?")) return;
    setWs(addDays(ws, delta * 7));
    setDays({});
    setDirty(false);
    setSavedName(null);
    setErr("");
    setInfo("");
  }

  function addProject(name = newProject) {
    const p = name.trim();
    setNewProject("");
    if (!p || myProjects.some((x) => x.toLowerCase() === p.toLowerCase())) return;
    const next = [...myProjects, p];
    setMyProjects(next);
    saveList(storeKey, next);
  }
  function removeProject(p) {
    const next = myProjects.filter((x) => x !== p);
    setMyProjects(next);
    saveList(storeKey, next);
  }

  /** Fill empty working days only; skips leave, tops up days partly logged elsewhere, halves half-day leave. */
  function fillWorking() {
    const hrs = roundHours(fill);
    if (!(hrs > 0 && hrs <= 24)) return setErr("Enter hours between 0 and 24.");
    setErr("");
    let skippedLeave = 0;
    const n = { ...days };
    list.filter((d) => !d.off && !d.future).forEach((d) => {
      if (d.leave && !d.leave.half) { skippedLeave += 1; return; }
      if ((n[d.date] || []).some((e) => Number(e.hours) > 0)) return;
      const want = roundHours((d.leave?.half ? hrs / 2 : hrs) - (d.logged?.hours || 0));
      if (want > 0) n[d.date] = [{ ...((n[d.date] || [])[0] || blank()), hours: String(want) }];
    });
    change(() => n);
    setInfo(`Filled empty working days with ${hrs} h${skippedLeave ? `; skipped ${skippedLeave} leave day(s)` : ""}. Days you already filled were left as they are.`);
  }

  /**
   * Fill empty working days from the projects a Project Manager assigned to this employee:
   * every day between the start date and the ETA gets the assigned hours per day, with the role as the task.
   * Skips weekly offs, holidays and leave; days already filled or logged elsewhere are left alone.
   */
  function fillFromAssignments(auto = false) {
    if (!assignments.length) return setInfo("You have no project assignments for this week.");
    const label = (id) => { const p = (projects.data || []).find((x) => x.name === id); return p ? projectLabel(p) : id; };
    const n = { ...days };
    const used = new Set();
    let daysFilled = 0;
    list.filter((d) => !d.off && !d.future).forEach((d) => {
      if (d.leave && !d.leave.half) return;
      if ((n[d.date] || []).some((e) => Number(e.hours) > 0)) return;
      const active = assignments.filter((a) => a.start <= d.date && d.date <= a.end && a.status !== "Cancelled");
      if (!active.length) return;
      const total = active.reduce((s, a) => s + a.hoursPerDay, 0);
      const want = roundHours((d.leave?.half ? total / 2 : total) - (d.logged?.hours || 0));
      if (want <= 0) return;
      n[d.date] = active.map((a) => { used.add(label(a.project)); return { ...blank(), project: label(a.project), hours: String(roundHours((a.hoursPerDay / total) * want)), task: a.role, notes: `ETA ${dmy(a.eta)}` }; });
      daysFilled += 1;
    });
    if (used.size) {
      const merged = [...myProjects];
      used.forEach((p) => { if (!merged.some((x) => x.toLowerCase() === p.toLowerCase())) merged.push(p); });
      if (merged.length !== myProjects.length) { setMyProjects(merged); saveList(storeKey, merged); }
    }
    if (!daysFilled) return setInfo("Nothing to fill - your assigned days are already filled, on leave or logged in another timesheet.");
    change(() => n);
    setInfo(`${auto ? "Filled automatically" : "Filled"} from your project assignments: ${daysFilled} day(s). Review and adjust before saving.`);
  }

  // Pre-fill a new timesheet once everything it depends on has loaded (once per week)
  const autoFor = useRef(null);
  const ready = !holidays.loading && !leave.loading && !existing.loading && !assigned.loading && !projects.loading;
  useEffect(() => {
    if (editName || !ready || autoFor.current === from) return;
    autoFor.current = from;
    if (assignments.length && !Object.values(days).some((arr) => arr.some((e) => Number(e.hours) > 0))) fillFromAssignments(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, from]);

  function importCsv(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { entries, invalid, order, ambiguous } = csvToEntries(parseCsv(reader.result));
      const next = {};
      const found = [];
      let other = 0;
      let future = 0;
      entries.forEach((x) => {
        if (x.date < from || x.date > to) { other += 1; return; }
        if (x.date > today) { future += 1; return; }
        (next[x.date] = next[x.date] || []).push({ project: x.project, hours: String(x.hours), task: x.task, notes: x.notes });
        if (x.project) found.push(x.project);
      });
      const used = Object.values(next).flat().length;
      change((v) => ({ ...v, ...next }));
      const merged = [...myProjects];
      found.forEach((p) => { if (!merged.some((m) => m.toLowerCase() === p.toLowerCase())) merged.push(p); });
      if (merged.length !== myProjects.length) { setMyProjects(merged); saveList(storeKey, merged); }
      const notes = [
        `Imported ${used} entr${used === 1 ? "y" : "ies"} for the week of ${weekLabel(ws)}`,
        other && `${other} from other weeks skipped`,
        future && `${future} future-dated skipped`,
        invalid && `${invalid} row(s) without a valid date/hours skipped`,
        order === "mdy" ? "dates read as month/day (US format)" : ambiguous ? "dates read as day/month" : null,
      ].filter(Boolean);
      setErr("");
      setInfo(`${notes.join("; ")}. Imported days replace what was typed for those days.`);
    };
    reader.readAsText(file);
  }

  /** Build ERPNext time_logs for the week, or return an error message. */
  function buildLogs() {
    const logs = [];
    const onLeave = [];
    for (const d of list.filter((x) => !x.future)) {
      const entries = entriesOf(d.date).filter((e) => roundHours(e.hours) > 0);
      if (!entries.length) continue;
      if (entries.some((e) => Number(e.hours) < 0)) return { error: `${dmy(d.date)}: hours can't be negative.` };
      const dayTotal = entries.reduce((s, e) => s + roundHours(e.hours), 0);
      if (dayTotal + (d.logged?.hours || 0) > 24) return { error: `${dmy(d.date)} would have more than 24 hours${d.logged ? ` (${d.logged.hours.toFixed(2)} h already in ${d.logged.sheets.join(", ")})` : ""}.` };
      const slots = slotDay(d.date, entries.map((e) => e.hours), d.logged?.end || 0);
      if (slots.error) return { error: `${dmy(d.date)}: ${slots.error}.` };
      if (d.leave && !d.leave.half) onLeave.push(dmy(d.date));
      entries.forEach((e, i) => {
        const project = (e.project || defaultProject).trim();
        const projectId = resolveProject(project);
        const taskId = matchTask(tasks, e.task, projectId);
        logs.push({
          ...(e.keep || {}),
          from_time: slots.times[i],
          hours: roundHours(e.hours),
          project: projectId || undefined,
          task: taskId || undefined,
          description: composeDescription({ project, task: e.task.trim(), notes: (e.notes || "").trim() }),
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
    const allLogs = [...init.outside, ...built.logs]; // entries of an edited draft outside this week stay as they were
    if (!built.logs.length) return setErr(savedName ? "This timesheet has no hours left for this week - use Delete on the list instead." : "Enter hours for at least one day.");
    if (built.onLeave.length && !window.confirm(`You entered hours on leave day(s): ${built.onLeave.join(", ")}. Save anyway?`)) return;
    if (submit && !window.confirm(`Submit the week of ${weekLabel(ws)} (${total.toFixed(2)} h)? You won't be able to edit it unless it's returned to you.`)) return;

    setBusy(submit ? "submit" : "draft");
    let name = savedName;
    try {
      // Activity Type is required by ERPNext on submit; stamp the default so employees never have to pick one.
      const timeLogs = await withActivityType(allLogs);
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
        setErr(`Saved as draft ${name}, but it couldn't be submitted: ${errMsg(x, "unknown error")} Fix the problem and press "Save & submit" again - the same draft will be updated, not duplicated.`);
        setBusy("");
        onChanged();
        return;
      }
    }
    onSaved();
  }

  const projectLabel = (p) => (p.project_name && p.project_name !== p.name ? p.project_name : p.name);
  const suggestions = (recent.data || []).filter((p) => !myProjects.some((x) => x.toLowerCase() === p.toLowerCase()));
  const monthLabel = weekLabel(ws);
  const cell = `${inputCls} !py-1`;
  const waiting = existing.loading && !existing.data;

  return (
    <Modal title={editName ? `Edit timesheet ${editName}` : savedName ? `Weekly timesheet · ${savedName} (draft)` : "Weekly timesheet"} onClose={onClose} wide="xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!editName && <button type="button" onClick={() => move(-1)} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"><ChevronLeft size={16} /></button>}
            <span className="min-w-[11rem] text-center text-[14px] font-semibold text-[var(--color-text)]">{monthLabel}</span>
            {!editName && <button type="button" onClick={() => move(1)} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"><ChevronRight size={16} /></button>}
            {!editName && ws !== mondayOf(today) && <button type="button" onClick={() => move(Math.round((fromIso(mondayOf(today)) - fromIso(ws)) / (7 * 86400000)))} className="text-[11px] text-[var(--color-red-hover)] hover:underline">This week</button>}
          </div>
          <p className="text-[12px] text-[var(--color-text-muted)]"><b className="text-[var(--color-text)]">{total.toFixed(2)} h</b> over {filled} day(s)</p>
        </div>

        {editName && init.outside.length > 0 && <Notice tone="info">This timesheet also has {init.outside.length} entr{init.outside.length === 1 ? "y" : "ies"} outside {monthLabel}; they are kept unchanged.</Notice>}

        <div>
          <p className="mb-1.5 text-[12px] text-[var(--color-text-muted)]">My projects <span className="text-[var(--color-text-faint)]">- add the projects you work on; they're remembered for next week</span></p>
          <div className="flex flex-wrap items-center gap-2">
            {myProjects.map((p) => (
              <span key={p} className="flex items-center gap-1.5 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2.5 py-1 text-[12px] text-[var(--color-text)]" title={resolveProject(p) ? `Linked to ERPNext project ${resolveProject(p)}` : "Not an ERPNext project - saved as text only"}>
                {p}{projects.data && !resolveProject(p) && <span className="text-[10px] text-[var(--color-amber)]">text only</span>}
                <button type="button" title="Remove" onClick={() => removeProject(p)} className="text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><X size={12} /></button>
              </span>
            ))}
            <input list="ts-known-projects" value={newProject} onChange={(e) => setNewProject(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addProject(); } }} placeholder="Type a project name…" className={`${cell} !w-56`} />
            <Button type="button" variant="secondary" onClick={() => addProject()} disabled={!newProject.trim()}><Plus size={14} /> Add</Button>
            <datalist id="ts-known-projects">{(projects.data || []).map((p) => <option key={p.name} value={projectLabel(p)}>{p.name}</option>)}</datalist>
          </div>
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-text-faint)]">
              Recently used:
              {suggestions.map((p) => <button key={p} type="button" onClick={() => addProject(p)} className="rounded-full border border-dashed border-[var(--color-border-strong)] px-2 py-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)]">+ {p}</button>)}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
          Fill empty working days with
          <input type="number" min="0.25" max="24" step="0.25" value={fill} onChange={(e) => setFill(e.target.value)} className={`${cell} !w-20`} /> h
          <Button type="button" variant="secondary" onClick={fillWorking} disabled={waiting}>Fill</Button>
          <Button type="button" variant="secondary" onClick={() => fillFromAssignments(false)} disabled={waiting || assigned.loading || !assignments.length} title="Fill from the projects your Project Manager assigned to you">From my assignments ({assignments.length})</Button>
          <Button type="button" variant="ghost" onClick={() => { if (!dirty || window.confirm("Clear everything you've entered for this week?")) change(() => ({})); }}>Clear</Button>
          <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv} />
          <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()}><Upload size={14} /> Import CSV</Button>
          <span className="text-[11px] text-[var(--color-text-faint)]">CSV: date, hours, project, task - or any file with Date / Hours / Project / Task headers</span>
        </div>

        {assignments.length > 0 && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-[12px]">
            <p className="mb-1.5 font-medium text-[var(--color-text)]">Your project assignments this week</p>
            <ul className="space-y-1 text-[var(--color-text-muted)]">
              {assignments.map((a) => <li key={a.name}><b className="text-[var(--color-text)]">{(projects.data || []).find((p) => p.name === a.project) ? projectLabel((projects.data || []).find((p) => p.name === a.project)) : a.project}</b> as {a.role} · {dmy(a.start)} to ETA {dmy(a.eta)} · {a.hoursPerDay} h/day</li>)}
            </ul>
          </div>
        )}

        {existing.error && <Notice>Couldn't check the hours you've already logged this week ({friendlyError(existing.error)}). Saving may fail if days overlap with another timesheet.</Notice>}
        {leave.error && <Notice tone="info">Couldn't load your leave for this week, so leave days aren't marked.</Notice>}

        <datalist id="ts-tasks">{tasks.map((t) => <option key={t.name} value={t.subject}>{t.project || ""}</option>)}</datalist>
        <div className="max-h-[42vh] overflow-auto rounded-lg border border-[var(--color-border)]">
          {waiting ? <p className="p-4 text-[13px] text-[var(--color-text-muted)]">Checking what you've already logged…</p> : (
            <table className="w-full min-w-[760px] table-fixed text-left text-[12.5px]">
              <colgroup><col className="w-[190px]" /><col className="w-[200px]" /><col className="w-[96px]" /><col /><col className="w-[40px]" /></colgroup>
              <thead className="sticky top-0 z-10 bg-[var(--color-surface)]"><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]"><th className="px-3 py-2 font-medium">Date</th><th className="px-2 py-2 font-medium">Project</th><th className="px-2 py-2 font-medium">Hours</th><th className="px-2 py-2 font-medium">Task / work done</th><th /></tr></thead>
              <tbody>
                {list.map((d) => d.future ? (
                  <tr key={d.date} className={`border-b border-[var(--color-border)] ${d.off ? "bg-[var(--color-surface-2)]" : ""}`}>
                    <td className="whitespace-nowrap px-3 py-1.5 align-top text-[var(--color-text)]">{dmy(d.date)} <span className="text-[var(--color-text-faint)]">{WEEKDAYS[d.wd]}</span></td>
                    <td colSpan={4} className="px-2 py-1.5 text-[11px] text-[var(--color-text-faint)]">Upcoming day{d.leave ? ` · ${d.leave.half ? "half-day " : ""}leave (${d.leave.status})` : ""}</td>
                  </tr>
                ) : entriesOf(d.date).map((e, i) => {
                  const options = e.project && !myProjects.includes(e.project) ? [...myProjects, e.project] : myProjects;
                  return (
                    <tr key={`${d.date}-${i}`} className={`border-b border-[var(--color-border)] ${d.off || (d.leave && !d.leave.half) ? "bg-[var(--color-surface-2)]" : ""}`}>
                      <td className="px-3 py-1 align-top text-[var(--color-text)]">{i === 0 ? (
                        <>
                          <span className="whitespace-nowrap">{dmy(d.date)} <span className="text-[var(--color-text-faint)]">{WEEKDAYS[d.wd]}</span></span>
                          {d.label && <span className="block truncate text-[10px] text-[var(--color-text-faint)]">{d.label}</span>}
                          {d.leave && <span className="block truncate text-[10px] text-[var(--color-amber)]">{d.leave.half ? "Half-day leave" : "On leave"} ({d.leave.status}{d.leave.leave_type ? `, ${d.leave.leave_type}` : ""})</span>}
                          {d.logged && <span className="block truncate text-[10px] text-[var(--color-amber)]" title={d.logged.sheets.join(", ")}>{d.logged.hours.toFixed(2)} h already in {d.logged.sheets.join(", ")}</span>}
                        </>
                      ) : null}</td>
                      <td className="px-2 py-1 align-top"><select className={cell} value={e.project || defaultProject} onChange={(ev) => patchEntry(d.date, i, { project: ev.target.value })}>{options.length === 0 && <option value="">Add a project above</option>}{options.map((p) => <option key={p}>{p}</option>)}</select></td>
                      <td className="px-2 py-1 align-top"><input type="number" min="0" max="24" step="0.25" value={e.hours} onChange={(ev) => patchEntry(d.date, i, { hours: ev.target.value })} className={cell} /></td>
                      <td className="px-2 py-1 align-top"><input list="ts-tasks" value={e.task} onChange={(ev) => patchEntry(d.date, i, { task: ev.target.value })} placeholder="What did you do?" className={cell} />{e.notes && <span className="mt-0.5 block truncate text-[10px] text-[var(--color-text-faint)]" title={e.notes}>Notes: {e.notes}</span>}</td>
                      <td className="px-1 py-1 align-top">{i === 0 ? <button type="button" title="Add another project / task for this day" onClick={() => addEntry(d.date)} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><Plus size={14} /></button> : <button type="button" title="Remove this entry" onClick={() => removeEntry(d.date, i)} className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><X size={14} /></button>}</td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          )}
        </div>

        {info && <Notice tone="info">{info}</Notice>}
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => { if (!dirty || window.confirm("Close without saving your changes?")) onClose(); }}>Cancel</Button>
          <Button type="button" variant="secondary" disabled={Boolean(busy) || waiting} onClick={() => save(false)}>{busy === "draft" ? "Saving…" : "Save as draft"}</Button>
          <Button type="button" disabled={Boolean(busy) || waiting} onClick={() => save(true)}>{busy === "submit" ? "Submitting…" : "Save & submit"}</Button>
        </div>
      </div>
    </Modal>
  );
}