'use client';
import { ActionButton, ActionForm, Submit } from './forms';
import { inviteEmployee, removeEmployee, setDisabled, updateEmployee } from '@/lib/actions';

type Person = { user_id: string; role: string; display_name: string | null; email: string | null; tech_id: string | null; disabled: boolean };

export function InviteForm({ franchise }: { franchise?: string }) {
  return (
    <ActionForm action={inviteEmployee} okText="Added. They can sign in now with a code sent to that email.">
      {franchise && <input type="hidden" name="franchise" value={franchise} />}
      <div className="row">
        <label className="f">Email<input name="email" type="email" required placeholder="name@example.com" /></label>
        <label className="f">Name<input name="display_name" placeholder="optional" /></label>
        <label className="f">Role<select name="role" defaultValue="tech"><option value="tech">Tech (tablet)</option><option value="manager">Manager (this site + Harbor)</option></select></label>
        <label className="f">Dispatch tech id<input name="tech_id" placeholder="optional, for techs" /></label>
        <Submit>Add</Submit>
      </div>
    </ActionForm>
  );
}

export function EmployeesTable({ people, me, path, techs }: { people: Person[]; me: string; path: string; techs: { tech_id: string | null; tech_name: string | null }[] }) {
  if (!people.length) return <div className="card muted">Nobody here yet.</div>;
  return (
    <div className="card"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Tech id</th><th></th></tr></thead><tbody>
      {people.map((p) => (
        <tr key={p.user_id} style={p.disabled ? { opacity: .55 } : undefined}>
          <td>{p.display_name || '—'} {p.user_id === me && <span className="chip accent">you</span>} {p.disabled && <span className="chip bad">off</span>}</td>
          <td>{p.email}</td>
          <td>{p.role === 'overwatch' ? <span className="chip accent">Overwatch</span> : p.user_id === me ? p.role : (
            <ActionForm action={updateEmployee} className="" resetOnOk={false} okText="">
              <input type="hidden" name="user_id" value={p.user_id} /><input type="hidden" name="path" value={path} />
              <select name="role" defaultValue={p.role} onChange={(e) => e.currentTarget.form?.requestSubmit()}><option value="tech">tech</option><option value="manager">manager</option></select>
            </ActionForm>)}</td>
          <td>{p.role === 'tech' ? (
            <ActionForm action={updateEmployee} className="" resetOnOk={false} okText="">
              <input type="hidden" name="user_id" value={p.user_id} /><input type="hidden" name="path" value={path} />
              <input name="tech_id" defaultValue={p.tech_id || ''} list="techids" placeholder="link to tech" style={{ width: 150 }} onBlur={(e) => { if (e.currentTarget.value !== (p.tech_id || '')) e.currentTarget.form?.requestSubmit(); }} />
            </ActionForm>) : <span className="muted">—</span>}</td>
          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            {p.user_id !== me && p.role !== 'overwatch' && (<>
              <ActionButton run={() => setDisabled(p.user_id, !p.disabled, path)}>{p.disabled ? 'Turn on' : 'Turn off'}</ActionButton>{' '}
              <ActionButton className="btn sm danger" sure="Click again to remove" run={() => removeEmployee(p.user_id, path)}>Remove</ActionButton>
            </>)}
          </td>
        </tr>))}
    </tbody></table>
    <datalist id="techids">{techs.filter((t) => t.tech_id).map((t) => <option key={t.tech_id!} value={t.tech_id!}>{t.tech_name || ''}</option>)}</datalist>
    <div className="small muted" style={{ marginTop: 8 }}>Turn off keeps the person but blocks sign-in and revokes their tablets. Remove deletes them from this store (their login stays but can't see anything).</div>
    </div>
  );
}
