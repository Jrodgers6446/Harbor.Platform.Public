'use client';
import Link from 'next/link';
import { useState } from 'react';
import { pct, RESULT_TEXT, type Row, type Summary, type TechSum } from '@/lib/techdash';

// Tech Dashboard, the way the Harbor extension shows it:
//   Day:          KPIs, then each tech (click to open their jobs) with outcome chips.
//   Week / Month: KPIs, a sortable table per tech, then by day (week) or by week (month), and why jobs failed.

type Report = { techs: TechSum[]; totals: Summary; buckets: (Summary & { key: string; label: string })[]; failedBy: Record<string, number> };
export type TechDashProps = {
  view: 'day' | 'week' | 'month'; day: string; label: string; goal: number; tz: string;
  dispatchAt: string | null; workordersAt: string | null; hasWorkorders: boolean; savedDays: number; rangeDays: number; clamped: boolean;
  board: { techs: TechSum[]; totals: Summary } | null; report: Report | null; vans: Record<string, string>;
};

const chipCls: Record<string, string> = { success: 'ok', failed: 'bad', canceled: 'grey', nowo: 'warn', inprogress: 'reply', upcoming: 'idle', done: 'ok', notdone: 'bad' };

export function TechDashView(p: TechDashProps) {
  const goal = p.goal / 100;
  const rateCls = (x: number | null) => (x == null ? '' : x >= goal ? 'ok' : 'bad');
  const at = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: p.tz }) : '');
  const href = (view: string, day = p.day) => `/m/techdash?day=${day}&view=${view}`;

  const kpis = (t: Summary) => { const c = t.counts, waiting = c.nowo + c.inprogress + c.upcoming; return (
    <div className="kpi-row" style={{ marginBottom: 14 }}>
      <div className="kpi"><div className="kpi-label">Jobs</div><div className="kpi-num">{t.jobs}</div><div className="kpi-sub">{waiting} still waiting on an outcome</div></div>
      <div className="kpi"><div className="kpi-label">Successful</div><div className="kpi-num ok">{c.success}</div><div className="kpi-sub">{c.failed} not successful · {c.canceled} canceled</div></div>
      <div className="kpi"><div className="kpi-label">Success rate</div><div className={'kpi-num ' + rateCls(t.rate)}>{pct(t.rate)}</div><div className="kpi-sub">goal {p.goal}%</div></div>
      <div className="kpi"><div className="kpi-label">Service goals</div><div className="kpi-num">{t.done} <span className="kpi-of">/ {t.opp}</span></div><div className="kpi-sub">{t.opp ? `${pct(t.serviceRate)} of opportunities` : 'no service goal opportunities yet'}</div></div>
    </div>); };

  return (<>
    <div className="mod-head"><div><h1>Tech Dashboard</h1><div className="muted">{p.label}{p.dispatchAt ? ' · Dispatch ' + at(p.dispatchAt) : ''}{p.workordersAt ? ' · Work orders ' + at(p.workordersAt) : ''}</div></div>
      <div className="seg" role="tablist">{(['day', 'week', 'month'] as const).map((v) => <Link key={v} role="tab" aria-selected={p.view === v} className={'seg-b' + (p.view === v ? ' on' : '')} href={href(v)}>{v[0].toUpperCase() + v.slice(1)}</Link>)}</div></div>
    {p.clamped && <div className="msg" style={{ marginBottom: 12 }}>Outcomes only exist for days that have happened, so this shows today.</div>}
    {!p.hasWorkorders && <div className="msg warn" style={{ marginBottom: 12 }}>No work orders yet, so outcomes can&apos;t be judged. Press the sync button at the top (it reads the work orders system too).</div>}
    {p.view === 'day' ? <DayBody {...p} kpis={kpis} chip={chipCls} rateCls={rateCls} /> : <ReportBody {...p} kpis={kpis} rateCls={rateCls} href={href} />}
  </>);
}

