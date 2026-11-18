import { EmailCodeLogin } from '@/components/EmailCodeLogin';
import { Logo } from '@/components/Logo';
import { currentSite } from '@/lib/supabase-server';

export default function Login({ searchParams }: { searchParams: { error?: string } }) {
  const overwatch = currentSite() === 'overwatch';
  return (
    <main className="center">
      <div className="card">
        <Logo size={48} />
        <div><h1>{overwatch ? 'Harbor Overwatch' : 'Harbor'}</h1><div className="muted">{overwatch ? 'Platform control. Overwatch accounts only.' : "Sign in with the code we email you. New here? Sign up with your work email and your store."}</div></div>
        {searchParams.error && <div className="msg bad">{searchParams.error}</div>}
        <EmailCodeLogin next={overwatch ? '/overwatch' : '/'} />
        {!overwatch && <a href="/demo" className="small">See a demo first →</a>}
        <div className="small faint">Created by SageWorkx</div>
      </div>
    </main>
  );
}
