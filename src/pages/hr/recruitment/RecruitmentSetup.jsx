// Recruitment setup (Administrator) and candidate data retention (HR).
import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Settings2, ShieldOff } from "lucide-react";
import { Button } from "../../../components/ui/primitives";
import { Async, Grid, Notice, PageHeader, Panel } from "../../../components/employee/EmployeeShell";
import { dmy, errMsg, useAsync } from "../../../lib/employeePortal";
import { anonymise, dueForAnonymisation, RETENTION_MONTHS, stageOf } from "../../../lib/recruitment";
import { SiteSetupPanel } from "../../../components/SiteSetupPanel";
import { useAuth } from "../../../context/AuthContext";
import { candidateUrl, StageBadge } from "./shared";
import { confirmDialog } from "../../../components/ui/dialogs";

export default function RecruitmentSetup() {
  const { user } = useAuth();
  const isAdmin = user?.email === "Administrator";
  return (
    <div className="space-y-5">
      <PageHeader icon={Settings2} title="Recruitment Setup" subtitle="One-time setup and candidate data retention" />
      {isAdmin ? <SiteSetupPanel /> : <Notice tone="info">The one-time setup can only be run by the Administrator. Data retention is below.</Notice>}
      <Retention />
    </div>
  );
}

function Retention() {
  const due = useAsync(dueForAnonymisation, []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  async function runAll() {
    const list = due.data || [];
    if (!list.length || !(await confirmDialog(`Anonymise ${list.length} candidate(s)? Names, contact details, CVs and CTC are removed permanently.`))) return;
    setBusy(true);
    setMsg(null);
    let done = 0;
    const failed = [];
    for (const a of list) {
      try { await anonymise(a); done += 1; } catch (e) { failed.push(`${a.applicant_name}: ${errMsg(e, "failed")}`); }
    }
    setMsg({ ok: !failed.length, text: `${done} anonymised.${failed.length ? ` Failed: ${failed.join("; ")}` : ""}` });
    setBusy(false);
    due.reload();
  }
  return (
    <Panel title="Data Retention" hint={`Rejected, withdrawn and on-hold candidates are kept for ${RETENTION_MONTHS} months from when they left the process, then anonymised. Candidates who never gave consent should be anonymised sooner.`} action={<Button variant="secondary" onClick={runAll} disabled={busy || !(due.data || []).length}>{busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />} Anonymise all due</Button>}>
      {msg && <div className="mb-3"><Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice></div>}
      <Async state={due}>
        {(list) => <Grid rows={list} empty="No candidates are due for anonymisation." columns={[
          { key: "applicant_name", label: "Candidate", render: (a) => <Link to={candidateUrl(a.name)} className="hover:underline">{a.applicant_name}</Link> },
          { key: "stage", label: "Stage", render: (a) => <StageBadge stage={stageOf(a)} /> },
          { key: "custom_retain_until", label: "Keep Until", render: (a) => dmy(a.custom_retain_until) || `${dmy(a.modified)} + ${RETENTION_MONTHS}m` },
          { key: "custom_consent", label: "Consent", render: (a) => (Number(a.custom_consent) ? "Given" : "Not recorded") },
        ]} />}
      </Async>
    </Panel>
  );
}
