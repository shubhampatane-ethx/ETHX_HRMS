// Project Manager pages: dashboard, projects, and assignments (who works on what, in which role, until when).
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Ban, Briefcase, CalendarClock, CheckCheck, ClipboardList, Flag, Pencil, Plus, Users } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { useAuth } from "../../context/AuthContext";
import { Button, DateField, LinkField } from "../../components/ui/primitives";
import { Async, chipCls, Empty, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, Stat, StatusPill } from "../../components/employee/EmployeeShell";
import { dmy, errMsg, isoDate, listTry, useAsync } from "../../lib/employeePortal";
import { createAssignment, listAssignments, parseAssignment, setAssignmentStatus, updateAssignment, workingDays } from "../../lib/assignments";
import { assertManagerRuleInstalled, loadProjectRoles, managerOf, managesProject, setProjectManager } from "../../lib/projectRoles";
import { hasPermission } from "../../permissions/roles";
import { TeamMemberSearch } from "../../components/TeamMemberSearch";
import { endProject, previewEndProject } from "../../lib/contractors";
import { alertDialog, confirmDialog } from "../../components/ui/dialogs";

const loadProjects = () => listTry("Project", { fields: ["name", "project_name", "status", "expected_start_date", "expected_end_date", "percent_complete", "company", "custom_project_manager", "owner"], orderBy: "modified desc" }, ["name", "project_name", "status", "expected_end_date", "company"]);
const loadEmployees = () => listTry("Employee", { filters: [["status", "=", "Active"]], fields: ["name", "employee_name", "user_id", "department", "designation", "company"], orderBy: "employee_name asc" }, ["name", "employee_name", "user_id", "company"]);
const projectLabel = (p) => (p.project_name && p.project_name !== p.name ? p.project_name : p.name);
const ACTIVE = ["Open", "Working", "Pending Review", "Overdue"];
const isActive = (a) => ACTIVE.includes(a.status);

function useTeam() {
  const { user } = useAuth();
  const seesAll = hasPermission(user, "dashboard.admin") || hasPermission(user, "dashboard.hr");
  // ERPNext also returns projects this person only works on (for their timesheet); the workspace is for the ones they manage.
  const allProjects = useAsync(loadProjects, []);
  const projects = useMemo(() => ({ ...allProjects, data: allProjects.data?.filter((p) => seesAll || !("owner" in p) || managerOf(p) === user.email) }), [allProjects, seesAll, user.email]);
  const employees = useAsync(loadEmployees, []);
  const assignments = useAsync(listAssignments, []);
  const byUser = useMemo(() => Object.fromEntries((employees.data || []).filter((e) => e.user_id).map((e) => [e.user_id, e])), [employees.data]);
  const projectMap = useMemo(() => Object.fromEntries((projects.data || []).map((p) => [p.name, p])), [projects.data]);
  const rows = useMemo(() => (assignments.data || []).map(parseAssignment).filter((a) => projectMap[a.project]).map((a) => ({ ...a, employee: byUser[a.assignees[0]], projectName: projectMap[a.project] ? projectLabel(projectMap[a.project]) : a.project })), [assignments.data, byUser, projectMap]);
  return { projects, employees, assignments, rows };
}

/* ------------------------------- dashboard ------------------------------- */

