'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

// Sign-ups are limited to one company email domain (the database checks it too).
const SIGNUP_DOMAIN = (process.env.NEXT_PUBLIC_SIGNUP_DOMAIN || 'example.com').replace(/^@/, '');
const DOMAIN = new RegExp('^[^@\\s]+@' + SIGNUP_DOMAIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');

/**
 * Sign in with a 6-digit code emailed to you, or Sign up: name + work email + your store. A sign-up
 * becomes a request that a manager of that store approves under Employees (checked by the database).
 */
export function EmailCodeLogin({ next = '/' }: { next?: string }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [store, setStore] = useState('');
  const [stores, setStores] = useState<{ id: string; name: string }[] | null>(null);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'bad' | 'ok'; text: string } | null>(null);
  const sb = supabaseBrowser();

  useEffect(() => {
    if (mode !== 'up' || stores) return;
    sb.rpc('signup_stores').then(({ data, error }) => { setStores(error ? [] : (data as { id: string; name: string }[]) || []); });
  }, [mode, stores, sb]);

  async function emailCode() {
    const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true, emailRedirectTo: `${location.origin}/auth/callback` } });
    if (error) { setMsg({ kind: 'bad', text: friendly(error.message) }); return false; }
    setSent(true); setMsg({ kind: 'ok', text: `We emailed a 6-digit code to ${email.trim()}. It works for 1 hour.` });
    return true;
  }
  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true); setMsg(null);
    if (mode === 'up') {
      if (!DOMAIN.test(email.trim())) { setBusy(false); return setMsg({ kind: 'bad', text: `Sign up with your @${SIGNUP_DOMAIN} work email.` }); }
      const { error } = await sb.rpc('request_signup', { p_email: email.trim(), p_name: name.trim(), p_franchise: store });
      if (error) { setBusy(false); return setMsg({ kind: 'bad', text: error.message }); }
    }
    await emailCode();
    setBusy(false);
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (error) { setBusy(false); return setMsg({ kind: 'bad', text: /expired|invalid/i.test(error.message) ? 'That code is wrong or expired. Send a new one.' : friendly(error.message) }); }
    // a sign-up: the email is now proven, so the store's managers can see the request
    const { data: st } = await sb.rpc('confirm_signup');
    setBusy(false);
    location.href = st === 'pending' ? '/no-access?why=pending' : next;
  }
  const switchTo = (m: 'in' | 'up') => { setMode(m); setSent(false); setCode(''); setMsg(null); };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="seg" role="tablist" style={{ justifySelf: 'start' }}>
        <button type="button" role="tab" aria-selected={mode === 'in'} className={'seg-b' + (mode === 'in' ? ' on' : '')} onClick={() => switchTo('in')}>Sign in</button>
        <button type="button" role="tab" aria-selected={mode === 'up'} className={'seg-b' + (mode === 'up' ? ' on' : '')} onClick={() => switchTo('up')}>Sign up</button>
      </div>
      {!sent ? (
        <form onSubmit={send} style={{ display: 'grid', gap: 10 }}>
          {mode === 'up' && <label className="f">Your name<input required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" maxLength={80} /></label>}
          <label className="f">Work email<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`name@${SIGNUP_DOMAIN}`} /></label>
          {mode === 'up' && email.includes('@') && !DOMAIN.test(email.trim()) && <div className="small" style={{ color: '#f0a5a5' }}>Sign-ups need an @{SIGNUP_DOMAIN} email.</div>}
          {mode === 'up' && <label className="f">Your store
            <select required value={store} onChange={(e) => setStore(e.target.value)}>
              <option value="">{stores === null ? 'Loading stores…' : stores.length ? 'Pick your store location' : 'No stores found'}</option>
              {(stores || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>}
          <button className="btn primary" disabled={busy || !email.includes('@') || (mode === 'up' && (!DOMAIN.test(email.trim()) || name.trim().length < 2 || !store))}>
            {busy ? 'Sending…' : mode === 'up' ? 'Ask to join · email me a code' : 'Email me a code'}</button>
          {mode === 'up' && <div className="small muted">A manager at your store approves new accounts. You&apos;ll get a code to confirm your email, then you can sign in once they approve.</div>}
        </form>
      ) : (
        <form onSubmit={verify} style={{ display: 'grid', gap: 10 }}>
          <label className="f">6-digit code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" style={{ fontSize: 22, letterSpacing: '.3em' }} autoFocus /></label>
          <button className="btn primary" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : mode === 'up' ? 'Confirm my email' : 'Sign in'}</button>
          <div className="small muted">Wrong email or no code? <a href="#" onClick={(e) => { e.preventDefault(); setSent(false); setCode(''); setMsg(null); }}>Start over</a> · <a href="#" onClick={(e) => { e.preventDefault(); emailCode(); }}>Send again</a></div>
        </form>
      )}
      {msg && <div className={'msg ' + msg.kind}>{msg.text}</div>}
    </div>
  );
}

function friendly(m: string) {
  if (/hasn.t been added|not.*allowed|signups not allowed|Signups not allowed/i.test(m)) return "This email hasn't been added to a store yet. Use Sign up to ask your store, or ask your manager to add you under Employees.";
  if (/rate|security purposes|too many/i.test(m)) return 'Too many codes asked for. Wait a minute and try again.';
  return m;
}
