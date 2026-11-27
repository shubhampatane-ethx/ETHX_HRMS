// Project Manager pages: dashboard, projects, and assignments (who works on what, in which role, until when).
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Ban, Briefcase, CalendarClock, CheckCheck, ClipboardList, Pencil, Plus, Search, Timer, Users } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { useAuth } from "../../context/AuthContext";
import { Button, DateField, LinkField } from "../../components/ui/primitives";
import { Async, chipCls, Empty, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, Stat, StatusPill } from "../../components/employee/EmployeeShell";
import { daysUntil, dmy, errMsg, isoDate, listTry, useAsync } from "../../lib/employeePortal";
import { createAssignment, listAssignments, parseAssignment, setAssignmentStatus, updateAssignment, workingDays } from "../../lib/assignments";
import { assertManagerRuleInstalled, loadProjectRoles, managerOf, managesProject, setProjectManager } from "../../lib/projectRoles";
import { hasPermission } from "../../permissions/roles";
import { matchesSearch, TeamMemberSearch } from "../../components/TeamMemberSearch";
import { endProject, previewEndProject } from "../../lib/contractors";
import { alertDialog, confirmDialog } from "../../components/ui/dialogs";
import { ProjectBoard } from "./ProjectBoard";
import { RowMenu } from "../../components/ui/RowMenu";
import { setStage, stageOf, STAGE_PATH } from "../../lib/projectLifecycle";

