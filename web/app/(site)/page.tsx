import Link from 'next/link';
import { currentUser } from '@/lib/supabase-server';
import { ago, stateOf } from '@/lib/format';
import { pickDay, plusDays, storeToday } from '@/lib/day';
import { HomeWidgets, type Widget } from '@/components/shell/HomeWidgets';
import { DownloadApp } from '@/components/DownloadApp';
import { bridgeDay, CANCELLED, DONE } from '@/lib/bridge';
import { overwatchDay } from '@/lib/overwatch';
import { makeLogic, mergeWos, mondayOf, pct as pctOf, shiftDate } from '@/lib/techdash';

export const dynamic = 'force-dynamic';

type Job = { outcome: string | null; customer_name: string | null; window_start: string | null };
type Sheet = { id: string; tech_name: string | null; van: string | null; submitted_at: string | null; clock_in_at: string | null; sheet_jobs: Job[] };

export default async function Home({ searchParams }: { searchParams: { day?: string } }) {
  const { sb, profile } = await currentUser();
  const { data: fr } = await sb.from('franchises').select('timezone').eq('id', profile!.franchise_id).maybeSingle();
  const tz = (fr as { timezone?: string } | null)?.timezone || undefined;
  const today = storeToday(tz);
  const day = pickDay(searchParams.day, tz);
  const rel = day === today ? 'Today' : day === plusDays(today, 1) ? 'Tomorrow' : day === plusDays(today, -1) ? 'Yesterday' : new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const q = (k: string) => `?day=${day}` + k;
  const manager = profile!.role !== 'tech';

  if (!manager) {
    return (<>
      <div className="home-head"><div><h1>{rel} at a glance</h1><p className="muted">{profile!.franchises?.name}</p></div></div>
      <div className="widget">Your daily forms, route and repair assist live in the Harbor tablet app. Managers use this site.</div>
      <DownloadApp always />
    </>);
  }

  const zone = tz || 'America/New_York';
  const L = makeLogic(zone);
  // outcomes: the picked day, or today when a future day is picked
  const tdDay = day <= L.today() ? day : L.today();
  const [{ data: sheets }, { data: devices }, { count: people }, br, { data: pcRes }, { data: snaps }, { data: st }, ow, { data: asks }] = await Promise.all([
    sb.from('sheets').select('id,tech_name,van,submitted_at,clock_in_at,sheet_jobs(outcome,customer_name,window_start)').eq('franchise_id', profile!.franchise_id).eq('sheet_date', day).order('tech_name'),
    sb.from('devices').select('id,name,tech_name,status,battery,last_seen_at').eq('franchise_id', profile!.franchise_id).eq('status', 'active').order('name'),
    sb.from('profiles').select('user_id', { count: 'exact', head: true }).eq('franchise_id', profile!.franchise_id).eq('disabled', false),
    bridgeDay(sb, profile!.franchise_id, day),
    sb.from('precall_results').select('sjn,customer,status,reply').eq('franchise_id', profile!.franchise_id).eq('day', day),
    sb.from('bridge_snapshots').select('source,day,payload,captured_at').eq('franchise_id', profile!.franchise_id).gte('day', shiftDate(mondayOf(tdDay), -2)).lte('day', shiftDate(tdDay, 8)),
    sb.from('store_settings').select('key,value').eq('franchise_id', profile!.franchise_id).eq('key', 'techdash'),
    overwatchDay(sb, profile!.franchise_id, today, zone).catch(() => []),
    sb.from('signup_requests').select('id,display_name,email').eq('franchise_id', profile!.franchise_id).eq('status', 'pending').not('confirmed_at', 'is', null),
  ]);
  const sh = (sheets || []) as unknown as Sheet[];
  const devs = devices || [];
  const jobs = sh.flatMap((s) => s.sheet_jobs || []);
  const done = jobs.filter((j) => j.outcome).length;
  const online = devs.filter((d) => stateOf(d).key === 'online').length;
  const low = devs.filter((d) => d.battery != null && d.battery < 20).length;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

  const dispatchJobs = (br.dispatch?.jobs || []).filter((j) => !CANCELLED.test(j.status)).sort((a, b) => String(a.ws).localeCompare(String(b.ws)));
  const techName = new Map((br.dispatch?.techs || []).map((t) => [t.id, t.name]));
  const techRows = (br.dispatch?.techs || []).map((t) => { const m = dispatchJobs.filter((j) => j.techs.includes(t.id)); return { id: t.id, name: t.name, total: m.length, done: m.filter((j) => DONE.test(j.status)).length }; }).filter((t) => t.total);
  const hm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }) : '');
  const needsBridge = (what: string) => <div className="w-empty">{what} fills in from the dispatch system and the work orders system through <b>Harbor Bridge</b>. Press the sync button at the top to read this day.</div>;

  // techs who are off their route today
  const owOff = ow.filter((t) => t.flags.some((f) => f.sev !== 'low'));
  const owWidget: Widget[] = ow.length ? [{ id: 'overwatch', title: 'Overwatch', from: 'tablets', size: 'full', node: (
    <Link href="/tablets#overwatch" className="ow-home" style={{ textDecoration: 'none', color: 'inherit' }}>
      <span className={'ow-pulse' + (owOff.length ? '' : ' ok')} />
      <div className="w-grow"><b>{owOff.length ? `${owOff.length} tech${owOff.length === 1 ? ' is' : 's are'} off route today` : 'All techs on route today'}</b>
        {owOff.map((t) => { const f = t.flags.find((x) => x.sev !== 'low')!; return <div className="w-note" key={t.deviceId}><b>{t.tech}</b>: {f.text}{t.flags.length > 1 ? ` (+${t.flags.length - 1} more)` : ''}</div>; })}
        {!owOff.length && <div className="w-note">Overwatch compares each tablet&apos;s location with the tech&apos;s route. Click for the report.</div>}</div>
      <span className="small muted">Open report</span>
    </Link>) }] : [];

  const askWidget: Widget[] = asks?.length ? [{ id: 'signups', title: 'Asking to join', from: 'Sign up', size: 'full', node: (
    <Link href="/employees" className="ow-home" style={{ textDecoration: 'none', color: 'inherit' }}>
      <span className="ow-pulse" style={{ background: '#f59e0b' }} />
      <div className="w-grow"><b>{asks.length} {asks.length === 1 ? 'person is' : 'people are'} asking to join this store</b>
        <div className="w-note">{asks.map((a) => a.display_name || a.email).join(', ')}</div></div>
      <span className="small muted">Review in Employees</span>
    </Link>) }] : [];

  const widgets: Widget[] = [
    ...askWidget,
    ...owWidget,
    { id: 'kpis', title: 'Numbers', size: 'full', node: (
      <div className="kpi-row">
        <Link className="kpi" href={'/m/forms' + q('')}><div className="kpi-label">Customers</div><div className={'kpi-num' + (jobs.length || dispatchJobs.length ? '' : ' muted')}>{jobs.length || dispatchJobs.length || 'None yet'}</div><div className="kpi-sub">{sh.length ? `${sh.length} tech${sh.length === 1 ? '' : 's'} with forms` : dispatchJobs.length ? `in dispatch · ${techRows.length} techs` : 'no sheets yet'}</div></Link>
        <div className="kpi"><div className="kpi-label">Done</div><div className="kpi-num">{done} <span className="kpi-of">/ {jobs.length}</span></div><div className="pbar"><i style={{ width: pct(done, jobs.length) + '%' }} /></div></div>
        <Link className="kpi" href="/sheets"><div className="kpi-label">Forms signed</div><div className={'kpi-num' + (sh.length && sh.every((s) => s.submitted_at) ? ' ok' : '')}>{sh.filter((s) => s.submitted_at).length} <span className="kpi-of">/ {sh.length}</span></div></Link>
        <Link className="kpi" href="/m/devices"><div className="kpi-label">Tablets online</div><div className={'kpi-num' + (online ? ' ok' : '')}>{online} <span className="kpi-of">/ {devs.length}</span></div><div className="kpi-sub">{low ? `${low} low battery` : 'Batteries fine'}</div></Link>
        <Link className="kpi" href="/employees"><div className="kpi-label">Employees</div><div className="kpi-num">{people ?? 0}</div></Link>
      </div>) },
    { id: 'forms', title: 'Daily Forms', from: 'sent to tablets', open: '/m/forms' + q(''), size: 'half', node: sh.length ? sh.map((s) => {
      const j = s.sheet_jobs || []; const d = j.filter((x) => x.outcome).length;
      return (<div className="w-row" key={s.id}><span className={'dot ' + (s.submitted_at ? 'ok' : s.clock_in_at ? 'warn' : '')} /><div className="w-grow"><b>{s.tech_name || 'Tech'}</b>{s.van && <span className="muted small"> · {s.van}</span>}<div className="w-note">{d} of {j.length} customers done{s.clock_in_at ? ' · clocked in ' + new Date(s.clock_in_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: tz }) : ''}</div></div>
        {s.submitted_at ? <span className="chip ok">Signed</span> : <Link className="small" href={`/sheets/${s.id}`}>View</Link>}</div>);
    }) : <div className="w-empty">No daily forms for this day yet. In the Harbor extension, Daily Forms → <b>Send to tablets</b> puts them here.</div> },
    { id: 'devices', title: 'Devices', from: 'tablets', open: '/m/devices', node: devs.length ? devs.map((d) => { const s = stateOf(d); return (
      <div className="w-row" key={d.id}><span className={'dot ' + (s.key === 'online' ? 'ok' : s.key === 'idle' ? 'warn' : 'bad')} /><div className="w-grow"><b>{d.tech_name || d.name}</b><div className="w-note">{s.label} · {ago(d.last_seen_at)}</div></div><span className={'small ' + (d.battery != null && d.battery < 20 ? 'warn' : 'muted')}>{d.battery ?? '—'}{d.battery != null && '%'}</span></div>); })
      : <div className="w-empty">No approved tablets yet.</div> },
    ...precallWidgets(), ...techWidgets(),
  ];

  // Pre-call widgets, built from the store's saved Pre-call results
  function precallWidgets(): Widget[] {
    const res = (pcRes || []) as { sjn: string; customer: string | null; status: string | null; reply: any }[];
    const live = dispatchJobs.filter((j) => !DONE.test(j.status));
    const sent = res.filter((r) => r.status === 'sent');
    const replied = sent.filter((r) => r.reply && !['no-reply', 'skipped', 'error'].includes(r.reply.status));
    const needs = res.filter((r) => r.reply && (r.reply.status === 'needs-you' || (r.reply.status === 'replied' && r.reply.flags?.length && !r.reply.mismatch)));
    const differs = res.filter((r) => r.reply?.mismatch);
    const rp = sent.length ? Math.round((replied.length / sent.length) * 100) : 0;
    const open = '/m/precall' + q('');
    const rs = res.map((r) => r.reply).filter((r) => r && r.at && !['no-reply', 'skipped', 'error'].includes(r.status));
    let activity: React.ReactNode = <div className="w-empty">No replies yet.</div>;
    if (rs.length) {
      const t0 = Math.min(...rs.map((r) => Date.parse(r.at))), slot = 15 * 60e3;
      const n = Math.min(16, Math.floor((Math.max(...rs.map((r) => Date.parse(r.at))) - t0) / slot) + 1);
      const b = Array.from({ length: n }, (_, i) => ({ ok: 0, need: 0, t: new Date(t0 + i * slot) }));
      rs.forEach((r) => { const i = Math.min(n - 1, Math.floor((Date.parse(r.at) - t0) / slot)); if (r.status === 'needs-you') b[i].need++; else b[i].ok++; });
      const max = Math.max(1, ...b.map((x) => x.ok + x.need));
      const tm = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone });
      activity = <><div className="mini-chart">{b.map((x, i) => <div className="col" key={i} title={`${tm(x.t)}: ${x.ok} answered, ${x.need} need you`}><i className="need" style={{ height: (x.need / max) * 100 + '%' }} /><i style={{ height: (x.ok / max) * 100 + '%' }} /></div>)}</div>
        <div className="mini-x"><span>{tm(b[0].t)}</span><span>{tm(b[n - 1].t)}</span></div></>;
    }
    return [
      { id: 'precall-numbers', title: 'Pre-call numbers', from: 'Pre-call', size: 'full', node: (
        <div className="kpi-row">
          <Link className="kpi" href={open}><div className="kpi-label">Pre-calls sent</div><div className="kpi-num">{sent.length} <span className="kpi-of">/ {live.length}</span></div><div className="pbar"><i style={{ width: pct(sent.length, live.length) + '%' }} /></div></Link>
          <div className="kpi"><div className="kpi-label">Customers replied</div><div className="kpi-num">{replied.length} <span className="kpi-of ok">{rp}%</span></div><div className="kpi-sub">{sent.length - replied.length} no reply yet</div></div>
          <Link className="kpi" href={open}><div className="kpi-label">Needs you</div><div className={'kpi-num' + (needs.length ? ' bad' : '')}>{needs.length}</div><div className="kpi-sub">{needs.length ? 'open Pre-call to answer' : 'nothing waiting'}</div></Link>
          <div className="kpi"><div className="kpi-label">Claim differs</div><div className={'kpi-num' + (differs.length ? ' warn' : '')}>{differs.length}</div><div className="kpi-sub">{differs.length ? 'claim line sent' : 'all match'}</div></div>
        </div>) },
      { id: 'precall-needs', title: 'Needs you', from: 'Pre-call', open, size: 'half', node: needs.length ? needs.map((r) => (
        <div className="w-item" key={r.sjn}><div className="w-item-top"><b>{r.customer || 'Customer'}</b><span className="chip bad">{(r.reply.flags || []).join(', ') || 'check'}</span></div>
          {r.reply.customerText && <div className="w-quote">“{String(r.reply.customerText).slice(0, 220)}”</div>}
          {r.reply.reply && <div className="muted small">We answered: {String(r.reply.reply).slice(0, 120)}</div>}</div>)) : <div className="w-empty">No replies waiting on you.</div> },
      { id: 'precall-activity', title: 'Reply activity', from: 'Pre-call', open, size: 'half', off: true, node: activity },
      { id: 'precall', title: 'Call list', from: 'via Bridge', open, off: true, node: dispatchJobs.length ? (<>
        {dispatchJobs.slice(0, 6).map((j) => <div className="w-row" key={j.sjn}><div className="w-grow"><b>{j.name || 'Customer'}</b><div className="w-note">{hm(j.ws)}{j.we ? '–' + hm(j.we) : ''} · {j.techs.map((t) => techName.get(t) || t).join(', ') || 'not assigned'}</div></div><span className={'chip ' + (res.find((r) => r.sjn === j.sjn)?.status === 'sent' ? 'ok' : 'grey')}>{res.find((r) => r.sjn === j.sjn)?.status === 'sent' ? 'texted' : 'to call'}</span></div>)}
        {dispatchJobs.length > 6 && <div className="w-note" style={{ paddingTop: 8 }}>+ {dispatchJobs.length - 6} more</div>}</>) : needsBridge('Pre-call') },
    ];
  }

  // Tech Dashboard widgets
  function techWidgets(): Widget[] {
    const goal: number = ((st || [])[0]?.value as any)?.goal || 75;
    const all = (snaps || []) as { source: string; day: string; payload: any; captured_at: string }[];
    const woSnaps = all.filter((r) => r.source === 'workorders').sort((a, b) => a.captured_at.localeCompare(b.captured_at));
    const wos = mergeWos(woSnaps.map((r) => r.payload?.wos));
    const fetchedAt = woSnaps.length ? woSnaps[woSnaps.length - 1].captured_at : null;
    const dispatchOf = (d: string) => all.find((r) => r.source === 'dispatch' && r.day === d)?.payload || null;
    const lbl = tdDay === L.today() ? 'Today' : new Date(tdDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const open = `/m/techdash?day=${tdDay}`;
    const dispatch0 = dispatchOf(tdDay);
    const none = <div className="w-empty">No jobs saved for {lbl === 'Today' ? 'today' : lbl}. Press the sync button at the top with that day picked.</div>;
    const asOf = <span className="muted small">{fetchedAt ? 'outcomes as of ' + new Date(fetchedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: zone }) : 'no work order data yet: press the sync button'}</span>;
    const b = dispatch0 ? L.buildBoard(dispatch0, wos, tdDay) : null;
    const rc = (x: number | null) => (x == null ? 'idle' : x * 100 >= goal ? 'ok' : 'bad');
    const week: { d: string; t: ReturnType<typeof L.buildBoard>['totals'] | null }[] = [];
    for (let d = mondayOf(tdDay); d <= tdDay; d = shiftDate(d, 1)) { const h = dispatchOf(d); week.push({ d, t: h ? L.buildBoard(h, wos, d).totals : null }); }
    const wd = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
    const failed = b ? b.techs.flatMap((t) => t.rows.filter((r) => r.result === 'failed').map((r) => ({ ...r, tech: t.name }))) : [];
    const c = b?.totals.counts;
    return [
      { id: 'techdash-numbers', title: 'Tech results', from: 'Tech Dashboard', size: 'full', node: !b || !c ? none : (
        <div className="kpi-row">
          <Link className="kpi" href={open}><div className="kpi-label">{lbl}: successful</div><div className="kpi-num ok">{c.success}</div><div className="kpi-sub">{c.failed} not successful · {c.canceled} canceled</div></Link>
          <div className="kpi"><div className="kpi-label">Success rate</div><div className={'kpi-num ' + (b.totals.rate == null ? 'muted' : rc(b.totals.rate))}>{pctOf(b.totals.rate)}</div><div className="kpi-sub">goal {goal}%</div></div>
          <div className="kpi"><div className="kpi-label">Add-on services</div><div className="kpi-num">{b.totals.done} <span className="kpi-of">/ {b.totals.opp}</span></div><div className="kpi-sub">{b.totals.opp ? `${pctOf(b.totals.serviceRate)} of opportunities` : 'no opportunities yet'}</div></div>
          <div className="kpi"><div className="kpi-label">Waiting on outcome</div><div className="kpi-num">{c.nowo + c.inprogress + c.upcoming}</div><div className="kpi-sub">{asOf}</div></div>
        </div>) },
      { id: 'techdash', title: 'Success rate by tech', from: 'Tech Dashboard', open, size: 'half', node: !b ? none : (<>
        {b.techs.filter((t) => t.id !== '__none').map((t) => { const judged = t.counts.success + t.counts.failed; return (
          <div className="w-row" key={t.id}><div className="w-grow"><b>{t.name}</b> <span className="muted small">{t.jobs} jobs · {t.counts.success}/{judged} successful{t.opp ? ` · ${t.done}/${t.opp} services` : ''}</span>
            <div className="pbar"><i style={{ width: (t.rate == null ? 0 : Math.round(t.rate * 100)) + '%' }} /></div></div><span className={'chip ' + rc(t.rate)}>{pctOf(t.rate)}</span></div>); })}
        {!b.techs.some((t) => t.id !== '__none') && <div className="w-empty">No jobs assigned to techs.</div>}
        <div className="kpi-sub">{lbl} · {asOf}</div></>) },
      { id: 'techdash-failed', title: 'Not successful', from: 'Tech Dashboard', open, size: 'half', off: true, node: !b ? none : failed.length ? failed.map((r) => (
        <div className="w-row" key={r.number}><div className="w-grow"><b>{r.customer}</b><div className="w-note">{r.tech} · {r.windowText}</div></div><span className="chip bad">{r.label}</span></div>)) : <div className="w-empty">No unsuccessful jobs {lbl === 'Today' ? 'today' : 'on ' + lbl} so far.</div> },
      { id: 'techdash-week', title: 'This week', from: 'Tech Dashboard', open: `/m/techdash?day=${tdDay}&view=week`, size: 'half', off: true, node: (<>
        <div className="mini-chart">{week.map(({ d, t }) => <div className="col" key={d} title={`${wd(d)}: ${t ? pctOf(t.rate) + ' (' + t.counts.success + ' of ' + (t.counts.success + t.counts.failed) + ')' : 'no saved jobs'}`}><i className={t && t.rate != null && t.rate * 100 < goal ? 'need' : ''} style={{ height: (t && t.rate != null ? Math.round(t.rate * 100) : 0) + '%' }} /></div>)}</div>
        <div className="mini-x">{week.map(({ d }) => <span key={d}>{wd(d)}</span>)}</div>
        <div className="kpi-sub">Red = below your {goal}% goal. Days without saved jobs stay empty.</div></>) },
    ];
  }

  return <HomeWidgets heading={`${rel} at a glance`} sub={jobs.length ? `${jobs.length} jobs · ${sh.length} techs` : profile!.franchises?.name || ''} widgets={widgets} />;
}
