// Employee portal timesheets, in two screens:
//  - My Timesheet Entries: every week (Sunday to Saturday) in a date range with its total hours and status, including
//    the weeks still to be filled; New Timesheet Entry; Download (CSV / Excel).
//  - Timesheet: one week as a sheet - Name, Ecode, Period, Status; a line per project with Customer, Billing Type,
//    Job / Module, Sun..Sat hours, Total, Comments, the line's Status, its TS Approver (project manager, or whoever covers
//    for them in the hierarchy), the approver's status and any revise remark. Editable while a draft, read-only once
//    submitted.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, ChevronDown, Copy, Download, FileSpreadsheet, Plus, RotateCcw, Search, Send, Trash2, Upload, Wand2, X } from "lucide-react";
import { Async, Notice, StatusPill, useEmployee } from "../../components/employee/EmployeeShell";
import { Button, DateField } from "../../components/ui/primitives";
import { useAuth } from "../../context/AuthContext";
import { frappe } from "../../lib/api/frappeClient";
import { dmy, errMsg, friendlyError, getAssignedTasks, getHolidays, getTimesheets, isoDate, MONTHS, pad, parseWorkNote, useAsync, WEEKDAYS } from "../../lib/employeePortal";
import { getMyAssignments, parseAssignment } from "../../lib/assignments";
import { composeDescription, csvCell, csvToEntries, DAY_MINUTES, getEntriesBetween, getLeaveDays, getProjects, getTimesheetApprovers, matchTask, minutesOf, parseCsv, projectResolver, roundHours, saveCsv, slotDay, submitTimesheet, canSubmitWeek, weekEnd, weekStart, withActivityType } from "../../lib/timesheets";
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

const readList = (key) => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } };
const saveList = (key, list) => { try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* ignore */ } };

/* ---- dates (local, ISO yyyy-mm-dd; weeks run Sunday to Saturday) ---- */
const DAY_HOURS = 8;
const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (iso, n) => { const d = fromIso(iso); d.setDate(d.getDate() + n); return toIso(d); };
/** 01-Nov-2026 */
const dMy = (iso) => { if (!iso) return ""; const d = fromIso(String(iso).slice(0, 10)); return `${pad(d.getDate())}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`; };
const periodLabel = (ws, sep = " | ") => `${dMy(ws)}${sep}${dMy(addDays(ws, 6))}`;
const fmt = (n) => { const v = Math.round((Number(n) || 0) * 100) / 100; return Number.isInteger(v) ? String(v) : v.toFixed(2); };
const inWeek = (r, ws) => r.start_date <= addDays(ws, 6) && (r.end_date || r.start_date) >= ws;
const monthEnd = (iso) => { const d = fromIso(iso); return toIso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };

/** The week's timesheets: the submitted one (read-only) and/or the draft (editable). */
function weekSheets(rows, ws) {
  const mine = (rows || []).filter((r) => r.docstatus < 2 && inWeek(r, ws));
  return { submitted: mine.find((r) => r.docstatus === 1) || null, draft: mine.find((r) => r.docstatus === 0) || null, all: mine };
}

/** Status of a week for the list: the timesheet's review state, or what's still to do. */
function weekStatus(w, today) {
  const s = w.submitted || w.draft;
  if (s) return { label: s.review.label, review: s.review };
  return { label: weekEnd(w.ws) < today ? "Not Submitted" : "Not Started", missing: true };
}

export function EmpTimesheet() {
  const { employee } = useEmployee();
  const sheets = useAsync(() => getTimesheets(employee.name), [employee.name]);
  const [params, setParams] = useSearchParams();
  const week = params.get("week");
  const open = (ws) => setParams({ week: weekStart(ws) });
  const back = () => setParams({});
  return week
    ? <TimesheetSheet key={weekStart(week)} ws={weekStart(week)} sheets={sheets} onBack={back} onWeek={open} />
    : <TimesheetEntries sheets={sheets} onOpen={open} />;
}

/* =============================== My Timesheet Entries =============================== */

// Row actions on the entries list: quiet bordered buttons; discarding only turns red on hover.
const actBtn = "rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-[12px] font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]";
const actDanger = "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[12px] font-medium text-[var(--color-text-muted)] transition-colors hover:border-[color-mix(in_srgb,var(--color-red-hover)_40%,transparent)] hover:text-[var(--color-red-hover)] disabled:opacity-50";

/** A week with no timesheet: "Not Started" (this week) or "Not Submitted" (a past week - overdue). */
function MissingPill({ label }) {
  const tone = label === "Not Submitted" ? "var(--color-red-hover)" : label === "Discarded" ? "var(--color-text-muted)" : "var(--color-amber)";
  return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `color-mix(in srgb, ${tone} 15%, transparent)`, color: tone }}>{label}</span>;
}

