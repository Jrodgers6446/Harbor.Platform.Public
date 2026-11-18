'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { useEffect, useRef, useState } from 'react';

type Result = { ok: boolean; error?: string; data?: unknown } | null;

/** A form bound to a server action, showing its result and clearing itself on success. */
export function ActionForm({ action, children, okText = 'Saved.', className = 'card', resetOnOk = true }:
  { action: (s: unknown, f: FormData) => Promise<Result>; children: React.ReactNode; okText?: string; className?: string; resetOnOk?: boolean }) {
  const [state, run] = useFormState(action, null as Result);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok && resetOnOk) ref.current?.reset(); }, [state, resetOnOk]);
  return (
    <form ref={ref} action={run} className={className}>
      {children}
      {state && !state.ok && <div className="msg bad">{state.error}</div>}
      {state?.ok && <div className="msg ok">{okText}</div>}
    </form>
  );
}
export function Submit({ children, className = 'btn primary' }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending}>{pending ? 'Working…' : children}</button>;
}

/** A button that runs a server function; "sure" asks for a second click. */
export function ActionButton({ run, children, className = 'btn sm', sure }: { run: () => Promise<Result>; children: React.ReactNode; className?: string; sure?: string }) {
  const [busy, setBusy] = useState(false); const [armed, setArmed] = useState(false); const [err, setErr] = useState('');
  async function click() {
    if (sure && !armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; }
    setBusy(true); setErr(''); const r = await run(); setBusy(false); setArmed(false);
    if (r && !r.ok) setErr(r.error || 'Failed');
  }
  return (<span>
    <button className={className} disabled={busy} onClick={click}>{busy ? '…' : armed ? sure : children}</button>
    {err && <span className="bad small" style={{ marginLeft: 8 }}>{err}</span>}
  </span>);
}
