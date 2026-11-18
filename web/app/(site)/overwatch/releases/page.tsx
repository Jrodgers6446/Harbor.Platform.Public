import { supabaseServer } from '@/lib/supabase-server';
import { ReleaseForm } from '@/components/ReleaseForm';

export const dynamic = 'force-dynamic';

export default async function Releases() {
  const sb = supabaseServer();
  const [{ data: rel }, { data: files }] = await Promise.all([
    sb.from('releases').select('id,platform,version,notes,url,channel,min_supported,published_at').order('published_at', { ascending: false }).limit(50),
    sb.storage.from('releases').list('tablet', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } }),
  ]);
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/releases/tablet/`;
  const apks = (files || []).filter((f) => f.name.endsWith('.apk')).map((f) => ({ name: f.name, url: base + f.name, at: f.created_at, size: (f.metadata as any)?.size as number | undefined }));
  return (
    <>
      <h1>Overwatch · Releases</h1>
      <div className="muted">Pushing a release is what makes tablets, Harbor and the site see "update available". It needs version notes and the version typed again to confirm. <b>Sandbox</b> goes to the sandbox stores only; <b>Stable</b> goes to everyone.</div>
      <h2>Push a release</h2>
      <ReleaseForm apks={apks} />
      <h2>History</h2>
      <div className="card">{rel?.length ? <table><thead><tr><th>When</th><th>Platform</th><th>Version</th><th>Channel</th><th>Notes</th><th></th></tr></thead><tbody>
        {rel.map((r) => (<tr key={r.id}><td className="muted small">{new Date(r.published_at).toLocaleString()}</td><td>{r.platform}</td><td><b>{r.version}</b>{r.min_supported && <div className="small muted">min {r.min_supported}</div>}</td>
          <td><span className={'chip ' + (r.channel === 'stable' ? 'ok' : 'warn')}>{r.channel}</span></td><td className="small" style={{ whiteSpace: 'pre-wrap', maxWidth: 420 }}>{r.notes}</td><td>{r.url && <a className="btn sm" href={r.url}>File</a>}</td></tr>))}
      </tbody></table> : <div className="muted">Nothing pushed yet.</div>}</div>
      <h2>Builds waiting in storage</h2>
      <div className="card">{apks.length ? <table><tbody>{apks.map((a) => <tr key={a.name}><td>{a.name}</td><td className="muted small">{a.at ? new Date(a.at).toLocaleString() : ''}{a.size ? ` · ${(a.size / 1e6).toFixed(1)} MB` : ''}</td><td style={{ textAlign: 'right' }}><a className="btn sm" href={a.url}>Download</a></td></tr>)}</tbody></table>
        : <div className="muted">No APKs uploaded yet. Each GitHub Actions build uploads one here once the <code>SUPABASE_SERVICE_KEY</code> repo secret is set (see android/README.md).</div>}</div>
    </>
  );
}
