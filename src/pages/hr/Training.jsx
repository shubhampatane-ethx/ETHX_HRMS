import { LiveRecords } from "../../components/hr/LiveRecords";

export default function Training() {
  return <LiveRecords title="Training events" doctype="Training Event" description="Training activity from ERPNext HRMS." emptyLabel="No training events found." />;
}
