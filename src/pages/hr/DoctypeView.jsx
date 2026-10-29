import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileBarChart2, Plus, Trash2, X, Loader2 } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { errMsg } from "../../lib/employeePortal";
import { Card, Table, Button, Input, LinkField } from "../../components/ui/primitives";
import { findSetupItem } from "../../lib/hrSetupConfig";
import { useAuth } from "../../context/AuthContext";
import { hasPermission } from "../../permissions/roles";
import { alertDialog, confirmDialog, previewDialog } from "../../components/ui/dialogs";

const DEFAULT_FIELDS = ["name", "modified", "owner"];
const DEFAULT_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "owner", label: "Created by" },
  { key: "modified", label: "Last modified", render: (r) => formatDate(r.modified) },
];
const FALLBACK_FORM_FIELDS = [{ name: "name", label: "Name", type: "text", required: true }];

export default function DoctypeView() {
  const { doctype: slug } = useParams();
  const item = findSetupItem(slug);
  const { user } = useAuth();

  if (item?.adminOnly && !hasPermission(user, "dashboard.admin")) {
    return (
      <Card className="p-6">
        <p className="text-[13px] text-[var(--color-text-muted)]">{item.label} setup is managed by your Administrator.</p>
        <BackLink />
      </Card>
    );
  }

  if (!item) {
    return (
      <Card className="p-6">
        <p className="text-[13px] text-[var(--color-text-muted)]">Unknown item "{slug}".</p>
        <BackLink />
      </Card>
    );
  }

  // key: each doctype gets fresh state (filters, form) when moving between setup pages
  if (item.kind === "single") return <SingleSettings key={item.doctype} item={item} />;
  if (item.kind === "report") return <ReportRunner key={item.doctype} item={item} />;
  return <DoctypeCrud key={item.doctype} item={item} />;
}

function BackLink() {
  return (
    <Link
      to="/hr"
      className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
    >
      <ArrowLeft size={14} strokeWidth={1.75} />
      Back to HR
    </Link>
  );
}

