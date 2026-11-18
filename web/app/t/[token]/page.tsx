import { createClient } from '@supabase/supabase-js';
import { Logo } from '@/components/Logo';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Set up a Harbor tablet' };

type Info = { store: string; valid: boolean; expires_at: string; version: string | null; url: string | null };

/**
 * Where a tablet lands after scanning the QR from Download > Tablet. No sign-in needed: the token itself is the pass.
 * Step 1 downloads the app. Step 2 opens it with the token (harbor://pair?t=...), and the app pairs itself to the
 * store after the tech signs in, with no approval step.
 */
export default async function TabletSetup({ params }: { params: { token: string } }) {
  const token = (params.token || '').replace(/[^a-f0-9]/gi, '').slice(0, 64);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await sb.rpc('tablet_invite_info', { p_token: token });
  const i = (data as Info[] | null)?.[0];
  // Chrome on Android opens the app with an intent link; without the app it stays on this page.
  const open = `intent://pair?t=${token}#Intent;scheme=harbor;package=app.harbor.tech;end`;
  return (
    <main className="center">
      <div className="card" style={{ width: 'min(480px, 100%)' }}>
        <Logo size={48} />
        {!i ? (<><h1>Code not found</h1><div className="muted">Ask your manager for a new QR code (Harbor website → Download → Tablet).</div></>)
        : !i.valid ? (<><h1>This code has expired</h1><div className="muted">QR codes work once and last 30 minutes. Ask your manager for a new one.</div></>)
        : (<>
          <div><h1>Set up this tablet</h1><div className="muted">for <b>{i.store}</b></div></div>
          <div className="setup-step"><span className="n">1</span><div>
            <b>Install the Harbor app</b>
            <div className="small muted">Open the file when it finishes and allow installing from this source. Already installed? Skip to step 2.</div>
            {i.url ? <a className="btn primary" style={{ marginTop: 10 }} href={i.url}>Download app{i.version ? ` (${i.version})` : ''}</a> : <div className="msg warn">No app release has been published yet.</div>}
          </div></div>
          <div className="setup-step"><span className="n">2</span><div>
            <b>Open Harbor to pair</b>
            <div className="small muted">Come back to this page after installing. The tech signs in with the code we email them, and the tablet is approved for {i.store} straight away.</div>
            <a className="btn" style={{ marginTop: 10 }} href={open}>Open Harbor</a>
          </div></div>
          <div className="small faint">This code works once and expires at {new Date(i.expires_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}.</div>
        </>)}
      </div>
    </main>
  );
}
