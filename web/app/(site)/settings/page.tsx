import { redirect } from 'next/navigation';
import { currentUser, features } from '@/lib/supabase-server';
import { ActionButton } from '@/components/forms';
import { newStoreCode } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function Settings() {
  const { sb, profile } = await currentUser();
  if (profile!.role === 'tech') redirect('/');
  const [{ data: code }, f, { data: feats }] = await Promise.all([sb.rpc('my_store_code'), features(), sb.from('features').select('key,name,description')]);
  return (
    <>
      <h1>Store settings</h1>
      <div className="muted">{profile!.franchises?.name}</div>
      <h2>Store code</h2>
      <div className="card">
        <div className="small muted">Techs type this on the tablet right after signing in, so the login belongs to this store. It's also at the top of Harbor → Devices.</div>
        <div className="code" style={{ margin: '8px 0' }}>{code || '------'}</div>
        <ActionButton className="btn sm" sure="Click again to replace it" run={newStoreCode}>New code</ActionButton>
        <span className="small muted" style={{ marginLeft: 10 }}>The old code stops working; people already joined are not affected.</span>
      </div>
      <h2>Features for this store</h2>
      <div className="card">
        {(feats || []).map((x) => (<div className="switch" key={x.key}><div><b>{x.name}</b><div className="small muted">{x.description}</div></div><span className={'chip ' + (f[x.key] !== false ? 'ok' : 'grey')}>{f[x.key] !== false ? 'On' : 'Off'}</span></div>))}
        <div className="small muted" style={{ marginTop: 10 }}>Overwatch turns these on and off per store.</div>
      </div>
      <h2>Harbor extension</h2>
      <div className="card small muted">Managers also use the Harbor Chrome extension (Route Planner, Daily Forms, Pre-call, Devices). Sign in to its Devices settings with the same email; it sends you a code too.</div>
    </>
  );
}
