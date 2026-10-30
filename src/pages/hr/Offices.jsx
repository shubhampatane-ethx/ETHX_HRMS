import { useMemo, useState } from "react";
import { CalendarDays, CalendarPlus, MapPin, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Async, Empty, Field, inputCls, Modal, Notice, PageHeader, StatusPill } from "../../components/employee/EmployeeShell";
import { Button, LinkField } from "../../components/ui/primitives";
import { dmy, errMsg, useAsync } from "../../lib/employeePortal";
import { frappe } from "../../lib/api/frappeClient";
import { fieldsReady } from "../../lib/siteSetup";
import { applyToEmployees, createHolidayList, getHolidayList, loadOffices, saveHolidays, setCurrentList, weeklyOffsOf, WEEKDAYS } from "../../lib/offices";
import { confirmDialog } from "../../components/ui/dialogs";

const thisYear = new Date().getFullYear();
const yearOf = (l) => Number(String(l?.from_date || "").slice(0, 4)) || null;

export default function Offices() {
  const data = useAsync(async () => ({ ...(await loadOffices()), ready: await fieldsReady("Branch", "custom_holiday_list") }), []);
  const [modal, setModal] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const done = (text) => { setModal(null); setMessage(text); setError(""); data.reload(); };

  async function sync(office, list, employees) {
    const n = employees.filter((e) => e.branch === office.name && e.holiday_list !== list).length;
    if (!(await confirmDialog(`Set ${list} as the holiday list for ${n} employee(s) in ${office.name}?`))) return;
    try {
      await applyToEmployees(office.name, list, employees);
      done(`${n} employee(s) in ${office.name} now use ${list}.`);
    } catch (e) {
      setError(errMsg(e, "Couldn't update the employees."));
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={MapPin} title="Office Locations" subtitle="Each office has its own holiday list - employees follow the holidays of the office they work at" actions={
        <Button type="button" onClick={() => setModal({ kind: "office" })} disabled={!data.data}><Plus size={14} /> Add office</Button>
      } />
      {data.data && !data.data.ready && (
        <Notice tone="info">Ask the Administrator to run <b>Admin › ERPNext Setup › Run setup</b> once (module "Office locations &amp; holidays"). It adds the office fields and the rules that keep each employee on their office's holiday list.</Notice>
      )}
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="info">{message}</Notice>}

      <Async state={data}>
        {({ branches, lists, employees }) => branches.length === 0 ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><Empty icon={MapPin} text="No offices yet. Add your first office (e.g. Pune) to create its holiday list." /></div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {branches.map((b) => {
              const own = lists.filter((l) => l.custom_branch === b.name).sort((x, y) => String(y.from_date).localeCompare(String(x.from_date)));
              const current = lists.find((l) => l.name === b.custom_holiday_list);
              const people = employees.filter((e) => e.branch === b.name);
              const behind = current ? people.filter((e) => e.holiday_list !== current.name).length : 0;
              const nextYear = Math.max(thisYear, ...own.map(yearOf).filter(Boolean)) + (own.some((l) => yearOf(l) >= thisYear) ? 1 : 0);
              return (
                <section key={b.name} className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-red-wash)] text-[var(--color-red-hover)]"><MapPin size={18} /></span>
                      <div>
                        <h2 className="text-[15px] font-semibold text-[var(--color-text)]">{b.name}</h2>
                        <p className="text-[12px] text-[var(--color-text-muted)]">{[b.custom_city, b.custom_country].filter(Boolean).join(", ") || "Location not set"}</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setModal({ kind: "office", office: b })} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]" title="Edit office" aria-label={`Edit ${b.name}`}><Pencil size={14} /></button>
                  </div>
                  <dl className="mt-4 space-y-2 text-[12.5px]">
                    <div className="flex justify-between gap-3"><dt className="text-[var(--color-text-muted)]">Weekly off</dt><dd className="text-right text-[var(--color-text)]">{weeklyOffsOf(b).join(", ") || "None"}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-[var(--color-text-muted)]">Holiday list</dt><dd className="text-right text-[var(--color-text)]">{current ? `${current.name} · ${current.total_holidays ?? "?"} days` : <span className="text-[var(--color-red-hover)]">Not set</span>}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-[var(--color-text-muted)]">Employees</dt><dd className="text-right text-[var(--color-text)]">{people.length}{behind ? <span className="text-[var(--color-amber)]"> · {behind} on another list</span> : ""}</dd></div>
                  </dl>
                  {own.length > 1 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">{own.map((l) => <button key={l.name} type="button" onClick={() => setModal({ kind: "holidays", office: b, list: l.name })} className="rounded-md border border-[var(--color-border)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)] hover:border-[var(--color-red)]">{yearOf(l) || l.name}{l.name === b.custom_holiday_list ? " · current" : ""}</button>)}</div>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    {current && <Button type="button" variant="secondary" onClick={() => setModal({ kind: "holidays", office: b, list: current.name })}><CalendarDays size={14} /> Holidays</Button>}
                    <Button type="button" variant="secondary" onClick={() => setModal({ kind: "year", office: b, year: current ? nextYear : thisYear })}><CalendarPlus size={14} /> {current ? `${nextYear} list` : "Create holiday list"}</Button>
                    {current && behind > 0 && <Button type="button" variant="ghost" onClick={() => sync(b, current.name, employees)}><Users size={14} /> Apply to {behind}</Button>}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </Async>

      {modal?.kind === "office" && data.data && <OfficeModal office={modal.office} countries={data.data.countries} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === "year" && data.data && <YearModal office={modal.office} year={modal.year} countries={data.data.countries} lists={data.data.lists} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === "holidays" && data.data && <HolidaysModal office={modal.office} listName={modal.list} lists={data.data.lists} onClose={() => setModal(null)} onSwitch={(l) => setModal({ ...modal, list: l })} onDone={done} />}
    </div>
  );
}

function WeekdayPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEKDAYS.map((d) => (
        <label key={d} className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] ${value.includes(d) ? "border-[var(--color-red)] bg-[var(--color-red-wash)] text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-text-muted)]"}`}>
          <input type="checkbox" className="sr-only" aria-label={d} checked={value.includes(d)} onChange={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : WEEKDAYS.filter((x) => x === d || value.includes(x)))} />
          {d.slice(0, 3)}
        </label>
      ))}
    </div>
  );
}

const codeOf = (countries, name) => (countries.find((c) => c.name === name)?.code || "").toUpperCase();

/** Add or edit an office. A new office also gets this year's holiday list. */
function OfficeModal({ office, countries, onClose, onDone }) {
  const editing = Boolean(office);
  const [f, setF] = useState({
    name: office?.name || "", city: office?.custom_city || "", country: office?.custom_country || "", region: office?.custom_region_code || "",
    weekly: office ? weeklyOffsOf(office) : ["Saturday", "Sunday"], address: office?.custom_address || "", year: thisYear, publicHolidays: true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const fields = { custom_city: f.city, custom_country: f.country || null, custom_region_code: f.region, custom_weekly_offs: f.weekly.join(","), custom_address: f.address };
    try {
      if (editing) {
        await frappe.updateDoc("Branch", office.name, fields);
        onDone(`${office.name} updated. Weekly offs apply to holiday lists created from now on.`);
        return;
      }
      const name = f.name.trim();
      await frappe.createDoc("Branch", { branch: name, ...fields });
      const r = await createHolidayList(name, { year: Number(f.year), weeklyOffs: f.weekly, countryCode: codeOf(countries, f.country), regionCode: f.region, publicHolidays: f.publicHolidays });
      await setCurrentList(name, r.name);
      onDone(`${name} added with holiday list ${r.name}${r.publicHolidays ? ` (${r.publicHolidays} public holidays)` : ""}. ${r.note} Set "Office location" on each employee to put them on it.`);
    } catch (x) {
      setErr(errMsg(x, "ERPNext refused the office."));
      setBusy(false);
    }
  }

  return (
    <Modal title={editing ? `Edit ${office.name}` : "Add office"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {!editing && <Field label="Office name" hint="Shown to employees, e.g. Pune, Tokyo, New York"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="City"><input className={inputCls} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
          <LinkField label="Country" linkDoctype="Country" value={f.country} onChange={(v) => setF({ ...f, country: v })} required frappe={frappe} />
        </div>
        <Field label="State / region code (optional)" hint="Adds regional public holidays too, e.g. MH for Maharashtra, CA for California"><input className={inputCls} value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} /></Field>
        <Field label="Weekly off"><WeekdayPicker value={f.weekly} onChange={(weekly) => setF({ ...f, weekly })} /></Field>
        <Field label="Address (optional)"><textarea rows={2} className={inputCls} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        {!editing && (
          <div className="grid grid-cols-2 items-end gap-3 rounded-lg border border-[var(--color-border)] p-3">
            <Field label="Holiday list for year"><input className={inputCls} type="number" min="2000" max="2100" value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} required /></Field>
            <label className="flex items-center gap-2 pb-2 text-[12.5px] text-[var(--color-text)]"><input type="checkbox" checked={f.publicHolidays} onChange={(e) => setF({ ...f, publicHolidays: e.target.checked })} /> Add the country's public holidays</label>
          </div>
        )}
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Save office" : "Add office"}</Button></div>
      </form>
    </Modal>
  );
}

/** Next (or any) year's holiday list for an office, built from its weekly offs and country. */
function YearModal({ office, year: suggested, countries, lists, onClose, onDone }) {
  const [year, setYear] = useState(suggested);
  const [publicHolidays, setPublicHolidays] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const taken = lists.some((l) => l.name === `${office.name} ${year}`);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await createHolidayList(office.name, { year: Number(year), weeklyOffs: weeklyOffsOf(office), countryCode: codeOf(countries, office.custom_country), regionCode: office.custom_region_code, publicHolidays });
      const current = lists.find((l) => l.name === office.custom_holiday_list);
      // It becomes current now if the office has none or the current one has ended; otherwise the daily rule switches on 1 January.
      const makeCurrent = !current || String(current.to_date) < `${new Date().toISOString().slice(0, 10)}` || Number(year) === thisYear;
      if (makeCurrent) await setCurrentList(office.name, r.name);
      onDone(`${r.name} created${r.publicHolidays ? ` with ${r.publicHolidays} public holidays` : ""}. ${makeCurrent ? `It is now ${office.name}'s holiday list.` : `${office.name} switches to it automatically on 1 January ${year}.`} ${r.note}`);
    } catch (x) {
      setErr(errMsg(x, "ERPNext refused the holiday list."));
      setBusy(false);
    }
  }

  return (
    <Modal title={`Holiday List · ${office.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[12px] text-[var(--color-text-muted)]">Weekly off: {weeklyOffsOf(office).join(", ") || "none"} · Country: {office.custom_country || "not set"}{office.custom_region_code ? ` (${office.custom_region_code})` : ""}. Change these with the edit button on the office.</p>
        <Field label="Year"><input className={inputCls} type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(e.target.value)} required /></Field>
        <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-text)]"><input type="checkbox" checked={publicHolidays} onChange={(e) => setPublicHolidays(e.target.checked)} /> Add {office.custom_country || "the country"}'s public holidays</label>
        {taken && <Notice>{office.name} {year} already exists - open it under Holidays.</Notice>}
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || taken}>{busy ? "Creating…" : `Create ${office.name} ${year}`}</Button></div>
      </form>
    </Modal>
  );
}

