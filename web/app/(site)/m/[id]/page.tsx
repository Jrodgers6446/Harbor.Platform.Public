import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase-server';
import { pickDay } from '@/lib/day';
import Tablets from '../../tablets/page';
import { ExtensionModule } from '@/components/shell/ExtensionModule';
import { bridgeDay, CANCELLED, DONE } from '@/lib/bridge';
import { TechDashView } from '@/components/TechDashView';
import { makeLogic, mergeWos, mondayOf, shiftDate } from '@/lib/techdash';
import { PrecallModule, type PcJob, type PcResult } from '@/components/PrecallModule';

export const dynamic = 'force-dynamic';

type Job = { id: string; position: number; customer_name: string | null; address: string | null; window_start: string | null; window_end: string | null; device: string | null; problem: string | null; filed_parts: string | null; part_sku: string | null; part_status: string | null; outcome: string | null; reason: string | null; lat: number | null; lon: number | null };
type Sheet = { id: string; tech_id: string; tech_name: string | null; van: string | null; submitted_at: string | null; clock_in_at: string | null; sheet_jobs: Job[] };

const NAMES: Record<string, string> = { routes: 'Route Planner', forms: 'Daily Forms', precall: 'Pre-call', techdash: 'Tech Dashboard', devices: 'Devices' };

