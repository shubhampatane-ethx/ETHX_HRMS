// Project Manager › Leave & Expense Approvals: leave and expense claims where the PM is the approver
// (business-unit leave approver, expense-type approver, or the employee's manager).
import { CalendarCheck } from "lucide-react";
import { PageHeader } from "../../components/employee/EmployeeShell";
import { ApprovalQueue, useApprovalQueue } from "../../components/approvals/ApprovalQueue";

export default function PMLeaveApprovals() {
  const state = useApprovalQueue();
  const n = state.data ? state.data.leaves.length + state.data.expenses.length : null;
  return (
    <>
      <PageHeader icon={CalendarCheck} title="Leave & Expense Approvals" subtitle={n == null ? "Requests waiting for your decision" : n ? `${n} request(s) waiting for your decision` : "Nothing is waiting for you right now"} />
      <ApprovalQueue state={state} />
    </>
  );
}
