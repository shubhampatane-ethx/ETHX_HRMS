import { useEffect, useState } from "react";
import { frappe } from "../../lib/api/frappeClient";
import { Card, StatCard } from "../../components/ui/primitives";

export default function HRDashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [active, pendingLeave] = await Promise.all([
          frappe.getList("Employee", { filters: [["status", "=", "Active"]], fields: ["name"], limit: 0 }),
          frappe.getList("Leave Application", { filters: [["status", "=", "Open"]], fields: ["name"], limit: 0 }),
        ]);
        setStats({ active: active.length, pendingLeave: pendingLeave.length });
      } catch {
        setStats({ active: "—", pendingLeave: "—" });
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active Employees" value={stats?.active ?? "…"} />
        <StatCard label="Pending Leave Requests" value={stats?.pendingLeave ?? "…"} />
        <StatCard label="Today's Attendance" value="—" />
      </div>
      <Card className="p-5">
        <h2 className="text-[13px] font-semibold text-[var(--color-text)]">Quick actions</h2>
        <p className="mt-2 text-[13px] text-[var(--color-text-muted)]">
          Add employees, review leave, and run payroll from the sections in the sidebar.
        </p>
      </Card>
    </div>
  );
}
