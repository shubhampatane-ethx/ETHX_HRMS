// Recruitment home: what needs attention now, plus the funnel at a glance.
import { Link } from "react-router-dom";
import { Briefcase, CalendarClock, ClipboardList, Gavel, Handshake, Plus, UserSearch, Users } from "lucide-react";
import { Button } from "../../../components/ui/primitives";
import { Async, Empty, Grid, PageHeader, Panel, Stat } from "../../../components/employee/EmployeeShell";
import { dmy, isoDate, useAsync } from "../../../lib/employeePortal";
import { canApprove, fmtTime, listApplicants, listInterviews, listOffers, listOpenings, listRequisitions, offerStage, stageOf, STAGES } from "../../../lib/recruitment";
import { useAuth } from "../../../context/AuthContext";
import { candidateUrl, SetupHint, StageBadge } from "./shared";

async function loadOverview() {
  const [openings, apps, interviews, offers, reqs] = await Promise.all([
    listOpenings([["status", "=", "Open"]]),
    listApplicants(),
    listInterviews([["docstatus", "=", 0]]),
    listOffers([["docstatus", "<", 2]]),
    listRequisitions([["status", "in", ["Pending", "On Hold"]]]).catch(() => []),
  ]);
  return { openings, apps, interviews, offers, reqs };
}

export default function Overview() {
  const { user } = useAuth();
  const s = useAsync(loadOverview, []);
  const today = isoDate();
  const d = s.data;
  const appName = (id) => d?.apps.find((a) => a.name === id)?.applicant_name || id;
  const active = (d?.apps || []).filter((a) => !["Hired", "Rejected", "Withdrawn"].includes(stageOf(a)));
  const upcoming = (d?.interviews || []).filter((i) => i.scheduled_on >= today).sort((a, b) => `${a.scheduled_on}${a.from_time}`.localeCompare(`${b.scheduled_on}${b.from_time}`));
  const toDecide = (d?.interviews || []).filter((i) => i.scheduled_on < today);
  const pendingOffers = (d?.offers || []).filter((o) => offerStage(o) === "Pending Approval");
  const funnel = STAGES.map((st) => ({ ...st, n: (d?.apps || []).filter((a) => stageOf(a) === st.id).length }));
  const max = Math.max(1, ...funnel.map((f) => f.n));

  return (
    <div className="space-y-5">
      <PageHeader icon={UserSearch} title="Recruitment" subtitle="Requisition → opening → candidates → interviews → offer → onboarding" actions={<>
        <Link to="/hr/recruitment/requisitions"><Button variant="secondary"><ClipboardList size={14} /> Requisitions</Button></Link>
        <Link to="/hr/recruitment/candidates?add=1"><Button><Plus size={14} /> Add candidate</Button></Link>
      </>} />
      <SetupHint />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat to="/hr/recruitment/openings" icon={Briefcase} label="Open positions" value={d ? d.openings.length : s.error ? "—" : undefined} sub={d ? `${d.reqs.filter((r) => r.status === "Pending").length} requisition(s) awaiting a decision` : ""} accent="#4f8cff" />
        <Stat to="/hr/recruitment/candidates" icon={Users} label="Candidates in process" value={d ? active.length : undefined} sub={d ? `${d.apps.length} in total` : ""} accent="var(--color-green)" />
        <Stat to="/hr/recruitment/interviews" icon={CalendarClock} label="Interviews scheduled" value={d ? upcoming.length : undefined} sub={d ? `${toDecide.length} awaiting a decision` : ""} accent="var(--color-amber)" />
        <Stat to="/hr/recruitment/offers" icon={Handshake} label="Offers in progress" value={d ? d.offers.filter((o) => ["Draft", "Pending Approval", "Approved", "Sent", "Accepted"].includes(offerStage(o))).length : undefined} sub={d ? `${pendingOffers.length} need approval` : ""} accent="var(--color-red-hover)" />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel title="Pipeline" hint="Candidates by stage, all openings">
          <Async state={s}>
            {() => (
              <div className="space-y-2">
                {funnel.map((f) => (
                  <Link key={f.id} to={`/hr/recruitment/candidates?stage=${f.id}`} className="flex items-center gap-3 text-[12px]">
                    <span className="w-24 shrink-0"><StageBadge stage={f.id} /></span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]"><span className="block h-full rounded-full bg-[var(--color-red)]" style={{ width: `${(f.n / max) * 100}%` }} /></span>
                    <span className="w-8 text-right text-[var(--color-text)]">{f.n}</span>
                  </Link>
                ))}
              </div>
            )}
          </Async>
        </Panel>
        <Panel title="Next interviews" action={<Link to="/hr/recruitment/interviews" className="text-[12px] text-[var(--color-red-hover)] hover:underline">All</Link>}>
          <Async state={s}>
            {() => upcoming.length === 0 ? <Empty text="No interviews scheduled." /> : <Grid rows={upcoming.slice(0, 6)} columns={[
              { key: "when", label: "When", render: (i) => `${dmy(i.scheduled_on)} ${fmtTime(i.from_time)}` },
              { key: "c", label: "Candidate", render: (i) => <Link to={candidateUrl(i.job_applicant)} className="hover:underline">{appName(i.job_applicant)}</Link> },
              { key: "interview_round", label: "Round" },
            ]} />}
          </Async>
        </Panel>
        {(toDecide.length > 0 || (canApprove(user) && pendingOffers.length > 0)) && (
          <Panel title="Needs your attention" className="xl:col-span-2">
            <ul className="space-y-1.5 text-[12.5px]">
              {toDecide.slice(0, 8).map((i) => <li key={i.name}><Gavel size={12} className="mr-1.5 inline text-[var(--color-amber)]" /><Link to={candidateUrl(i.job_applicant)} className="hover:underline">{appName(i.job_applicant)}</Link> · {i.interview_round} on {dmy(i.scheduled_on)} needs a Cleared / Rejected decision</li>)}
              {canApprove(user) && pendingOffers.map((o) => <li key={o.name}><Handshake size={12} className="mr-1.5 inline text-[var(--color-red-hover)]" /><Link to="/hr/recruitment/offers" className="hover:underline">Offer for {o.applicant_name}</Link> is waiting for approval{o.owner === user.email ? " (drafted by you - another HR Manager must approve)" : ""}</li>)}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}
