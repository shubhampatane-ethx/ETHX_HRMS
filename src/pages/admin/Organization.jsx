import { useState } from "react";
import { DoctypeCrud } from "../hr/DoctypeView";
import { findSetupItem } from "../../lib/hrSetupConfig";
import { Tabs } from "../../components/employee/EmployeeShell";
import { ExpenseApproversByType, LeaveApproversByBU } from "./Approvers";

/**
 * Company setup lives here (Administrator only), together with who approves what:
 * leave approvers per business unit (department) and expense approvers per expense type.
 */
const TABS = [
  { id: "companies", label: "Companies" },
  { id: "leave", label: "Leave approvers (business units)" },
  { id: "expense", label: "Expense approvers (expense types)" },
];

export default function Organization() {
  const [tab, setTab] = useState("companies");
  const company = findSetupItem("company");
  return (
    <div className="space-y-5">
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "companies" && <DoctypeCrud item={{ ...company, section: "Organization" }} />}
      {tab === "leave" && <LeaveApproversByBU />}
      {tab === "expense" && <ExpenseApproversByType />}
    </div>
  );
}