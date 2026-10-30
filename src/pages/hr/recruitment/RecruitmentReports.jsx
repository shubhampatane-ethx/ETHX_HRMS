// Recruitment reports: open positions, candidates per stage, time to hire, offer acceptance, source effectiveness.
import { useMemo, useState } from "react";
import { BarChart3, Download } from "lucide-react";
import { Button } from "../../../components/ui/primitives";
import { Async, Grid, inputCls, PageHeader, Panel, Stat } from "../../../components/employee/EmployeeShell";
import { daysBetween, dmy, isoDate, useAsync } from "../../../lib/employeePortal";
import { addMonths, ALL_STAGES, downloadCsv, listApplicants, listOffers, listOpenings, listRequisitions, offerStage, stageOf, vacanciesOf } from "../../../lib/recruitment";
import { Activity, Clock, Handshake, Percent } from "lucide-react";

async function load() {
  const [openings, apps, offers, reqs] = await Promise.all([listOpenings(), listApplicants(), listOffers([["docstatus", "<", 2]]), listRequisitions().catch(() => [])]);
  return { openings, apps, offers, reqs };
}

const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

export default function RecruitmentReports() {
  const s = useAsync(load, []);
  const [months, setMonths] = useState(6);
  const since = addMonths(isoDate(), -months);

  const r = useMemo(() => {
    if (!s.data) return null;
    const { openings, apps: allApps, offers: allOffers, reqs } = s.data;
    const apps = allApps.filter((a) => String(a.creation).slice(0, 10) >= since);
    const appById = Object.fromEntries(allApps.map((a) => [a.name, a]));
    const offers = allOffers.filter((o) => String(o.creation).slice(0, 10) >= since);
    const sent = offers.filter((o) => o.docstatus === 1);
    const answered = sent.filter((o) => ["Accepted", "Rejected"].includes(o.status));
    const accepted = sent.filter((o) => o.status === "Accepted");
    // Time to hire: application created -> offer accepted (candidate response date).
    const tth = accepted.map((o) => (appById[o.job_applicant] && o.custom_response_on ? daysBetween(String(appById[o.job_applicant].creation).slice(0, 10), o.custom_response_on) - 1 : null)).filter((x) => x != null && x >= 0);
    const filledReqs = reqs.filter((q) => q.status === "Filled" && q.completed_on && q.posting_date);
    const ttf = filledReqs.map((q) => daysBetween(q.posting_date, q.completed_on) - 1);

    const bySource = {};
    apps.forEach((a) => {
      const k = a.source || "Not recorded";
      const st = stageOf(a);
      const b = (bySource[k] ||= { source: k, total: 0, shortlisted: 0, interviewed: 0, offered: 0, hired: 0 });
      b.total += 1;
      if (["Shortlisted", "Interview", "Offer", "Hired"].includes(st)) b.shortlisted += 1;
      if (["Interview", "Offer", "Hired"].includes(st)) b.interviewed += 1;
      if (["Offer", "Hired"].includes(st) || allOffers.some((o) => o.job_applicant === a.name && o.docstatus === 1)) b.offered += 1;
      if (st === "Hired") b.hired += 1;
    });

    const open = openings.filter((o) => o.status === "Open").map((o) => {
      const mine = allApps.filter((a) => a.job_title === o.name);
      const acc = allOffers.filter((x) => x.docstatus === 1 && x.status === "Accepted" && mine.some((a) => a.name === x.job_applicant) && !["No-show", "Withdrawn"].includes(x.custom_joining_status)).length;
      const stages = Object.fromEntries(ALL_STAGES.map((st) => [st.id, mine.filter((a) => stageOf(a) === st.id).length]));
      return { ...o, total: mine.length, accepted: acc, ageDays: daysBetween(String(o.posted_on || o.creation).slice(0, 10), isoDate()) - 1, stages };
    });

    const stageCounts = ALL_STAGES.map((st) => ({ stage: st.id, n: apps.filter((a) => stageOf(a) === st.id).length }));
    return { apps, sent, answered, accepted, tth, ttf, bySource: Object.values(bySource).sort((a, b) => b.total - a.total), open, stageCounts, offers };
  }, [s.data, since]);

  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  function exportAll() {
    if (!r) return;
    downloadCsv(`recruitment-report-${isoDate()}.csv`, ["Section", "Item", "Value 1", "Value 2", "Value 3", "Value 4", "Value 5"], [
      ...r.open.map((o) => ["Open position", o.job_title, `vacancies ${vacanciesOf(o)}`, `filled ${o.accepted}`, `candidates ${o.total}`, `open ${o.ageDays} days`, ""]),
      ...r.stageCounts.map((x) => ["Candidates per stage", x.stage, x.n, "", "", "", ""]),
      ...r.bySource.map((b) => ["Source", b.source, `applied ${b.total}`, `shortlisted ${b.shortlisted}`, `interviewed ${b.interviewed}`, `offered ${b.offered}`, `hired ${b.hired}`]),
      ["Offers", "Sent", r.sent.length, "", "", "", ""], ["Offers", "Accepted", r.accepted.length, "", "", "", ""], ["Offers", "Acceptance rate", pct(r.accepted.length, r.answered.length), "", "", "", ""],
      ["Time to hire (days)", "Median", median(r.tth) ?? "", "", "", "", ""], ["Time to fill requisition (days)", "Median", median(r.ttf) ?? "", "", "", "", ""],
    ]);
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={BarChart3} title="Recruitment Reports" subtitle={`Applications and offers created since ${dmy(since)}`} actions={<>
        <select className={`${inputCls} !w-auto`} value={months} onChange={(e) => setMonths(Number(e.target.value))}>{[3, 6, 12, 24].map((m) => <option key={m} value={m}>Last {m} months</option>)}</select>
        <Button variant="secondary" onClick={exportAll} disabled={!r}><Download size={14} /> CSV</Button>
      </>} />
      <Async state={s}>
        {() => r && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat icon={Activity} label="Applications" value={r.apps.length} sub={`${r.stageCounts.find((x) => x.stage === "Hired").n} hired`} accent="#4f8cff" />
              <Stat icon={Handshake} label="Offers Sent" value={r.sent.length} sub={`${r.accepted.length} accepted`} accent="var(--color-green)" />
              <Stat icon={Percent} label="Offer Acceptance" value={pct(r.accepted.length, r.answered.length)} sub={`of ${r.answered.length} answered offers`} accent="var(--color-amber)" />
              <Stat icon={Clock} label="Time to Hire (Median)" value={median(r.tth) != null ? `${median(r.tth)} d` : "—"} sub={`Application → offer accepted · ${r.tth.length} hire(s)`} accent="var(--color-red-hover)" />
            </div>
            <Panel title="Open Positions" hint="Filled = accepted offers that haven't fallen through">
              <Grid rows={r.open} empty="No open positions." columns={[
                { key: "job_title", label: "Opening" },
                { key: "v", label: "Filled / Vacancies", render: (o) => `${o.accepted} / ${vacanciesOf(o) || "—"}` },
                { key: "total", label: "Candidates" },
                ...["Screening", "Shortlisted", "Interview", "Offer"].map((st) => ({ key: st, label: st, render: (o) => o.stages[st] || 0 })),
                { key: "ageDays", label: "Open for", render: (o) => `${o.ageDays} d` },
              ]} />
            </Panel>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <Panel title="Source Effectiveness" hint="Of the candidates from each source, how many moved forward">
                <Grid rows={r.bySource} rowKey={(b) => b.source} empty="No applications in this period." columns={[
                  { key: "source", label: "Source" },
                  { key: "total", label: "Applied" },
                  { key: "shortlisted", label: "Shortlisted", render: (b) => `${b.shortlisted} (${pct(b.shortlisted, b.total)})` },
                  { key: "interviewed", label: "Interviewed", render: (b) => `${b.interviewed} (${pct(b.interviewed, b.total)})` },
                  { key: "offered", label: "Offered", render: (b) => b.offered },
                  { key: "hired", label: "Hired", render: (b) => `${b.hired} (${pct(b.hired, b.total)})` },
                ]} />
              </Panel>
              <Panel title="Candidates per Stage" hint="Applications created in the period, by where they are now">
                <Grid rows={r.stageCounts} rowKey={(x) => x.stage} columns={[{ key: "stage", label: "Stage" }, { key: "n", label: "Candidates" }]} />
                <p className="mt-3 text-[11px] text-[var(--color-text-faint)]">Median time to fill a requisition (raised → filled): {median(r.ttf) != null ? `${median(r.ttf)} days` : "no filled requisitions yet"}. Offer statuses: {Object.entries(r.offers.reduce((m, o) => { const k = offerStage(o); m[k] = (m[k] || 0) + 1; return m; }, {})).map(([k, v]) => `${k} ${v}`).join(" · ") || "none"}.</p>
              </Panel>
            </div>
          </>
        )}
      </Async>
    </div>
  );
}
