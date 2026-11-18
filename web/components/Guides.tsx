'use client';
import { useState } from 'react';
import { ActionButton, ActionForm, Submit } from './forms';
import { deleteGuide, saveGuide } from '@/lib/actions';

type Guide = { id: string; device: string; repair: string; steps: { title: string; detail?: string }[]; warnings: string | null; updated_at: string };

export function GuideEditor({ g }: { g?: Guide }) {
  return (
    <ActionForm action={saveGuide} okText="Saved. Tablets pick it up on their next refresh." resetOnOk={!g}>
      {g && <input type="hidden" name="id" value={g.id} />}
      <div className="row">
        <label className="f">Device<input name="device" required defaultValue={g?.device} placeholder="iPhone 14, Galaxy S24, Any phone…" /></label>
        <label className="f">Repair<input name="repair" required defaultValue={g?.repair} placeholder="Screen, Battery, Back glass, Charge port…" /></label>
      </div>
      <label className="f" style={{ marginTop: 10 }}>Steps, one per line as <code>Title - detail</code>
        <textarea name="steps" required defaultValue={g?.steps.map((s) => s.detail ? `${s.title} - ${s.detail}` : s.title).join('\n')} placeholder={'Pre-check - touch, Face ID, cameras, charging\nDisconnect the battery first - then the display cables'} /></label>
      <label className="f" style={{ marginTop: 10 }}>Watch out (optional)<input name="warnings" defaultValue={g?.warnings || ''} placeholder="Pry from the bottom only; the Face ID flex sits near the top." /></label>
      <div style={{ marginTop: 12 }}><Submit>{g ? 'Save changes' : 'Add guide'}</Submit></div>
    </ActionForm>
  );
}

export function GuideList({ guides }: { guides: Guide[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!guides.length) return <div className="card muted">No store guides yet; tablets use the built-in starters.</div>;
  return (<div style={{ display: 'grid', gap: 10 }}>
    {guides.map((g) => (<div className="card" key={g.id}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div><b>{g.device}</b> · {g.repair} <span className="muted small">· {g.steps.length} steps · {new Date(g.updated_at).toLocaleDateString()}</span></div>
        <div style={{ flex: 'none', display: 'flex', gap: 8 }}>
          <button className="btn sm" onClick={() => setOpen(open === g.id ? null : g.id)}>{open === g.id ? 'Close' : 'Edit'}</button>
          <ActionButton className="btn sm danger" sure="Click again to delete" run={() => deleteGuide(g.id)}>Delete</ActionButton>
        </div>
      </div>
      {open === g.id && <div style={{ marginTop: 12 }}><GuideEditor g={g} /></div>}
    </div>))}
  </div>);
}
