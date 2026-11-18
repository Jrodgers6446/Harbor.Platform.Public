'use client';
import { useState } from 'react';
import { ActionForm, Submit } from './forms';
import { publishRelease } from '@/lib/actions';

export function ReleaseForm({ apks }: { apks: { name: string; url: string }[] }) {
  const [platform, setPlatform] = useState('tablet');
  const [version, setVersion] = useState('');
  const [confirm, setConfirm] = useState('');
  const [channel, setChannel] = useState('sandbox');
  const ready = version.trim() && confirm.trim() === version.trim();
  return (
    <ActionForm action={publishRelease} okText="Pushed. Clients see it on their next check.">
      <div className="row">
        <label className="f">Platform<select name="platform" value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="tablet">Tablet app</option><option value="extension">Harbor extension</option><option value="web">Website</option></select></label>
        <label className="f">Version<input name="version" value={version} onChange={(e) => { setVersion(e.target.value); if (platform === 'tablet' && /harbor-tech-(\d+)/.test(e.target.value)) setVersion('0.1.' + RegExp.$1); }} placeholder={platform === 'tablet' ? '0.1.5' : '0.4.2'} required /></label>
        <label className="f">Channel<select name="channel" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="sandbox">Sandbox (test stores only)</option><option value="stable">Stable (everyone)</option></select></label>
        <label className="f">Must be at least (optional)<input name="min_supported" placeholder="older clients are forced to update" /></label>
      </div>
      <label className="f" style={{ marginTop: 10 }}>{platform === 'tablet' ? 'APK file' : 'Download / site URL'}
        {platform === 'tablet' && apks.length ? (
          <select name="url" defaultValue="" onChange={(e) => { const m = e.target.value.match(/harbor-tech-(\d+)\.apk/); if (m && !version) setVersion('0.1.' + m[1]); }}>
            <option value="">Pick a build…</option>{apks.map((a) => <option key={a.url} value={a.url}>{a.name}</option>)}
          </select>) : <input name="url" placeholder="https://…" />}
      </label>
      <label className="f" style={{ marginTop: 10 }}>Version notes (what changed, what to watch for)
        <textarea name="notes" required minLength={10} placeholder={'Added the route map and repair assist.\nWatch for: addresses that don\'t geocode show without a pin.'} /></label>
      <div className="row" style={{ marginTop: 12, alignItems: 'center' }}>
        <label className="f">Type the version to confirm<input name="confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={version || 'version'} autoComplete="off" /></label>
        <div style={{ flex: 2 }} className={'small ' + (ready ? 'ok' : 'muted')}>{ready ? `Ready to push ${version} to ${channel === 'stable' ? 'every store' : 'the sandboxes'}.` : 'Nothing goes out until the version is typed again.'}</div>
        <Submit>{channel === 'stable' ? 'Push to everyone' : 'Push to sandboxes'}</Submit>
      </div>
    </ActionForm>
  );
}
