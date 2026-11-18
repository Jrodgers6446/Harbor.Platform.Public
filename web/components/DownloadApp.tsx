import { headers } from 'next/headers';
import { supabaseServer } from '@/lib/supabase-server';

/** "Download the tablet app" card: shown big on Android, small elsewhere. Uses the newest release this store should run. */
export async function DownloadApp({ always = false }: { always?: boolean }) {
  const ua = headers().get('user-agent') || '';
  const android = /Android/i.test(ua);
  if (!android && !always) return null;
  const { data } = await supabaseServer().rpc('latest_release', { p_platform: 'tablet' });
  const r = (data as any[] | null)?.[0];
  return (
    <div className="card" style={{ marginTop: 20, borderColor: 'var(--accent-line)', background: 'var(--accent-bg)' }}>
      <div className="row" style={{ alignItems: 'center' }}>
        <div>
          <b>{android ? 'Get the Harbor tablet app' : 'Tablet app'}</b>
          <div className="small muted">{r ? <>Version {r.version} {r.channel === 'sandbox' && <span className="chip warn">sandbox</span>} · {new Date(r.published_at).toLocaleDateString()}</> : 'No release published yet.'}</div>
          {r?.notes && <div className="small" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{r.notes}</div>}
        </div>
        {r?.url && <a className="btn primary" style={{ flex: 'none' }} href={r.url}>Download app</a>}
      </div>
      {android && <div className="small muted" style={{ marginTop: 10 }}>After it downloads, open the file and allow installing from this source. Already installed? Open the app, it updates over the old one.</div>}
    </div>
  );
}