function Header({ item }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-[var(--color-text-faint)]">{item.section}</p>
      <h1 className="text-[17px] font-semibold text-[var(--color-text)]">{item.label}</h1>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Masters: live list + create + delete against a real ERPNext doctype    */
/* ---------------------------------------------------------------------- */

export function DoctypeCrud({ item }) {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading"); // loading | ok | error
  const [showForm, setShowForm] = useState(false);
  const fields = item.formFields?.length ? item.formFields : FALLBACK_FORM_FIELDS;

  function load() {
    setState("loading");
    frappe
      .getList(item.doctype, { fields: DEFAULT_FIELDS, limit: 100, orderBy: "modified desc" })
      .then((res) => {
        setRows(res);
        setState("ok");
      })
      .catch(() => setState("error"));
  }

  useEffect(load, [item.doctype]);

  async function handleDelete(name) {
    if (!(await confirmDialog(`Delete "${name}" from ${item.doctype}? This cannot be undone.`))) return;
    try {
      await frappe.deleteDoc(item.doctype, name);
      load();
    } catch (err) {
      alertDialog({ tone: "error", message: errorMessage(err) });
    }
  }

  const columns = [
    ...DEFAULT_COLUMNS,
    {
      key: "_actions",
      label: "",
      render: (r) => (
        <button
          onClick={() => handleDelete(r.name)}
          className="rounded p-1 text-[var(--color-text-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-red-hover)]"
          title={`Delete ${r.name}`}
        >
          <Trash2 size={13} strokeWidth={1.75} />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Header item={item} />
        <Button onClick={() => setShowForm((s) => !s)}>
          {showForm ? <X size={14} strokeWidth={2} /> : <Plus size={14} strokeWidth={2} />}
          {showForm ? "Cancel" : `New ${item.doctype}`}
        </Button>
      </div>

      {showForm && (
        <RecordForm
          doctype={item.doctype}
          fields={fields}
          onCancel={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      <Card>
        {state === "loading" && (
          <div className="flex h-32 items-center justify-center text-[13px] text-[var(--color-text-muted)]">
            Loading…
          </div>
        )}
        {state === "error" && (
          <div className="flex h-32 flex-col items-center justify-center gap-1 text-center text-[13px] text-[var(--color-text-muted)]">
            <p>Couldn't load {item.doctype}.</p>
            <p className="text-[var(--color-text-faint)]">
              Check that the doctype exists and this user has read access to it.
            </p>
          </div>
        )}
        {state === "ok" && <Table columns={columns} rows={rows} emptyLabel={`No ${item.doctype} records yet.`} />}
      </Card>
    </div>
  );
}

/** Generic create form driven by a doctype's formFields config. Real POST to ERPNext on submit. */
function RecordForm({ doctype, fields, onCancel, onCreated }) {
  const [values, setValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function setField(name, value) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await frappe.createDoc(doctype, values);
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <FieldInput key={f.name} field={f} value={values[f.name]} onChange={(v) => setField(f.name, v)} />
          ))}
        </div>
        {error && <p className="text-[12px] text-[var(--color-red-hover)]">{error}</p>}
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Save
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function FieldInput({ field, value, onChange }) {
  if (field.type === "link") {
    return (
      <LinkField
        label={field.label}
        linkDoctype={field.linkDoctype}
        value={value}
        onChange={onChange}
        required={field.required}
        frappe={frappe}
      />
    );
  }
  if (field.type === "select") {
    return (
      <label className="block">
        <span className="mb-1.5 block text-[12px] text-[var(--color-text-muted)]">{field.label}</span>
        <select
          value={value ?? ""}
          required={field.required}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]"
        >
          <option value="">Select…</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }
  const inputType = { date: "date", datetime: "datetime-local", number: "number" }[field.type] || "text";
  return (
    <Input
      label={field.label}
      type={inputType}
      required={field.required}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* ---------------------------------------------------------------------- */
/* Settings: load a Frappe Single doctype, edit, save                     */
/* ---------------------------------------------------------------------- */

const SINGLE_SYSTEM_FIELDS = ["doctype", "name", "owner", "creation", "modified", "modified_by", "docstatus", "idx"];

function SingleSettings({ item }) {
  const [doc, setDoc] = useState(null);
  const [edits, setEdits] = useState({});
  const [state, setState] = useState("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [meta, setMeta] = useState(null);
  useEffect(() => {
    setState("loading");
    Promise.all([
      frappe.getDoc(item.doctype, item.doctype),
      // field types / labels, so numbers aren't shown as checkboxes just because their value is 0 or 1
      frappe.client.get("/method/frappe.desk.form.load.getdoctype", { params: { doctype: item.doctype } }).then((r) => r.data?.docs?.[0]?.fields || null).catch(() => null),
    ])
      .then(([res, fields]) => {
        setDoc(res);
        setMeta(fields);
        setState("ok");
      })
      .catch(() => setState("error"));
  }, [item.doctype]);

  const LAYOUT = ["Section Break", "Column Break", "Tab Break", "HTML", "Button", "Heading", "Fold", "Table", "Table MultiSelect"];
  const entries = !doc ? [] : meta
    ? meta.filter((f) => f.fieldname && !LAYOUT.includes(f.fieldtype) && !Number(f.hidden)).map((f) => [f.fieldname, doc[f.fieldname], f])
    : Object.entries(doc).filter(([key, v]) => !SINGLE_SYSTEM_FIELDS.includes(key) && !Array.isArray(v));

  async function handleSave() {
    const labelOf = (key) => meta?.find((f) => f.fieldname === key)?.label || key.replace(/_/g, " ");
    const shown = (v) => (v === true || v === 1 ? "Yes" : v === false || v === 0 ? "No" : v === "" || v == null ? "(empty)" : String(v));
    if (!(await previewDialog({ title: item.label || item.doctype, rows: Object.entries(edits).map(([k, v]) => [labelOf(k), shown(v)]), confirmLabel: "Confirm & save" }))) return;
    setSaving(true);
    setError(null);
    try {
      await frappe.updateDoc(item.doctype, item.doctype, edits);
      setEdits({});
      const fresh = await frappe.getDoc(item.doctype, item.doctype);
      setDoc(fresh);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Header item={item} />
      <Card className="p-5">
        {state === "loading" && <p className="text-[13px] text-[var(--color-text-muted)]">Loading…</p>}
        {state === "error" && (
          <p className="text-[13px] text-[var(--color-text-muted)]">
            Couldn't load {item.doctype}. Check that this user has read access to this single doctype.
          </p>
        )}
        {state === "ok" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              {entries.length === 0 && (
                <p className="text-[13px] text-[var(--color-text-muted)]">No configurable fields returned.</p>
              )}
              {entries.map(([key, value, df]) => (
                <SingleField
                  key={key}
                  fieldKey={key}
                  df={df}
                  value={key in edits ? edits[key] : value}
                  onChange={(v) => setEdits((e) => ({ ...e, [key]: v }))}
                />
              ))}
            </div>
            {error && <p className="text-[12px] text-[var(--color-red-hover)]">{error}</p>}
            <Button onClick={handleSave} disabled={saving || Object.keys(edits).length === 0}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save changes
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function SingleField({ fieldKey, value, onChange, df }) {
  const label = df?.label || fieldLabel(fieldKey);
  if (df && Number(df.read_only)) return <Input label={label} value={value ?? ""} disabled onChange={() => {}} />;
  if (df?.fieldtype === "Select") {
    const opts = String(df.options || "").split("\n");
    return (
      <label className="block">
        <span className="mb-1.5 block text-[12px] text-[var(--color-text-muted)]">{label}</span>
        <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]">
          {opts.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
        </select>
      </label>
    );
  }
  if (df?.fieldtype === "Link") return <LinkField label={label} linkDoctype={df.options} frappe={frappe} value={value ?? ""} onChange={onChange} />;
  if (df && ["Int", "Float", "Currency", "Percent", "Duration"].includes(df.fieldtype)) return <Input label={label} type="number" step="any" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
  if (df && ["Date", "Time", "Datetime"].includes(df.fieldtype)) return <Input label={label} type={df.fieldtype === "Date" ? "date" : df.fieldtype === "Time" ? "time" : "datetime-local"} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
  const isBooleanish = df ? df.fieldtype === "Check" : value === 0 || value === 1 || value === true || value === false;
  if (isBooleanish) {
    const checked = value === 1 || value === true;
    return (
      <label className="flex items-center gap-2 text-[13px] text-[var(--color-text)]">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked ? 1 : 0)}
          className="h-3.5 w-3.5 accent-[var(--color-red)]"
        />
        {label}
      </label>
    );
  }
  return (
    <Input
      label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* ---------------------------------------------------------------------- */
/* Reports: run a Query/Script report live via frappe.desk.query_report   */
/* ---------------------------------------------------------------------- */

const y = new Date().getFullYear();
const thisMonth = new Date().getMonth() + 1;
const today = () => new Date().toISOString().slice(0, 10);
const MONTHS3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const F = {
  company: { fieldname: "company", label: "Company", type: "link", doctype: "Company" },
  employee: { fieldname: "employee", label: "Employee", type: "link", doctype: "Employee" },
  department: { fieldname: "department", label: "Department", type: "link", doctype: "Department" },
  from: { fieldname: "from_date", label: "From date", type: "date" },
  to: { fieldname: "to_date", label: "To date", type: "date" },
};
const req = (f, extra = {}) => ({ ...f, reqd: true, ...extra });
// Filters each HRMS report needs (from the report's own .js definition). Others get the generic four.
const REPORT_FILTERS = {
  "Monthly Attendance Sheet": [
    { fieldname: "filter_based_on", type: "hidden", default: "Month" },
    { fieldname: "month", label: "Month", type: "select", options: MONTHS3.map((m, i) => [i + 1, m]), default: thisMonth, reqd: true },
    { fieldname: "year", label: "Year", type: "select", options: [y - 2, y - 1, y, y + 1].map((v) => [v, String(v)]), default: y, reqd: true },
    req(F.company), F.employee, F.department,
  ],
  "Employee Birthday": [{ fieldname: "month", label: "Month", type: "select", options: MONTHS3.map((m) => [m, m]), default: MONTHS3[thisMonth - 1], reqd: true }, req(F.company)],
  "Employee Analytics": [req(F.company), { fieldname: "parameter", label: "Group by", type: "select", options: ["Branch", "Grade", "Department", "Designation", "Employment Type"].map((v) => [v, v]), default: "Department", reqd: true }],
  "Recruitment Analytics": [req(F.company), { fieldname: "on_date", label: "As on", type: "date", default: today(), reqd: true }],
  "Employee Leave Balance": [req(F.from, { default: `${y}-01-01` }), req(F.to, { default: `${y}-12-31` }), req(F.company), F.department, F.employee],
  "Employee Leave Balance Summary": [{ fieldname: "date", label: "As on", type: "date", default: today(), reqd: true }, req(F.company), F.department, F.employee],
  "Employees Working on a Holiday": [req(F.from, { default: `${y}-01-01` }), req(F.to, { default: `${y}-12-31` }), req(F.company), F.department],
  "Employee Exits": [F.from, F.to, F.company, F.department, F.employee],
};
const GENERIC = [F.company, F.employee, F.from, F.to];

function ReportRunner({ item }) {
  const defs = REPORT_FILTERS[item.doctype] || GENERIC;
  const [filters, setFilters] = useState(() => Object.fromEntries(defs.map((d) => [d.fieldname, d.default ?? ""])));
  const [result, setResult] = useState(null);
  const [state, setState] = useState("idle"); // idle | loading | ok | error
  const [error, setError] = useState(null);
  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const missing = defs.filter((d) => d.reqd && (filters[d.fieldname] === "" || filters[d.fieldname] == null)).map((d) => d.label);

  async function run() {
    if (missing.length) { setError(`Fill in: ${missing.join(", ")}`); setState("error"); return; }
    setState("loading");
    setError(null);
    const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "" && v != null));
    try {
      const res = await frappe.callMethod("frappe.desk.query_report.run", {
        report_name: item.doctype,
        filters: activeFilters,
      });
      if (!res) throw new Error("This report can't be run from here. Contact your administrator for access.");
      setResult(res);
      setState("ok");
    } catch (err) {
      setError(errorMessage(err));
      setState("error");
    }
  }

  const { columns, rows } = result ? normalizeReport(result) : { columns: [], rows: [] };

  return (
    <div className="space-y-4">
      <Header item={item} />

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {defs.filter((d) => d.type !== "hidden").map((d) => {
            const label = `${d.label}${d.reqd ? " *" : ""}`;
            if (d.type === "link") return <LinkField key={d.fieldname} label={label} linkDoctype={d.doctype} frappe={frappe} value={filters[d.fieldname]} onChange={(v) => set(d.fieldname, v)} />;
            if (d.type === "date") return <Input key={d.fieldname} label={label} type="date" value={filters[d.fieldname]} onChange={(e) => set(d.fieldname, e.target.value)} />;
            return (
              <label key={d.fieldname} className="block">
                <span className="mb-1.5 block text-[12px] text-[var(--color-text-muted)]">{label}</span>
                <select value={filters[d.fieldname]} onChange={(e) => set(d.fieldname, e.target.value)} className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]">
                  {d.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-[var(--color-text-faint)]">Fields marked * are required by this report; leave the others blank to include everything.</p>
        <Button className="mt-3" onClick={run} disabled={state === "loading"}>
          {state === "loading" && <Loader2 size={14} className="animate-spin" />}
          Run report
        </Button>
      </Card>

      {state === "error" && (
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-red-wash)] text-[var(--color-red-hover)]">
              <FileBarChart2 size={14} strokeWidth={1.75} />
            </span>
            <p className="text-[13px] text-[var(--color-text-muted)]">{error}</p>
          </div>
        </Card>
      )}

      {state === "ok" && (
        <Card>
          <div className="overflow-x-auto">
            <Table columns={columns} rows={rows} emptyLabel="No rows returned for these filters." />
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * Frappe's query_report.run returns `columns` in one of a few shapes
 * (list of dicts, or "fieldname:Label:Type/Options:Width" strings for
 * Query Reports) and `result` as either a list of dicts or a list of
 * arrays positioned to match `columns`. Normalize both into what the
 * shared <Table> component expects.
 */
function normalizeReport(res) {
  const rawColumns = res.columns || [];
  const columns = rawColumns.map((c, i) => {
    if (typeof c === "string") {
      const [fieldname, label] = c.split(":");
      return { key: fieldname || `col${i}`, label: label || fieldname || `Column ${i + 1}` };
    }
    return { key: c.fieldname || `col${i}`, label: c.label || c.fieldname || `Column ${i + 1}` };
  });

  const rawRows = res.result || [];
  const rows = rawRows.map((row) => {
    if (Array.isArray(row)) {
      return Object.fromEntries(columns.map((c, i) => [c.key, row[i]]));
    }
    return row;
  });

  return { columns, rows };
}

function fieldLabel(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function errorMessage(err) {
  return errMsg(err, "Something went wrong while loading this data.");
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}