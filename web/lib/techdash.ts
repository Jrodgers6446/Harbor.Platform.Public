// Tech Dashboard logic, ported from the Harbor extension's modules/techdash/logic.js.
// Joins dispatch-system jobs with work orders per tech. On the website both come from Harbor Bridge snapshots,
// which carry no phone numbers or IMEIs, so jobs and work orders are matched by customer name (full name, or first + last).
import type { DispatchDay, DispatchJob, WorkOrder } from './bridge';
import { carrierOf } from './precallRules';

// The service goal add-on, filed as its own work order. Adjust to the add-on's name in your work orders.
const SERVICE_RE = /performance (check|promise)/i;

export type Result = 'success' | 'failed' | 'canceled' | 'nowo' | 'inprogress' | 'upcoming';
export type Row = { number: string; customer: string; goalJob: boolean; opportunity: boolean; windowText: string; startMs: number; dispatchStatus: string; result: Result; label: string; service: { state: 'none' | 'done' | 'notdone'; label: string }; matched: boolean; date?: string; techId?: string };
export type Summary = { counts: Record<Result, number>; rate: number | null; servicesDone: number; servicesTotal: number; jobs: number; opp: number; done: number; serviceRate: number | null };
export type TechSum = Summary & { id: string; name: string; rows: Row[] };

export const RESULT_TEXT: Record<Result, string> = { success: 'Successful', failed: 'Not successful', canceled: 'Canceled', nowo: 'No closed work order', inprogress: 'In progress', upcoming: 'Not started' };

const nameKeys = (s: string) => {
  const t = String(s || '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (!t.length) return [];
  const full = t.join(''), fl = t.length > 1 ? t[0] + t[t.length - 1] : null;
  return fl && fl !== full ? [full, fl] : [full];
};
export const shiftDate = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export const mondayOf = (d: string) => { const dow = new Date(d + 'T00:00:00Z').getUTCDay(); return shiftDate(d, -((dow + 6) % 7)); };
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5);

export function dispatchState(s: string) {
  s = String(s || '').toLowerCase();
  if (/cancel/.test(s)) return 'canceled';
  if (/complet/.test(s)) return 'completed';
  if (/accept|new|schedul|assign/.test(s)) return 'upcoming';
  return 'inprogress'; // Departed, Arrived, …
}

