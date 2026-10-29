import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, CalendarCheck, Eye, EyeOff, Loader2, Lock, Users, UserRound, Wallet, CalendarClock, ArrowRight } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { primaryAppRole } from "../permissions/roles";

/** Logo + a clearly visible HRMS tag (the shared Brand's label is too faint on this page). */
function LoginBrand() {
  return (
    <div className="flex items-center gap-4">
      <img src="/ethx-logo.svg" alt="ETHX Softcon" className="h-14 w-auto" />
      <span className="rounded-md border border-[var(--color-red-deep)] bg-[var(--color-red-wash)] px-3 py-1.5 text-[14px] font-semibold uppercase tracking-[0.22em] text-[var(--color-text)]">
        HRMS
      </span>
    </div>
  );
}

const FEATURES = [
  { icon: Users, title: "Employees", text: "Profiles, departments and records in one place" },
  { icon: CalendarCheck, title: "Attendance", text: "Daily tracking with monthly and yearly views" },
  { icon: CalendarClock, title: "Leave", text: "Requests and approvals without the paperwork" },
  { icon: Wallet, title: "Payroll", text: "Salary information in one place" },
];

// Browsers paint autofilled inputs white/blue; keep them on-theme instead.
const inputClass =
  "w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] py-3 pl-10 pr-3 text-[14px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] outline-none transition-colors focus:border-[var(--color-red)] focus:ring-4 focus:ring-[var(--color-red-wash)] " +
  "[&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_var(--color-surface-2)] [&:-webkit-autofill]:[-webkit-text-fill-color:var(--color-text)] [&:-webkit-autofill]:[caret-color:var(--color-text)]";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [usr, setUsr] = useState("");
  const [pwd, setPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const signedIn = await login(usr, pwd);
      if (!signedIn) {
        setError("Signed in, but the session could not be started. Please try again.");
        return;
      }

      // Land on the workspace that matches this account. Only go back to the page the
      // user was on before if it belongs to that workspace - otherwise e.g. signing in as
      // HR after logging out of an /admin page would end on "Not authorized".
      const role = primaryAppRole(signedIn?.roles);
      const home = role === "admin" ? "/admin" : role === "hr" ? "/hr" : role === "employee" ? "/employee" : role === "pm" ? "/pm" : "/";
      const from = location.state?.from?.pathname;
      const canReturn = from && home !== "/" && (from === home || from.startsWith(`${home}/`));
      navigate(canReturn ? from : home, { replace: true });
    } catch (err) {
      const noReply = err?.code === "ECONNABORTED" || !err?.response;
      setError(
        noReply
          ? "Can't reach the sign-in service. Check your connection and try again."
          : err.response.status === 401 || err.response.status === 403
            ? "Invalid email or password."
            : "Sign-in failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-[var(--color-bg)] min-[800px]:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden border-r border-[var(--color-border)] min-[800px]:flex min-[800px]:flex-col min-[800px]:justify-center min-[800px]:gap-12 min-[800px]:px-10 min-[800px]:py-16 xl:px-16">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(700px 500px at 0% 0%, color-mix(in srgb, var(--color-red) 28%, transparent), transparent 65%), radial-gradient(600px 450px at 100% 100%, color-mix(in srgb, var(--color-red) 14%, transparent), transparent 65%)" }}
        />
        {/* faint grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "44px 44px", maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)", WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)" }}
        />

        <div className="relative shrink-0"><LoginBrand /></div>

        <div className="relative max-w-xl">
          <h2 className="text-balance text-[1.75rem] font-medium leading-[1.2] tracking-tight xl:text-[2rem] text-[var(--color-text)]">
            People operations,<br />
            <span className="bg-gradient-to-r from-[var(--color-red-hover)] to-[color-mix(in_srgb,var(--color-red)_55%,var(--color-text))] bg-clip-text text-transparent">built for the way your team works.</span>
          </h2>
          <p className="mt-3 text-[13px] leading-6 text-[var(--color-text-muted)]">
            One workspace for everything HR, connected to your company data.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-2.5 xl:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface)_70%,transparent)] p-3.5 backdrop-blur-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-red-wash)] text-[var(--color-red-hover)]"><Icon size={16} strokeWidth={1.9} /></span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[var(--color-text)]">{title}</p>
                  <p className="mt-0.5 text-[12px] leading-[1.15rem] text-[var(--color-text-muted)]">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="absolute bottom-6 left-10 text-[12px] text-[var(--color-text-faint)] xl:left-16">© {new Date().getFullYear()} ETHX Softcon. All rights reserved.</p>
      </aside>

      {/* Sign-in */}
      <main className="relative flex items-center justify-center px-5 py-10">
        <div className="pointer-events-none absolute inset-0 min-[800px]:hidden" style={{ background: "radial-gradient(500px 300px at 50% 0%, color-mix(in srgb, var(--color-red) 18%, transparent), transparent 70%)" }} />
        <div className="relative w-full max-w-[400px]">
          <div className="mb-8 min-[800px]:hidden"><LoginBrand /></div>

          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">Welcome back</h1>
          <p className="mt-1.5 text-[14px] text-[var(--color-text-muted)]">Sign in with your work account to continue.</p>

          <form data-no-preview onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-[var(--color-text-muted)]">Email or username</span>
              <div className="relative">
                <UserRound size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
                <input type="text" value={usr} onChange={(e) => setUsr(e.target.value)} placeholder="you@company.com or Administrator" autoComplete="username" required autoFocus className={inputClass} />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-[var(--color-text-muted)]">Password</span>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
                <input type={showPwd ? "text" : "password"} value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Enter your password" autoComplete="current-password" required className={`${inputClass} pr-11`} />
                <button type="button" onClick={() => setShowPwd((v) => !v)} aria-label={showPwd ? "Hide password" : "Show password"} className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)]">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {error && (
              <div role="alert" className="flex items-center gap-2 rounded-lg border border-[var(--color-red-deep)] bg-[var(--color-red-wash)] px-3.5 py-2.5 text-[13px] text-[var(--color-red-hover)]">
                <AlertCircle size={15} className="shrink-0" /> {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="group flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-red)] py-3 text-[14px] font-medium text-[var(--color-on-accent)] shadow-[0_8px_24px_-8px_color-mix(in_srgb,var(--color-red)_60%,transparent)] transition-all hover:bg-[var(--color-red-hover)] disabled:cursor-not-allowed disabled:opacity-70">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Signing in...</> : <>Sign in <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" /></>}
            </button>
          </form>

          <p className="mt-6 text-center text-[12px] text-[var(--color-text-faint)]">Trouble signing in? Contact your system administrator.</p>
        </div>
      </main>
    </div>
  );
}