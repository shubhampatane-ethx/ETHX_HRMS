import { useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Download, ExternalLink, FileSpreadsheet, Laptop, Loader2, Plus, Search, Upload, XCircle } from "lucide-react";
import { Async, chipCls, Empty, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, StatusPill, Tabs } from "../../components/employee/EmployeeShell";
import { Button } from "../../components/ui/primitives";
import { ASSET_FOLDER, dmy, ensureAssetFolder, errMsg, getAssetLists, isoDate, useAsync } from "../../lib/employeePortal";
import { frappe } from "../../lib/api/frappeClient";
import { fieldsReady } from "../../lib/siteSetup";
import { addAsset, applyRegister, loadAssets, loadEmployees, norm, planRegister, readRegister, reassignAsset } from "../../lib/assetRegister";
import { confirmDialog } from "../../components/ui/dialogs";

// Same columns as the company's Excel register, so HR can keep maintaining it in Excel and re-upload it. The
// "Example" row shows the format and is skipped on import (any row whose first cell starts with "Example").
const TEMPLATE = [
  "S/N,Emp. Code,Employee Name,Asset Name,Asset Type,Manufacturer Serial Number,Asset Code,Asset Assigned on <Date>,Asset Assigned By <Name>,Asset Approved by <Name>,DoE / Terminated,Asset Submission on (DD-MMM-YY),Revoked all access On <Date>,Revoked all access By <Name>,Other Assets Assigned,Current Status,Location",
  'Example (delete this row),EMP-0001,Asha Rao,Dell Latitude 5420,Laptop,5CG1234XYZ,ESPL-LAP-001,01-Nov-26,HR,Manager,,,,,"Charger, Mouse",Working,Office',
].join("\r\n") + "\r\n";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "assigned", label: "Assigned" },
  { id: "office", label: "In Office" },
  { id: "returned", label: "Returned" },
];

