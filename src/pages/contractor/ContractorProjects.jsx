import { Briefcase } from "lucide-react";
import { Async, Empty, KeyValue, PageHeader, Panel, StatusPill } from "../../components/employee/EmployeeShell";
import { useAuth } from "../../context/AuthContext";
import { frappe } from "../../lib/api/frappeClient";
import { dmy, useAsync } from "../../lib/employeePortal";
import { getMyAssignments, parseAssignment } from "../../lib/assignments";

async function loadMine(email) {
  const rows = (await getMyAssignments(email, "2000-01-01", "2100-12-31")).map(parseAssignment);
  const ids = [...new Set(rows.map((r) => r.project).filter(Boolean))];
  const projects = ids.length ? await frappe.getList("Project", { filters: [["name", "in", ids]], fields: ["name", "project_name", "status", "expected_start_date", "expected_end_date"], limit: 0 }) : [];
  return rows.map((r) => ({ ...r, info: projects.find((p) => p.name === r.project) }));
}

/** All a contractor sees: the projects they work on and their role on each. */
export default function ContractorProjects() {
  const { user } = useAuth();
  const mine = useAsync(() => loadMine(user.email), [user.email]);
  return (
    <>
      <PageHeader icon={Briefcase} title="My Projects" subtitle="The projects you are working on and your role on each" />
      <Async state={mine}>
        {(rows) => rows.length === 0 ? <Panel><Empty text="You have no projects assigned." /></Panel> : rows.map((r) => (
          <Panel key={r.name} title={r.info?.project_name || r.project} action={<StatusPill status={r.info?.status || r.status} />}>
            <KeyValue items={[
              ["My Role", r.role], ["Hours per Day", r.hoursPerDay], ["My Start Date", dmy(r.start)], ["My End Date", dmy(r.eta)],
              ["Project Start", dmy(r.info?.expected_start_date)], ["Project End", dmy(r.info?.expected_end_date)],
              ...(r.notes ? [["Notes", r.notes]] : []),
            ]} />
          </Panel>
        ))}
      </Async>
    </>
  );
}
