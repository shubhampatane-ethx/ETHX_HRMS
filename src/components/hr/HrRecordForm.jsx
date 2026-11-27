import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { errMsg } from "../../lib/employeePortal";
import { Button, Card, DateField, Input, LinkField } from "../ui/primitives";

/**
 * submittable: the doctype is submittable (e.g. Attendance) - new records are submitted after saving, and editing a
 * submitted record cancels it and saves an amended copy (submitted records cannot be edited directly).
 * validate(payload, { recordName, values }): optional; returns the payload to save (it may tidy values) or throws an
 * Error whose message is shown on the form.
 */
export function HrRecordForm({ doctype, fields, recordName, onCancel, onSaved, submittable = false, validate }) {
  const [values, setValues] = useState({});
  const [state, setState] = useState(recordName ? "loading" : "ready");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!recordName) {
      setValues({});
      setState("ready");
      return undefined;
    }
    setState("loading");
    frappe
      .getDoc(doctype, recordName)
      .then((doc) => {
        if (!cancelled) {
          setValues(doc);
          setState("ready");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(errorMessage(err));
          setState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [doctype, recordName]);

  function setField(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setState("saving");
    setError("");
    let payload = Object.fromEntries(
      fields
        .map((field) => [field.name, values[field.name]])
        .filter(([, value]) => value !== undefined && value !== "")
    );
    try {
      if (validate) payload = await validate(payload, { recordName, values });
      let saved;
      if (submittable && recordName && Number(values.docstatus) === 1) {
        await frappe.cancelDoc(doctype, recordName);
        saved = await frappe.createDoc(doctype, { ...payload, amended_from: recordName });
        await frappe.submitDoc(await frappe.getDoc(doctype, saved.name));
      } else if (recordName) {
        saved = await frappe.updateDoc(doctype, recordName, payload);
        if (submittable && Number(saved?.docstatus) === 0) await frappe.submitDoc(await frappe.getDoc(doctype, recordName));
      } else {
        saved = await frappe.createDoc(doctype, payload);
        if (submittable) await frappe.submitDoc(await frappe.getDoc(doctype, saved.name));
      }
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
      setState("ready");
    }
  }

  return (
    <Card className="border-[var(--color-border-strong)] p-5">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-red-hover)]">
            HRMS record
          </p>
          <h2 className="mt-1 text-[16px] font-semibold text-[var(--color-text)]">
            {recordName ? `Edit ${doctype}` : `New ${doctype}`}
          </h2>
        </div>
        <button type="button" onClick={onCancel} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]" aria-label="Close form">
          <X size={17} />
        </button>
      </div>

      {state === "loading" ? (
        <div className="flex h-28 items-center justify-center text-[13px] text-[var(--color-text-muted)]">Loading record...</div>
      ) : state === "error" ? (
        <p className="text-[13px] text-[var(--color-red-hover)]">{error}</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <Field key={field.name} field={field} value={values[field.name]} onChange={(value) => setField(field.name, value)} />
            ))}
          </div>
          {error && <p className="text-[12px] leading-5 text-[var(--color-red-hover)]">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={state === "saving"}>
              {state === "saving" && <Loader2 size={14} className="animate-spin" />}
              {recordName ? "Save Changes" : "Create Record"}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      )}
    </Card>
  );
}

// Short lists HR manages themselves: a missing entry can be added straight from the picker ("+ Create").
const CREATABLE = {
  "Employee Grade": async (text) => (await frappe.createDoc("Employee Grade", { __newname: text, name: text })).name || text,
};

function Field({ field, value, onChange }) {
  if (field.type === "link") {
    return <LinkField label={field.label} linkDoctype={field.linkDoctype} value={value} onChange={onChange} required={field.required} frappe={frappe} onCreate={CREATABLE[field.linkDoctype]} filters={field.linkFilters} />;
  }
  if (field.type === "date") {
    return <DateField label={field.label} value={value} onChange={onChange} required={field.required} />;
  }
  if (field.type === "select") {
    return (
      <label className="block">
        <span className="mb-1.5 block text-[12px] text-[var(--color-text-muted)]">{field.label}</span>
        <select value={value ?? ""} required={field.required} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]">
          <option value="">Select...</option>
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
    );
  }
  if (field.type === "textarea") {
    return (
      <label className="block sm:col-span-2">
        <span className="mb-1.5 block text-[12px] text-[var(--color-text-muted)]">{field.label}</span>
        <textarea value={value ?? ""} required={field.required} onChange={(event) => onChange(event.target.value)} rows={4} className="w-full resize-y rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]" />
      </label>
    );
  }
  return <Input label={field.label} type={field.type || "text"} required={field.required} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />;
}

function errorMessage(error) {
  return errMsg(error, "Couldn't save this record.");
}