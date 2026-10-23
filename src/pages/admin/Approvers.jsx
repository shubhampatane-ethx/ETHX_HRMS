import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2, Wand2, X } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { errMsg, listTry } from "../../lib/employeePortal";
import { createTypeFields, ensureRole, EXPENSE_ROLE, LEAVE_ROLE, missingTypeFields } from "../../lib/approvals";
import { Button, Card } from "../../components/ui/primitives";

/**
 * Approver configuration. It edits standard ERPNext data only:
 *  - Leave approvers: the "Leave Approvers" table of each Department (the business unit).
 *  - Expense approvers: a custom "Expense Approver" field on each Expense Claim Type.
 * Anyone chosen also gets ERPNext's Leave Approver / Expense Approver role, which ERPNext needs to let them act.
 */
const inputCls = "w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]";

function useUsers() {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    frappe.getList("User", { filters: [["enabled", "=", 1], ["user_type", "=", "System User"]], fields: ["name", "full_name"], orderBy: "full_name asc", limit: 500 })
      .then((rows) => setUsers(rows.filter((u) => !["Administrator", "Guest"].includes(u.name))))
      .catch(() => setUsers([]));
  }, []);
  const names = useMemo(() => Object.fromEntries(users.map((u) => [u.name, u.full_name || u.name])), [users]);
  return { users, names };
}

function Hint({ children }) {
  return <p className="mb-4 max-w-3xl text-[13px] text-[var(--color-text-muted)]">{children}</p>;
}

/* ----------------------- leave approvers by business unit ----------------------- */

