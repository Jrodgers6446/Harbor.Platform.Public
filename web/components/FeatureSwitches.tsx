'use client';
import { ActionButton } from './forms';
import { setFeature } from '@/lib/actions';

type F = { key: string; name: string; description: string | null; default_on: boolean };
export function FeatureSwitches({ franchiseId, features, set }: { franchiseId: string; features: F[]; set: { key: string; enabled: boolean }[] }) {
  const over = new Map(set.map((s) => [s.key, s.enabled]));
  return (<div className="card">
    {features.map((f) => { const o = over.get(f.key); const on = o ?? f.default_on; return (
      <div className="switch" key={f.key}>
        <div><b>{f.name}</b> <span className="small muted">{f.key}</span><div className="small muted">{f.description}</div></div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className={'chip ' + (on ? 'ok' : 'grey')}>{on ? 'On' : 'Off'}{o === undefined && <span className="faint"> · default</span>}</span>
          <ActionButton run={() => setFeature(franchiseId, f.key, !on)}>{on ? 'Turn off' : 'Turn on'}</ActionButton>
          {o !== undefined && <ActionButton run={() => setFeature(franchiseId, f.key, null)}>Use default</ActionButton>}
        </div>
      </div>); })}
  </div>);
}
