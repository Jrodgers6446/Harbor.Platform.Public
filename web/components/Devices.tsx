'use client';
import { useState } from 'react';
import { ActionButton } from './forms';
import { deviceAction } from '@/lib/actions';

type D = { id: string; name: string; tech_id: string | null; tech_name: string | null; van: string | null };

export function DeviceRow({ d, mode }: { d: D; mode: 'approve' | 'edit' | 'actions' | 'revoked' }) {
  const [name, setName] = useState(d.name); const [techId, setTechId] = useState(d.tech_id || ''); const [techName, setTechName] = useState(d.tech_name || ''); const [van, setVan] = useState(d.van || '');
  const patch = () => ({ name: name.trim() || d.name, tech_id: techId.trim() || null, tech_name: techName.trim() || null, van: van.trim() || null });
  if (mode === 'approve') return (
    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tablet name" />
      <div className="row"><input value={techId} onChange={(e) => setTechId(e.target.value)} placeholder="Dispatch tech id" /><input value={techName} onChange={(e) => setTechName(e.target.value)} placeholder="Tech name" /></div>
      <input value={van} onChange={(e) => setVan(e.target.value)} placeholder="Van (optional)" />
      <div className="row"><ActionButton className="btn primary" run={() => deviceAction(d.id, 'approve', patch())}>Approve</ActionButton><ActionButton className="btn danger" sure="Click again to deny" run={() => deviceAction(d.id, 'remove')}>Deny</ActionButton></div>
    </div>);
  if (mode === 'edit') return (
    <div style={{ display: 'grid', gap: 6, maxWidth: 260 }}>
      <input value={techName} onChange={(e) => setTechName(e.target.value)} placeholder="Tech name" style={{ minHeight: 34 }} />
      <div className="row" style={{ gap: 6 }}><input value={techId} onChange={(e) => setTechId(e.target.value)} placeholder="tech id" style={{ minHeight: 34 }} /><input value={van} onChange={(e) => setVan(e.target.value)} placeholder="van" style={{ minHeight: 34 }} /></div>
      {(techId !== (d.tech_id || '') || techName !== (d.tech_name || '') || van !== (d.van || '')) && <ActionButton className="btn sm primary" run={() => deviceAction(d.id, 'update', patch())}>Save</ActionButton>}
    </div>);
  if (mode === 'actions') return <ActionButton className="btn sm danger" sure="Click again to revoke" run={() => deviceAction(d.id, 'revoke')}>Revoke</ActionButton>;
  return <ActionButton className="btn sm danger" sure="Click again to delete" run={() => deviceAction(d.id, 'remove')}>Delete</ActionButton>;
}