/** The Harbor extension's modules, on the website. */
export default async function Module({ params, searchParams }: { params: { id: string }; searchParams: { day?: string; view?: string; ow?: string } }) {
  if (!NAMES[params.id]) notFound();
  const { sb, profile } = await currentUser();
  if (profile!.role === 'tech') redirect('/');
  if (params.id === 'devices') return <Tablets searchParams={searchParams} />;
  const { data: fr } = await sb.from('franchises').select('timezone').eq('id', profile!.franchise_id).maybeSingle();
  const tz = (fr as { timezone?: string } | null)?.timezone || 'America/New_York';
  const day = pickDay(searchParams.day, tz);
  const { data } = await sb.from('sheets')
    .select('id,tech_id,tech_name,van,submitted_at,clock_in_at,sheet_jobs(id,position,customer_name,address,window_start,window_end,device,problem,filed_parts,part_sku,part_status,outcome,reason,lat,lon)')
    .eq('franchise_id', profile!.franchise_id).eq('sheet_date', day).order('tech_name');
  const sheets = ((data || []) as unknown as Sheet[]).map((s) => ({ ...s, sheet_jobs: [...(s.sheet_jobs || [])].sort((a, b) => a.position - b.position) }));
  const t = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: tz }) : '');
  const win = (j: Job) => (j.window_start ? `${t(j.window_start)}${j.window_end ? ' – ' + t(j.window_end) : ''}` : 'no window');
  const dayText = new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const { data: st } = await sb.from('store_settings').select('key,value').eq('franchise_id', profile!.franchise_id);
  const setting = (k: string) => ((st || []).find((r) => r.key === k)?.value || {}) as Record<string, any>;
  const storeAddress: string = setting('routes').storeAddress || '';
  const vans: Record<string, string> = setting('vans');
  const goal: number = setting('techdash').goal || 75;
  if (params.id === 'precall' || params.id === 'techdash') {
    const b = await bridgeDay(sb, profile!.franchise_id, day);
    if (params.id === 'precall') {
      if (!b.dispatch) return <NeedsBridge id="precall" dayText={dayText} />;
      const name = new Map(b.dispatch.techs.map((t) => [t.id, t.name]));
      const jobs: PcJob[] = b.dispatch.jobs.filter((j) => !CANCELLED.test(j.status)).sort((a, c) => String(a.ws).localeCompare(String(c.ws)))
        .map((j) => ({ sjn: j.sjn, name: j.name || '', status: j.status, type: j.type, carrier: j.carrier, ws: j.ws, we: j.we, address: j.address, tech: j.techs.map((t) => name.get(t) || t).join(', '), done: DONE.test(j.status) }));
      const { data: res } = await sb.from('precall_results').select('sjn,status,detail,message,sent_at,dry,reply').eq('franchise_id', profile!.franchise_id).eq('day', day);
      const sheet: Record<string, { device: string | null; filed: string | null }> = {};
      sheets.forEach((s) => s.sheet_jobs.forEach((j) => { if (j.customer_name) sheet[j.customer_name.trim().toLowerCase()] = { device: j.device, filed: j.filed_parts || j.problem }; }));
      const rules = setting('precall_rules').rules;
      return <PrecallModule day={day} dayText={dayText} tz={tz} dispatchAt={b.dispatchAt} jobs={jobs} results={(res || []) as PcResult[]} sheet={sheet} settings={setting('precall')} rules={Array.isArray(rules) ? rules : null} />;
    }
    return techDash(sb, profile!.franchise_id, day, searchParams.view, tz, goal, vans);
  }
  const empty = <div className="widget w-empty">No daily forms for {dayText}. In the Harbor extension, Daily Forms → <b>Send to tablets</b> sends them here and to the techs&apos; tablets.</div>;

  if (params.id === 'routes') {
    return (<ExtensionModule page="modules/routes/planner.html" day={day} title="Route Planner">
      <div className="mod-head"><div><h1>Route Planner</h1><div className="muted">{dayText} · stops in the order they were sent to each tablet{storeAddress ? ' · starting from the store' : ''}</div></div></div>
      {!sheets.length ? empty : <div className="tech-cols">{sheets.map((s) => {
        const stops = s.sheet_jobs.filter((j) => j.address || (j.lat != null && j.lon != null));
        const maps = stops.length ? 'https://www.google.com/maps/dir/' + (storeAddress ? encodeURIComponent(storeAddress) + '/' : '') + stops.map((j) => encodeURIComponent(j.lat != null && j.lon != null ? `${j.lat},${j.lon}` : j.address!)).join('/') : null;
        const van = s.van || vans[s.tech_id] || '';
        return (<section className="widget" key={s.id}>
          <div className="w-head"><h2>{s.tech_name || 'Tech'}</h2>{van && <span className="from">{van}</span>}{maps && <a className="open" href={maps} target="_blank" rel="noreferrer">Open in Maps</a>}</div>
          {s.sheet_jobs.map((j, i) => (<div className="stop" key={j.id}><span className="n">{i + 1}</span><div className="w-grow"><b>{j.customer_name || 'Customer'}</b> <span className="muted small">· {win(j)}</span><div className="w-note">{j.address || 'No address'}</div></div>
            {j.outcome && <span className={'chip ' + (j.outcome === 'completed' ? 'ok' : 'warn')}>{j.outcome}</span>}</div>))}
          {!s.sheet_jobs.length && <div className="w-empty">No customers.</div>}
        </section>);
      })}</div>}
    </ExtensionModule>);
  }

  // forms
  return (<>
    <div className="mod-head"><div><h1>Daily Forms</h1><div className="muted">{dayText} · what each tech has on their tablet, filled in as they go</div></div><Link className="btn" href="/sheets">All forms</Link></div>
    {!sheets.length ? empty : sheets.map((s) => (
      <section className="widget" key={s.id} style={{ marginBottom: 16 }}>
        <div className="w-head"><h2>{s.tech_name || 'Tech'}</h2><span className="from">{s.van || vans[s.tech_id] || 'no van'}{s.clock_in_at ? ' · clocked in ' + t(s.clock_in_at) : ''}</span>
          <span className="open">{s.submitted_at ? <span className="chip ok">Signed</span> : <Link href={`/sheets/${s.id}`}>Open forms</Link>}</span></div>
        <table><thead><tr><th>#</th><th>Customer</th><th>Window</th><th>Device / problem</th><th>Part</th><th>Outcome</th></tr></thead><tbody>
          {s.sheet_jobs.map((j, i) => (<tr key={j.id}><td className="muted">{i + 1}</td><td><b>{j.customer_name || '—'}</b><div className="small muted">{j.address}</div></td><td className="small">{win(j)}</td>
            <td className="small">{j.device || '—'}<div className="muted">{j.problem || j.filed_parts}</div></td>
            <td className="small">{j.part_sku || <span className="muted">—</span>}{j.part_status && <div className="muted">{j.part_status === 'returned' ? 'Returned' : 'Installed'}</div>}</td>
            <td>{j.outcome ? <span className={'chip ' + (j.outcome === 'completed' ? 'ok' : 'warn')}>{j.outcome}</span> : <span className="chip grey">open</span>}{j.reason && <div className="small muted">{j.reason}</div>}</td></tr>))}
        </tbody></table>
      </section>))}
  </>);
}


