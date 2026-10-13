import { useMemo, useState } from "react";
import { BriefcaseBusiness, Check, Loader2, RefreshCw, Save, Users } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { errMsg, useAsync } from "../../lib/employeePortal";
import { Button, Card } from "../../components/ui/primitives";

const EMPTY = [];

async function loadProjects() {
  const [projectRows, employeeRows] = await Promise.all([
    frappe.getList("Project", { fields: ["name", "project_name", "status"], limit: 0, orderBy: "modified desc" }),
    frappe.getList("Employee", { filters: [["status", "=", "Active"]], fields: ["name", "employee_name", "user_id", "company"], limit: 0, orderBy: "employee_name asc" }),
  ]);
  const documents = await Promise.all(projectRows.map((row) => frappe.getDoc("Project", row.name)));
  return {
    projects: documents.map((doc) => ({ ...projectRows.find((row) => row.name === doc.name), users: doc.users || [] })),
    employees: employeeRows.filter((employee) => employee.user_id),
  };
}

export default function AdminProjects() {
  const query = useAsync(loadProjects, []);
  const projects = query.data?.projects || EMPTY;
  const employees = query.data?.employees || EMPTY;
  const [selected, setSelected] = useState("");
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const selectedProject = projects.some((item) => item.name === selected) ? selected : projects[0]?.name || "";
  const project = projects.find((item) => item.name === selectedProject);
  const assignedEmployees = useMemo(() => {
    const users = new Set((project?.users || []).map((row) => row.user));
    return employees.filter((employee) => users.has(employee.user_id)).map((employee) => employee.name);
  }, [employees, project]);
  const assigned = drafts[selectedProject] || assignedEmployees;
  const assignmentChanged = assigned.length !== assignedEmployees.length || assigned.some((name) => !assignedEmployees.includes(name));

  function toggle(employeeName) {
    setDrafts((current) => {
      const previous = current[selectedProject] || assignedEmployees;
      const next = previous.includes(employeeName)
        ? previous.filter((name) => name !== employeeName)
        : [...previous, employeeName];
      return { ...current, [selectedProject]: next };
    });
    setMessage("");
  }

  async function saveAssignments() {
    if (!project) return;
    setSaving(true);
    setMessage("");
    try {
      const employeeUsers = new Set(employees.map((employee) => employee.user_id));
      const rowsByUser = new Map((project.users || []).map((row) => [row.user, row]));
      const preserved = (project.users || []).filter((row) => !employeeUsers.has(row.user));
      const selectedRows = assigned
        .map((name) => employees.find((employee) => employee.name === name))
        .filter(Boolean)
        .map((employee) => rowsByUser.get(employee.user_id) || { user: employee.user_id, full_name: employee.employee_name });
      await frappe.updateDoc("Project", project.name, { users: [...preserved, ...selectedRows] });
      setDrafts((current) => { const next = { ...current }; delete next[project.name]; return next; });
      setMessage(`Assignments saved for ${project.project_name || project.name}.`);
      query.reload();
    } catch (e) {
      setMessage(errMsg(e, "Couldn't save project assignments. Check Project write permissions."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-border)] pb-5">
        <div>
          <p className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-red-hover)]"><BriefcaseBusiness size={14} /> Work allocation</p>
          <h1 className="text-[19px] font-semibold text-[var(--color-text)]">Project assignments</h1>
          <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">Assign active employee accounts to ERPNext projects. Employees can only select projects listed here when logging hours.</p>
        </div>
        <Button variant="secondary" onClick={() => { setMessage(""); query.reload(); }} disabled={query.loading}><RefreshCw size={14} /> Refresh</Button>
      </section>

      {query.error && <p role="alert" className="rounded-md border border-[var(--color-red)]/30 bg-[var(--color-red-wash)] px-3 py-2 text-[12px] text-[var(--color-red-hover)]">{errMsg(query.error, "Couldn't load projects and employee accounts.")}</p>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <div><h2 className="text-[13px] font-semibold text-[var(--color-text)]">ERPNext projects</h2><p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{projects.length} available</p></div>
            <BriefcaseBusiness size={16} className="text-[var(--color-text-faint)]" />
          </div>
          {query.loading && !query.data ? <div className="flex h-32 items-center justify-center text-[13px] text-[var(--color-text-muted)]"><Loader2 size={14} className="mr-2 animate-spin" />Loading projects…</div> : projects.length === 0 ? <p className="p-5 text-[13px] text-[var(--color-text-muted)]">No projects found in ERPNext.</p> : (
            <ul className="max-h-[65vh] overflow-y-auto divide-y divide-[var(--color-border)]">
              {projects.map((item) => {
                const count = employees.filter((employee) => (item.users || []).some((row) => row.user === employee.user_id)).length;
                return (
                  <li key={item.name}>
                    <button type="button" onClick={() => { setSelected(item.name); setMessage(""); }} className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${selectedProject === item.name ? "bg-[var(--color-red-wash)]" : "hover:bg-[var(--color-surface-2)]"}`}>
                      <span className="min-w-0"><span className="block truncate text-[13px] font-medium text-[var(--color-text)]">{item.project_name || item.name}</span><span className="block truncate text-[11px] text-[var(--color-text-muted)]">{item.name}{item.status ? ` · ${item.status}` : ""}</span></span>
                      <span className="flex shrink-0 items-center gap-1 text-[11px] text-[var(--color-text-muted)]"><Users size={13} />{count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
            <div><h2 className="text-[13px] font-semibold text-[var(--color-text)]">{project?.project_name || project?.name || "Select a project"}</h2><p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">Choose employee accounts allowed to log time</p></div>
            <Button onClick={saveAssignments} disabled={!project || query.loading || saving || !assignmentChanged}><Save size={14} />{saving ? "Saving…" : "Save assignments"}</Button>
          </div>
          {!project ? <p className="p-5 text-[13px] text-[var(--color-text-muted)]">Select a project to manage its employee assignments.</p> : employees.length === 0 ? <p className="p-5 text-[13px] text-[var(--color-text-muted)]">No active employees with linked user accounts are available.</p> : (
            <ul className="max-h-[65vh] overflow-y-auto divide-y divide-[var(--color-border)]">
              {employees.map((employee) => {
                const checked = assigned.includes(employee.name);
                return (
                  <li key={employee.name}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-[var(--color-surface-2)]">
                      <input type="checkbox" checked={checked} onChange={() => toggle(employee.name)} className="h-4 w-4 accent-[var(--color-red)]" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-[13px] text-[var(--color-text)]">{employee.employee_name || employee.name}</span><span className="block truncate text-[11px] text-[var(--color-text-muted)]">{employee.user_id}{employee.company ? ` · ${employee.company}` : ""}</span></span>
                      {checked && <Check size={15} className="text-[var(--color-green)]" />}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {message && <p role="status" className={`border-t border-[var(--color-border)] px-4 py-3 text-[12px] ${message.startsWith("Couldn't") ? "text-[var(--color-red-hover)]" : "text-[var(--color-green)]"}`}>{message}</p>}
        </Card>
      </div>
    </div>
  );
}