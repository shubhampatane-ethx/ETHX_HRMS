import { useEffect, useState } from "react";
import { frappe } from "../../lib/api/frappeClient";
import { Card, StatCard } from "../../components/ui/primitives";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [hrUsers, employees, companies] = await Promise.all([
          frappe.getList("Has Role", { filters: [["role", "in", ["HR Manager", "HR User"]]], fields: ["parent"], limit: 0 }),
          frappe.getList("Employee", { filters: [["status", "=", "Active"]], fields: ["name"], limit: 0 }),
          frappe.getList("Company", { fields: ["name"], limit: 0 }),
        ]);
        setStats({
          hrUsers: new Set(hrUsers.map((r) => r.parent)).size,
          employees: employees.length,
          companies: companies.length,
        });
      } catch {
        // ERPNext not reachable yet in this environment - show placeholders.
        setStats({ hrUsers: "—", employees: "—", companies: "—" });
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="HR Users" value={stats?.hrUsers ?? "…"} />
        <StatCard label="Active Employees" value={stats?.employees ?? "…"} />
        <StatCard label="Companies" value={stats?.companies ?? "…"} />
      </div>

      <Card className="p-5">
        <h2 className="text-[13px] font-semibold text-[var(--color-text)]">Getting started</h2>
        <ol className="mt-3 space-y-2 text-[13px] text-[var(--color-text-muted)]">
          <li>1. Create your first HR user from <span className="text-[var(--color-text)]">HR Users</span>.</li>
          <li>2. Set up Companies, Branches, and Departments under <span className="text-[var(--color-text)]">Organization</span>.</li>
          <li>3. Review the <span className="text-[var(--color-text)]">Roles & Permissions</span> matrix before HR starts adding employees.</li>
        </ol>
      </Card>
    </div>
  );
}
