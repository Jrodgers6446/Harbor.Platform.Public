'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

export type SignupReq = { id: string; email: string; display_name: string; confirmed_at: string | null; created_at: string };

/** Employees → people asking to join this store (from Sign up). Approve as tech or manager, or decline. */
export function SignupRequests({ list }: { list: SignupReq[] }) {
  const router = useRouter();
  const [role, setRole] = useState<Record<string, string>>({});
  const [tech, setTech] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: string; k: string } | null>(null);
  const run = async (id: string, fn: 'approve_signup' | 'deny_signup') => {
    setBusy(id); setMsg(null);
    const args = fn === 'approve_signup' ? { p_id: id, p_role: role[id] || 'tech', p_tech_id: tech[id] || null } : { p_id: id };
    const { error } = await supabaseBrowser().rpc(fn, args);
    setBusy(null);
    if (error) setMsg({ t: error.message, k: 'bad' }); else { setMsg({ t: fn === 'approve_signup' ? 'Approved. They can sign in now.' : 'Declined.', k: 'ok' }); router.refresh(); }
  };
  if (!list.length) return null;
  return (<>
    <h2>Asking to join <span className="chip warn" style={{ marginLeft: 6 }}>{list.length}</span></h2>
    <div className="card"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Tech id</th><th /></tr></thead><tbody>
      {list.map((r) => (<tr key={r.id}>
        <td><b>{r.display_name}</b><div className="small muted">asked {new Date(r.created_at).toLocaleDateString()}</div></td>
        <td>{r.email}{!r.confirmed_at && <div className="small muted">hasn&apos;t entered their emailed code yet</div>}</td>
        <td><select value={role[r.id] || 'tech'} onChange={(e) => setRole({ ...role, [r.id]: e.target.value })} aria-label={`Role for ${r.display_name}`}><option value="tech">Tech</option><option value="manager">Manager</option></select></td>
        <td><input value={tech[r.id] || ''} onChange={(e) => setTech({ ...tech, [r.id]: e.target.value })} placeholder="optional" style={{ maxWidth: 140 }} aria-label={`Tech id for ${r.display_name}`} /></td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <button className="btn sm primary" disabled={!!busy || !r.confirmed_at} onClick={() => run(r.id, 'approve_signup')}>Approve</button>{' '}
          <button className="btn sm danger" disabled={!!busy} onClick={() => run(r.id, 'deny_signup')}>Decline</button></td>
      </tr>))}
    </tbody></table>
    <div className="small muted" style={{ marginTop: 8 }}>From Sign up on the front page. Only work emails on the allowed domain can ask, and they confirm their email with a code first.</div>
    {msg && <div className={'msg ' + msg.k} style={{ marginTop: 8 }}>{msg.t}</div>}</div>
  </>);
}
