import { Link } from "react-router-dom";
import { Briefcase, Building2, ClipboardList, ShieldCheck, SlidersHorizontal, UserCog } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { HR_SETUP_SECTIONS, slugify } from "../../lib/hrSetupConfig";
import { Card } from "../../components/ui/primitives";

const PLATFORM = [
  { to: "/admin/users", label: "HR Users", hint: "Create and manage HR accounts", icon: UserCog },
  { to: "/admin/project-managers", label: "Project Managers", hint: "Who can assign projects", icon: ClipboardList },
  { to: "/admin/organization", label: "Organization", hint: "Companies", icon: Building2 },
  { to: "/admin/roles", label: "Roles & Permissions", hint: "What HR, Project Managers and employees may do", icon: ShieldCheck },
];

function Tile({ to, label, hint, icon: Icon }) {
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 transition-colors hover:border-[var(--color-red-deep)] hover:bg-[var(--color-surface-2)]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)] text-[var(--color-text-muted)] group-hover:bg-[var(--color-red-wash)] group-hover:text-[var(--color-red-hover)]"><Icon size={17} strokeWidth={1.8} /></span>
      <span className="min-w-0"><span className="block truncate text-[13px] font-medium text-[var(--color-text)]">{label}</span>{hint && <span className="block truncate text-[11px] text-[var(--color-text-muted)]">{hint}</span>}</span>
    </Link>
  );
}

/** A hub for everything configurable: platform setup, plus the HR & payroll settings pages. */
export default function Settings() {
  const { user } = useAuth();
  const hrSettings = (HR_SETUP_SECTIONS.find((s) => s.title === "Settings")?.items || []).filter((i) => !i.disabled);

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-red-wash)] text-[var(--color-red-hover)]"><SlidersHorizontal size={18} /></span>
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--color-text)]">Settings</h2>
            <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">Signed in as <b className="text-[var(--color-text)]">{user?.email}</b> (Administrator)</p>
          </div>
        </div>
      </Card>

      <section>
        <h3 className="mb-3 text-[13px] font-semibold text-[var(--color-text)]">Platform</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{PLATFORM.map((t) => <Tile key={t.to} {...t} />)}</div>
      </section>

      {hrSettings.length > 0 && (
        <section>
          <h3 className="mb-3 text-[13px] font-semibold text-[var(--color-text)]">HR & payroll settings</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{hrSettings.map((i) => <Tile key={i.doctype} to={`/hr/setup/${slugify(i.doctype)}`} label={i.label} icon={Briefcase} />)}</div>
        </section>
      )}
    </div>
  );
}