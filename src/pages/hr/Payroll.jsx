import { LiveRecords } from "../../components/hr/LiveRecords";

export default function Payroll() {
  return <LiveRecords title="Salary slips" doctype="Salary Slip" description="Payroll documents from ERPNext HRMS." emptyLabel="No salary slips found." />;
}