/** Tech Dashboard: day / week / month like the extension, from Bridge's saved dispatch-system days and work orders system work orders. */
async function techDash(sb: any, franchiseId: string, picked: string, viewParam: string | undefined, tz: string, goal: number, vans: Record<string, string>) {
  const L = makeLogic(tz);
  const today = L.today();
  const view = viewParam === 'week' || viewParam === 'month' ? viewParam : 'day';
  const day = picked > today ? today : picked;
  let from = day, to = day, label: string;
  const f = (d: string, o: Intl.DateTimeFormatOptions) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', ...o });
  if (view === 'week') { from = mondayOf(day); to = shiftDate(from, 6); label = f(from, { month: 'short', day: 'numeric' }) + ' – ' + f(to, { month: 'short', day: 'numeric', year: 'numeric' }); }
  else if (view === 'month') { from = day.slice(0, 8) + '01'; to = shiftDate(new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7), 1)).toISOString().slice(0, 10), -1); label = f(from, { month: 'long', year: 'numeric' }); }
  else label = new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const end = to < today ? to : today;
  const { data } = await sb.from('bridge_snapshots').select('source,day,payload,captured_at').eq('franchise_id', franchiseId).gte('day', shiftDate(from, -2)).lte('day', shiftDate(end, 8));
  const snaps = (data || []) as { source: string; day: string; payload: any; captured_at: string }[];
  const dispatchDays = snaps.filter((r) => r.source === 'dispatch' && r.day >= from && r.day <= end).sort((a, b) => a.day.localeCompare(b.day));
  const woSnaps = snaps.filter((r) => r.source === 'workorders').sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  const wos = mergeWos(woSnaps.map((r) => r.payload?.wos));
  const dispatchDay = dispatchDays.find((r) => r.day === day);
  const latest = (l: typeof snaps) => (l.length ? l.reduce((a, b) => (a.captured_at > b.captured_at ? a : b)).captured_at : null);
  const rangeDays = Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 864e5) + 1;
  return <TechDashView view={view} day={day} label={label} goal={goal} tz={tz} vans={vans} clamped={picked > today}
    dispatchAt={view === 'day' ? dispatchDay?.captured_at || null : latest(dispatchDays)} workordersAt={latest(woSnaps)} hasWorkorders={woSnaps.length > 0}
    savedDays={dispatchDays.length} rangeDays={Math.max(1, rangeDays)}
    board={view === 'day' && dispatchDay ? L.buildBoard(dispatchDay.payload, wos, day) : null}
    report={view !== 'day' ? L.buildReport(dispatchDays.map((r) => ({ date: r.day, dispatch: r.payload })), wos, view === 'week' ? 'day' : 'week') : null} />;
}

function NeedsBridge({ id, dayText }: { id: string; dayText: string }) {
  const what = id === 'precall'
    ? 'Pre-call shows who to confirm for the day, from the dispatch system.'
    : 'Tech Dashboard shows each tech’s jobs from the dispatch system and the week’s work orders from the work orders system.';
  return (<>
    <div className="mod-head"><div><h1>{NAMES[id]}</h1><div className="muted">{dayText} · live data through Harbor Bridge</div></div></div>
    <section className="widget bridge-card">
      <div className="w-head"><h2>Nothing from Bridge for this day yet</h2></div>
      <p style={{ marginTop: 0 }}>{what}</p>
      <ol className="steps"><li>Install <b>Harbor Bridge</b> in Chrome on this computer (the card at the bottom of the sidebar turns green).</li><li>Open the dispatch system and the work orders system from the Bridge icon and sign in once.</li><li>Press the sync button at the top right (it reads the dispatch system, then the work orders system).</li></ol>
    </section>
  </>);
}