export default function Assets() {
  const data = useAsync(async () => {
    const [assets, employees, ready] = await Promise.all([loadAssets(), loadEmployees(), fieldsReady("Asset", "custom_register_key")]);
    return { assets, employees, ready };
  }, []);
  const files = useAsync(getAssetLists, []);
  const fileRef = useRef(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [importing, setImporting] = useState(null); // { file, reg }
  const [reading, setReading] = useState(false);
  const [moving, setMoving] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const employees = data.data?.employees || [];
  const empName = useMemo(() => Object.fromEntries(employees.map((e) => [e.name, e.employee_name])), [employees]);

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "asset-register-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function pick(file) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setError("");
    setMessage("");
    if (!/\.(xlsx|csv)$/i.test(file.name)) return setError("Choose the register as an Excel (.xlsx) or CSV file. Older .xls files: open in Excel and save as .xlsx.");
    setReading(true);
    try {
      const reg = await readRegister(file);
      if (!reg.rows.length) {
        setError(reg.sheets.length
          ? `${file.name} has the header row but no assets under it. Add one row per asset below the header (the template's "Example" row is ignored), save, and import again.`
          : `No asset list found in ${file.name}. The first rows need a header with at least three columns such as "Employee Name", "Asset Type", "Asset Code", "Asset Name" or "Manufacturer Serial Number".${reg.headings?.[0] ? ` The file starts with: ${reg.headings[0]}.` : ""} Download the Register Template to see the expected columns.`);
      }
      else setImporting({ file, reg });
    } catch (e) {
      setError(`Couldn't read ${file.name}: ${e?.message || e}`);
    } finally {
      setReading(false);
    }
  }

  const counts = (assets) => ({
    all: assets.length,
    assigned: assets.filter((a) => a.custodian).length,
    office: assets.filter((a) => !a.custodian && !a.custom_returned_on).length,
    returned: assets.filter((a) => !a.custodian && a.custom_returned_on).length,
  });
  const shown = (assets) => assets
    .filter((a) => filter === "all" || (filter === "assigned" ? a.custodian : filter === "office" ? !a.custodian && !a.custom_returned_on : !a.custodian && a.custom_returned_on))
    .filter((a) => !q || `${a.custom_asset_code} ${a.asset_name} ${a.custom_serial_number} ${empName[a.custodian] || ""} ${a.custodian || ""} ${a.asset_category} ${a.location}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5">
      <PageHeader icon={Laptop} title="Asset Management" subtitle="The company asset register - each employee sees only the assets assigned to them" actions={
        <>
          <Button type="button" variant="secondary" onClick={downloadTemplate}><Download size={14} /> Register Template</Button>
          <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} disabled={reading || !data.data}>
            {reading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {reading ? "Reading…" : "Import Register"}
          </Button>
          <Button type="button" onClick={() => { setError(""); setMessage(""); setAdding(true); }} disabled={!data.data}><Plus size={14} /> Add Asset</Button>
        </>
      } />
      {data.data && !data.data.ready && (
        <Notice tone="info">It's set up automatically the next time the Administrator signs in. The setup adds the register fields (asset code, serial number, assigned by…) and the rule that employees see only their own assets.</Notice>
      )}
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="info">{message}</Notice>}

      <Panel title="Asset Register" hint="Add assets one at a time, or upload a register - uploaded changes are shown for review before anything is saved.">
        <Async state={data}>
          {({ assets }) => {
            const c = counts(assets);
            const rows = shown(assets);
            return (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-1.5">{FILTERS.map((f) => <button key={f.id} type="button" className={chipCls(filter === f.id)} onClick={() => setFilter(f.id)}>{f.label} ({c[f.id]})</button>)}</div>
                  <label className="relative w-64">
                    <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, serial, person…" aria-label="Search assets" className={`${inputCls} pl-8`} />
                  </label>
                </div>
                {assets.length === 0 ? <Empty icon={FileSpreadsheet} text="No assets yet. Add one, or import your asset register." /> : (
                  <Grid rows={rows} empty="No assets match." columns={[
                    { key: "custom_asset_code", label: "Code", render: (a) => <span className="font-medium">{a.custom_asset_code || "—"}</span> },
                    { key: "asset_name", label: "Asset", render: (a) => <span>{a.asset_name}<span className="block text-[11px] text-[var(--color-text-faint)]">{a.asset_category}{a.custom_serial_number ? ` · ${a.custom_serial_number}` : ""}</span></span> },
                    { key: "custodian", label: "Assigned To", render: (a) => (a.custodian ? <span>{empName[a.custodian] || a.custodian}<span className="block text-[11px] text-[var(--color-text-faint)]">{a.custom_assigned_on ? `since ${dmy(a.custom_assigned_on)}` : a.custodian}</span></span> : <span className="text-[var(--color-text-muted)]">{a.custom_returned_on ? `Returned ${dmy(a.custom_returned_on)}` : "In office"}</span>) },
                    { key: "custom_condition", label: "Condition", render: (a) => (a.custom_condition ? <StatusPill status={a.custom_condition} /> : "—") },
                    { key: "location", label: "Location" },
                    { key: "docstatus", label: "", render: (a) => (Number(a.docstatus) === 0 ? <StatusPill status="Draft" /> : <button type="button" onClick={() => setMoving(a)} className="flex items-center gap-1 text-[12px] text-[var(--color-red-hover)] hover:underline"><ArrowRightLeft size={13} /> {a.custodian ? "Reassign / return" : "Assign"}</button>) },
                  ]} />
                )}
              </div>
            );
          }}
        </Async>
      </Panel>

      <Panel title="Uploaded Register Files" hint="Every imported register is kept here as a record of what was uploaded.">
        <Async state={files}>
          {(list) => list.length === 0 ? <Empty text="No register files uploaded yet." /> : (
            <ul className="divide-y divide-[var(--color-border)]">
              {list.map((f) => (
                <li key={f.name} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2.5 text-[13px] text-[var(--color-text)]"><FileSpreadsheet size={15} className="shrink-0 text-[var(--color-text-muted)]" /><span className="truncate">{f.file_name}</span><span className="shrink-0 text-[11px] text-[var(--color-text-faint)]">{dmy(f.creation)}</span></span>
                  <a href={f.file_url} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><ExternalLink size={13} /> Open</a>
                </li>
              ))}
            </ul>
          )}
        </Async>
      </Panel>

      {importing && data.data && (
        <ImportModal file={importing.file} reg={importing.reg} employees={employees} assets={data.data.assets}
          onClose={() => setImporting(null)}
          onDone={(text) => { setImporting(null); setMessage(text); data.reload(); files.reload(); }} />
      )}
      {adding && data.data && <AddAssetModal employees={employees} assets={data.data.assets} onClose={() => setAdding(false)} onDone={(text) => { setAdding(false); setMessage(text); data.reload(); }} />}
      {moving && <MoveModal asset={moving} employees={employees} onClose={() => setMoving(null)} onDone={(text) => { setMoving(null); setMessage(text); data.reload(); }} />}
    </div>
  );
}

const STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "attention", label: "Needs Attention" },
  { id: "new", label: "New" },
  { id: "update", label: "Changes" },
  { id: "same", label: "Unchanged" },
];
const NOBODY = "__nobody__";

function ImportModal({ file, reg, employees, assets, onClose, onDone }) {
  const companies = useMemo(() => [...new Set(employees.map((e) => e.company).filter(Boolean))], [employees]);
  const plan = useMemo(() => planRegister(reg.rows, { employees, assets }), [reg, employees, assets]);
  const [holders, setHolders] = useState({}); // key -> employee name, or NOBODY to leave unassigned
  const [skip, setSkip] = useState(() => new Set());
  const [tab, setTab] = useState(() => (plan.some((p) => p.issues.length) ? "attention" : "all"));
  const [opts, setOpts] = useState({ company: companies[0] || "", location: "Office", value: "", purchaseDate: isoDate() });
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState(null);
  const [err, setErr] = useState("");

  const empName = Object.fromEntries(employees.map((e) => [e.name, e.employee_name]));
  // Apply HR's choices on top of the automatic plan.
  const items = plan.map((p) => {
    const chosen = holders[p.key];
    if (chosen === undefined) return p;
    const holder = chosen === NOBODY ? "" : chosen;
    const issues = p.issues.filter((i) => !/choose|leave unassigned/.test(i));
    const changes = p.changes.filter((c) => c.field !== "custodian");
    if (p.existing && (p.existing.custodian || "") !== holder) changes.unshift({ field: "custodian", label: "Assigned To", from: empName[p.existing.custodian] || p.existing.custodian || "Nobody", to: empName[holder] || "Nobody" });
    return { ...p, holder, issues, changes, status: p.existing ? (changes.length || p.status === "update" ? "update" : "same") : "new" };
  });
  const kind = (p) => (p.issues.length ? "attention" : p.status);
  const count = (id) => items.filter((p) => id === "all" || kind(p) === id).length;
  const todo = items.filter((p) => !skip.has(p.key) && p.status !== "same");
  const blocked = todo.filter((p) => p.issues.length);
  const needsValue = todo.some((p) => !p.existing);
  const notInFile = assets.filter((a) => a.custom_register_key && !items.some((p) => p.existing?.name === a.name)).length;

  async function apply() {
    setErr("");
    if (blocked.length) return setErr(`${blocked.length} row(s) still need attention - choose who holds them (or "Leave unassigned"), or untick them.`);
    if (needsValue && !opts.company) return setErr("Choose the company for assets that aren't assigned to anyone.");
    const n = todo.filter((p) => !p.existing).length;
    const u = todo.length - n;
    if (!(await confirmDialog({ title: "Apply Asset Register", message: `Add ${n} new asset(s) and update ${u} existing one(s) in ERPNext? Changes of holder are recorded as asset movements.`, confirmLabel: "Apply" }))) return;
    setBusy(true);
    setLog([]);
    try {
      const results = await applyRegister(todo, opts, employees, (r) => setLog((l) => [...(l || []), r]));
      try {
        await ensureAssetFolder();
        await frappe.uploadFile(file, { isPrivate: true, folder: ASSET_FOLDER });
      } catch { /* keeping a copy of the file is a nice-to-have */ }
      const ok = results.filter((r) => r.ok).length;
      const failed = results.length - ok;
      if (!failed) onDone(`Asset register imported: ${ok} asset(s) added or updated.`);
      else setErr(`${ok} saved, ${failed} couldn't be saved - see the reasons below. Fix them and import the register again; saved rows won't be duplicated.`);
    } catch (e) {
      setErr(errMsg(e, "The import stopped."));
    }
    setBusy(false);
  }

  const visible = items.filter((p) => tab === "all" || kind(p) === tab);
  return (
    <Modal title={`Import Asset Register · ${file.name}`} onClose={busy ? () => {} : onClose} wide="xl">
      <div className="space-y-4">
        <p className="text-[12px] text-[var(--color-text-muted)]">
          Read {reg.rows.length} row(s) from {reg.sheets.map((s) => `"${s}"`).join(" and ")}{reg.skipped.length ? ` (skipped ${reg.skipped.map((s) => `"${s}"`).join(", ")} - no asset columns)` : ""}.
          {" "}Matched by asset code, then serial number. {notInFile > 0 && `${notInFile} asset(s) already in ERPNext aren't in this file and stay as they are.`}
        </p>

        {needsValue && (
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--color-border)] p-3 sm:grid-cols-4">
            <Field label="Company (Unassigned Assets)"><select className={inputCls} value={opts.company} onChange={(e) => setOpts({ ...opts, company: e.target.value })}>{companies.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Default Location"><input className={inputCls} value={opts.location} onChange={(e) => setOpts({ ...opts, location: e.target.value })} /></Field>
            <Field label="Value per New Asset (₹, Optional)" hint="Blank records ₹1 as a placeholder - ERPNext needs some value"><input className={inputCls} type="number" min="1" placeholder="1" value={opts.value} onChange={(e) => setOpts({ ...opts, value: e.target.value })} /></Field>
            <Field label="Purchase Date if None" hint="Rows with an assigned date use that"><input className={inputCls} type="date" value={opts.purchaseDate} onChange={(e) => setOpts({ ...opts, purchaseDate: e.target.value })} /></Field>
          </div>
        )}

        <Tabs value={tab} onChange={setTab} tabs={STATUS_TABS.map((t) => ({ ...t, count: count(t.id) }))} />
        <div className="max-h-[48vh] overflow-y-auto rounded-lg border border-[var(--color-border)]">
          {visible.length === 0 ? <Empty text="Nothing in this list." /> : (
            <table className="w-full text-left text-[12.5px]">
              <thead className="sticky top-0 bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">
                <tr><th className="w-8 px-3 py-2" /><th className="px-3 py-2">Asset</th><th className="px-3 py-2">In the Sheet</th><th className="px-3 py-2">Assigned to (ERPNext)</th><th className="px-3 py-2">What Happens</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {visible.map((p) => {
                  const off = skip.has(p.key);
                  const pickHolder = p.match.how === "unmatched" || p.match.how === "ambiguous" || holders[p.key] !== undefined || p.issues.some((i) => /same time/.test(i));
                  return (
                    <tr key={p.key} className={off ? "opacity-45" : ""}>
                      <td className="px-3 py-2 align-top"><input type="checkbox" aria-label={`Include ${p.assetName}`} checked={!off && p.status !== "same"} disabled={p.status === "same"} onChange={() => setSkip((s) => { const n = new Set(s); if (n.has(p.key)) n.delete(p.key); else n.add(p.key); return n; })} /></td>
                      <td className="px-3 py-2 align-top">
                        <b className="font-medium text-[var(--color-text)]">{p.row.code || p.assetName}</b>
                        <span className="block text-[11px] text-[var(--color-text-faint)]">{[p.row.code ? p.assetName : "", p.type, p.row.serial].filter(Boolean).join(" · ")}</span>
                        <span className="block text-[10.5px] text-[var(--color-text-faint)]">{p.row.sheet}, row {p.row.line}{p.history.length ? ` (+${p.history.length} earlier)` : ""}</span>
                      </td>
                      <td className="px-3 py-2 align-top text-[var(--color-text-muted)]">
                        {p.holder || p.row.empName || p.row.empCode ? <>{p.row.empName || "—"}{p.row.empCode ? <span className="block text-[11px] text-[var(--color-text-faint)]">{p.row.empCode}</span> : null}</> : p.want.custom_returned_on ? `Returned ${dmy(p.want.custom_returned_on)}` : "Not assigned"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {pickHolder ? (
                          <select className={`${inputCls} !py-1 text-[12px]`} value={holders[p.key] ?? ""} onChange={(e) => setHolders((h) => ({ ...h, [p.key]: e.target.value }))} aria-label={`Who holds ${p.assetName}`}>
                            <option value="" disabled>Choose…</option>
                            <option value={NOBODY}>Leave unassigned</option>
                            {(p.match.candidates?.length ? employees.filter((e) => p.match.candidates.includes(e.name)) : []).map((e) => <option key={`c-${e.name}`} value={e.name}>★ {e.employee_name} ({e.name})</option>)}
                            {employees.map((e) => <option key={e.name} value={e.name}>{e.employee_name} ({e.employee_number || e.name})</option>)}
                          </select>
                        ) : p.holder ? <span>{empName[p.holder] || p.holder}<span className="block text-[11px] text-[var(--color-text-faint)]">{p.match.how === "code" ? "matched by employee code" : "matched by name - check"}</span></span> : <span className="text-[var(--color-text-muted)]">Nobody</span>}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {p.issues.map((i) => <span key={i} className="flex items-start gap-1 text-[var(--color-red-hover)]"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {i}</span>)}
                        {!p.issues.length && (p.status === "new" ? <StatusPill status="New" /> : p.status === "same" ? <span className="text-[var(--color-text-faint)]">No change</span> : (
                          <ul className="space-y-0.5">{(p.changes.length ? p.changes : [{ label: "Linked to This Register Row", from: "", to: "" }]).map((c) => <li key={c.label}><span className="text-[var(--color-text-muted)]">{c.label}</span>{c.to !== "" && <>: <s className="text-[var(--color-text-faint)]">{c.from}</s> → {c.to}</>}</li>)}</ul>
                        ))}
                        {p.warnings.map((w) => <span key={w} className="block text-[11px] text-[var(--color-amber)]">{w}</span>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {log && (
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-[var(--color-border)] p-3 text-[12px]">
            {log.map((r) => <li key={r.key} className="flex items-start gap-1.5">{r.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[var(--color-green)]" /> : <XCircle size={13} className="mt-0.5 shrink-0 text-[var(--color-red-hover)]" />}<span><b className="font-medium">{r.name}</b> - {r.text}</span></li>)}
            {busy && <li className="flex items-center gap-1.5 text-[var(--color-text-muted)]"><Loader2 size={13} className="animate-spin" /> Working… {log.length} of {todo.length}</li>}
          </ul>
        )}
        {err && <Notice>{err}</Notice>}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[12px] text-[var(--color-text-muted)]">{todo.filter((p) => !p.existing).length} new · {todo.filter((p) => p.existing).length} to update · {blocked.length} need attention · {count("same")} unchanged</span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>{log && !busy ? "Close" : "Cancel"}</Button>
            <Button type="button" onClick={apply} disabled={busy || !todo.length}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {busy ? "Saving…" : `Apply ${todo.length} change(s)`}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

const ASSET_TYPES = ["Laptop", "Desktop", "Monitor", "Mobile", "Furniture", "Electronic", "Mechanical", "Office Equipment"];
const ASSET_CONDITIONS = ["Working", "Damaged", "Out of Service"];

/** Add one asset directly, without a template. */
function AddAssetModal({ employees, assets, onClose, onDone }) {
  const companies = useMemo(() => [...new Set(employees.map((e) => e.company).filter(Boolean))], [employees]);
  const types = useMemo(() => [...new Set([...ASSET_TYPES, ...assets.map((a) => a.asset_category).filter(Boolean)])], [assets]);
  const [f, setF] = useState({ name: "", type: "Laptop", code: "", serial: "", custodian: "", assignedOn: isoDate(), assignedBy: "", location: "Office", condition: "Working", company: companies[0] || "", purchaseDate: isoDate(), value: "", other: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (f.code.trim() && assets.some((a) => norm(a.custom_asset_code) === norm(f.code))) return setErr(`Asset code ${f.code.trim()} is already in the register.`);
    if (f.serial.trim() && assets.some((a) => norm(a.custom_serial_number) === norm(f.serial))) return setErr(`Serial number ${f.serial.trim()} is already in the register.`);
    setBusy(true);
    try {
      const result = await addAsset(f, employees);
      onDone(`${f.name.trim()}: ${result.text}.`);
    } catch (x) {
      setErr(errMsg(x, "ERPNext refused this asset."));
      setBusy(false);
    }
  }

  return (
    <Modal title="Add Asset" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Asset Name"><input required className={inputCls} value={f.name} onChange={set("name")} placeholder="e.g. Dell Latitude 5420" /></Field>
          <Field label="Asset Type">
            <input required list="asset-types" className={inputCls} value={f.type} onChange={set("type")} />
            <datalist id="asset-types">{types.map((t) => <option key={t} value={t} />)}</datalist>
          </Field>
          <Field label="Asset Code (Optional)"><input className={inputCls} value={f.code} onChange={set("code")} /></Field>
          <Field label="Serial Number (Optional)"><input className={inputCls} value={f.serial} onChange={set("serial")} /></Field>
          <Field label="Assign To (Optional)">
            <select className={inputCls} value={f.custodian} onChange={set("custodian")}>
              <option value="">Nobody - keep in the office</option>
              {employees.filter((e) => e.status !== "Left").map((e) => <option key={e.name} value={e.name}>{e.employee_name} ({e.employee_number || e.name})</option>)}
            </select>
          </Field>
          {f.custodian
            ? <Field label="Assigned On"><input required type="date" className={inputCls} value={f.assignedOn} onChange={set("assignedOn")} /></Field>
            : <Field label="Company"><select required className={inputCls} value={f.company} onChange={set("company")}>{companies.map((c) => <option key={c}>{c}</option>)}</select></Field>}
          {f.custodian && <Field label="Assigned By (Optional)"><input className={inputCls} value={f.assignedBy} onChange={set("assignedBy")} /></Field>}
          <Field label="Location"><input required className={inputCls} value={f.location} onChange={set("location")} /></Field>
          <Field label="Condition"><select className={inputCls} value={f.condition} onChange={set("condition")}>{ASSET_CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Purchase Date" hint="Uses the assigned date when the asset is assigned"><input required type="date" className={inputCls} value={f.purchaseDate} onChange={set("purchaseDate")} /></Field>
          <Field label="Value (₹, Optional)" hint="Blank records ₹1 as a placeholder - ERPNext needs some value"><input type="number" min="1" className={inputCls} value={f.value} onChange={set("value")} /></Field>
          <Field label="Other Assets With It (Optional)"><input className={inputCls} value={f.other} onChange={set("other")} placeholder="e.g. Charger, Mouse" /></Field>
        </div>
        <Field label="Notes (Optional)"><textarea rows={2} className={inputCls} value={f.notes} onChange={set("notes")} /></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Add Asset"}</Button></div>
      </form>
    </Modal>
  );
}

/** Give an asset to someone else, or take it back into the office. */
function MoveModal({ asset, employees, onClose, onDone }) {
  const [to, setTo] = useState("");
  const [location, setLocation] = useState(asset.location || "Office");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const holder = employees.find((e) => e.name === asset.custodian);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const back = to === NOBODY;
      await reassignAsset(asset, back ? "" : to, location);
      await frappe.updateDoc("Asset", asset.name, back
        ? { custom_returned_on: isoDate(), custom_holder_left_on: null }
        : { custom_assigned_on: isoDate(), custom_returned_on: null, custom_holder_left_on: null, custom_access_revoked_on: null, custom_access_revoked_by: null }).catch(() => {});
      onDone(back ? `${asset.custom_asset_code || asset.asset_name} returned to ${location}.` : `${asset.custom_asset_code || asset.asset_name} assigned to ${employees.find((x) => x.name === to)?.employee_name || to}.`);
    } catch (x) {
      setErr(errMsg(x, "ERPNext refused the movement."));
      setBusy(false);
    }
  }

  return (
    <Modal title={`${asset.custom_asset_code || asset.asset_name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[12px] text-[var(--color-text-muted)]">{asset.asset_name} · {asset.asset_category}{asset.custom_serial_number ? ` · ${asset.custom_serial_number}` : ""}. Now: {holder ? holder.employee_name : "in office"}.</p>
        <Field label="Give It To">
          <select className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} required>
            <option value="" disabled>Choose…</option>
            {asset.custodian && <option value={NOBODY}>Return to the office</option>}
            {employees.filter((e) => e.name !== asset.custodian && e.status !== "Left").map((e) => <option key={e.name} value={e.name}>{e.employee_name} ({e.employee_number || e.name})</option>)}
          </select>
        </Field>
        <Field label={to === NOBODY ? "Returned to (Location)" : "Location"}><input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} required /></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !to}>{busy ? "Saving…" : to === NOBODY ? "Return Asset" : "Assign Asset"}</Button></div>
      </form>
    </Modal>
  );
}
