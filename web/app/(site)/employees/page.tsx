import { currentUser } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { EmployeesTable, InviteForm } from '@/components/Employees';
import { SignupRequests, type SignupReq } from '@/components/SignupRequests';

export const dynamic = 'force-dynamic';

export default async function Employees() {
  const { sb, profile } = await currentUser();
  if (profile!.role === 'tech') redirect('/');
  const [{ data: people }, { data: invites }, { data: techs }, { data: asks }] = await Promise.all([
    sb.from('profiles').select('user_id,role,display_name,email,tech_id,disabled,created_at').eq('franchise_id', profile!.franchise_id).order('role').order('display_name'),
    sb.from('employee_invites').select('id,email,role,tech_id,display_name,created_at').is('used_at', null).eq('franchise_id', profile!.franchise_id).order('created_at', { ascending: false }),
    sb.from('devices').select('tech_id,tech_name').not('tech_id', 'is', null),
    sb.from('signup_requests').select('id,email,display_name,confirmed_at,created_at').eq('franchise_id', profile!.franchise_id).eq('status', 'pending').order('created_at'),
  ]);
  return (
    <>
      <h1>Employees</h1>
      <div className="muted">Add someone's email and they can sign in with a code we email them. Techs use the tablet; managers use this site.</div>
      <SignupRequests list={(asks || []) as SignupReq[]} />
      <h2>Add someone</h2>
      <InviteForm />
      <h2>People</h2>
      <EmployeesTable people={people || []} me={profile!.user_id} path="/employees" techs={techs || []} />
      {!!invites?.length && (<><h2>Added, not signed in yet</h2>
        <div className="card"><table><thead><tr><th>Email</th><th>Role</th><th>Tech id</th><th>Added</th></tr></thead><tbody>
          {invites.map((i) => <tr key={i.id}><td>{i.email}</td><td>{i.role}</td><td>{i.tech_id || '—'}</td><td className="muted">{new Date(i.created_at).toLocaleDateString()}</td></tr>)}
        </tbody></table><div className="small muted" style={{ marginTop: 8 }}>They show up under People the first time they sign in.</div></div></>)}
    </>
  );
}
