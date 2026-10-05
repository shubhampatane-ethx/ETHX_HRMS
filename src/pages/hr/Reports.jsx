import { LiveRecords } from "../../components/hr/LiveRecords";

export default function Reports() {
  return <LiveRecords title="Reports catalog" doctype="Report" description="Reports available from your ERPNext instance." emptyLabel="No reports are available to this user." />;
}
