import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUser } from '@/lib/supabase-server';
import { clock, day } from '@/lib/format';
import { ActionButton } from '@/components/forms';
import { reopenSheet } from '@/lib/actions';
import { PrintButton } from '@/components/PrintButton';

export const dynamic = 'force-dynamic';

export default async function SheetPage({ params }: { params: { id: string } }) {
  const { sb } = await currentUser();
  const { data: s } = await sb.from('sheets').select('*,sheet_jobs(*)').eq('id', params.id).maybeSingle();
  if (!s) notFound();
  const jobs = [...(s.sheet_jobs as any[])].sort((a, b) => a.position - b.position);
  const win = (j: any) => j.window_start ? `${clock(j.window_start)}${j.window_end ? ' – ' + clock(j.window_end) : ''}` : '';
  return (
    <>
      <div className="row no-print" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <div><Link href="/sheets">← Daily forms</Link></div>
        <div style={{ flex: 'none', display: 'flex', gap: 8 }}>
          <PrintButton />
          {s.submitted_at && <ActionButton className="btn" sure="Click again to reopen" run={() => reopenSheet(s.id)}>Reopen for edits</ActionButton>}
        </div>
      </div>
      <div className="sheet-print">
        <h3>Daily Form</h3>
        <div>Tech: <b>{s.tech_name}</b> &nbsp; Date: <b>{day(s.sheet_date)}</b></div>
        <div>Van: {s.van || '____'} &nbsp; Clock in time: {clock(s.clock_in_at)} &nbsp; BOD: {s.bod_done ? 'Done' : '____'}</div>
        <div style={{ marginTop: 10, textDecoration: 'underline' }}>Customer List</div>
        {jobs.map((j) => (<div className="cust" key={j.id}>
          <div>Name: <b>{j.customer_name}</b> &nbsp; Device: {j.device} {j.filed_parts && <span>· {j.filed_parts}</span>} <span style={{ color: '#666' }}>{win(j)}</span></div>
          <div>Part SKU: {j.part_sku || '______'} &nbsp; Back glass SKU: {j.bg_sku || '______'} &nbsp; Battery SKU: {j.battery_sku || '______'} &nbsp; Reference: {j.rw || '____'}</div>
          <div>Part Status: <b>{j.part_status === 'returned' ? 'Returned' : j.part_status === 'used' ? 'Installed' : 'Installed / Returned'}</b> &nbsp; Outcome: <b>{j.outcome || '—'}</b> {j.reason && <span>· Reason: {j.reason}</span>}</div>
        </div>))}
        <div style={{ marginTop: 12 }}>Clock out time: {clock(s.clock_out_at)} &nbsp; End Mileage: {s.end_mileage ?? '______'} &nbsp; EOD: {s.eod_done ? 'Done' : '____'}</div>
        <div style={{ marginTop: 12 }}><b>Manager signature:</b> {s.manager_name || '________________'} {s.submitted_at && <span style={{ color: '#666' }}>· {new Date(s.submitted_at).toLocaleString()}</span>}</div>
        {s.signature && <div className="sig" style={{ maxWidth: 420, marginTop: 6 }}><svg viewBox="0 0 900 400" preserveAspectRatio="xMinYMid meet"><path d={s.signature} fill="none" stroke="#1d1630" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg></div>}
      </div>
    </>
  );
}
