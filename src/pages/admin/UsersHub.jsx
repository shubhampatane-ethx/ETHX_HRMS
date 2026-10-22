import { useSearchParams } from "react-router-dom";
import { Tabs } from "../../components/employee/EmployeeShell";
import AdminUsers from "./Users";
import ProjectManagers from "./ProjectManagers";
import Employees from "../hr/Employees";

const TABS = [
  { id: "hr", label: "HR Users" },
  { id: "employees", label: "All Employees" },
  { id: "project-managers", label: "Project Managers" },
];

/** One "Users" page: HR users, every employee, and Project Managers as tabs (?tab=employees etc.). */
export default function UsersHub() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "hr";

  return (
    <div className="space-y-5">
      <Tabs tabs={TABS} value={tab} onChange={(id) => setParams(id === "hr" ? {} : { tab: id })} />
      {tab === "hr" && <AdminUsers />}
      {tab === "employees" && <Employees />}
      {tab === "project-managers" && <ProjectManagers />}
    </div>
  );
}