const loadProjects = () => listTry("Project", { fields: ["name", "project_name", "status", "expected_start_date", "expected_end_date", "percent_complete", "company", "custom_project_manager", "owner", "custom_stage", "actual_time", "actual_start_date", "priority"], orderBy: "modified desc" }, ["name", "project_name", "status", "expected_end_date", "company"]);
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
      await setStage(p.name, stageOf(p), "Closed").catch(() => {});
      projects.reload();
      assignments.reload();
    } catch (e) {
      alertDialog({ tone: "error", message: errMsg(e, "Couldn't end this project.") });
    }
  }
  const nameOf = (email) => (employees.data || []).find((e) => e.user_id === email)?.employee_name || email;
  const [stageFilter, setStageFilter] = useState("live");
  const inFilter = (p) => stageFilter === "all" || (stageFilter === "live" ? !ended(p) : stageOf(p) === stageFilter);
  const STAGE_CHIPS = [["live", "Live"], ...STAGE_PATH.slice(0, 4).map((s) => [s, s]), ["On Hold", "On Hold"], ["Closed", "Closed"], ["Cancelled", "Cancelled"], ["all", "All"]];
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const matches = (p) => !needle || [p.project_name, p.name, p.company, nameOf(managerOf(p))].some((v) => String(v || "").toLowerCase().includes(needle));
  const ready = projects.data && employees.data && assignments.data;

  return (
    <>
      <PageHeader icon={Briefcase} title="Projects" subtitle="Every project with its team, leads, dates, hours, tasks and delays. Open one for its full timeline" actions={<Button onClick={() => setOpen(true)}><Plus size={14} /> New Project</Button>} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">{STAGE_CHIPS.map(([id, l]) => <button key={id} type="button" onClick={() => setStageFilter(id)} className={chipCls(stageFilter === id)}>{l}{projects.data && <span className="ml-1.5 text-[var(--color-text-faint)]">{projects.data.filter((p) => id === "all" || (id === "live" ? !ended(p) : stageOf(p) === id)).length}</span>}</button>)}</div>
        <div className="w-full sm:w-72"><input className={inputCls} placeholder="Search project, company, manager…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <Async state={projects}>
        {(list) => (ready ? <ProjectBoard all={list} list={list.filter((p) => inFilter(p) && matches(p))} assignments={rows} employees={employees.data} nameOf={nameOf} isAdmin={isAdmin} onEnd={end} /> : <Panel><p className="text-[13px] text-[var(--color-text-muted)]">Loading team and hours…</p></Panel>)}
      </Async>
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
  const navigate = useNavigate();
  // ?assign=1 (or a project) opens the Assign form; ?person=<email> picks the team member (from Resources' bench).
  const [modal, setModal] = useState(() => (params.get("assign") ? { project: params.get("assign") === "1" ? "" : params.get("assign"), email: params.get("person") || "" } : null));
  const today = isoDate();

  const shown = rows.filter((a) => (filter === "all" || (filter === "active" ? isActive(a) : filter === "completed" ? a.status === "Completed" : a.status === "Cancelled")) && (!projectFilter || a.project === projectFilter) && (!search.trim() || matchesSearch(search, { name: a.employee?.employee_name || a.assignees[0] || "", roles: [a.role, a.employee?.designation] })));

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

  // Figures for the tiles and each row.
  const activeRows = rows.filter(isActive);
  const weekIso = isoDate(new Date(new Date().setDate(new Date().getDate() + 7)));
  const overdue = activeRows.filter((a) => a.eta && a.eta < today);
  const endingSoon = activeRows.filter((a) => a.eta >= today && a.eta <= weekIso);
  const people = new Set(activeRows.flatMap((a) => a.assignees)).size;
  const bookedPerDay = activeRows.filter((a) => a.start <= today && a.eta >= today).reduce((n, a) => n + (Number(a.hoursPerDay) || 0), 0);
  const count = (v) => rows.filter((a) => (v === "all" ? true : v === "active" ? isActive(a) : v === "completed" ? a.status === "Completed" : a.status === "Cancelled")).length;

  return (
    <>
      <PageHeader icon={ClipboardList} title="Assignments" subtitle="Who works on which project, in what role, for how long, and how many hours a day" actions={<Button onClick={() => setModal({ project: projectFilter })}><Plus size={14} /> Assign Team Member</Button>} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={ClipboardList} label="Active Assignments" value={assignments.data ? activeRows.length : undefined} sub={`${people} people on projects`} />
        <Stat icon={AlertTriangle} label="Past ETA" value={assignments.data ? overdue.length : undefined} sub="Still active after their end date" accent="var(--color-red-hover)" />
        <Stat icon={CalendarClock} label="Ending Within 7 Days" value={assignments.data ? endingSoon.length : undefined} sub="Extend or let them finish" accent="var(--color-amber)" />
        <Stat icon={Timer} label="Hours Booked Today" value={assignments.data ? `${bookedPerDay} h` : undefined} sub="Across everyone assigned today" accent="#2563eb" />
      </div>
      <Panel title="Team Assignments" hint="Each assignment pre-fills the person's monthly timesheet: every working day from start to ETA at the hours per day set here, minus leave and holidays.">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">{FILTERS.map(([v, l]) => <button key={v} type="button" onClick={() => setFilter(v)} className={chipCls(filter === v)}>{l}{assignments.data && <span className="ml-1.5 text-[var(--color-text-faint)]">{count(v)}</span>}</button>)}</div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-48"><select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className={inputCls}><option value="">All Projects</option>{(projects.data || []).map((p) => <option key={p.name} value={p.name}>{projectLabel(p)}</option>)}</select></div>
            <div className="relative w-60"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or role…" className={`${inputCls} pl-8`} /></div>
          </div>
        </div>
        <Async state={assignments}>
          {() => <Grid rows={shown} empty="No assignments match." columns={[
            { key: "employee", label: "Team Member", render: (a) => {
              const name = a.employee?.employee_name || a.assignees[0] || "—";
              return (
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-red-wash)] text-[11px] font-semibold text-[var(--color-red-hover)]">{String(name).split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>
                  <div className="min-w-0"><div className="truncate font-medium">{name}</div>{a.employee?.designation && <div className="truncate text-[11px] text-[var(--color-text-faint)]">{a.employee.designation}</div>}</div>
                </div>
              );
            } },
            { key: "projectName", label: "Project", render: (a) => <Link to={`/pm/projects/${encodeURIComponent(a.project)}`} className="font-medium hover:text-[var(--color-red-hover)] hover:underline">{a.projectName}</Link> },
            { key: "role", label: "Role", render: (a) => <span>{a.role}{/lead|manager|head|architect/i.test(a.role || "") && <span className="ml-1.5 rounded bg-[var(--color-red-wash)] px-1.5 py-px text-[10px] font-semibold text-[var(--color-red-hover)]">Lead</span>}</span> },
            { key: "start", label: "Period", className: "min-w-[210px]", render: (a) => <Period a={a} today={today} /> },
            { key: "hoursPerDay", label: "Hours", render: (a) => <span><span className="font-medium">{a.hoursPerDay} h/day</span><span className="block text-[11px] text-[var(--color-text-faint)]">{Math.round((Number(a.hoursPerDay) || 0) * workingDays(a.start, a.end || a.eta))} h in total</span></span> },
            { key: "status", label: "Status", render: (a) => <StatusPill status={isActive(a) && a.eta < today ? "Overdue" : a.status} /> },
            { key: "_a", label: "", className: "w-[150px]", render: (a) => isActive(a) ? (
              <div className="flex items-center justify-end gap-1.5">
                {a.eta < today
                  ? <Button className="!px-2.5 !py-1 text-[11.5px]" onClick={() => setModal({ edit: a })}><CalendarClock size={12} /> Extend</Button>
                  : <Button variant="secondary" className="!px-2.5 !py-1 text-[11.5px]" onClick={() => setModal({ edit: a })}><Pencil size={12} /> Edit</Button>}
                <RowMenu items={[
                  a.eta < today && { label: "Edit Assignment", icon: Pencil, onClick: () => setModal({ edit: a }) },
                  { label: "Mark Completed", icon: CheckCheck, onClick: () => setStatus(a, "Completed", `Mark ${a.role} on ${a.projectName} as completed? Timesheets stop filling after today.`) },
                  { label: "View Project", icon: Briefcase, onClick: () => navigate(`/pm/projects/${encodeURIComponent(a.project)}`) },
                  { label: "Cancel Assignment", icon: Ban, danger: true, onClick: () => setStatus(a, "Cancelled", "Cancel this assignment? It will no longer pre-fill timesheets.") },
                ]} />
              </div>
            ) : <div className="text-right text-[11px] text-[var(--color-text-faint)]">{a.status === "Completed" ? `Finished ${dmy(a.end || a.eta)}` : "Cancelled"}</div> },
          ]} />}
        </Async>
      </Panel>
      {modal && <AssignModal init={modal} projects={projects.data || []} employees={employees.data || []} roles={roles} active={rows.filter(isActive)} history={rows} onClose={closeModal} onSaved={(text) => { closeModal(); assignments.reload(); projects.reload(); if (text) alertDialog({ tone: "success", title: "Project Manager Set", message: text }); }} />}
    </>
  );
}