export function PMDashboard() {
  const { projects, employees, assignments, rows } = useTeam();
  const today = isoDate();
  const active = rows.filter(isActive);
  const week = new Date(Date.now() + 7 * 86400000);
  const weekIso = isoDate(week);
  const ending = active.filter((a) => a.eta <= weekIso).sort((a, b) => a.eta.localeCompare(b.eta));
  const openProjects = (projects.data || []).filter((p) => !["Completed", "Cancelled"].includes(p.status));
  const busy = new Set(active.filter((a) => a.start <= today && a.end >= today).flatMap((a) => a.assignees));
  const free = (employees.data || []).filter((e) => e.user_id && !busy.has(e.user_id)).length;

  return (
    <>
      <PageHeader icon={Briefcase} title="Project Manager" subtitle="Assign people to projects with a role and ETA - their timesheets fill in automatically" actions={<Link to="/pm/assignments?assign=1"><Button><Plus size={14} /> Assign Team Member</Button></Link>} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat to="/pm/projects" icon={Briefcase} label="Open Projects" value={projects.data ? openProjects.length : projects.error ? "—" : undefined} sub="Not completed or cancelled" accent="#4f8cff" />
        <Stat to="/pm/assignments" icon={ClipboardList} label="Active Assignments" value={assignments.data ? active.length : assignments.error ? "—" : undefined} sub="People on projects" accent="var(--color-green)" />
        <Stat to="/pm/assignments" icon={Users} label="Free Today" value={employees.data && assignments.data ? free : undefined} sub="Employees with a login, not assigned today" accent="var(--color-amber)" />
        <Stat to="/pm/assignments" icon={CalendarClock} label="ETA Within 7 Days" value={assignments.data ? ending.length : undefined} sub="Assignments ending soon" accent="var(--color-red-hover)" />
      </div>
      <Panel title="Upcoming ETAs" hint="Active assignments by end date" action={<Link to="/pm/assignments" className="text-[12px] text-[var(--color-red-hover)] hover:underline">View All</Link>}>
        <Async state={assignments}>
          {() => active.length === 0 ? <Empty text="No active assignments yet." /> : (
            <Grid rows={active.slice(0, 8)} columns={[
              { key: "employee", label: "Team Member", render: (r) => r.employee?.employee_name || r.assignees[0] || "—" },
              { key: "projectName", label: "Project" },
              { key: "role", label: "Role" },
              { key: "eta", label: "ETA", render: (r) => <span className={r.eta < today ? "text-[var(--color-red-hover)]" : ""}>{dmy(r.eta)}</span> },
              { key: "hoursPerDay", label: "Hours/Day" },
            ]} />
          )}
        </Async>
      </Panel>
    </>
  );
}

/* -------------------------------- projects -------------------------------- */

export function PMProjects() {
  const { user } = useAuth();
  const isAdmin = hasPermission(user, "dashboard.admin");
  const { projects, employees, assignments, rows } = useTeam();
  const [open, setOpen] = useState(false);
  const ended = (p) => ["Completed", "Cancelled"].includes(p.status);

  async function end(p) {
    try {
      const { remove, kept } = await previewEndProject(p.name);
      const lines = [`End ${projectLabel(p)}? It is marked Completed.`];
      if (remove.length) {
        lines.push(`\nThese contractors' logins and details are deleted permanently. This can't be undone. Their timesheets stay, with just their name:`);
        remove.forEach((c) => lines.push(`• ${c.name}${c.unsubmitted ? ` (${c.unsubmitted} timesheet(s) not submitted yet: they can no longer submit them)` : ""}`));
      }
      if (kept.length) lines.push(`\nStaying because they work on another live project: ${kept.map((c) => c.name).join(", ")}.`);
      if (!(await confirmDialog({ title: "End Project", message: lines.join("\n"), danger: true, confirmLabel: remove.length ? "End and delete contractors" : "End project" }))) return;
      await endProject(p.name);
      projects.reload();
      assignments.reload();
    } catch (e) {
      alertDialog({ tone: "error", message: errMsg(e, "Couldn't end this project.") });
    }
  }
  const nameOf = (email) => (employees.data || []).find((e) => e.user_id === email)?.employee_name || email;
  const team = (id) => new Set(rows.filter((a) => a.project === id && isActive(a)).flatMap((a) => a.assignees)).size;

  return (
    <>
      <PageHeader icon={Briefcase} title="Projects" subtitle="Your company's projects and how many people are assigned" actions={<Button onClick={() => setOpen(true)}><Plus size={14} /> New Project</Button>} />
      <Panel>
        <Async state={projects}>
          {(list) => <Grid rows={list} empty="No projects yet." columns={[
            { key: "name", label: "Project", render: (p) => <span>{projectLabel(p)}{p.project_name && p.project_name !== p.name && <span className="ml-2 text-[11px] text-[var(--color-text-faint)]">{p.name}</span>}</span> },
            { key: "manager", label: "Project Manager", render: (p) => (managerOf(p) ? nameOf(managerOf(p)) : "—") },
            { key: "status", label: "Status", render: (p) => <StatusPill status={p.status} /> },
            { key: "expected_end_date", label: "ETA", render: (p) => dmy(p.expected_end_date) || "—" },
            { key: "percent_complete", label: "Progress", render: (p) => (p.percent_complete != null ? `${Math.round(p.percent_complete)}%` : "—") },
            { key: "team", label: "Team", render: (p) => team(p.name) },
            { key: "_a", label: "", render: (p) => (ended(p) ? null : (
              <div className="flex items-center justify-end gap-3 whitespace-nowrap text-[11px]">
                <Link to={`/pm/assignments?assign=${encodeURIComponent(p.name)}`} className="text-[var(--color-red-hover)] hover:underline">Assign</Link>
                {isAdmin && <button type="button" onClick={() => end(p)} className="flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><Flag size={12} /> End Project</button>}
              </div>
            )) },
          ]} />}
        </Async>
      </Panel>
      {open && <ProjectModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); projects.reload(); }} />}
    </>
  );
}

