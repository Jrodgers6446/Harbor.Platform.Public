'use client';
import { useTransition } from 'react';
import { setViewAsManager } from '@/lib/actions';

export function ViewAsToggle({ on }: { on: boolean }) {
  const [busy, start] = useTransition();
  return <button className="btn sm" disabled={busy} onClick={() => start(async () => { await setViewAsManager(!on); location.href = '/'; })}>
    {on ? 'Back to Overwatch view' : 'View as manager'}</button>;
}

export function ViewAsBar() {
  const [busy, start] = useTransition();
  return <div className="viewas-bar"><span>Viewing as a store manager. Overwatch tools are hidden; your access hasn't changed.</span>
    <button className="btn sm" disabled={busy} onClick={() => start(async () => { await setViewAsManager(false); location.href = '/'; })}>Exit</button></div>;
}