function DayBody(p: TechDashProps & { kpis: (t: Summary) => React.ReactNode; chip: Record<string, string>; rateCls: (x: number | null) => string }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (!p.board) return <div className="widget w-empty">No dispatch jobs saved for this day. Press the dispatch sync button at the top.</div>;
  const ready = p.hasWorkorders;
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const outcome = (r: Row) => (ready ? <span className={'chip ' + p.chip[r.result]}>{r.result === 'failed' || r.result === 'nowo' ? r.label : RESULT_TEXT[r.result]}</span> : <span className="chip grey">no work order data</span>);
  return (<>
    {ready && p.kpis(p.board.totals)}
    {ready && <p className="small muted" style={{ marginTop: 0 }}>Successful = the closed work order&apos;s outcome is Completed. Service goal done = the customer has a completed service goal work order. Click a tech to see their jobs.</p>}
    {p.board.techs.map((t) => { const c = t.counts, waiting = c.nowo + c.inprogress + c.upcoming, isOpen = open.has(t.id); return (
      <section className="widget td-tech" key={t.id}>
        <button className="td-th" aria-expanded={isOpen} onClick={() => toggle(t.id)}>
          <span className="td-arrow">{isOpen ? '▾' : '▸'}</span><b>{t.name}</b>{p.vans[t.id] && <span className="muted small">{p.vans[t.id]}</span>}
          {ready && t.rate != null && <span className={'chip ' + p.rateCls(t.rate)}>{pct(t.rate)} successful</span>}
          {ready ? <>{c.success > 0 && <span className="chip ok">{c.success} successful</span>}{c.failed > 0 && <span className="chip bad">{c.failed} not successful</span>}{c.canceled > 0 && <span className="chip grey">{c.canceled} canceled</span>}{waiting > 0 && <span className="chip warn">{waiting} waiting</span>}{t.servicesTotal > 0 && <span className="chip ok">{t.servicesDone}/{t.servicesTotal} services done</span>}</>
            : <span className="chip grey">{t.rows.length} jobs</span>}
        </button>
        {isOpen && t.rows.map((r) => (
          <div className="td-job" key={r.number}>
            <div><b>{r.windowText}</b><div className="small muted">Dispatch: {r.dispatchStatus}</div></div>
            <div><div>{r.customer}</div><div className="small muted">{r.number}{r.goalJob ? ' · service goal' : ''}</div></div>
            <div>{outcome(r)} {r.service.state !== 'none' && <span className={'chip ' + p.chip[r.service.state]}>{r.service.label}</span>}</div>
          </div>))}
      </section>); })}
  </>);
}

