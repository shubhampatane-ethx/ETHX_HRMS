// In-app replacements for window.confirm / alert / prompt, plus the "review before submitting"
// step that every <form> goes through. Call the functions from anywhere (no hook needed);
// <DialogHost /> is mounted once in App and renders whatever is open.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Info, X } from "lucide-react";

let current = null;
const listeners = new Set();
const queue = [];

function emit() { listeners.forEach((l) => l()); }
function subscribe(l) { listeners.add(l); return () => listeners.delete(l); }
function snapshot() { return current; }

function open(kind, opts) {
  const options = typeof opts === "string" ? { message: opts } : opts || {};
  return new Promise((resolve) => {
    queue.push({ kind, ...options, resolve, id: Math.random() });
    if (!current) next();
  });
}
function next() { current = queue.shift() || null; emit(); }
function close(value) {
  if (!current) return;
  current.resolve(value);
  next();
}

/** Ask yes / no. Resolves true or false. `danger` styles the confirm button for destructive actions. */
export const confirmDialog = (opts) => open("confirm", opts);
/** Show a message with a single OK. `tone`: "error" | "success" | "info". */
export const alertDialog = (opts) => open("alert", opts);
/** Ask for text (e.g. a reason). Resolves the trimmed text, or null when cancelled. */
export const promptDialog = (opts) => open("prompt", opts);
/** Show `rows` ([label, value][]) for review. Resolves true to go ahead, false to go back and edit. */
export const previewDialog = (opts) => open("preview", opts);

/* ---------- reading a form for the review step ---------- */

