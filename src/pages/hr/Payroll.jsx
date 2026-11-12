// HR › Payroll: every salary slip, filtered by month, year, employee and status, with totals, PDF and CSV.
import { useMemo, useState } from "react";
import { Download, Wallet } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button } from "../../components/ui/primitives";
import { Async, Grid, inputCls, PageHeader, Panel, StatusPill } from "../../components/employee/EmployeeShell";
import { dmy, money, MONTHS_LONG, useAsync } from "../../lib/employeePortal";
import { downloadCsv } from "../../lib/recruitment";

const FIELDS = ["name", "employee", "employee_name", "department", "start_date", "end_date", "posting_date", "gross_pay", "total_deduction", "net_pay", "currency", "status", "docstatus"];
const pdfUrl = (name) => `/api/method/frappe.utils.print_format.download_pdf?doctype=Salary%20Slip&name=${encodeURIComponent(name)}&no_letterhead=0`;

export default function Payroll() {
  const slips = useAsync(() => frappe.getList("Salary Slip", { filters: [["docstatus", "<", 2]], fields: FIELDS, orderBy: "end_date desc", limit: 0 }), []);
  const now = new Date();
  const [year, setYear] = useState("all");
  const [month, setMonth] = useState("all"); // "01".."12" or "all"
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const all = slips.data || [];
  const years = useMemo(() => [...new Set(all.map((r) => String(r.end_date).slice(0, 4)))].sort().reverse(), [all]);
  const shown = all.filter((r) => {
    const end = String(r.end_date);
    const q = search.trim().toLowerCase();
    return (year === "all" || end.startsWith(year))
      && (month === "all" || end.slice(5, 7) === month)
      && (status === "all" || r.status === status)
      && (!q || `${r.employee_name} ${r.employee} ${r.department || ""}`.toLowerCase().includes(q));
  });
  const sum = (k) => shown.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const cur = all[0]?.currency || "INR";
  const statuses = [...new Set(all.map((r) => r.status).filter(Boolean))];
  const period = [month !== "all" ? MONTHS_LONG[Number(month) - 1] : "", year !== "all" ? year : ""].filter(Boolean).join(" ") || "All periods";
  const exportCsv = () => downloadCsv(`salary-slips-${period.replace(/\s+/g, "-").toLowerCase()}.csv`,
    ["Employee ID", "Employee", "Department", "From", "To", "Gross", "Deductions", "Net Pay", "Status"],
    shown.map((r) => [r.employee, r.employee_name, r.department || "", r.start_date, r.end_date, r.gross_pay, r.total_deduction, r.net_pay, r.status]));

  return (
    <div className="space-y-5">
      <PageHeader icon={Wallet} title="Payroll" subtitle="Salary slips by month, with each employee's gross, deductions and net pay" actions={<Button variant="secondary" onClick={exportCsv} disabled={!shown.length}><Download size={14} /> Download CSV</Button>} />
      <Async state={slips}>
        {() => (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              {[["Salary slips", shown.length], ["Gross earnings", money(sum("gross_pay"), cur)], ["Total deductions", money(sum("total_deduction"), cur)], ["Net pay", money(sum("net_pay"), cur)]].map(([l, v]) => (
                <div key={l} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><p className="text-[12px] text-[var(--color-text-muted)]">{l} · {period}</p><p className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{v}</p></div>
              ))}
            </div>
            <Panel title="Salary Slips" action={
              <div className="flex flex-wrap gap-2">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" className={`${inputCls} !w-44 !py-1`} />
                <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} !w-auto !py-1`}><option value="all">All months</option>{MONTHS_LONG.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}</select>
                <select aria-label="Year" value={year} onChange={(e) => setYear(e.target.value)} className={`${inputCls} !w-auto !py-1`}><option value="all">All years</option>{(years.length ? years : [String(now.getFullYear())]).map((y) => <option key={y}>{y}</option>)}</select>
                <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputCls} !w-auto !py-1`}><option value="all">All statuses</option>{statuses.map((s) => <option key={s}>{s}</option>)}</select>
              </div>
            }>
              <Grid rows={shown} empty={all.length ? "No salary slips match these filters." : "No salary slips have been created yet."} columns={[
                { key: "employee_name", label: "Employee", render: (r) => <span>{r.employee_name}<span className="block text-[11px] text-[var(--color-text-faint)]">{r.employee}{r.department ? ` · ${r.department}` : ""}</span></span> },
                { key: "end_date", label: "Month", render: (r) => `${MONTHS_LONG[Number(String(r.end_date).slice(5, 7)) - 1]} ${String(r.end_date).slice(0, 4)}` },
                { key: "start_date", label: "Period", render: (r) => `${dmy(r.start_date)} – ${dmy(r.end_date)}` },
                { key: "gross_pay", label: "Gross", render: (r) => money(r.gross_pay, r.currency) },
                { key: "total_deduction", label: "Deductions", render: (r) => money(r.total_deduction, r.currency) },
                { key: "net_pay", label: "Net Pay", render: (r) => <b>{money(r.net_pay, r.currency)}</b> },
                { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
                { key: "_pdf", label: "", render: (r) => <a href={pdfUrl(r.name)} target="_blank" rel="noreferrer" title="Download PDF" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><Download size={14} /></a> },
              ]} />
            </Panel>
          </>
        )}
      </Async>
    </div>
  );
}
