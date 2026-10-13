// Admin › ERPNext Setup: one place to install everything the app adds on top of standard ERPNext / HRMS.
import { Wrench } from "lucide-react";
import { PageHeader } from "../../components/employee/EmployeeShell";
import { SiteSetupPanel } from "../../components/SiteSetupPanel";

export default function ErpSetup() {
  return (
    <div className="space-y-5">
      <PageHeader icon={Wrench} title="ERPNext setup" subtitle="Custom fields, change history, field restrictions and server-side rules for recruitment, timesheet review and security" />
      <SiteSetupPanel />
    </div>
  );
}
