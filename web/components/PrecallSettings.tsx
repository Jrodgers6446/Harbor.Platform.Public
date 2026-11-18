'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { ACTIONS, CARRIER_PATTERNS, CHECKS, DEFAULT_RULES, evaluate, render, type Rule } from '@/lib/precallRules';
import { DEFAULT_LINE_A, DEFAULT_LINE_B, badChars, type PcSettings } from './PrecallModule';

// Settings → Pre-call, shared by every manager of the store (store_settings 'precall' and 'precall_rules').
// Rules are checked top to bottom; the first that matches wins, then the rules indented under it are checked.

export function PrecallSettings() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [s, setS] = useState<PcSettings | null>(null);
  const [rules, setRules] = useState<Rule[]>(DEFAULT_RULES);
  const [custom, setCustom] = useState(false);
  const [msg, setMsg] = useState<{ t: string; k?: string }>({ t: '' });
  const [test, setTest] = useState('My screen is cracked and the back glass too');
  const [testKinds, setTestKinds] = useState('screen');
  const [testCarrier, setTestCarrier] = useState(CARRIER_PATTERNS[0].name);

  useEffect(() => {
    sb.from('store_settings').select('key,value').in('key', ['precall', 'precall_rules']).then(({ data }) => {
      const v = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
      setS(v.precall || {});
      if (Array.isArray(v.precall_rules?.rules) && v.precall_rules.rules.length) { setRules(v.precall_rules.rules); setCustom(true); }
    });
  }, [sb]);

  const save = async (key: string, value: unknown, ok = 'Saved for everyone at this store.') => {
    const { error } = await sb.rpc('set_store_setting', { p_key: key, p_value: value });
    setMsg(error ? { t: error.message, k: 'bad' } : { t: ok, k: 'ok' });
    return !error;
  };
  const saveLines = (patch: Partial<PcSettings>) => { const n = { ...(s || {}), ...patch }; setS(n); save('precall', n); };
  const saveRules = async (next: Rule[]) => {
    const bad = badChars(next.map((r) => r.reply).join(' '));
    if (bad.length) { setMsg({ t: `Replies can't use these characters (the phone can't type them): ${bad.join(' ')}`, k: 'bad' }); return; }
    if (await save('precall_rules', { rules: next }, 'Reply logic saved.')) setCustom(true);
  };
  const edit = (i: number, patch: Partial<Rule>) => setRules((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const remove = (i: number) => setRules((r) => { const d = r[i].depth; let end = i + 1; while (end < r.length && r[end].depth > d) end++; return [...r.slice(0, i), ...r.slice(end)]; });
  const add = (i: number, child: boolean) => setRules((r) => {
    const d = child ? r[i].depth + 1 : r[i].depth;
    let at = i + 1; if (!child) while (at < r.length && r[at].depth > r[i].depth) at++;
    const n: Rule = { id: 'r' + Date.now().toString(36), depth: d, kind: 'if', check: 'keywords', title: 'New rule', keys: '', action: 'flag', reply: '' };
    return [...r.slice(0, at), n, ...r.slice(at)];
  });
  const move = (i: number, dir: -1 | 1) => setRules((r) => {
    const j = i + dir; if (j < 0 || j >= r.length || r[j].depth !== r[i].depth) return r;
    const n = [...r]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  const kinds = testKinds.split(',').map((k) => k.trim()).filter(Boolean);
  const result = evaluate(rules, test, kinds.length ? kinds : null);
  const reply = result.rule && (result.rule.action === 'reply' || result.rule.action === 'both')
    ? render(result.rule.reply, { first: 'Dana', date: 'Nov 15', window: '10am-12pm', carrier: testCarrier, filedKinds: kinds, claimLines: { lineA: s?.lineA || DEFAULT_LINE_A, lineB: s?.lineB || DEFAULT_LINE_B } })
    : null;

  if (!s) return <div className="w-empty">Loading…</div>;
  return (<>
    <h3>Pre-call</h3>
    <p className="muted small" style={{ margin: 0 }}>Texts go out from the phone connected to Harbor Helper on this PC. The message and iPhone steps are edited on the Pre-call page. Everything here is shared by every manager at this store.</p>
    <div><Link className="btn" href="/m/precall">Open Pre-call</Link></div>

    <h3 style={{ marginTop: 8 }}>Carrier claim lines</h3>
    <p className="muted small" style={{ margin: 0 }}>Used as {'{claimLine}'} when a customer&apos;s description differs from the filed claim.</p>
    <label className="f">{CARRIER_PATTERNS.find((c) => c.key === 'lineA')?.name}<input defaultValue={s.lineA || DEFAULT_LINE_A} onBlur={(e) => saveLines({ lineA: e.target.value.trim() || DEFAULT_LINE_A })} /></label>
    <label className="f">{CARRIER_PATTERNS.find((c) => c.key === 'lineB')?.name}<input defaultValue={s.lineB || DEFAULT_LINE_B} onBlur={(e) => saveLines({ lineB: e.target.value.trim() || DEFAULT_LINE_B })} /></label>
    <label className="toggle-row"><span>Watch for replies after a send<div className="small muted">Every 3 minutes for 30 minutes while Pre-call is open.</div></span><input type="checkbox" checked={s.watchOn !== false} onChange={(e) => saveLines({ watchOn: e.target.checked })} /></label>

    <h3 style={{ marginTop: 8 }}>Reply logic</h3>
    <p className="muted small" style={{ margin: 0 }}>{custom ? 'Your rules.' : 'Default rules.'} Checked top to bottom; the first match wins, then the rules under it. Placeholders: {'{first} {date} {window} {carrier} {claimLine} {filed}'}.</p>
    {rules.map((r, i) => (
      <div className="rule-row" key={r.id} style={{ marginLeft: r.depth * 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="rule-kind">{r.depth === 0 ? 'When' : r.kind === 'else' ? 'Otherwise' : 'If'} · {CHECKS[r.check] || r.check}</span>
          <input aria-label="Rule name" value={r.title} onChange={(e) => edit(i, { title: e.target.value })} />
          {r.depth > 0 && <select aria-label="Check" value={r.check} onChange={(e) => edit(i, { check: e.target.value, kind: e.target.value === 'always' ? 'else' : 'if' })}>
            {['keywords', 'issue', 'claimMatch', 'always'].map((c) => <option key={c} value={c}>{CHECKS[c]}</option>)}</select>}
          {r.check === 'keywords' && <input aria-label="Words" placeholder="words, separated by commas" value={r.keys} onChange={(e) => edit(i, { keys: e.target.value })} />}
          <select aria-label="Action" value={r.action} onChange={(e) => edit(i, { action: e.target.value })}>{Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          {(r.action === 'reply' || r.action === 'both') && <textarea className="pc-tpl" rows={2} aria-label="Reply" value={r.reply} onChange={(e) => edit(i, { reply: e.target.value })} />}
        </div>
        <div className="rule-tools">
          <button className="btn sm" title="Move up" onClick={() => move(i, -1)}>↑</button>
          <button className="btn sm" title="Move down" onClick={() => move(i, 1)}>↓</button>
          <button className="btn sm" title="Add a rule after this one" onClick={() => add(i, false)}>+</button>
          <button className="btn sm" title="Add a rule under this one" onClick={() => add(i, true)}>↳</button>
          {r.depth > 0 && <button className="btn sm danger" title="Remove this rule and the ones under it" onClick={() => remove(i)}>×</button>}
        </div>
      </div>))}
    <div className="row">
      <button className="btn primary" onClick={() => saveRules(rules)}>Save reply logic</button>
      <button className="btn" onClick={() => { if (window.confirm('Go back to the default reply rules?')) { setRules(DEFAULT_RULES); saveRules(DEFAULT_RULES); } }}>Reset to default</button>
    </div>

    <div className="panel-box small">
      <b>Try a reply</b>
      <textarea className="pc-tpl" rows={2} value={test} onChange={(e) => setTest(e.target.value)} aria-label="Customer reply to test" />
      <div className="row"><label className="f">Filed for<input value={testKinds} onChange={(e) => setTestKinds(e.target.value)} placeholder="screen, bg, battery" /></label>
        <label className="f">Carrier<select value={testCarrier} onChange={(e) => setTestCarrier(e.target.value)}>{CARRIER_PATTERNS.map((c) => <option key={c.key}>{c.name}</option>)}</select></label></div>
      <div className="muted">Path: {result.path.join(' → ') || 'no rule matched'}</div>
      {result.extra.length > 0 && <div className="muted">Mentions repairs not filed: {result.extra.join(', ')}</div>}
      <div>{result.rule ? <><b>{ACTIONS[result.rule.action] || result.rule.action}</b>{reply ? <>: “{reply}”</> : (result.rule.action === 'reply' || result.rule.action === 'both') ? ': (a placeholder can’t be filled, so it would be flagged instead)' : ''}</> : 'Nothing happens.'}</div>
    </div>
    {msg.t && <div className={'msg ' + (msg.k || '')}>{msg.t}</div>}
  </>);
}