function ProjectModal({ onClose, onSaved }) {
  const { user } = useAuth();
  const [f, setF] = useState({ name: "", company: "", start: isoDate(), end: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (f.end && f.end < f.start) return setErr("The ETA can't be before the start date.");
    setBusy(true);
    setErr("");
    try {
      const doc = { project_name: f.name.trim(), company: f.company, status: "Open", is_active: "Yes", expected_start_date: f.start || undefined, expected_end_date: f.end || undefined };
      // The creating PM approves timesheet hours on this project (field added by ERPNext Setup).
      try { await frappe.createDoc("Project", { ...doc, custom_project_manager: user.email }); }
      catch (x) { if (/custom_project_manager|Unknown column|not permitted/i.test(String(x?.response?.data?.exception || ""))) await frappe.createDoc("Project", doc); else throw x; }
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't create the project."));
      setBusy(false);
    }
  }
  return (
    <Modal title="New Project" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Project Name"><input required className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <LinkField label="Company" linkDoctype="Company" value={f.company} onChange={(v) => setF({ ...f, company: v })} required frappe={frappe} />
        <div className="grid grid-cols-2 gap-3"><DateField label="Start" value={f.start} onChange={(v) => setF({ ...f, start: v })} /><DateField label="ETA (End)" value={f.end} onChange={(v) => setF({ ...f, end: v })} /></div>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create Project"}</Button></div>
      </form>
    </Modal>
  );
}

/* ------------------------------- assignments ------------------------------- */

const FILTERS = [["active", "Active"], ["completed", "Completed"], ["cancelled", "Cancelled"], ["all", "All"]];

export function PMAssignments() {
  const { projects, employees, assignments, rows } = useTeam();
  const roleList = useAsync(loadProjectRoles, []);
  const roles = roleList.data?.roles || [];
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState("active");
  const [projectFilter, setProjectFilter] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(() => (params.get("assign") ? { project: params.get("assign") === "1" ? "" : params.get("assign") } : null));
  const today = isoDate();

  const shown = rows.filter((a) => (filter === "all" || (filter === "active" ? isActive(a) : filter === "completed" ? a.status === "Completed" : a.status === "Cancelled")) && (!projectFilter || a.project === projectFilter) && (!search || `${a.employee?.employee_name || a.assignees[0] || ""} ${a.role}`.toLowerCase().includes(search.toLowerCase())));

  async function setStatus(a, status, text) {
    if (!(await confirmDialog(text))) return;
    try {
      // Finishing a manager's assignment ends their management of that project too.
      const project = (projects.data || []).find((p) => p.name === a.project);
      const endsManagement = managesProject(roles, a.role) && project?.custom_project_manager === a.assignees[0];
      if (endsManagement) await assertManagerRuleInstalled();
      await setAssignmentStatus(a.name, status, a);
      if (endsManagement) await setProjectManager(a.project, "");
      assignments.reload();
      projects.reload();
    } catch (e) {
      alertDialog({ tone: "error", message: errMsg(e, "Couldn't update the assignment.") });
    }
  }
  const closeModal = () => { setModal(null); if (params.get("assign")) setParams({}); };

  return (
    <>
      <PageHeader icon={ClipboardList} title="Assignments" subtitle="Who works on which project, in what role, until when" actions={<Button onClick={() => setModal({ project: projectFilter })}><Plus size={14} /> Assign Team Member</Button>} />
      <Notice tone="info">Team members see these days pre-filled in their monthly timesheet: every working day from the start date to the ETA, with the hours per day you set, minus leave and holidays.</Notice>
      <Panel>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {FILTERS.map(([v, l]) => <button key={v} type="button" onClick={() => setFilter(v)} className={chipCls(filter === v)}>{l}</button>)}
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className={`${inputCls} !w-auto !py-1`}><option value="">All projects</option>{(projects.data || []).map((p) => <option key={p.name} value={p.name}>{projectLabel(p)}</option>)}</select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or role…" className={`${inputCls} !w-48 !py-1`} />
        </div>
        <Async state={assignments}>
          {() => <Grid rows={shown} empty="No assignments match." columns={[
            { key: "employee", label: "Team Member", render: (a) => a.employee?.employee_name || a.assignees[0] || "—" },
            { key: "projectName", label: "Project" },
            { key: "role", label: "Role" },
            { key: "start", label: "Period", render: (a) => `${dmy(a.start)} – ${dmy(a.eta)}` },
            { key: "hoursPerDay", label: "Hours/Day" },
            { key: "status", label: "Status", render: (a) => <StatusPill status={isActive(a) && a.eta < today ? "Overdue" : a.status} /> },
            { key: "_a", label: "", render: (a) => isActive(a) ? (
              <div className="flex justify-end gap-1">
                <button type="button" title="Edit role / ETA / hours" onClick={() => setModal({ edit: a })} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><Pencil size={14} /></button>
                <button type="button" title="Mark completed" onClick={() => setStatus(a, "Completed", `Mark ${a.role} on ${a.projectName} as completed? Timesheets stop filling after today.`)} className="rounded p-1 text-[var(--color-green)] hover:bg-[var(--color-surface-2)]"><CheckCheck size={14} /></button>
                <button type="button" title="Cancel assignment" onClick={() => setStatus(a, "Cancelled", "Cancel this assignment? It will no longer pre-fill timesheets.")} className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><Ban size={14} /></button>
              </div>
            ) : null },
          ]} />}
        </Async>
      </Panel>
      {modal && <AssignModal init={modal} projects={projects.data || []} employees={employees.data || []} roles={roles} active={rows.filter(isActive)} history={rows} onClose={closeModal} onSaved={(text) => { closeModal(); assignments.reload(); projects.reload(); if (text) alertDialog({ tone: "success", title: "Project Manager Set", message: text }); }} />}
    </>
  );
}

function AssignModal({ init, projects, employees, roles, active, history, onClose, onSaved }) {
  const edit = init.edit;
  const lastDay = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  const [f, setF] = useState(() => edit
    ? { project: edit.project, email: edit.assignees[0] || "", role: edit.role, start: edit.start, eta: edit.eta, hours: String(edit.hoursPerDay), notes: edit.notes }
    : { project: init.project || "", email: "", role: "", start: isoDate(), eta: isoDate(lastDay), hours: "8", notes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const project = projects.find((p) => p.name === f.project);
  const label = project ? projectLabel(project) : f.project;
  const days = workingDays(f.start, f.eta);
  const hours = Number(f.hours) || 0;

  // how booked is this person in the same period?
  const booked = f.email ? active.filter((a) => a.name !== edit?.name && a.assignees.includes(f.email) && a.start <= f.eta && a.end >= f.start).reduce((s, a) => s + a.hoursPerDay, 0) : 0;

  async function submit(e) {
    e.preventDefault();
    if (!f.email) return setErr("Choose a team member.");
    if (f.eta < f.start) return setErr("The ETA can't be before the start date.");
    if (!(hours > 0 && hours <= 24)) return setErr("Hours per day must be between 0 and 24.");
    const makeManager = managesProject(roles, f.role);
    const wasManager = edit && managesProject(roles, edit.role);
    const person = (email) => employees.find((x) => x.user_id === email)?.employee_name || email;
    const current = project?.custom_project_manager;
    const replacing = makeManager && current && current !== f.email && current !== "Administrator";
    if (replacing && !(await confirmDialog({ title: "Replace Project Manager", message: `${person(current)} manages ${label} now. A project has one manager at a time: make ${person(f.email)} the manager instead?`, confirmLabel: "Replace" }))) return;
    setBusy(true);
    setErr("");
    try {
      if (makeManager || wasManager) await assertManagerRuleInstalled();
      const data = { project: f.project, projectLabel: label, email: f.email, role: f.role.trim(), start: f.start, eta: f.eta, hoursPerDay: hours, notes: f.notes.trim() };
      if (edit) await updateAssignment(edit.name, data);
      else await createAssignment(data);
      if (replacing) {
        // The previous manager's assignment ends with their role; done first, while the signed-in person may still change the team.
        for (const a of active.filter((x) => x.project === f.project && x.name !== edit?.name && x.assignees.includes(current) && managesProject(roles, x.role))) await setAssignmentStatus(a.name, "Completed", a);
      }
      if (makeManager) await setProjectManager(f.project, f.email);
      else if (wasManager && current === f.email) await setProjectManager(f.project, "");
      onSaved(makeManager && current !== f.email ? `${person(f.email)} now manages ${label}. They need to sign out and back in to get the Project Manager workspace.` : "");
    } catch (x) {
      setErr(errMsg(x, "Couldn't save the assignment."));
      setBusy(false);
    }
  }

  return (
    <Modal title={edit ? "Edit Assignment" : "Assign Team Member to a Project"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Project">
            {edit ? <p className="py-2 text-[13px] text-[var(--color-text)]">{label}</p> : <select required className={inputCls} value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })}><option value="">Select…</option>{projects.filter((p) => !["Completed", "Cancelled"].includes(p.status)).map((p) => <option key={p.name} value={p.name}>{projectLabel(p)}</option>)}</select>}
          </Field>
          {/* Not a Field: that wraps its contents in a <label>, and clicking a result would refocus the search box. */}
          <div>
            <p className="mb-1.5 text-[12px] text-[var(--color-text-muted)]">Team Member</p>
            {edit
              ? <p className="py-2 text-[13px] text-[var(--color-text)]">{employees.find((x) => x.user_id === f.email)?.employee_name || f.email}</p>
              : <TeamMemberSearch people={employees} assignments={history} value={f.email} onChange={(email) => setF({ ...f, email })} />}
            {!edit && <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">Search by name or role. Only people with a portal login can be assigned.</p>}
          </div>
        </div>
        <Field label="Role on This Project" hint={managesProject(roles, f.role) ? "This person will manage this project: assign its team and approve its timesheets, on this project only." : undefined}>
          <select required className={inputCls} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            <option value="">Select…</option>
            {edit && !roles.some((r) => r.role_name === f.role) && <option>{f.role}</option>}
            {roles.filter((r) => !Number(r.disabled) || r.role_name === f.role).map((r) => <option key={r.name} value={r.role_name}>{r.role_name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <DateField label="Start Date" value={f.start} onChange={(v) => setF({ ...f, start: v, eta: f.eta < v ? v : f.eta })} required />
          <DateField label="ETA (End Date)" value={f.eta} onChange={(v) => setF({ ...f, eta: v })} required />
          <Field label="Hours per Day"><input type="number" min="0.25" max="24" step="0.25" required className={inputCls} value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></Field>
        </div>
        <Field label="Notes (Optional)"><textarea rows={2} className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <p className="text-[12px] text-[var(--color-text-muted)]">About <b className="text-[var(--color-text)]">{days}</b> working day(s) · <b className="text-[var(--color-text)]">{(days * hours).toFixed(1)} h</b> in total. Their monthly timesheet fills these days automatically.</p>
        {booked > 0 && <Notice tone="info">This team member is already booked {booked} h/day in that period - with this assignment that becomes {booked + hours} h/day.</Notice>}
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : edit ? "Save Changes" : "Assign"}</Button></div>
      </form>
    </Modal>
  );
}