function isoToDmy(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v);
  if (!m) return v;
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ""}`;
}

function labelFor(el, seen) {
  const label = el.labels?.[0] || el.closest("label");
  if (label) {
    if (seen.has(label)) return null; // second control of the same field (e.g. a hidden date picker)
    seen.add(label);
    const copy = label.cloneNode(true);
    copy.querySelectorAll("input, select, textarea, button, svg").forEach((n) => n.remove());
    const text = copy.textContent.replace(/\s+/g, " ").replace(/\s*\*\s*$/, "").trim();
    if (text) return text;
  }
  return el.getAttribute("aria-label") || el.placeholder || el.name || "Field";
}

function valueFor(el) {
  if (el instanceof HTMLSelectElement) {
    const picked = [...el.selectedOptions].filter((o) => o.value !== "");
    return picked.map((o) => o.textContent.trim()).join(", ");
  }
  if (el instanceof HTMLTextAreaElement) return el.value.trim();
  switch (el.type) {
    case "checkbox": return el.checked ? "Yes" : "";
    case "radio": return el.checked ? (el.labels?.[0]?.textContent.trim() || el.value) : "";
    case "file": return [...(el.files || [])].map((f) => f.name).join(", ");
    case "password": return el.value ? "••••••••" : "";
    case "date":
    case "datetime-local": return el.value ? isoToDmy(el.value) : "";
    default: return el.value.trim();
  }
}

/** Filled-in fields of a form as [label, value] rows, in the order they appear. */
export function formRows(form) {
  const seen = new Set();
  const rows = [];
  for (const el of form.querySelectorAll("input, select, textarea")) {
    if (["hidden", "submit", "button", "reset", "image"].includes(el.type)) continue;
    if (el.tabIndex < 0 || el.closest("[aria-hidden='true']")) continue;
    const value = valueFor(el);
    const label = labelFor(el, seen);
    if (!label || !value) continue;
    rows.push([label, value]);
  }
  return rows;
}

function headingFor(form) {
  let node = form;
  for (let i = 0; i < 5 && node; i += 1) {
    node = node.parentElement;
    const h = node?.querySelector("h2, h3");
    if (h && !form.contains(h)) return h.textContent.trim();
  }
  return "";
}

/**
 * Every form submit is held back and shown as a review first; "Confirm & submit" lets it through.
 * Opt a form out (sign-in, search boxes) with data-no-preview.
 */
function useFormReview() {
  useEffect(() => {
    async function onSubmit(e) {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || form.hasAttribute("data-no-preview")) return;
      if (form.__reviewed) { form.__reviewed = false; return; }
      e.preventDefault();
      e.stopPropagation();
      const submitter = e.submitter;
      const action = submitter?.textContent.replace(/\s+/g, " ").trim() || "Submit";
      const ok = await previewDialog({ title: headingFor(form), rows: formRows(form), confirmLabel: `Confirm & ${action}` });
      if (!ok || !form.isConnected) return;
      form.__reviewed = true;
      if (submitter && submitter.isConnected && submitter.form === form) form.requestSubmit(submitter);
      else form.requestSubmit();
    }
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);
}

/* ---------- rendering ---------- */

const TONES = {
  error: { icon: AlertTriangle, cls: "bg-[var(--color-red-wash)] text-[var(--color-red-hover)]" },
  danger: { icon: AlertTriangle, cls: "bg-[var(--color-red-wash)] text-[var(--color-red-hover)]" },
  success: { icon: CheckCircle2, cls: "bg-[color-mix(in_srgb,var(--color-green)_15%,transparent)] text-[var(--color-green)]" },
  info: { icon: Info, cls: "bg-[var(--color-surface-2)] text-[var(--color-text-muted)]" },
  preview: { icon: ClipboardCheck, cls: "bg-[var(--color-red-wash)] text-[var(--color-red-hover)]" },
};

const btn = "inline-flex items-center justify-center rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors disabled:opacity-50";
const primary = `${btn} bg-[var(--color-red)] text-[var(--color-on-accent,#fff)] hover:bg-[var(--color-red-hover)]`;
const secondary = `${btn} border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-[var(--color-text)] hover:border-[var(--color-red-deep)]`;

export function DialogHost() {
  useFormReview();
  const d = useSyncExternalStore(subscribe, snapshot);
  if (!d) return null;
  return <Dialog key={d.id} d={d} />;
}

function Dialog({ d }) {
  const [text, setText] = useState(d.defaultValue ?? "");
  const [touched, setTouched] = useState(false);
  const focusRef = useRef(null);
  const cancelValue = d.kind === "prompt" ? null : d.kind === "alert" ? undefined : false;
  const required = d.kind === "prompt" && d.required !== false;
  const invalid = required && !text.trim();

  useEffect(() => {
    focusRef.current?.focus();
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation(); // keep the modal underneath open
      close(cancelValue);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [cancelValue]);

  function accept(e) {
    e?.preventDefault();
    if (d.kind === "prompt") {
      setTouched(true);
      if (invalid) return;
      close(text.trim());
    } else close(d.kind === "alert" ? undefined : true);
  }

  const tone = TONES[d.kind === "preview" ? "preview" : d.tone || (d.danger ? "danger" : d.kind === "alert" ? "info" : "info")];
  const Icon = tone.icon;
  const title = d.kind === "preview"
    ? `Review before submitting${d.title ? ` · ${d.title}` : ""}`
    : d.title || (d.kind === "alert" ? (d.tone === "error" ? "Something went wrong" : "Notice") : "Please confirm");

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4" onMouseDown={(e) => e.target === e.currentTarget && close(cancelValue)}>
      <form
        data-no-preview
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        onSubmit={accept}
        className={`w-full ${d.kind === "preview" ? "max-w-lg" : "max-w-md"} rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl`}
      >
        <div className="flex items-start gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone.cls}`}><Icon size={17} /></span>
          <div className="min-w-0 flex-1 pt-1">
            <h2 id="app-dialog-title" className="text-[14px] font-semibold text-[var(--color-text)]">{title}</h2>
            {d.message && <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-[var(--color-text-muted)]">{d.message}</p>}
          </div>
          <button type="button" onClick={() => close(cancelValue)} aria-label="Close" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X size={16} /></button>
        </div>

        {d.kind === "preview" && (
          d.rows?.length ? (
            <dl className="mt-4 max-h-[55vh] divide-y divide-[var(--color-border)] overflow-y-auto rounded-lg border border-[var(--color-border)]">
              {d.rows.map(([k, v], i) => (
                <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3.5 py-2">
                  <dt className="text-[12px] text-[var(--color-text-muted)]">{k}</dt>
                  <dd className="whitespace-pre-line break-words text-[13px] text-[var(--color-text)]">{v}</dd>
                </div>
              ))}
            </dl>
          ) : <p className="mt-4 text-[13px] text-[var(--color-text-muted)]">Nothing was filled in. Submit anyway?</p>
        )}

        {d.kind === "prompt" && (
          <label className="mt-4 block">
            {d.label && <span className="mb-1.5 block text-[12px] text-[var(--color-text-muted)]">{d.label}</span>}
            {d.multiline === false ? (
              <input ref={focusRef} type={d.inputType || "text"} value={text} onChange={(e) => setText(e.target.value)} placeholder={d.placeholder} min={d.min} max={d.max} className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]" />
            ) : (
              <textarea ref={focusRef} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={d.placeholder} className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]" />
            )}
            {touched && invalid && <span role="alert" className="mt-1 block text-[11px] text-[var(--color-red-hover)]">This is required.</span>}
          </label>
        )}

        <div className="mt-5 flex justify-end gap-2">
          {d.kind !== "alert" && (
            <button type="button" onClick={() => close(cancelValue)} className={secondary}>
              {d.cancelLabel || (d.kind === "preview" ? "Back to edit" : "Cancel")}
            </button>
          )}
          <button ref={d.kind === "prompt" ? undefined : focusRef} type="submit" className={primary}>
            {d.confirmLabel || (d.kind === "alert" ? "OK" : d.kind === "preview" ? "Confirm & submit" : "Confirm")}
          </button>
        </div>
      </form>
    </div>
  );
}
