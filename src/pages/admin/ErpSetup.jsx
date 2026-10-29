// Admin › System Setup: install the fields and rules required by the app.
import { Wrench } from "lucide-react";
import { PageHeader } from "../../components/employee/EmployeeShell";
import { SiteSetupPanel } from "../../components/SiteSetupPanel";

export default function ErpSetup() {
  return (
    <div className="space-y-5">
      <PageHeader icon={Wrench} title="System setup" subtitle="Manage required fields, change history, field restrictions and server-side rules for recruitment, timesheet review and security" />
      <SiteSetupPanel />
    </div>
  );
}
