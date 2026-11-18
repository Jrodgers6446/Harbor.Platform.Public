import { currentUser } from '@/lib/supabase-server';
import { SignOut } from '@/components/SignOut';
import { Logo } from '@/components/Logo';
import { STANDARD_HOST } from '@/lib/hosts';

export default async function NoAccess({ searchParams }: { searchParams: { why?: string } }) {
  const { sb, user, profile } = await currentUser();
  const { data: req } = user && !profile ? await sb.from('signup_requests').select('status,franchise_id,confirmed_at,created_at').eq('user_id', user.id).maybeSingle() : { data: null };
  const { data: stores } = req ? await sb.rpc('signup_stores') : { data: null };
  const storeName = req ? ((stores || []) as { id: string; name: string }[]).find((x) => x.id === req.franchise_id)?.name || 'your store' : '';
  return (
    <main className="center">
      <div className="card">
        <Logo size={48} />
        <h1>{req?.status === 'pending' ? 'Waiting for approval' : 'Not set up yet'}</h1>
        {searchParams.why === 'overwatch' && profile && !profile.disabled
          ? <div className="muted">This address is for Overwatch only. Your store's site is <a href={`https://${STANDARD_HOST}`}>{STANDARD_HOST}</a>.</div>
          : req?.status === 'pending'
          ? <div className="muted">Thanks! Your email <b>{user?.email}</b> is confirmed. A manager at <b>{storeName}</b> needs to approve your account. You&apos;ll be able to sign in as soon as they do; sign in again then.</div>
          : req?.status === 'denied'
          ? <div className="muted">A manager at <b>{storeName}</b> declined this request. Talk to your manager if that&apos;s a mistake.</div>
          : profile?.disabled
          ? <div className="muted">This account was turned off by a manager.</div>
          : <div className="muted">You signed in as <b>{user?.email}</b>, but no store has added that email yet. Ask your manager to add you under <b>Employees</b>, then sign in again.</div>}
        <SignOut />
      </div>
    </main>
  );
}