export function makeLogic(tz: string) {
  const localDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: tz }) : null);
  const timeText = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }) : '');
  const today = () => localDate(new Date().toISOString())!;

  function buildIndex(wos: WorkOrder[]) {
    const byName = new Map<string, WorkOrder[]>();
    wos.forEach((w) => nameKeys(w.name).forEach((k) => { if (!byName.has(k)) byName.set(k, []); byName.get(k)!.push(w); }));
    return byName;
  }
  function pickBest(list: WorkOrder[], jobDate: string) {
    let best: { w: WorkOrder; d: number; rank: number; t: number } | null = null;
    list.forEach((w) => {
      const d = Math.abs(dayDiff(localDate(w.createdAt) || jobDate, jobDate));
      if (d > 1) return;
      const rank = w.state === 'closed' ? 0 : 1;
      const t = Date.parse(w.updatedAt || w.createdAt || '') || 0;
      if (!best || d < best.d || (d === best.d && (rank < best.rank || (rank === best.rank && t > best.t)))) best = { w, d, rank, t };
    });
    return best ? (best as { w: WorkOrder }).w : null;
  }

  function evalJob(job: DispatchJob, idx: Map<string, WorkOrder[]>, date: string): Row {
    const dispatch = dispatchState(job.status);
    const cands = [...new Set(nameKeys(job.name).flatMap((k) => idx.get(k) || []))];
    const repair = pickBest(cands.filter((w) => !SERVICE_RE.test(w.program)), date);
    const service = pickBest(cands.filter((w) => SERVICE_RE.test(w.program)), date);
    const past = date < today();
    let result: Result, label: string;
    if (repair && repair.state === 'closed') {
      if (/^completed$/i.test(repair.outcome)) { result = 'success'; label = 'Completed'; } else { result = 'failed'; label = repair.outcome || 'Closed without completing'; }
    } else if (dispatch === 'canceled' || (repair && repair.state === 'cancelled')) {
      result = 'canceled'; label = repair && repair.state === 'cancelled' ? 'Work order cancelled' : 'Canceled in the dispatch system';
    } else if (dispatch === 'completed') { result = 'nowo'; label = 'Done in the dispatch system, no closed work order yet'; }
    else if (past) { result = 'nowo'; label = 'No closed work order found'; }
    else if (dispatch === 'inprogress') { result = 'inprogress'; label = 'In progress'; }
    else { result = 'upcoming'; label = 'Not started'; }
    let svc: Row['service'] = { state: 'none', label: '' };
    if (service) svc = service.state === 'closed'
      ? (/^completed$/i.test(service.outcome) ? { state: 'done', label: 'Service done' } : { state: 'notdone', label: 'Service ' + String(service.outcome || 'not completed').toLowerCase() })
      : { state: 'notdone', label: 'Service canceled' };
    // Service goals apply to jobs from Carrier A (see CARRIER_PATTERNS in precallRules.ts).
    const goalJob = carrierOf(job.carrier)?.key === 'lineA';
    return {
      number: job.sjn, customer: job.name || '', goalJob, opportunity: goalJob && result !== 'canceled' && result !== 'upcoming',
      windowText: job.ws ? timeText(job.ws) + (job.we ? ' – ' + timeText(job.we) : '') : '', startMs: job.ws ? Date.parse(job.ws) : 0,
      dispatchStatus: job.status || '', result, label, service: svc, matched: !!repair,
    };
  }

  const summarize = (rows: Row[]): Summary => {
    const counts: Record<Result, number> = { success: 0, failed: 0, canceled: 0, nowo: 0, inprogress: 0, upcoming: 0 };
    let servicesDone = 0, servicesTotal = 0;
    rows.forEach((r) => { counts[r.result]++; if (r.service.state !== 'none') servicesTotal++; if (r.service.state === 'done') servicesDone++; });
    const judged = counts.success + counts.failed;
    const opp = rows.filter((r) => r.opportunity).length, done = rows.filter((r) => r.opportunity && r.service.state === 'done').length;
    return { counts, rate: judged ? counts.success / judged : null, servicesDone, servicesTotal, jobs: rows.length, opp, done, serviceRate: opp ? done / opp : null };
  };
  const group = (rows: Row[], names: Map<string, string>): TechSum[] => {
    const g = new Map<string, Row[]>();
    rows.forEach((r) => { const k = r.techId || '__none'; if (!g.has(k)) g.set(k, []); g.get(k)!.push(r); });
    return [...g.entries()].map(([id, rs]) => ({ id, name: id === '__none' ? 'Unassigned jobs' : names.get(id) || 'Tech ' + id, rows: rs.sort((a, b) => a.startMs - b.startMs), ...summarize(rs) }))
      .sort((a, b) => Number(a.id === '__none') - Number(b.id === '__none') || a.name.localeCompare(b.name));
  };

  /** One day: each tech's jobs and outcomes. */
  function buildBoard(dispatch: DispatchDay, wos: WorkOrder[], date: string) {
    const idx = buildIndex(wos);
    const names = new Map(dispatch.techs.map((t) => [t.id, t.name]));
    const rows = dispatch.jobs.map((j) => ({ ...evalJob(j, idx, date), techId: j.techs[0] || '__none' }));
    const techs = group(rows, names);
    return { techs, totals: summarize(rows) };
  }

  /** Week (bucket by day) or month (bucket by week), from every day Bridge saved in the range. */
  function buildReport(days: { date: string; dispatch: DispatchDay }[], wos: WorkOrder[], bucket: 'day' | 'week') {
    const idx = buildIndex(wos);
    const names = new Map<string, string>();
    const rows: Row[] = [];
    days.forEach((d) => {
      d.dispatch.techs.forEach((t) => names.set(t.id, t.name));
      d.dispatch.jobs.forEach((j) => rows.push({ ...evalJob(j, idx, d.date), date: d.date, techId: j.techs[0] || '__none' }));
    });
    const bk = (date: string) => (bucket === 'day' ? date : mondayOf(date));
    const bmap = new Map<string, Row[]>();
    rows.forEach((r) => { const k = bk(r.date!); if (!bmap.has(k)) bmap.set(k, []); bmap.get(k)!.push(r); });
    const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', ...o });
    const buckets = [...bmap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, rs]) => ({
      key: k, label: bucket === 'day' ? fmt(k, { weekday: 'short', month: 'numeric', day: 'numeric' }) : fmt(k, { month: 'short', day: 'numeric' }) + ' – ' + fmt(shiftDate(k, 6), { month: 'short', day: 'numeric' }),
      ...summarize(rs),
    }));
    const failedBy: Record<string, number> = {};
    rows.filter((r) => r.result === 'failed').forEach((r) => { failedBy[r.label] = (failedBy[r.label] || 0) + 1; });
    return { techs: group(rows, names), totals: summarize(rows), buckets, failedBy };
  }

  return { buildBoard, buildReport, today, localDate };
}

/** Every work order in the work order snapshots, newest copy of each. */
export function mergeWos(lists: (WorkOrder[] | undefined)[]) {
  const m = new Map<string, WorkOrder>();
  lists.forEach((l) => (l || []).forEach((w) => m.set(String(w.id), w)));
  return [...m.values()];
}

export const pct = (x: number | null) => (x == null ? '–' : Math.round(x * 100) + '%');
