// Applies the whole ERPNext setup (lib/autoSetup.js) by itself when an Administrator signs in, so nobody has to run
// System Setup or Apply Everything by hand. A small card shows progress; it disappears once done.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, Wrench, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { applyEverything, autoSetupDue, lastAutoSetup } from "../lib/autoSetup";
import { Button } from "./ui/primitives";
import { confirmDialog } from "./ui/dialogs";
import { dmyHm } from "../lib/employeePortal";

const pad = (n) => String(n).padStart(2, "0");
const stamp = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`; };

const isSiteAdmin = (user) => Boolean(user) && !user.mustChangePassword && (user.email === "Administrator" || (user.erpRoles || []).includes("System Manager"));

export function AutoSetup() {
  const { user } = useAuth();
  const admin = isSiteAdmin(user);
  const [state, setState] = useState(null); // null | { phase: "running", text } | { phase: "done" } | { phase: "failed", problems }
  const started = useRef(false);

  useEffect(() => {
    if (!admin || started.current || !autoSetupDue()) return undefined;
    started.current = true;
    let hide;
    Promise.resolve()
      .then(() => setState({ phase: "running", text: "Starting…" }))
      .then(() => applyEverything((log) => setState({ phase: "running", text: log[log.length - 1]?.text || "" })))
      .then(({ ok, log }) => {
        setState(ok ? { phase: "done" } : { phase: "failed", problems: log.filter((l) => !l.ok).length });
        if (ok) hide = setTimeout(() => setState(null), 6000);
      })
      .catch(() => setState({ phase: "failed", problems: 1 }));
    return () => clearTimeout(hide);
  }, [admin]);

  if (!state) return null;
  return (
    <div role="status" className="fixed bottom-5 left-5 z-40 w-[340px] max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4 shadow-xl">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-red-wash)] text-[var(--color-red-hover)]">
          {state.phase === "running" ? <Loader2 size={15} className="animate-spin" /> : state.phase === "done" ? <CheckCircle2 size={15} className="text-[var(--color-green)]" /> : <Wrench size={15} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[var(--color-text)]">{state.phase === "running" ? "Setting Up HRMS 360" : state.phase === "done" ? "HRMS 360 Setup Complete" : "HRMS 360 Setup Needs Attention"}</p>
          <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">
            {state.phase === "running" ? <span className="line-clamp-2">{state.text}</span>
              : state.phase === "done" ? "Doctypes, fields, server rules, role permissions and login restrictions are applied. This won't run again until the app changes."
                : <>{state.problems} step(s) couldn't be applied. <Link to="/admin/roles" className="text-[var(--color-red-hover)] underline" onClick={() => setState(null)}>See what's missing</Link>. It retries automatically tomorrow.</>}
          </p>
        </div>
        {state.phase !== "running" && <button type="button" aria-label="Close" onClick={() => setState(null)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X size={14} /></button>}
      </div>
    </div>
  );
}

/** When the setup last ran, with a button to run it again now (System Setup and Roles & Permissions pages). */
export function AutoSetupStatus({ onDone }) {
  const [last, setLast] = useState(lastAutoSetup);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState(null);

  async function run() {
    if (!(await confirmDialog({ title: "Apply Setup Again", message: "Check the site again and add anything missing: doctypes, fields, server rules, role permissions and login restrictions? Nothing that's already right is changed.", confirmLabel: "Apply" }))) return;
    setBusy(true);
    setLog([]);
    try {
      await applyEverything(setLog);
    } catch (e) {
      setLog((l) => [...(l || []), { ok: false, text: e?.message || "Setup stopped." }]);
    }
    setBusy(false);
    setLast(lastAutoSetup());
    onDone?.();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-[var(--color-text-muted)]">
          {!last ? "Applied automatically the next time the Administrator signs in."
            : last.ok ? <>Applied automatically on <b className="text-[var(--color-text)]">{dmyHm(stamp(last.at))}</b>. It runs again by itself when the app changes.</>
              : <span className="text-[var(--color-amber)]">Last run on {dmyHm(stamp(last.at))} had {last.problems} problem(s). It retries automatically; or apply again now.</span>}
        </p>
        <Button type="button" variant="secondary" onClick={run} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />} {busy ? "Applying…" : "Apply Again"}</Button>
      </div>
      {log && log.length > 0 && (
        <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-[12px]">
          {log.map((l, i) => <li key={i} className={l.ok ? "text-[var(--color-text-muted)]" : "text-[var(--color-red-hover)]"}>{l.ok ? "✓" : "✗"} {l.text}</li>)}
        </ul>
      )}
    </div>
  );
}