/** Start → ETA with how far along it is, and days left or overdue. */
function Period({ a, today }) {
  const total = Math.max(1, daysUntil(a.eta) - daysUntil(a.start));
  const used = Math.min(total, Math.max(0, -daysUntil(a.start)));
  const left = daysUntil(a.eta);
  const live = isActive(a);
  const late = live && left < 0;
  return (
    <div>
      <div className="whitespace-nowrap">{dmy(a.start)} – {dmy(a.end || a.eta)}</div>
      {live && (
        <>
          <div className="mt-1 h-1 w-full max-w-[180px] overflow-hidden rounded-full bg-[var(--color-surface-2)]"><div className="h-full rounded-full" style={{ width: `${late ? 100 : Math.round((used / total) * 100)}%`, background: late ? "var(--color-red-hover)" : "var(--color-green)" }} /></div>
          <div className={`mt-0.5 text-[11px] ${late ? "font-medium text-[var(--color-red-hover)]" : "text-[var(--color-text-faint)]"}`}>{late ? `${-left} day(s) past ETA` : a.start > today ? `Starts in ${daysUntil(a.start)} day(s)` : left === 0 ? "Ends today" : `${left} day(s) left`}</div>
        </>
      )}
    </div>
  );
}

function AssignModal({ init, projects, employees, roles, active, history, onClose, onSaved }) {
  const edit = init.edit;
  const lastDay = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  const [f, setF] = useState(() => edit
    ? { project: edit.project, email: edit.assignees[0] || "", role: edit.role, start: edit.start, eta: edit.eta, hours: String(edit.hoursPerDay), notes: edit.notes }
    : { project: init.project || "", email: init.email || "", role: "", start: isoDate(), eta: isoDate(lastDay), hours: "8", notes: "" });
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