function TimesheetEntries({ sheets, onOpen }) {
  const { employee } = useEmployee();
  const today = isoDate();
  const first = `${today.slice(0, 8)}01`;
  const [draft, setDraft] = useState({ from: first, to: monthEnd(first) });
  const [range, setRange] = useState(draft);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  // Weeks the employee discarded (no timesheet needed, e.g. not working): kept for this login on this device.
  const discardKey = `ts-discarded:${employee.name}`;
  const [discarded, setDiscarded] = useState(() => new Set(readList(discardKey)));
  const [showDiscarded, setShowDiscarded] = useState(false);
  const saveDiscarded = (next) => { setDiscarded(next); saveList(discardKey, [...next]); };

  // Every week touching the range, up to this week, from the employee's joining date.
  const allWeeks = useMemo(() => {
    const out = [];
    const last = weekStart(range.to < today ? range.to : today);
    for (let ws = weekStart(range.from); ws <= last; ws = addDays(ws, 7)) {
      if (employee.date_of_joining && addDays(ws, 6) < employee.date_of_joining) continue;
      const w = { ws, ...weekSheets(sheets.data, ws) };
      w.total = w.all.reduce((n, r) => n + (Number(r.total_hours) || 0), 0);
      w.status = weekStatus(w, today);
      // Only a week with nothing on it can stay discarded; once a timesheet exists it shows normally.
      w.discarded = Boolean(w.status.missing && discarded.has(ws));
      if (w.discarded) w.status = { label: "Discarded", missing: true };
      out.push(w);
    }
    return out.reverse();
  }, [range, sheets.data, today, employee.date_of_joining, discarded]);
  const weeks = showDiscarded ? allWeeks : allWeeks.filter((w) => !w.discarded);
  const discardedCount = allWeeks.filter((w) => w.discarded).length;

  const counts = weeks.reduce((m, w) => ({ ...m, [w.status.label]: (m[w.status.label] || 0) + 1 }), {});
  const missing = allWeeks.filter((w) => w.status.missing && !w.discarded && weekEnd(w.ws) < today).length;

  async function discardWeek(w) {
    if (!(await confirmDialog({ title: "Discard Week", message: `Discard ${periodLabel(w.ws, " to ")}? It won't be listed as still to submit - use this for a week you weren't working. You can bring it back with Show Discarded.`, confirmLabel: "Discard" }))) return;
    const next = new Set(discarded);
    next.add(w.ws);
    saveDiscarded(next);
    setDone(`${periodLabel(w.ws, " to ")} discarded.`);
  }
  function restoreWeek(w) {
    const next = new Set(discarded);
    next.delete(w.ws);
    saveDiscarded(next);
    setDone(`${periodLabel(w.ws, " to ")} restored.`);
  }
  async function discardDraft(w) {
    if (!(await confirmDialog({ title: "Discard Draft", message: `Discard the draft for ${periodLabel(w.ws, " to ")} (${fmt(w.draft.total_hours)} h)? It's deleted and can't be recovered.`, danger: true, confirmLabel: "Discard Draft" }))) return;
    setBusy(w.draft.name);
    setErr("");
    try {
      await frappe.deleteDoc("Timesheet", w.draft.name);
      setDone(`Draft for ${periodLabel(w.ws, " to ")} discarded.`);
      sheets.reload();
    } catch (x) {
      setErr(errMsg(x, "Couldn't discard this draft."));
    }
    setBusy("");
  }

  async function download(kind) {
    setMenu(false);
    setBusy(kind);
    setErr("");
    try {
      const names = weeks.flatMap((w) => w.all.map((r) => r.name));
      const byParent = names.length ? await getEntriesBetween(range.from, range.to, names) : new Map();
      const head = ["Timesheet Period", "Date", "Day", "Project", "Job / Module", "Billing Type", "Hours", "Comments", "Line Status", "Timesheet", "Timesheet Status"];
      const lines = [];
      for (const w of [...weeks].reverse()) {
        if (!w.all.length) { lines.push([periodLabel(w.ws, " - "), "", "", "", "", "", 0, "", "", "", w.status.label]); continue; }
        for (const r of w.all) {
          for (const l of byParent.get(r.name) || []) {
            const n = parseWorkNote(l.description, { project: l.project, task: l.task });
            const day = String(l.from_time).slice(0, 10);
            lines.push([periodLabel(w.ws, " - "), dMy(day), WEEKDAYS[fromIso(day).getDay()], n.project, n.task, Number(l.is_billable) ? "Billable" : "Non-Billable", Number(l.hours) || 0, n.notes, l.custom_line_status || (r.docstatus === 1 ? "Pending" : "Draft"), r.name, r.review.label]);
          }
        }
      }
      const file = `timesheets-${employee.name}-${range.from}-to-${range.to}`;
      if (kind === "csv") saveCsv([head, ...lines].map((row) => row.map(csvCell).join(",")), `${file}.csv`);
      else {
        const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
        const html = `<html><head><meta charset="utf-8"></head><body><table border="1"><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${lines.map((row) => `<tr>${row.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
        const url = URL.createObjectURL(new Blob(["﻿", html], { type: "application/vnd.ms-excel" }));
        Object.assign(document.createElement("a"), { href: url, download: `${file}.xls` }).click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (x) {
      setErr(errMsg(x, "Couldn't prepare the download."));
    }
    setBusy("");
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-5 py-3.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-red-wash)] text-[var(--color-red-hover)]"><CalendarDays size={16} /></span><div><h2 className="text-[15px] font-semibold text-[var(--color-text)]">My Timesheet Entries</h2><p className="text-[12px] text-[var(--color-text-muted)]">Your weekly timesheets and the weeks still to fill</p></div></div>
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-44"><DateField label="From" value={draft.from} onChange={(v) => setDraft({ ...draft, from: v })} /></div>
            <div className="w-44"><DateField label="To" value={draft.to} onChange={(v) => setDraft({ ...draft, to: v })} /></div>
            <Button onClick={() => { if (draft.from && draft.to && draft.from <= draft.to) setRange(draft); else setErr("Choose a From date on or before the To date."); }} variant="secondary"><Search size={14} /> Search</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => onOpen(today)}><Plus size={14} /> New Timesheet Entry</Button>
            <div className="relative">
              <Button variant="secondary" onClick={() => setMenu(!menu)} disabled={Boolean(busy)}><Download size={14} /> {busy ? "Preparing…" : "Download"} <ChevronDown size={13} /></Button>
              {menu && (
                <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg">
                  <button type="button" onClick={() => download("csv")} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"><Download size={13} /> CSV</button>
                  <button type="button" onClick={() => download("xls")} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"><FileSpreadsheet size={13} /> Excel</button>
                </div>
              )}
            </div>
          </div>
        </div>
        {err && <Notice>{err}</Notice>}
        {done && <Notice tone="info">{done}</Notice>}
        {sheets.data && allWeeks.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            {Object.entries(counts).map(([k, n]) => <span key={k} className="inline-flex items-center gap-1.5">{["Not Started", "Not Submitted", "Discarded"].includes(k) ? <MissingPill label={k} /> : <StatusPill status={k} />} <b className="text-[var(--color-text)]">{n}</b></span>)}
            {discardedCount > 0 && <button type="button" onClick={() => setShowDiscarded(!showDiscarded)} className="text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-text)] hover:underline">{showDiscarded ? "Hide Discarded" : `Show Discarded (${discardedCount})`}</button>}
            {missing > 0 && <span className="ml-auto font-medium text-[var(--color-red-hover)]">{missing} past week{missing === 1 ? "" : "s"} still to submit</span>}
          </div>
        )}
        <Async state={sheets}>
          {() => (
            <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wide text-[var(--color-text-faint)]">
                  <tr><th className="px-4 py-2.5 font-semibold">Timesheet Period</th><th className="px-4 py-2.5 text-right font-semibold">Total Hours</th><th className="px-4 py-2.5 text-center font-semibold">Status</th><th className="w-56 px-4 py-2.5" /></tr>
                </thead>
                <tbody>
                  {weeks.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-[var(--color-text-muted)]">No weeks in this range.</td></tr>}
                  {weeks.map((w, i) => (
                    <tr key={w.ws} className={`border-t border-[var(--color-border)] ${w.discarded ? "opacity-60" : ""} ${i % 2 ? "bg-[color-mix(in_srgb,var(--color-surface-2)_50%,transparent)]" : ""}`}>
                      <td className="px-4 py-2.5"><button type="button" onClick={() => onOpen(w.ws)} className="font-medium text-[var(--color-text)] hover:text-[var(--color-red-hover)] hover:underline">{periodLabel(w.ws)}</button></td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(w.total)}</td>
                      <td className="px-4 py-2.5 text-center">{w.status.review ? <ReviewPill review={w.status.review} /> : <MissingPill label={w.status.label} />}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {w.discarded
                            ? <button type="button" onClick={() => restoreWeek(w)} className={actBtn}>Restore</button>
                            : <button type="button" onClick={() => onOpen(w.ws)} className={actBtn}>{w.status.missing ? "Fill Now" : w.draft ? "Edit" : "View"}</button>}
                          {w.status.missing && !w.discarded && <button type="button" onClick={() => discardWeek(w)} title="You weren't working this week - don't list it as still to submit" className={actDanger}>Discard</button>}
                          {w.draft && !w.submitted && <button type="button" disabled={busy === w.draft.name} onClick={() => discardDraft(w)} className={actDanger}>{busy === w.draft.name ? "Discarding…" : "Discard Draft"}</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-[var(--color-border)] px-4 py-2 text-right text-[12.5px] text-[var(--color-text-muted)]">Total {weeks.length}</div>
            </div>
          )}
        </Async>
      </div>
    </section>
  );
}

/* =============================== Timesheet (one week) =============================== */

function TimesheetSheet({ ws, sheets, onBack, onWeek }) {
  const { employee } = useEmployee();
  const { user } = useAuth();
  const navigate = useNavigate();
  const tasks = useAsync(() => getAssignedTasks(user.email), [user.email]);
  const unsaved = useRef(false);
  const [note, setNote] = useState("");
  const [viewSubmitted, setViewSubmitted] = useState(false);
  const w = weekSheets(sheets.data, ws);
  const today = isoDate();
  // A draft is edited (with a link to the submitted sheet if there's one too); otherwise the submitted one is shown.
  const shown = viewSubmitted && w.submitted ? w.submitted : w.draft || w.submitted;
  const editable = !shown || shown.docstatus === 0;
  const doc = useAsync(() => (shown ? frappe.getDoc("Timesheet", shown.name) : Promise.resolve(null)), [shown?.name, shown?.modified, shown?.docstatus]);

  // The sidebar stays clickable beside the sheet, so leaving with unsaved hours asks first.
  useEffect(() => {
    const onClick = (e) => {
      const link = e.target.closest?.("a[href]");
      if (!link || !unsaved.current || link.target === "_blank" || link.hasAttribute("download")) return;
      e.preventDefault();
      e.stopPropagation();
      confirmDialog("You have unsaved hours on your timesheet. Leave this page and discard them?").then((ok) => { if (ok) { unsaved.current = false; navigate(link.getAttribute("href")); } });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [navigate]);

  const guard = async () => !unsaved.current || confirmDialog("You have unsaved hours on this timesheet. Discard them?");
  const goWeek = async (to) => { if (await guard()) { unsaved.current = false; onWeek(to); } };
  const goBack = async () => { if (await guard()) { unsaved.current = false; onBack(); } };

  // Period choices: the last 12 weeks, this week, and any week with a timesheet.
  const periods = useMemo(() => {
    const set = new Set([ws]);
    for (let i = 0; i < 13; i += 1) set.add(addDays(weekStart(today), -7 * i));
    (sheets.data || []).forEach((r) => set.add(weekStart(r.start_date)));
    return [...set].sort().reverse();
  }, [ws, today, sheets.data]);

  const review = shown?.review;
  const statusText = !shown ? "Not Started" : review?.label || "Draft";
  const banner = !shown
    ? { tone: "info", text: `No timesheet for this week yet. Enter your hours and save a draft; you can submit from Saturday ${dMy(weekEnd(ws))}.` }
    : review?.key === "returned"
      ? { tone: "error", text: `Returned for correction${review.note ? `: ${review.note}` : ""}. Correct it and submit again.` }
      : shown.docstatus === 0
        ? { tone: "info", text: canSubmitWeek(ws, today) ? "This timesheet is a draft. Check it and submit it for approval." : `This timesheet is a draft. You can submit it from Saturday ${dMy(weekEnd(ws))}; if you don't, it's submitted automatically after the week ends.` }
        : ["approved", "finalized"].includes(review?.key)
          ? { tone: "warn", text: `This timesheet has been approved${review.key === "finalized" ? " and finalized" : ""} and is read only.` }
          : review?.key === "partial"
            ? { tone: "warn", text: "Some projects on this timesheet are approved; the rest are waiting for their approver. It's read only." }
            : { tone: "warn", text: "This timesheet is submitted and waiting for approval. It's read only." };

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-5 py-3.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-red-wash)] text-[var(--color-red-hover)]"><CalendarDays size={16} /></span><div><h2 className="text-[15px] font-semibold text-[var(--color-text)]">Timesheet</h2><p className="text-[12px] text-[var(--color-text-muted)]">Hours by project for the week, and who approves them</p></div></div>
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.4fr_1.2fr_auto]">
          <div><div className="text-[12.5px] font-semibold text-[var(--color-text)]">Name:</div><div className="mt-1 text-[14px] font-medium text-[var(--color-text)]">{employee.employee_name}</div></div>
          <div><div className="text-[12.5px] font-semibold text-[var(--color-text)]">Ecode:</div><div className="mt-1 text-[14px] font-medium text-[var(--color-text)]">{employee.employee_number || employee.name}</div></div>
          <label className="block"><span className="text-[12.5px] font-semibold text-[var(--color-text)]">Period:</span>
            <select value={ws} onChange={(e) => goWeek(e.target.value)} className="mt-1 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-[13.5px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]">
              {periods.map((p) => <option key={p} value={p}>{periodLabel(p, " To ")}</option>)}
            </select>
          </label>
          <div><span className="text-[12.5px] font-semibold text-[var(--color-text)]">Status:</span><div className="mt-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-[13.5px] text-[var(--color-text)]">{statusText}</div></div>
          <Button variant="secondary" onClick={goBack}><ArrowLeft size={14} /> My Timesheet Entries</Button>
        </div>

        <div className={`rounded-lg border px-4 py-2.5 text-[13px] ${banner.tone === "error" ? "border-[color-mix(in_srgb,var(--color-red-hover)_40%,transparent)] bg-[var(--color-red-wash)] text-[var(--color-text)]" : banner.tone === "warn" ? "border-[color-mix(in_srgb,var(--color-amber)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-amber)_14%,transparent)] text-[var(--color-text)]" : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"}`}>{banner.text}</div>
        {w.draft && w.submitted && <p className="text-[12px] text-[var(--color-text-muted)]">This week has a submitted timesheet ({w.submitted.name}) and a draft with more hours ({w.draft.name}). <button type="button" className="font-medium text-[var(--color-red-hover)] hover:underline" onClick={() => setViewSubmitted(!viewSubmitted)}>{viewSubmitted ? "Edit the draft" : "View the submitted one"}</button></p>}
        {note && <Notice tone="info">{note}</Notice>}

        {sheets.loading && !sheets.data ? <p className="py-8 text-center text-[13px] text-[var(--color-text-muted)]">Loading timesheet…</p>
          : shown && !doc.data ? (doc.error ? <Notice>{friendlyError(doc.error)}</Notice> : <p className="py-8 text-center text-[13px] text-[var(--color-text-muted)]">Loading timesheet…</p>)
            : (
              <WeeklySheet
                key={`${shown?.name || "new"}|${shown?.docstatus ?? "n"}|${doc.data?.modified || ""}`}
                employee={employee}
                tasks={tasks.data || []}
                ws={ws}
                doc={doc.data}
                sheet={shown}
                editable={editable}
                submittedName={!shown ? null : w.submitted?.name !== shown.name ? w.submitted?.name : null}
                recentNames={(sheets.data || []).slice(0, 6).map((r) => r.name)}
                unsaved={unsaved}
                onBack={goBack}
                onSaved={(name, submitted) => { setNote(submitted ? `${name} was submitted for approval.` : `${name} was saved as a draft.`); setViewSubmitted(false); sheets.reload(); }}
                onChanged={(message) => { setNote(message); sheets.reload(); }}
              />
            )}
      </div>
    </section>
  );
}

/* ---------------------------------- the sheet grid ---------------------------------- */

let rowSeq = 0;
const newRow = (r = {}) => ({ id: `r${++rowSeq}`, project: "", task: "", notes: "", billable: true, hours: {}, keep: {}, status: "", approvedBy: [], ...r });
const rowKey = (project, task) => `${String(project || "").trim().toLowerCase()}|${String(task || "").trim().toLowerCase()}`;
const KEEP_FIELDS = ["activity_type"];

/** Time logs -> rows: one per project + job, hours per day; line status and who approved it. */
function logsToRows(logs, ws) {
  const we = addDays(ws, 6);
  const rows = [];
  const outside = [];
  (logs || []).forEach((l) => {
    const date = String(l.from_time).slice(0, 10);
    if (date < ws || date > we) { outside.push(l); return; } // older entries outside the week are kept as they are
    const n = parseWorkNote(l.description, { project: l.project, task: l.task });
    let r = rows.find((x) => rowKey(x.project, x.task) === rowKey(n.project, n.task));
    if (!r) { r = newRow({ project: n.project, task: n.task, notes: n.notes, billable: false, statuses: [] }); rows.push(r); }
    else if (n.notes && !r.notes.includes(n.notes)) r.notes = [r.notes, n.notes].filter(Boolean).join("; ");
    r.hours[date] = String(roundHours((Number(r.hours[date]) || 0) + Number(l.hours || 0)));
    r.keep[date] = Object.fromEntries(KEEP_FIELDS.filter((k) => l[k] != null).map((k) => [k, l[k]]));
    if (Number(l.is_billable)) r.billable = true;
    r.statuses.push(l.custom_line_status || "");
    if (l.custom_line_approver && !r.approvedBy.includes(l.custom_line_approver)) r.approvedBy.push(l.custom_line_approver);
  });
  rows.forEach((r) => { r.status = r.statuses.length && r.statuses.every((x) => x === "Approved") ? "Approved" : r.statuses.some((x) => x === "Pending" || x === "Approved") ? "Pending" : ""; delete r.statuses; });
  return { rows, outside };
}

function WeeklySheet({ employee, tasks, ws, doc, sheet, editable, submittedName, recentNames, unsaved, onBack, onSaved, onChanged }) {
  const emp = employee.name;
  const storeKey = `ts-projects:${emp}`;
  const today = isoDate();
  const [init] = useState(() => (doc ? logsToRows(doc.time_logs, ws) : { rows: [], outside: [] }));
  const [rows, setRows] = useState(() => (init.rows.length ? init.rows : editable ? [newRow()] : []));
  const [dirty, setDirty] = useState(false);
  useEffect(() => { unsaved.current = dirty; }, [dirty, unsaved]);
  const [savedName, setSavedName] = useState(sheet?.docstatus === 0 ? sheet.name : null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const fileInput = useRef(null);
  const from = ws;
  const to = addDays(ws, 6);
  const { user } = useAuth();

  const holidays = useAsync(() => getHolidays(employee), [emp]);
  const projects = useAsync(() => getProjects(), []);
  const leave = useAsync(() => (user?.roles?.includes("Contractor") ? Promise.resolve({}) : getLeaveDays(emp, from, to)), [emp, from]);
  // Hours already logged this week on other timesheets (counted, and new entries go after them).
  const existing = useAsync(async () => {
    if (!editable) return {};
    const list = await frappe.getList("Timesheet", { filters: [["employee", "=", emp], ["docstatus", "<", 2], ["end_date", ">=", from], ["start_date", "<=", to]], fields: ["name"], limit: 0 });
    const names = list.map((s) => s.name).filter((n) => n !== savedName);
    const byParent = await getEntriesBetween(from, to, names);
    const map = {};
    byParent.forEach((logs, name) => logs.forEach((l) => {
      const day = String(l.from_time).slice(0, 10);
      const d = (map[day] = map[day] || { hours: 0, end: 0, sheets: [] });
      d.hours += Number(l.hours || 0);
      const endDay = String(l.to_time || "").slice(0, 10);
      d.end = Math.max(d.end, endDay && endDay > day ? DAY_MINUTES : l.to_time ? minutesOf(l.to_time) : minutesOf(l.from_time) + Number(l.hours || 0) * 60);
      if (!d.sheets.includes(name)) d.sheets.push(name);
    }));
    return map;
  }, [emp, from, savedName, editable]);
  const recent = useAsync(async () => {
    if (!editable || !recentNames.length) return [];
    const r = await frappe.getList("Timesheet Detail", { parent: "Timesheet", filters: [["parent", "in", recentNames]], fields: ["project", "description"], limit: 0 }).catch(() => []);
    return [...new Set(r.map((x) => parseWorkNote(x.description, { project: x.project }).project).filter(Boolean))];
  }, [recentNames.join(","), editable]);
  const assigned = useAsync(() => (editable ? getMyAssignments(employee.user_id, from, to) : Promise.resolve([])), [emp, from, editable]);
  const assignments = useMemo(() => (assigned.data || []).map(parseAssignment), [assigned.data]);
  const resolveProject = useMemo(() => projectResolver(projects.data || []), [projects.data]);
  const projectRow = (text) => (projects.data || []).find((p) => p.name === resolveProject(text));
  const projectLabel = (p) => (p.project_name && p.project_name !== p.name ? p.project_name : p.name);
  const labelOf = (id) => { const p = (projects.data || []).find((x) => x.name === id); return p ? projectLabel(p) : id; };

  // Approver of each project (hierarchy-aware) and names of the people who approved lines.
  const projectIds = [...new Set(rows.map((r) => resolveProject(r.project)).filter(Boolean))].sort();
  const approverUsers = [...new Set(rows.flatMap((r) => r.approvedBy))].sort();
  const approvers = useAsync(() => getTimesheetApprovers({ employee: emp, projects: projectIds, users: approverUsers }), [emp, projectIds.join(","), approverUsers.join(",")]);
  const nameOf = (u) => approvers.data?.names?.[u] || u;
  const approverFor = (r) => {
    if (r.approvedBy.length) return { text: r.approvedBy.map(nameOf).join(", ") };
    const a = approvers.data?.approvers?.[resolveProject(r.project) || ""];
    if (!a) return { text: approvers.loading ? "…" : "—" };
    return { text: nameOf(a.user), sub: a.covering_for ? `Covering for ${nameOf(a.covering_for)}` : a.via };
  };

  const holidayMap = useMemo(() => Object.fromEntries((holidays.data?.holidays || []).map((h) => [h.date, h])), [holidays.data]);
  const listHasWeeklyOffs = (holidays.data?.holidays || []).some((h) => h.weeklyOff);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(ws, i);
    const wd = fromIso(date).getDay();
    const h = holidayMap[date];
    const off = Boolean(h) || (!listHasWeeklyOffs && (wd === 0 || wd === 6));
    const weekend = off && (!h || h.weeklyOff);
    const lv = leave.data?.[date] || null;
    const label = weekend ? "Weekly off" : h ? h.description : lv ? (lv.half ? "Half-day leave" : "On leave") : "";
    return { date, wd, off, weekend, label, leave: lv, logged: existing.data?.[date] || null, future: date > today };
  });
  const expected = days.reduce((s, d) => s + (d.off ? 0 : d.leave ? (d.leave.half ? DAY_HOURS / 2 : 0) : DAY_HOURS), 0);
  const cell = (r, date) => Number(r.hours[date]) || 0;
  const dayTotal = (date) => rows.reduce((s, r) => s + cell(r, date), 0);
  const rowTotal = (r) => days.reduce((s, d) => s + cell(r, d.date), 0);
  const weekTotal = rows.reduce((s, r) => s + rowTotal(r), 0);
  const elsewhere = days.reduce((s, d) => s + (d.logged?.hours || 0), 0);
  const submitOpen = canSubmitWeek(ws, today);

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
  const mergeRows = (incoming, replaceHours = false) => change((v) => {
    const out = v.filter((r) => r.project || r.task || Object.values(r.hours).some((h) => Number(h) > 0));
    incoming.forEach((x) => {
      const hit = out.find((r) => rowKey(r.project, r.task) === rowKey(x.project, x.task));
      if (hit) Object.entries(x.hours || {}).forEach(([d, h]) => { if (replaceHours || !(Number(hit.hours[d]) > 0)) hit.hours[d] = h; });
      else out.push(newRow(x));
    });
    return out.length ? out.map((r) => ({ ...r, hours: { ...r.hours } })) : [newRow()];
  });

  /** Lines from the project assignments for this week, with the assigned hours per day. */
  function fillFromAssignments(auto = false) {
    if (!assignments.length) return setInfo("You have no project assignments for this week.");
    const incoming = assignments.filter((a) => a.status !== "Cancelled").map((a) => {
      const hours = {};
      days.filter((d) => !d.off && !(d.leave && !d.leave.half) && a.start <= d.date && d.date <= a.end).forEach((d) => { hours[d.date] = String(roundHours(d.leave?.half ? a.hoursPerDay / 2 : a.hoursPerDay)); });
      const p = (projects.data || []).find((x) => x.name === a.project);
      return { project: labelOf(a.project), task: a.role, notes: "", billable: p ? Boolean(p.customer) : true, hours };
    });
    remember(incoming.map((x) => x.project));
    mergeRows(incoming);
    setInfo(`${auto ? "Filled automatically" : "Filled"} from your project assignments (${incoming.length} line${incoming.length === 1 ? "" : "s"}). Check before submitting.`);
  }

  async function copyLastWeek() {
    setBusy("copy");
    setErr("");
    try {
      const pf = addDays(ws, -7);
      const pt = addDays(ws, -1);
      const list = await frappe.getList("Timesheet", { filters: [["employee", "=", emp], ["docstatus", "<", 2], ["end_date", ">=", pf], ["start_date", "<=", pt]], fields: ["name"], limit: 0 });
      const byParent = list.length ? await getEntriesBetween(pf, pt, list.map((s) => s.name)) : new Map();
      const prev = [];
      byParent.forEach((logs) => logs.forEach((l) => {
        const n = parseWorkNote(l.description, { project: l.project, task: l.task });
        if (!prev.some((x) => rowKey(x.project, x.task) === rowKey(n.project, n.task))) prev.push({ project: n.project, task: n.task, notes: "", billable: Boolean(Number(l.is_billable)), hours: {} });
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
    if (!editable || doc || !ready || autoFor.current === from) return;
    autoFor.current = from;
    const empty = !rows.some((r) => Object.values(r.hours).some((h) => Number(h) > 0));
    if (assignments.length && empty && !elsewhere) {
      fillFromAssignments(true);
      setDirty(false);
    }
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
      entries.forEach((x) => {
        if (x.date < from || x.date > to) { other += 1; return; }
        let r = incoming.find((y) => rowKey(y.project, y.task) === rowKey(x.project, x.task));
        if (!r) { r = { project: x.project, task: x.task, notes: x.notes || "", hours: {} }; incoming.push(r); }
        r.hours[x.date] = String(roundHours((Number(r.hours[x.date]) || 0) + Number(x.hours)));
      });
      remember(incoming.map((x) => x.project));
      mergeRows(incoming, true);
      const used = incoming.reduce((s, r) => s + Object.keys(r.hours).length, 0);
      setErr("");
      setInfo([`Imported ${used} entr${used === 1 ? "y" : "ies"} for ${periodLabel(ws, " to ")}`, other && `${other} from other weeks skipped`, invalid && `${invalid} row(s) without a valid date/hours skipped`, order === "mdy" ? "dates read as month/day (US format)" : ambiguous ? "dates read as day/month" : null].filter(Boolean).join("; ") + ".");
    };
    reader.readAsText(file);
  }

  /** Rows -> ERPNext time_logs (slotted one after another each day, after hours logged elsewhere). */
  function buildLogs() {
    const logs = [];
    const onLeave = [];
    for (const r of rows) {
      const any = Object.values(r.hours).some((h) => Number(h) > 0);
      if (any && !String(r.project || "").trim()) return { error: "Choose a project on every line that has hours." };
      if (Object.values(r.hours).some((h) => Number(h) < 0)) return { error: "Hours can't be negative." };
    }
    for (const d of days) {
      const entries = rows.filter((r) => roundHours(r.hours[d.date]) > 0);
      if (!entries.length) continue;
      const total = entries.reduce((s, r) => s + roundHours(r.hours[d.date]), 0);
      if (total + (d.logged?.hours || 0) > 24) return { error: `${dmy(d.date)} would have more than 24 hours${d.logged ? ` (${fmt(d.logged.hours)} h already in ${d.logged.sheets.join(", ")})` : ""}.` };
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
          is_billable: r.billable ? 1 : 0,
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
    if (!built.logs.length) return setErr("Enter hours for at least one day.");
    if (built.onLeave.length && !(await confirmDialog(`You entered hours on leave day(s): ${built.onLeave.join(", ")}. Save anyway?`))) return;
    if (submit && !submitOpen) return setErr(`You can submit this week from Saturday ${dMy(weekEnd(ws))}. Until then, save it as a draft.`);
    if (submit && !(await confirmDialog(`Submit the week ${periodLabel(ws, " to ")} (${fmt(weekTotal)} h of ${fmt(expected)} h expected) for approval? You won't be able to edit it unless it's returned to you.`))) return;
    if (!submit && !(await confirmDialog(`Save the week ${periodLabel(ws, " to ")} as a draft (${fmt(weekTotal)} h)? You can still edit it before submitting.`))) return;
    remember(rows.map((r) => r.project.trim()));
    setBusy(submit ? "submit" : "draft");
    let name = savedName;
    try {
      const timeLogs = await withActivityType([...init.outside, ...built.logs]);
      if (name) await frappe.updateDoc("Timesheet", name, { time_logs: timeLogs });
      else { name = (await frappe.createDoc("Timesheet", { employee: emp, company: employee.company, time_logs: timeLogs })).name; setSavedName(name); }
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
        setBusy("");
        onChanged(`Saved as draft ${name}, but it couldn't be submitted: ${errMsg(x, "unknown error")} Fix the problem and press Submit again - the same draft is updated, not duplicated.`);
        return;
      }
    }
    setBusy("");
    onSaved(name, submit);
  }

  async function deleteDraft() {
    if (!savedName || !(await confirmDialog({ title: "Delete Draft", message: `Delete draft ${savedName}? This can't be undone.`, danger: true, confirmLabel: "Delete" }))) return;
    setBusy("delete");
    try {
      await frappe.deleteDoc("Timesheet", savedName);
      unsaved.current = false;
      onChanged(`Draft ${savedName} deleted.`);
    } catch (x) {
      setErr(errMsg(x, "Couldn't delete this draft."));
    }
    setBusy("");
  }

  const known = [...new Set([...readList(storeKey), ...(recent.data || []), ...(projects.data || []).map(projectLabel)])];
  const waiting = editable && existing.loading && !existing.data;
  const returned = sheet?.review?.key === "returned";
  const remark = sheet?.review?.note || "";
  const lineStatus = (r) => (!sheet || sheet.docstatus === 0 ? (returned ? "Returned" : sheet ? "Draft" : "New") : r.status === "Approved" ? "Approved" : "Pending Approval");
  const approverStatus = (r) => (!sheet || sheet.docstatus === 0 ? (returned ? "Returned" : "—") : r.status === "Approved" ? "Approved" : "Pending");
  const inp = "w-full rounded border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-[12.5px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]";
  const th = "border-r border-[var(--color-border)] px-2 py-2 text-[11px] font-semibold uppercase tracking-wide";
  const td = "border-r border-[var(--color-border)] px-2 py-2 align-middle";

  return (
    <div className="space-y-3">
      {submittedName && editable && <Notice tone="info">{submittedName} is already submitted for this week. Hours entered here go on a separate draft.</Notice>}
      {editable && init.outside.length > 0 && <Notice tone="info">This draft also has {init.outside.length} entr{init.outside.length === 1 ? "y" : "ies"} outside this week; they are kept unchanged.</Notice>}
      {existing.error && <Notice>Couldn't check the hours you've already logged this week ({friendlyError(existing.error)}). Saving may fail if days overlap with another timesheet.</Notice>}

      <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
        {/* toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {editable ? (
              <>
                <Button type="button" variant="secondary" className="!px-2.5 !py-1 text-[12px]" onClick={() => change((v) => [...v, newRow()])}><Plus size={13} /> Add Line</Button>
                <Button type="button" variant="secondary" className="!px-2.5 !py-1 text-[12px]" onClick={() => fillFromAssignments(false)} disabled={waiting || !assignments.length} title="Lines and hours from the projects you're assigned to"><Wand2 size={13} /> From My Assignments ({assignments.length})</Button>
                <Button type="button" variant="secondary" className="!px-2.5 !py-1 text-[12px]" onClick={copyLastWeek} disabled={Boolean(busy) || waiting}><Copy size={13} /> {busy === "copy" ? "Copying…" : "Copy Last Week"}</Button>
                <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv} />
                <Button type="button" variant="ghost" className="!px-2.5 !py-1 text-[12px]" onClick={() => fileInput.current?.click()}><Upload size={13} /> Import CSV</Button>
              </>
            ) : <span className="text-[12px] text-[var(--color-text-muted)]">{sheet?.name}</span>}
          </div>
          <div className="flex items-center gap-3 text-[12px] text-[var(--color-text-muted)]">
            <span>Week <b className="text-[13px] text-[var(--color-text)]">{fmt(weekTotal + elsewhere)}</b> / {fmt(expected)} h{elsewhere ? ` (incl. ${fmt(elsewhere)} h elsewhere)` : ""}</span>
            {editable && <button type="button" onClick={async () => { if (!dirty || (await confirmDialog("Undo all your changes to this week?"))) { setRows(init.rows.length ? init.rows.map((r) => ({ ...r, hours: { ...r.hours } })) : [newRow()]); setDirty(false); setInfo(""); } }} className="flex items-center gap-1 hover:text-[var(--color-text)]"><RotateCcw size={13} /> Reset</button>}
          </div>
        </div>

        <datalist id="ts-known-projects">{known.map((p) => <option key={p} value={p} />)}</datalist>
        <datalist id="ts-tasks">{tasks.map((t) => <option key={t.name} value={t.subject}>{t.project || ""}</option>)}</datalist>

        <div className="overflow-x-auto">
          {waiting ? <p className="p-4 text-[13px] text-[var(--color-text-muted)]">Checking what you've already logged…</p> : (
            <table className="w-full min-w-[1500px] border-collapse text-[12.5px]">
              <thead className="text-[var(--color-text-muted)]">
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
                  <th className={th} colSpan={4}>Date</th>
                  {days.map((d) => <th key={d.date} className={`${th} w-[68px] min-w-[68px] text-center normal-case ${d.date === today ? "bg-[var(--color-red-wash)] text-[var(--color-red-hover)]" : ""}`}>{pad(fromIso(d.date).getDate())}</th>)}
                  <th className={th} colSpan={editable ? 7 : 6} />
                </tr>
                <tr className="border-b border-[var(--color-border-strong)] bg-[var(--color-surface-2)]">
                  <th className={`${th} min-w-[180px] text-left`}>Project Name</th>
                  <th className={`${th} min-w-[150px] text-left`}>Customer Name</th>
                  <th className={`${th} min-w-[110px] text-left`}>Billing Type</th>
                  <th className={`${th} min-w-[150px] text-left`}>Job/Module</th>
                  {days.map((d) => <th key={d.date} title={d.label || undefined} className={`${th} w-[68px] min-w-[68px] text-center normal-case ${d.date === today ? "bg-[var(--color-red-wash)] text-[var(--color-red-hover)]" : ""}`}>{WEEKDAYS[d.wd]}</th>)}
                  <th className={`${th} w-[64px] text-right`}>Total</th>
                  <th className={`${th} min-w-[170px] text-left`}>Comments</th>
                  <th className={`${th} min-w-[110px] text-left`}>Status</th>
                  <th className={`${th} min-w-[140px] text-left`}>TS Approver</th>
                  <th className={`${th} min-w-[90px] text-left`}>TS Approver Status</th>
                  <th className={`${th} min-w-[150px] text-left`}>TS Approver Revise Remark</th>
                  {editable && <th className={`${th} w-[44px]`} />}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={18} className="px-3 py-6 text-center text-[var(--color-text-muted)]">No hours on this timesheet.</td></tr>}
                {rows.map((r) => {
                  const p = projectRow(r.project);
                  const ap = approverFor(r);
                  return (
                    <tr key={r.id} className="border-t border-[var(--color-border)] hover:bg-[color-mix(in_srgb,var(--color-surface-2)_60%,transparent)]">
                      <td className={td}>{editable ? <><input list="ts-known-projects" value={r.project} onChange={(e) => { const np = projectRow(e.target.value); patchRow(r.id, { project: e.target.value, ...(np ? { billable: Boolean(np.customer) } : {}) }); }} placeholder="Project" className={inp} />{r.project && projects.data && !p && <span className="block text-[10px] text-[var(--color-amber)]">Not in the project list</span>}</> : <span className="block max-w-[220px] truncate" title={r.project}>{p ? projectLabel(p) : r.project || "—"}</span>}</td>
                      <td className={td}><span className="block max-w-[180px] truncate" title={p?.customer || ""}>{p?.customer || "—"}</span></td>
                      <td className={td}>{editable ? <select value={r.billable ? "1" : "0"} onChange={(e) => patchRow(r.id, { billable: e.target.value === "1" })} className={inp}><option value="1">Billable</option><option value="0">Non-Billable</option></select> : r.billable ? "Billable" : "Non-Billable"}</td>
                      <td className={td}>{editable ? <input list="ts-tasks" value={r.task} onChange={(e) => patchRow(r.id, { task: e.target.value })} placeholder="Job / module" className={inp} /> : <span className="block max-w-[180px] truncate" title={r.task}>{r.task || "—"}</span>}</td>
                      {days.map((d) => {
                        const grey = d.off || (d.leave && !d.leave.half);
                        return (
                          <td key={d.date} className={`${td} text-center ${grey ? "bg-[var(--color-surface-2)]" : ""}`} title={d.label || undefined}>
                            {editable
                              ? <input type="number" min="0" max="24" step="0.25" inputMode="decimal" value={r.hours[d.date] ?? ""} onChange={(e) => setHours(r.id, d.date, e.target.value)} aria-label={`${r.project || "Line"} ${dmy(d.date)}`} className="w-full rounded border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-1 py-1.5 text-center text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                              : <span className="tabular-nums">{cell(r, d.date) ? fmt(cell(r, d.date)) : ""}</span>}
                          </td>
                        );
                      })}
                      <td className={`${td} text-right font-semibold tabular-nums`}>{fmt(rowTotal(r))}</td>
                      <td className={td}>{editable ? <input value={r.notes} onChange={(e) => patchRow(r.id, { notes: e.target.value })} placeholder="What you worked on" className={inp} /> : <span className="block max-w-[220px] truncate" title={r.notes}>{r.notes}</span>}</td>
                      <td className={td}><StatusPill status={lineStatus(r)} /></td>
                      <td className={td}><span className="block">{ap.text}</span>{ap.sub && <span className="block text-[10.5px] text-[var(--color-text-faint)]">{ap.sub}</span>}</td>
                      <td className={td}>{approverStatus(r)}</td>
                      <td className={td}><span className="block max-w-[200px] text-[12px] text-[var(--color-text-muted)]">{returned ? remark : ""}</span></td>
                      {editable && <td className="px-1 py-2 text-center"><button type="button" title="Remove line" onClick={() => removeRow(r.id)} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:!text-[var(--color-red-hover)]"><X size={14} /></button></td>}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--color-border-strong)] bg-[var(--color-surface-2)] font-semibold text-[var(--color-text)]">
                  <td className="px-2 py-2.5 text-center" colSpan={4}>Total</td>
                  {days.map((d) => {
                    const t = dayTotal(d.date) + (editable ? d.logged?.hours || 0 : 0);
                    const target = d.off ? 0 : d.leave ? (d.leave.half ? DAY_HOURS / 2 : 0) : DAY_HOURS;
                    return <td key={d.date} className={`px-2 py-2.5 text-center tabular-nums ${editable && !d.future && target > 0 && t < target ? "text-[var(--color-amber)]" : ""}`} title={target ? `Expected ${target} h` : d.label || undefined}>{fmt(t)}</td>;
                  })}
                  <td className="px-2 py-2.5 text-right tabular-nums">{fmt(weekTotal + (editable ? elsewhere : 0))}</td>
                  <td colSpan={editable ? 7 : 6} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-3 py-2 text-[12px] text-[var(--color-text-muted)]">
          <span>{rows.length} line{rows.length === 1 ? "" : "s"}{editable ? " · amber totals are past working days under 8 h · shaded days are weekly offs, holidays or leave" : ""}</span>
          <span>Total {rows.length}</span>
        </div>
      </div>

      {editable && assignments.length > 0 && <p className="text-[11.5px] text-[var(--color-text-muted)]">Assigned this week: {assignments.map((a) => `${labelOf(a.project)} as ${a.role} (${a.hoursPerDay} h/day, ETA ${dmy(a.eta)})`).join(" · ")}</p>}
      {info && <Notice tone="info">{info}</Notice>}
      {err && <Notice>{err}</Notice>}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {editable && savedName && <Button type="button" variant="ghost" disabled={Boolean(busy)} onClick={deleteDraft}><Trash2 size={14} /> {busy === "delete" ? "Deleting…" : "Delete Draft"}</Button>}
        <Button type="button" variant="secondary" onClick={onBack}>{editable ? "Cancel" : "Back"}</Button>
        {editable && <Button type="button" variant="secondary" disabled={Boolean(busy) || waiting} onClick={() => save(false)}><CalendarDays size={14} /> {busy === "draft" ? "Saving…" : "Save Draft"}</Button>}
        {editable && <Button type="button" disabled={Boolean(busy) || waiting || !submitOpen} title={submitOpen ? undefined : `Opens on Saturday ${dMy(weekEnd(ws))}`} onClick={() => save(true)}><Send size={14} /> {busy === "submit" ? "Submitting…" : "Submit"}</Button>}
      </div>
    </div>
  );
}