/** See and edit one year's holidays; the office's other years are one click away. */
function HolidaysModal({ office, listName, lists, onClose, onSwitch, onDone }) {
  const doc = useAsync(() => getHolidayList(listName), [listName]);
  const [rows, setRows] = useState(null);
  const [showWeekly, setShowWeekly] = useState(false);
  const [add, setAdd] = useState({ date: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const own = lists.filter((l) => l.custom_branch === office.name).sort((a, b) => String(a.from_date).localeCompare(String(b.from_date)));
  const list = rows || (doc.data?.holidays || []).map((h) => ({ holiday_date: h.holiday_date, description: h.description, weekly_off: Boolean(Number(h.weekly_off)) }));
  const shown = useMemo(() => list.filter((h) => showWeekly || !h.weekly_off), [list, showWeekly]);
  const dirty = rows !== null;
  const strip = (s) => String(s || "").replace(/<[^>]+>/g, "");

  function addHoliday(e) {
    e.preventDefault();
    setErr("");
    const d = doc.data;
    if (add.date < d.from_date || add.date > d.to_date) return setErr(`The date must be within ${dmy(d.from_date)} – ${dmy(d.to_date)}.`);
    if (list.some((h) => h.holiday_date === add.date && !h.weekly_off)) return setErr("There is already a holiday on that date.");
    setRows([...list.filter((h) => h.holiday_date !== add.date), { holiday_date: add.date, description: add.description.trim(), weekly_off: false }]);
    setAdd({ date: "", description: "" });
  }

  async function save() {
    if (!(await confirmDialog(`Save the holidays of ${listName}? Leave and attendance for ${office.name} use this list.`))) return;
    setBusy(true);
    setErr("");
    try {
      await saveHolidays(listName, list);
      onDone(`${listName} saved.`);
    } catch (x) {
      setErr(errMsg(x, "ERPNext refused the change."));
      setBusy(false);
    }
  }

  return (
    <Modal title={`Holidays · ${listName}`} onClose={async () => { if (!dirty || (await confirmDialog("Close without saving your changes?"))) onClose(); }} wide>
      <Async state={doc}>
        {(d) => (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">{own.map((l) => <button key={l.name} type="button" disabled={dirty} onClick={() => onSwitch(l.name)} className={`rounded-md border px-2 py-0.5 text-[12px] disabled:opacity-50 ${l.name === listName ? "border-[var(--color-red)] bg-[var(--color-red-wash)] text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-text-muted)]"}`}>{yearOf(l) || l.name}</button>)}</div>
              <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={showWeekly} onChange={(e) => setShowWeekly(e.target.checked)} /> Show weekly offs</label>
            </div>
            <p className="text-[12px] text-[var(--color-text-muted)]">{dmy(d.from_date)} – {dmy(d.to_date)} · {list.filter((h) => !h.weekly_off).length} holidays + {list.filter((h) => h.weekly_off).length} weekly offs</p>
            <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-[var(--color-border)]">
              {shown.length === 0 ? <Empty text="No holidays yet - add them below." /> : (
                <table className="w-full text-left text-[12.5px]">
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {shown.map((h) => (
                      <tr key={`${h.holiday_date}-${h.weekly_off}`}>
                        <td className="w-32 px-3 py-2 text-[var(--color-text)]">{dmy(h.holiday_date)}</td>
                        <td className="w-24 px-3 py-2 text-[var(--color-text-muted)]">{new Date(`${h.holiday_date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" })}</td>
                        <td className="px-3 py-2 text-[var(--color-text)]">{strip(h.description) || "—"}</td>
                        <td className="w-24 px-3 py-2">{h.weekly_off ? <StatusPill status="Weekly off" /> : null}</td>
                        <td className="w-10 px-3 py-2 text-right">{!h.weekly_off && <button type="button" title="Remove" aria-label={`Remove ${strip(h.description)}`} onClick={() => setRows(list.filter((x) => x !== h))} className="text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><Trash2 size={13} /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {/* Adding only changes the list on screen; "Save holidays" asks before anything is saved. */}
            <form data-no-preview onSubmit={addHoliday} className="flex flex-wrap items-end gap-2">
              <div className="w-40"><Field label="Date"><input className={inputCls} type="date" min={d.from_date} max={d.to_date} value={add.date} onChange={(e) => setAdd({ ...add, date: e.target.value })} required /></Field></div>
              <div className="min-w-48 flex-1"><Field label="Holiday"><input className={inputCls} value={add.description} onChange={(e) => setAdd({ ...add, description: e.target.value })} placeholder="e.g. Diwali" required /></Field></div>
              <Button type="submit" variant="secondary"><Plus size={14} /> Add</Button>
            </form>
            {err && <Notice>{err}</Notice>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>{dirty ? "Discard" : "Close"}</Button>
              <Button type="button" onClick={save} disabled={busy || !dirty}>{busy ? "Saving…" : "Save holidays"}</Button>
            </div>
          </div>
        )}
      </Async>
    </Modal>
  );
}
