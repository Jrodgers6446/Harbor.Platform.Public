import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase-server';
import { clock, day } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Sheets({ searchParams }: { searchParams: { from?: string } }) {
  const { sb, profile } = await currentUser();
  if (profile!.role === 'tech') redirect('/');
  const from = searchParams.from || new Date(Date.now() - 14 * 864e5).toLocaleDateString('en-CA');
  const { data } = await sb.from('sheets').select('id,sheet_date,tech_name,van,clock_in_at,clock_out_at,end_mileage,submitted_at,manager_name,sheet_jobs(outcome,part_status)').eq('franchise_id', profile!.franchise_id).gte('sheet_date', from).order('sheet_date', { ascending: false }).order('tech_name');
  const rows = data || [];
  const days = [...new Set(rows.map((r) => r.sheet_date))];
  return (
    <>
      <h1>Daily sheets</h1>
      <div className="muted">What the techs filled in on their tablets. Submitted sheets carry the manager's signature and can be printed.</div>
      <form className="row no-print" style={{ margin: '14px 0' }}><label className="f">From<input type="date" name="from" defaultValue={from} /></label><button className="btn">Show</button></form>
      {days.map((d) => (<div key={d}><h2>{day(d)}</h2><div className="card"><table><thead><tr><th>Tech</th><th>Van</th><th>In / out</th><th>Customers</th><th>RTI</th><th>Status</th></tr></thead><tbody>
        {rows.filter((r) => r.sheet_date === d).map((r) => { const jobs = (r.sheet_jobs || []) as { outcome: string | null; part_status: string | null }[]; return (
          <tr key={r.id}><td><Link href={`/sheets/${r.id}`}>{r.tech_name || 'Tech'}</Link></td><td>{r.van || '—'}</td><td>{clock(r.clock_in_at)} – {clock(r.clock_out_at)}</td>
            <td>{jobs.filter((j) => j.outcome === 'completed').length} done · {jobs.filter((j) => j.outcome && j.outcome !== 'completed').length} resched/unrep · {jobs.filter((j) => !j.outcome).length} open</td>
            <td>{jobs.filter((j) => j.part_status === 'rti').length || '—'}</td>
            <td>{r.submitted_at ? <span className="chip ok">Signed by {r.manager_name}</span> : <span className="chip grey">Open</span>}</td></tr>); })}
      </tbody></table></div></div>))}
      {!rows.length && <div className="card muted">No sheets since {day(from)}.</div>}
    </>
  );
}
