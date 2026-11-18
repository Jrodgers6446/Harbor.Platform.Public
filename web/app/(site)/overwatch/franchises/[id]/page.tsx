import { notFound } from 'next/navigation';
import { currentUser } from '@/lib/supabase-server';
import { EmployeesTable, InviteForm } from '@/components/Employees';
import { ActionForm, Submit } from '@/components/forms';
import { updateFranchise } from '@/lib/actions';
import { FeatureSwitches } from '@/components/FeatureSwitches';

export const dynamic = 'force-dynamic';

export default async function Franchise({ params }: { params: { id: string } }) {
  const { sb, profile } = await currentUser();
  const { data: f } = await sb.from('franchises').select('id,name,is_sandbox,timezone,store_address').eq('id', params.id).maybeSingle();
  if (!f) notFound();
  const [{ data: code }, { data: people }, { data: feats }, { data: set }, { data: devs }] = await Promise.all([
    sb.rpc('store_code_for', { p_franchise: f.id }),
    sb.from('profiles').select('user_id,role,display_name,email,tech_id,disabled').eq('franchise_id', f.id).order('role').order('display_name'),
    sb.from('features').select('key,name,description,default_on').order('key'),
    sb.from('franchise_features').select('key,enabled').eq('franchise_id', f.id),
    sb.from('devices').select('tech_id,tech_name,name,status').eq('franchise_id', f.id),
  ]);
  const path = `/overwatch/franchises/${f.id}`;
  return (
    <>
      <h1>{f.name} {f.is_sandbox && <span className="chip warn">sandbox</span>}</h1>
      <div className="muted">Store code <b className="code" style={{ fontSize: 18, letterSpacing: '.2em' }}>{code}</b></div>
      <h2>Details</h2>
      <ActionForm action={updateFranchise} resetOnOk={false}>
        <input type="hidden" name="id" value={f.id} />
        <div className="row">
          <label className="f">Name<input name="name" defaultValue={f.name} required /></label>
          <label className="f">Time zone<input name="timezone" defaultValue={f.timezone} /></label>
          <label className="f">Store address<input name="store_address" defaultValue={f.store_address || ''} placeholder="for route start" /></label>
          <label className="f" style={{ flex: 'none', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 42 }}><input type="checkbox" name="sandbox" defaultChecked={f.is_sandbox} style={{ minHeight: 0 }} /> Sandbox</label>
          <Submit>Save</Submit>
        </div>
      </ActionForm>
      <h2>Features</h2>
      <FeatureSwitches franchiseId={f.id} features={feats || []} set={set || []} />
      <h2>Add someone to this store</h2>
      <InviteForm franchise={f.id} />
      <h2>People</h2>
      <EmployeesTable people={people || []} me={profile!.user_id} path={path} techs={devs || []} />
      <h2>Tablets</h2>
      <div className="card">{devs?.length ? <table><tbody>{devs.map((d, i) => <tr key={i}><td>{d.name}</td><td>{d.tech_name || <span className="muted">no tech</span>}</td><td><span className={'chip ' + (d.status === 'active' ? 'ok' : d.status === 'pending' ? 'warn' : 'bad')}>{d.status}</span></td></tr>)}</tbody></table> : <span className="muted">None yet.</span>}</div>
    </>
  );
}