export function LeaveApproversByBU() {
  const { users, names } = useUsers();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState(null);

  const load = useCallback(async () => {
    setRows(null);
    setError("");
    try {
      const [depts, links] = await Promise.all([
        listTry("Department", { filters: [["is_group", "=", 0]], fields: ["name", "department_name", "company", "disabled"], orderBy: "company asc, name asc", limit: 0 }, ["name", "department_name", "company"]),
        frappe.getList("Department Approver", { filters: [["parentfield", "=", "leave_approvers"]], fields: ["parent", "approver", "idx"], parent: "Department", orderBy: "idx asc", limit: 0 }).catch(() => []),
      ]);
      setRows(depts.filter((d) => !d.disabled).map((d) => ({ ...d, approvers: links.filter((l) => l.parent === d.name).map((l) => l.approver) })));
    } catch (e) {
      setRows([]);
      setError(errMsg(e, "Couldn't load departments."));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = (rows || []).filter((d) => !search || `${d.name} ${d.company || ""}`.toLowerCase().includes(search.toLowerCase()));

  async function save(dept, list) {
    await frappe.updateDoc("Department", dept.name, { leave_approvers: list.map((approver) => ({ approver })) });
    for (const email of list) await ensureRole(email, LEAVE_ROLE);
    await load();
  }

  return (
    <div>
      <Hint>Each department is a business unit (sub-departments also use their parent unit's approvers). The first approver is the default; whoever is on approved leave is skipped and the next one is used - new requests at once, pending ones by a daily job (Admin › ERPNext Setup installs it). Employees without an approver here fall back to the approver on their own Employee record.</Hint>
      <div className="mb-3"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search business unit or company…" className={`${inputCls} max-w-xs`} /></div>
      <Card className="overflow-hidden">
        {rows === null ? <p className="flex h-28 items-center justify-center gap-2 text-[13px] text-[var(--color-text-muted)]"><Loader2 size={14} className="animate-spin" /> Loading…</p> : (
          <table className="w-full text-left text-[13px]">
            <thead><tr className="border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]"><th className="px-4 py-2.5 font-medium">Business unit</th><th className="px-4 py-2.5 font-medium">Company</th><th className="px-4 py-2.5 font-medium">Leave approvers (in order)</th><th /></tr></thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d.name} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]">
                  <td className="px-4 py-2.5 text-[var(--color-text)]">{d.department_name || d.name}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{d.company || "—"}</td>
                  <td className="px-4 py-2.5">{d.approvers.length ? d.approvers.map((a, i) => <span key={a} className="mr-2 inline-block rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2.5 py-0.5 text-[12px] text-[var(--color-text)]">{i + 1}. {names[a] || a}</span>) : <span className="text-[var(--color-amber)]">Not set</span>}</td>
                  <td className="px-4 py-2.5 text-right"><button type="button" title="Edit approvers" onClick={() => setEdit(d)} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"><Pencil size={14} /></button></td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-[var(--color-text-muted)]">No departments found.</td></tr>}
            </tbody>
          </table>
        )}
      </Card>
      {error && <p className="mt-3 text-[12px] text-[var(--color-red-hover)]">{error}</p>}
      {edit && <ApproverEditor title={`Leave approvers - ${edit.department_name || edit.name}`} initial={edit.approvers} users={users} names={names} onClose={() => setEdit(null)} onSave={(list) => save(edit, list)} />}
    </div>
  );
}

function ApproverEditor({ title, initial, users, names, onClose, onSave }) {
  const [list, setList] = useState(initial);
  const [add, setAdd] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const move = (i, d) => setList((l) => { const n = [...l]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });

  async function save() {
    setBusy(true);
    setErr("");
    try { await onSave(list); onClose(); } catch (e) { setErr(errMsg(e, "ERPNext refused this change.")); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-[14px] font-semibold text-[var(--color-text)]">{title}</h2><button type="button" onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X size={16} /></button></div>
        <ol className="space-y-2">
          {list.map((a, i) => (
            <li key={a} className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px]">
              <span className="w-5 text-[var(--color-text-faint)]">{i + 1}</span><span className="flex-1 truncate text-[var(--color-text)]">{names[a] || a}</span>
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-30"><ArrowUp size={14} /></button>
              <button type="button" disabled={i === list.length - 1} onClick={() => move(i, 1)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-30"><ArrowDown size={14} /></button>
              <button type="button" onClick={() => setList((l) => l.filter((x) => x !== a))} className="text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><Trash2 size={14} /></button>
            </li>
          ))}
          {list.length === 0 && <li className="text-[12px] text-[var(--color-text-muted)]">No approvers yet.</li>}
        </ol>
        <div className="mt-3 flex gap-2">
          <select value={add} onChange={(e) => setAdd(e.target.value)} className={inputCls}><option value="">Add an approver…</option>{users.filter((u) => !list.includes(u.name)).map((u) => <option key={u.name} value={u.name}>{u.full_name || u.name} ({u.name})</option>)}</select>
          <Button variant="secondary" disabled={!add} onClick={() => { setList((l) => [...l, add]); setAdd(""); }}><Plus size={14} /> Add</Button>
        </div>
        {err && <p className="mt-3 text-[12px] text-[var(--color-red-hover)]">{err}</p>}
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></div>
      </div>
    </div>
  );
}

/* ----------------------- expense approvers by expense type ----------------------- */

export function ExpenseApproversByType() {
  const { users, names } = useUsers();
  const [missing, setMissing] = useState(null);
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [bulk, setBulk] = useState("");
  const [onlyEmpty, setOnlyEmpty] = useState(true);
  const [newType, setNewType] = useState("");
  const [newApprover, setNewApprover] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const miss = await missingTypeFields();
      setMissing(miss);
      setRows(await listTry("Expense Claim Type", { fields: ["name", "expense_approver"], limit: 0, orderBy: "name asc" }, ["name"]));
    } catch (e) {
      setRows([]);
      setMissing([]);
      setError(errMsg(e, "Couldn't load expense types."));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setup() {
    setBusy("setup");
    setError("");
    try { await createTypeFields(); await load(); } catch (e) { setError(errMsg(e, "Couldn't add the field. You must be signed in as Administrator.")); }
    setBusy("");
  }

  async function saveApprover(type, email) {
    await frappe.updateDoc("Expense Claim Type", type, { expense_approver: email || null });
  }

  async function change(type, email) {
    setBusy(type);
    setError("");
    setMsg("");
    try {
      await saveApprover(type, email);
      if (email) await ensureRole(email, EXPENSE_ROLE);
      setRows((r) => r.map((x) => (x.name === type ? { ...x, expense_approver: email } : x)));
    } catch (e) {
      setError(errMsg(e, "ERPNext refused this change."));
    }
    setBusy("");
  }

  // one approver for every expense type (or only the ones that have none yet)
  async function applyAll() {
    if (!bulk) return;
    const targets = rows.filter((t) => (onlyEmpty ? !t.expense_approver : t.expense_approver !== bulk));
    if (!targets.length) return setMsg("Nothing to change.");
    if (!window.confirm(`Set ${names[bulk] || bulk} as the approver for ${targets.length} expense type(s)?`)) return;
    setBusy("bulk");
    setError("");
    setMsg("");
    let done = 0;
    try {
      await ensureRole(bulk, EXPENSE_ROLE);
      for (const t of targets) { await saveApprover(t.name, bulk); done += 1; }
      setMsg(`${names[bulk] || bulk} now approves ${done} expense type(s).`);
    } catch (e) {
      setError(`${done} updated, then ERPNext refused: ${errMsg(e, "change rejected.")}`);
    }
    setBusy("");
    load();
  }

  async function addType(e) {
    e.preventDefault();
    const name = newType.trim();
    if (!name) return;
    setBusy("add");
    setError("");
    setMsg("");
    try {
      await frappe.createDoc("Expense Claim Type", { expense_type: name, ...(newApprover ? { expense_approver: newApprover } : {}) });
      if (newApprover) await ensureRole(newApprover, EXPENSE_ROLE);
      setNewType("");
      setNewApprover("");
      setMsg(`Expense type "${name}" added. Set its expense account in Accounting setup below.`);
      await load();
    } catch (x) {
      setError(errMsg(x, "Couldn't add the expense type."));
    }
    setBusy("");
  }

  const fieldMissing = (missing || []).length > 0;
  const unset = (rows || []).filter((t) => !t.expense_approver).length;

  return (
    <div>
      <Hint>Each expense type has its own approver. When an employee picks a type, that person becomes the claim's approver. If the type has none, or its approver is on leave, the business unit's expense approver (then the employee's own) is used. Claims need a bill to be approved and a reason to be rejected.</Hint>
      {fieldMissing && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-4 py-3 text-[13px] text-[var(--color-text-muted)]">
          <span>ERPNext's Expense Claim Type has no approver field yet. This adds a standard custom field (no code or server change).</span>
          <Button onClick={setup} disabled={busy === "setup"}>{busy === "setup" ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Add the approver field</Button>
        </div>
      )}
      {!fieldMissing && rows && rows.length > 0 && (
        <Card className="mb-4 p-4">
          <p className="mb-2 text-[13px] font-medium text-[var(--color-text)]">Set one approver for all expense types</p>
          <div className="flex flex-wrap items-center gap-3">
            <select value={bulk} onChange={(e) => setBulk(e.target.value)} className={`${inputCls} max-w-xs`}><option value="">Choose an approver…</option>{users.map((u) => <option key={u.name} value={u.name}>{names[u.name]} ({u.name})</option>)}</select>
            <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} /> Only types without an approver{unset ? ` (${unset})` : ""}</label>
            <Button onClick={applyAll} disabled={!bulk || !!busy}>{busy === "bulk" ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Apply to {onlyEmpty ? `${unset} type(s)` : `all ${rows.length} types`}</Button>
          </div>
          <p className="mt-2 text-[11px] text-[var(--color-text-faint)]">You can still change individual types in the table below afterwards.</p>
        </Card>
      )}
      {unset > 0 && !fieldMissing && <p className="mb-3 text-[12px] text-[var(--color-amber)]">{unset} expense type(s) have no approver - their claims go to the business-unit approver.</p>}
      <Card className="overflow-hidden">
        {rows === null ? <p className="flex h-28 items-center justify-center gap-2 text-[13px] text-[var(--color-text-muted)]"><Loader2 size={14} className="animate-spin" /> Loading…</p> : (
          <table className="w-full text-left text-[13px]">
            <thead><tr className="border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]"><th className="px-4 py-2.5 font-medium">Expense type</th><th className="px-4 py-2.5 font-medium">Approver</th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.name} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5 text-[var(--color-text)]">{t.name}</td>
                  <td className="px-4 py-2"><div className="flex items-center gap-2"><select disabled={!!busy || fieldMissing} value={t.expense_approver || ""} onChange={(e) => change(t.name, e.target.value)} className={`${inputCls} max-w-xs ${t.expense_approver ? "" : "!border-[var(--color-amber)]"}`}><option value="">Not set (business unit decides)</option>{users.map((u) => <option key={u.name} value={u.name}>{names[u.name]} ({u.name})</option>)}</select>{busy === t.name && <Loader2 size={14} className="animate-spin text-[var(--color-text-muted)]" />}</div></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={2} className="px-4 py-6 text-center text-[var(--color-text-muted)]">No expense types found.</td></tr>}
            </tbody>
          </table>
        )}
      </Card>
      <form onSubmit={addType} className="mt-3 flex flex-wrap items-center gap-2">
        <input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="New expense type, e.g. Internet" className={`${inputCls} max-w-[14rem]`} />
        <select value={newApprover} onChange={(e) => setNewApprover(e.target.value)} disabled={fieldMissing} className={`${inputCls} max-w-xs`}><option value="">Approver (optional)</option>{users.map((u) => <option key={u.name} value={u.name}>{names[u.name]} ({u.name})</option>)}</select>
        <Button type="submit" variant="secondary" disabled={!newType.trim() || !!busy}>{busy === "add" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add expense type</Button>
      </form>
      {msg && <p className="mt-3 text-[12px] text-[var(--color-green)]">{msg}</p>}
      {error && <p className="mt-3 text-[12px] text-[var(--color-red-hover)]">{error}</p>}
    </div>
  );
}
/* ----------------------- accounting setup for expense claims ----------------------- */

/**
 * Approving an expense claim books it in the accounts. ERPNext needs, per company, the payable account the
 * employee is owed from and a default cost center, and per expense type the expense account to charge.
 * Pick them here (standard ERPNext fields on Company and Expense Claim Type).
 */
export function ExpenseAccounting() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [companies, accounts, centers, types] = await Promise.all([
        frappe.getList("Company", { fields: ["name", "default_expense_claim_payable_account", "default_payable_account", "cost_center"], limit: 0, orderBy: "name asc" }),
        frappe.getList("Account", { filters: [["is_group", "=", 0], ["disabled", "=", 0]], fields: ["name", "company", "account_type", "root_type"], limit: 0, orderBy: "name asc" }),
        frappe.getList("Cost Center", { filters: [["is_group", "=", 0], ["disabled", "=", 0]], fields: ["name", "company"], limit: 0, orderBy: "name asc" }),
        frappe.getList("Expense Claim Type", { fields: ["name"], limit: 0, orderBy: "name asc" }),
      ]);
      const typeDocs = await Promise.all(types.map((t) => frappe.getDoc("Expense Claim Type", t.name).catch(() => ({ name: t.name, accounts: [] }))));
      setData({ companies, accounts, centers, types: typeDocs });
    } catch (e) {
      setData({ companies: [], accounts: [], centers: [], types: [] });
      setError(errMsg(e, "Couldn't load the accounts. You must be signed in as Administrator (or have Accounts access)."));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function run(key, fn, done) {
    setBusy(key);
    setError("");
    setMsg("");
    try { await fn(); setMsg(done); await load(); } catch (e) { setError(errMsg(e, "ERPNext refused this change.")); }
    setBusy("");
  }
  const setCompany = (c, field, value) => run(`${c.name}-${field}`, () => frappe.updateDoc("Company", c.name, { [field]: value || null }), `${c.name} updated.`);
  const setTypeAccount = (type, company, account) => run(`${type.name}-${company}`, () => {
    const rows = (type.accounts || []).filter((r) => r.company !== company).map(({ company: co, default_account }) => ({ company: co, default_account }));
    if (account) rows.push({ company, default_account: account });
    return frappe.updateDoc("Expense Claim Type", type.name, { accounts: rows });
  }, `${type.name} updated.`);

  if (!data) return <p className="flex h-20 items-center gap-2 text-[13px] text-[var(--color-text-muted)]"><Loader2 size={14} className="animate-spin" /> Loading accounts…</p>;
  const payables = (co) => data.accounts.filter((a) => a.company === co && a.account_type === "Payable");
  const expenses = (co) => data.accounts.filter((a) => a.company === co && a.root_type === "Expense");
  const centers = (co) => data.centers.filter((c) => c.company === co);

  return (
    <div className="mt-8">
      <h3 className="text-[14px] font-semibold text-[var(--color-text)]">Accounting setup</h3>
      <Hint>Approving a claim books it in the accounts. Each company needs a payable account (what the company owes the employee) and a default cost center, and each expense type needs an expense account per company. Check with your accountant which accounts to use.</Hint>
      <Card className="mb-4 overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead><tr className="border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]"><th className="px-4 py-2.5 font-medium">Company</th><th className="px-4 py-2.5 font-medium">Expense claim payable account</th><th className="px-4 py-2.5 font-medium">Default cost center</th></tr></thead>
          <tbody>
            {data.companies.map((c) => (
              <tr key={c.name} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-2.5 text-[var(--color-text)]">{c.name}</td>
                <td className="px-4 py-2"><select disabled={!!busy} value={c.default_expense_claim_payable_account || ""} onChange={(e) => setCompany(c, "default_expense_claim_payable_account", e.target.value)} className={`${inputCls} max-w-xs ${c.default_expense_claim_payable_account ? "" : "!border-[var(--color-amber)]"}`}><option value="">Not set - approvals will fail</option>{payables(c.name).map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}</select></td>
                <td className="px-4 py-2"><select disabled={!!busy} value={c.cost_center || ""} onChange={(e) => setCompany(c, "cost_center", e.target.value)} className={`${inputCls} max-w-xs ${c.cost_center ? "" : "!border-[var(--color-amber)]"}`}><option value="">Not set</option>{centers(c.name).map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}</select></td>
              </tr>
            ))}
            {data.companies.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-[var(--color-text-muted)]">No companies found.</td></tr>}
          </tbody>
        </table>
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead><tr className="border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]"><th className="px-4 py-2.5 font-medium">Expense type</th>{data.companies.map((c) => <th key={c.name} className="px-4 py-2.5 font-medium">Expense account · {c.name}</th>)}</tr></thead>
          <tbody>
            {data.types.map((t) => (
              <tr key={t.name} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-2.5 text-[var(--color-text)]">{t.name}</td>
                {data.companies.map((c) => {
                  const cur = (t.accounts || []).find((r) => r.company === c.name)?.default_account || "";
                  return <td key={c.name} className="px-4 py-2"><select disabled={!!busy} value={cur} onChange={(e) => setTypeAccount(t, c.name, e.target.value)} className={`${inputCls} max-w-xs ${cur ? "" : "!border-[var(--color-amber)]"}`}><option value="">Not set</option>{expenses(c.name).map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}</select></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {busy && <p className="mt-3 flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><Loader2 size={13} className="animate-spin" /> Saving…</p>}
      {msg && <p className="mt-3 text-[12px] text-[var(--color-green)]">{msg}</p>}
      {error && <p className="mt-3 text-[12px] text-[var(--color-red-hover)]">{error}</p>}
    </div>
  );
}