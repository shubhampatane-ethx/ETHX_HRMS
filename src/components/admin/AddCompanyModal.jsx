// Adding a client company - the super admin's job, opened from the sidebar beside Viewing Client. The new company
// becomes the client being viewed, with all four modules on.
import { useState } from "react";
import { frappe } from "../../lib/api/frappeClient";
import { errMsg } from "../../lib/employeePortal";
import { Button } from "../ui/primitives";
import { Field, inputCls, Modal, Notice } from "../employee/EmployeeShell";

export function AddCompanyModal({ onClose, onAdded }) {
  const [form, setForm] = useState({ company_name: "", abbr: "", country: "India", default_currency: "INR" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const doc = await frappe.createDoc("Company", { ...form, company_name: form.company_name.trim(), abbr: form.abbr.trim().toUpperCase() });
      onAdded(doc?.name || form.company_name.trim());
    } catch (err) {
      setError(errMsg(err, "Couldn't add the company."));
      setBusy(false);
    }
  }

  return (
    <Modal title="Add Company" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Company Name"><input required value={form.company_name} onChange={set("company_name")} className={inputCls} placeholder="Client's legal name" /></Field>
        <Field label="Abbreviation"><input required maxLength={10} value={form.abbr} onChange={set("abbr")} className={inputCls} placeholder="Short code, e.g. ETHX" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Country"><input required value={form.country} onChange={set("country")} className={inputCls} /></Field>
          <Field label="Default Currency"><input required value={form.default_currency} onChange={set("default_currency")} className={inputCls} /></Field>
        </div>
        <p className="text-[12px] text-[var(--color-text-muted)]">The new company becomes the client you're viewing and opens on Modules & People with all four modules on - switch off what they haven't bought there.</p>
        {error && <Notice>{error}</Notice>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add Company"}</Button>
        </div>
      </form>
    </Modal>
  );
}
