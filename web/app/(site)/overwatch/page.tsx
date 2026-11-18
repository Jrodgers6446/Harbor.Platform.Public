import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase-server';
import { ActionForm, Submit } from '@/components/forms';
import { createFranchise } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function Franchises() {
  const sb = supabaseServer();
  const [{ data: fr }, { data: people }, { data: devs }] = await Promise.all([
    sb.from('franchises').select('id,name,is_sandbox,timezone,created_at').order('is_sandbox').order('name'),
    sb.from('profiles').select('franchise_id,role,disabled'),
    sb.from('devices').select('franchise_id,status'),
  ]);
  const count = (fid: string, f: (x: any) => boolean, list: any[] | null) => (list || []).filter((x) => x.franchise_id === fid && f(x)).length;
  return (
    <>
      <h1>Overwatch · Franchises</h1>
      <div className="muted">Every store on the platform. Sandboxes are stores for testing: pair one tablet to each and try sandbox releases and feature switches there first.</div>
      <h2>Add a franchise</h2>
      <ActionForm action={createFranchise} okText="Added. Open it to get the store code and add its first manager.">
        <div className="row">
          <label className="f">Name<input name="name" required placeholder="Example Store North" /></label>
          <label className="f">Time zone<select name="timezone" defaultValue="America/New_York"><option>America/New_York</option><option>America/Chicago</option><option>America/Denver</option><option>America/Phoenix</option><option>America/Los_Angeles</option></select></label>
          <label className="f" style={{ flex: 'none', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 42 }}><input type="checkbox" name="sandbox" style={{ minHeight: 0 }} /> Sandbox</label>
          <Submit>Add franchise</Submit>
        </div>
      </ActionForm>
      <h2>Franchises</h2>
      <div className="card"><table><thead><tr><th>Name</th><th>Managers</th><th>Techs</th><th>Tablets</th><th>Pending</th><th></th></tr></thead><tbody>
        {(fr || []).map((f) => (<tr key={f.id}>
          <td><Link href={`/overwatch/franchises/${f.id}`}><b>{f.name}</b></Link> {f.is_sandbox && <span className="chip warn">sandbox</span>}<div className="small muted">{f.timezone}</div></td>
          <td>{count(f.id, (p) => p.role !== 'tech' && !p.disabled, people)}</td><td>{count(f.id, (p) => p.role === 'tech' && !p.disabled, people)}</td>
          <td>{count(f.id, (d) => d.status === 'active', devs)}</td><td>{count(f.id, (d) => d.status === 'pending', devs) || '—'}</td>
          <td style={{ textAlign: 'right' }}><Link className="btn sm" href={`/overwatch/franchises/${f.id}`}>Open</Link></td></tr>))}
      </tbody></table></div>
    </>
  );
}
