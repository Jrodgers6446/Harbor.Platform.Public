import Link from 'next/link';
import { currentUser } from '@/lib/supabase-server';
import { ago, stateOf } from '@/lib/format';
import { DownloadApp } from '@/components/DownloadApp';
import { storeToday } from '@/lib/day';

export const dynamic = 'force-dynamic';

export default async function Overview() {
  const { sb, profile } = await currentUser();
  const manager = profile!.role !== 'tech';
  const { data: fr } = await sb.from('franchises').select('timezone').eq('id', profile!.franchise_id).maybeSingle();
  const today = storeToday((fr as { timezone?: string } | null)?.timezone || undefined);
  const [{ data: devices }, { data: sheets }, { data: people }] = await Promise.all([
    manager ? sb.from('devices').select('id,name,tech_name,status,battery,last_seen_at').eq('status', 'active') : Promise.resolve({ data: [] as any[] }),
    manager ? sb.from('sheets').select('id,tech_name,van,submitted_at,clock_in_at,sheet_jobs(outcome)').eq('sheet_date', today) : Promise.resolve({ data: [] as any[] }),
    manager ? sb.from('profiles').select('user_id,role,disabled') : Promise.resolve({ data: [] as any[] }),
  ]);
  const devs = devices || [], sh = sheets || [];
  const online = devs.filter((d) => stateOf(d).key === 'online').length;
  const low = devs.filter((d) => d.battery != null && d.battery < 20).length;
  return (
    <>
      <h1 style={{ fontSize: 30 }}>{greeting()}, {firstName(profile!.display_name || profile!.email || '')}</h1>
      <div className="muted">{profile!.franchises?.name} · {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      <DownloadApp always={!manager} />
      {!manager && <div className="card" style={{ marginTop: 12 }}>Your daily forms, route and repair assist live in the tablet app. Managers use this site.</div>}
      {manager && (<>
        <div className="cards" style={{ marginTop: 20 }}>
          <Link href="/tablets" className="card kpi"><div className="l">Tablets online</div><div className={'n ' + (online ? 'ok' : '')}>{online} <span className="muted small">/ {devs.length}</span></div></Link>
          <div className="card kpi"><div className="l">Low battery</div><div className={'n ' + (low ? 'warn' : '')}>{low}</div></div>
          <Link href="/sheets" className="card kpi"><div className="l">Forms today</div><div className="n">{sh.filter((s) => s.submitted_at).length} <span className="muted small">/ {sh.length} submitted</span></div></Link>
          <Link href="/employees" className="card kpi"><div className="l">Employees</div><div className="n">{(people || []).filter((p) => !p.disabled).length}</div></Link>
        </div>
        <h2>Today's forms</h2>
        <div className="card">{sh.length ? <table><thead><tr><th>Tech</th><th>Van</th><th>Clocked in</th><th>Customers</th><th>Status</th></tr></thead><tbody>
          {sh.map((s) => { const jobs = (s.sheet_jobs || []) as { outcome: string | null }[]; const done = jobs.filter((j) => j.outcome).length; return (
            <tr key={s.id}><td><Link href={`/sheets/${s.id}`}>{s.tech_name || 'Tech'}</Link></td><td>{s.van || '—'}</td><td>{s.clock_in_at ? new Date(s.clock_in_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : <span className="muted">not yet</span>}</td>
              <td>{done} / {jobs.length} done</td><td>{s.submitted_at ? <span className="chip ok">Submitted</span> : <span className="chip grey">In progress</span>}</td></tr>); })}
        </tbody></table> : <div className="muted">No daily forms for today. Harbor's Daily Forms → <b>Send to tablets</b> puts them here.</div>}</div>
        <h2>Tablets</h2>
        <div className="card">{devs.length ? <table><thead><tr><th>Tablet</th><th>Tech</th><th>Last report</th><th>Battery</th></tr></thead><tbody>
          {devs.map((d) => { const s = stateOf(d); return (<tr key={d.id}><td>{d.name}</td><td>{d.tech_name || <span className="muted">not linked</span>}</td><td><span className={'chip ' + (s.key === 'online' ? 'ok' : s.key === 'idle' ? 'warn' : 'bad')}>{s.label}</span> <span className="muted small">{ago(d.last_seen_at)}</span></td><td>{d.battery ?? '—'}{d.battery != null && '%'}</td></tr>); })}
        </tbody></table> : <div className="muted">No approved tablets yet. <Link href="/tablets">Approve one</Link> when it asks to pair.</div>}</div>
      </>)}
    </>
  );
}
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const firstName = (s: string) => s.split(/[\s@.]/)[0] || s;