type SortKey = 'name' | 'jobs' | 'success' | 'failed' | 'canceled' | 'rate' | 'opp' | 'done' | 'srate';
function ReportBody(p: TechDashProps & { kpis: (t: Summary) => React.ReactNode; rateCls: (x: number | null) => string; href: (v: string, d?: string) => string }) {
  const [sort, setSort] = useState<{ k: SortKey; dir: number }>({ k: 'name', dir: 1 });
  const d = p.report;
  if (!d || !d.totals.jobs) return <div className="widget w-empty">No dispatch days saved in {p.label}. Bridge saves a day each time the dispatch sync button is pressed with that day picked.</div>;
  const val = (t: TechSum): number | null => ({ jobs: t.jobs, success: t.counts.success, failed: t.counts.failed, canceled: t.counts.canceled, rate: t.rate, opp: t.opp, done: t.done, srate: t.serviceRate, name: 0 }[sort.k]);
  const techs = [...d.techs].sort((a, b) => {
    if (sort.k === 'name') return a.name.localeCompare(b.name) * sort.dir;
    const x = val(a), y = val(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x - y) * sort.dir;
  });
  const th = (k: SortKey, label: string) => <th className="td-sort" onClick={() => setSort((s) => ({ k, dir: s.k === k ? -s.dir : 1 }))}>{label}{sort.k === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>;
  const cells = (t: Summary) => (<><td>{t.jobs}</td><td>{t.counts.success}</td><td>{t.counts.failed}</td><td>{t.counts.canceled}</td><td className={p.rateCls(t.rate)}>{pct(t.rate)}</td><td>{t.opp}</td><td>{t.done}</td><td>{pct(t.serviceRate)}</td></>);
  const csv = () => {
    const rows = [['Tech', 'Jobs', 'Successful', 'Not successful', 'Canceled', 'Success rate', 'Goal opportunities', 'Services done', 'Service rate']];
    const line = (n: string, t: Summary) => [n, t.jobs, t.counts.success, t.counts.failed, t.counts.canceled, pct(t.rate), t.opp, t.done, pct(t.serviceRate)].map(String);
    d.techs.forEach((t) => rows.push(line(t.name, t))); rows.push(line('All techs', d.totals));
    const text = 'Report: ' + p.label + '\n' + rows.map((r) => r.map((c) => '"' + c.replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = `tech-report-${p.view}-${p.day}.csv`; a.click();
  };
  const fb = Object.entries(d.failedBy).sort((a, b) => b[1] - a[1]);
  const t = d.totals;
  return (<>
    {p.kpis(t)}
    <p className="small muted" style={{ marginTop: 0 }}>{t.jobs} jobs in {p.label} ({p.savedDays} of {p.rangeDays} days saved by Bridge). Success rate = successful ÷ (successful + not successful). Jobs with no matching closed work order ({t.counts.nowo + t.counts.inprogress + t.counts.upcoming}) are left out of the rate.</p>
    <section className="widget"><div className="w-head"><h2>By tech</h2><span className="open"><button className="btn sm" onClick={csv}>Download CSV</button></span></div>
      <div className="pc-table"><table><thead><tr>{th('name', 'Tech')}{th('jobs', 'Jobs')}{th('success', 'Successful')}{th('failed', 'Not successful')}{th('canceled', 'Canceled')}{th('rate', 'Success rate')}{th('opp', 'Goal opps')}{th('done', 'Services done')}{th('srate', 'Service rate')}</tr></thead>
        <tbody>{techs.map((x) => <tr key={x.id}><td><b>{x.name}</b></td>{cells(x)}</tr>)}<tr className="td-total"><td>All techs</td>{cells(t)}</tr></tbody></table></div></section>
    <section className="widget" style={{ marginTop: 16 }}><div className="w-head"><h2>{p.view === 'week' ? 'By day' : 'By week'}</h2></div>
      <div className="td-chart">{d.buckets.map((b) => <Link key={b.key} href={p.view === 'week' ? p.href('day', b.key) : p.href('week', b.key)} className="td-col" title={`${b.label}: ${pct(b.rate)}`}><i className={b.rate != null && b.rate < p.goal / 100 ? 'need' : ''} style={{ height: (b.rate == null ? 0 : Math.round(b.rate * 100)) + '%' }} /><span>{pct(b.rate)}</span></Link>)}</div>
      <div className="pc-table"><table><thead><tr><th>{p.view === 'week' ? 'Day' : 'Week'}</th><th>Jobs</th><th>Successful</th><th>Not successful</th><th>Canceled</th><th>Success rate</th><th>Goal opps</th><th>Services done</th><th>Service rate</th></tr></thead>
        <tbody>{d.buckets.map((b) => <tr key={b.key}><td><Link href={p.view === 'week' ? p.href('day', b.key) : p.href('week', b.key)}>{b.label}</Link></td>{cells(b)}</tr>)}</tbody></table></div>
      <p className="small muted">Red = below your {p.goal}% goal. {p.view === 'week' ? 'Click a day to open it.' : 'Click a week to open it.'}</p></section>
    {fb.length > 0 && <section className="widget" style={{ marginTop: 16 }}><div className="w-head"><h2>Why jobs weren&apos;t successful</h2></div>
      {fb.map(([o, n]) => <div className="w-row" key={o}><div className="w-grow">{o}</div><b>{n}</b></div>)}</section>}
  </>);
}
