import { createClient } from '@supabase/supabase-js';
import { Logo } from '@/components/Logo';

export const dynamic = 'force-dynamic';

/** Public download page (no sign-in): the current stable tablet build. Sandbox builds show after signing in. */
export default async function Get() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await sb.rpc('public_release', { p_platform: 'tablet' });
  const r = (data as any[] | null)?.[0];
  return (
    <main className="center">
      <div className="card">
        <Logo size={48} />
        <div><h1>Harbor tablet app</h1><div className="muted">For the techs' Galaxy tablets.</div></div>
        {r ? (<>
          <div>Version <b>{r.version}</b> <span className="muted small">· {new Date(r.published_at).toLocaleDateString()}</span></div>
          <div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{r.notes}</div>
          <a className="btn primary" href={r.url}>Download app</a>
          <div className="small muted">Open the file when it finishes and allow installing from this source. Then sign in with your work account and type your store code.</div>
        </>) : <div className="msg warn">No release has been published yet.</div>}
        <a href="/login" className="small">Sign in to the site →</a>
      </div>
    </main>
  );
}
