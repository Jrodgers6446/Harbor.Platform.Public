'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { bridgeCall } from '@/components/shell/util';
import { DEFAULT_RULES, kindsIn, type Rule } from '@/lib/precallRules';

// Pre-call on the website, same flow as the extension's Pre-call module: pick customers, dry run or send the
// confirmation text through Harbor Helper (the phone on this PC, reached through Harbor Bridge), then watch for
// replies and answer them with the reply logic tree. Results are saved per store (precall_results).

export type PcJob = { sjn: string; name: string; status: string; type: string; carrier: string; ws: string | null; we: string | null; address: string; tech: string; done: boolean };
export type PcResult = { sjn: string; status: string | null; detail: string | null; message: string | null; sent_at: string | null; dry: any; reply: any };
export type PcSheetInfo = { device: string | null; filed: string | null };
export type PcSettings = { template?: string; iphoneOn?: boolean; iphoneText?: string; att?: string; verizon?: string; watchOn?: boolean };

export const DEFAULT_TEMPLATE = 'Hi {first}, this is Example Repair Co confirming your repair appointment for {date} ({window}). Your technician will text you here with an ETA. Please reply with any questions!';
export const DEFAULT_IPHONE = 'Since your device is an iPhone, please turn off Find My iPhone and Stolen Device Protection before your appointment. ' +
  'Stolen Device Protection: Settings > Face ID & Passcode > Stolen Device Protection > turn it off (if it asks you to wait an hour, start early). ' +
  'Find My iPhone: Settings > tap your name > Find My > Find My iPhone > turn it off (needs your Apple ID password).';
export const DEFAULT_LINE_ATT = '1-800-555-0100 or att.example.com/support';
export const DEFAULT_LINE_VZ = '1-800-555-0101 or the carrier support app';
const WATCH_MIN = 30, EVERY_MIN = 3;
const FINISHED = ['done', 'failed', 'cancelled'];

/** adb can only type plain ASCII: swap smart punctuation, one line. */
export const asciiize = (s: string) => s.replace(/[\r\n\t]+/g, ' ').replace(/[\u00a0\u2009\u202f]/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...');
export const badChars = (s: string) => { const m = asciiize(s).match(/[^\x20-\x7E]/gu); return m ? [...new Set(m)] : []; };

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : '');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hour = (iso: string, tz: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }).replace(':00', '').replace(/\s/g, '').toLowerCase();
const windowText = (j: PcJob, tz: string) => (j.ws ? hour(j.ws, tz) + (j.we ? '-' + hour(j.we, tz) : '') : '');
const zipOf = (a: string) => (String(a || '').match(/\b\d{5}\b(?!.*\b\d{5}\b)/) || [])[0] || '';
const fillTpl = (tpl: string, v: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)).replace(/\s*\(\s*\)/g, '').replace(/\s+/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();

function filedKindsOf(j: PcJob, info?: PcSheetInfo) {
  if (info?.filed) { const k = kindsIn(info.filed); if (k.length) return k; }
  const t = (j.type || '').toLowerCase();
  if (/back glass/.test(t)) return ['bg'];
  if (/^screen$|front screen/.test(t)) return ['screen'];
  if (/battery/.test(t)) return ['battery'];
  return null;
}

type Pill = { ok: boolean; text: string };
type Watch = { day: string; until: number; paused?: boolean; left?: number } | null;
const WATCH_KEY = 'harbor:precall:watch';
const readWatch = (): Watch => { try { return JSON.parse(localStorage.getItem(WATCH_KEY) || 'null'); } catch { return null; } };
const writeWatch = (w: Watch) => { try { localStorage.setItem(WATCH_KEY, JSON.stringify(w)); } catch { /* private window */ } };

export function PrecallModule(p: { day: string; dayText: string; tz: string; hcAt: string | null; jobs: PcJob[]; results: PcResult[]; sheet: Record<string, PcSheetInfo>; settings: PcSettings; rules: Rule[] | null }) {
  const { day, tz } = p;
  const sb = useMemo(() => supabaseBrowser(), []);
  const [results, setResults] = useState<Record<string, PcResult>>(() => Object.fromEntries(p.results.map((r) => [r.sjn, r])));
  const [tpl, setTpl] = useState(p.settings.template || DEFAULT_TEMPLATE);
  const [iphoneOn, setIphoneOn] = useState(p.settings.iphoneOn !== false);
  const [iphoneText, setIphoneText] = useState(p.settings.iphoneText || DEFAULT_IPHONE);
  const [att, setAtt] = useState(p.settings.att || DEFAULT_LINE_ATT);
  const [vz, setVz] = useState(p.settings.verizon || DEFAULT_LINE_VZ);
  const [watchOn, setWatchOn] = useState(p.settings.watchOn !== false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pill, setPill] = useState<Pill | null>(null);
  const [msg, setMsg] = useState<{ t: string; k?: string }>({ t: '' });
  const [run, setRun] = useState<{ id: string; mode: string; total: number; done: number; sent: number; current?: string; pending: Set<string> } | null>(null);
  const [replyBusy, setReplyBusy] = useState(false);
  const [watch, setWatch] = useState<Watch>(null);
  const [, tick] = useState(0);
  const busyRef = useRef(false);
  busyRef.current = !!run || replyBusy;
  const rules = p.rules && p.rules.length ? p.rules : DEFAULT_RULES;

  const info = (j: PcJob) => p.sheet[j.name.trim().toLowerCase()];
  const isApple = (j: PcJob): boolean | null => { const d = info(j)?.device; return d == null ? null : /iphone|apple|ipad/i.test(d); };
  const dateLabel = new Date(day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const varsFor = (j: PcJob) => { const parts = j.name.trim().split(/\s+/); return { first: cap(parts[0] || 'there'), last: cap(parts.slice(1).join(' ')), date: dateLabel, window: windowText(j, tz), tech: cap(j.tech.split(/\s+/)[0] || '') }; };
  const render = (j: PcJob) => { const base = fillTpl(asciiize(tpl), varsFor(j)); return iphoneOn && isApple(j) === true ? `${base} ${fillTpl(asciiize(iphoneText), varsFor(j))}`.trim() : base; };

  const selectOpen = useCallback(() => setSel(new Set(p.jobs.filter((j) => !j.done && j.name && results[j.sjn]?.status !== 'sent').map((j) => j.sjn))), [p.jobs, results]);
  useEffect(() => { selectOpen(); /* once per day */ }, [day]); // eslint-disable-line react-hooks/exhaustive-deps

  // helper pill (all through Harbor Bridge)
  const checkHelper = useCallback(async () => {
    const r = await bridgeCall('helper', { path: '/status' });
    let s: Pill;
    if (r.error === 'NO_BRIDGE') s = { ok: false, text: 'Harbor Bridge not installed' };
    else if (!r.ok) s = { ok: false, text: r.error === 'Helper token not set' ? 'helper token not set (settings)' : r.error === 'Wrong helper token' ? 'wrong helper token' : 'helper not running' };
    else { const d = r.data?.device; s = d?.state === 'device' ? { ok: true, text: `helper ready · ${d.model || 'phone'}` } : { ok: false, text: d?.state === 'unauthorized' ? 'tap Allow on the phone' : 'helper running · no phone' }; }
    setPill(s); return s.ok;
  }, []);
  useEffect(() => { const t0 = setTimeout(checkHelper, 700); const t = setInterval(() => { if (!busyRef.current) checkHelper(); }, 15000); return () => { clearTimeout(t0); clearInterval(t); }; }, [checkHelper]);

  // saving
  const saveSettings = async (patch: Partial<PcSettings>) => {
    const next = { template: tpl, iphoneOn, iphoneText, att, verizon: vz, watchOn, ...patch };
    const { error } = await sb.rpc('set_store_setting', { p_key: 'precall', p_value: next });
    if (error) setMsg({ t: 'Couldn’t save the settings: ' + error.message, k: 'bad' });
  };
  const put = async (sjn: string, patch: Record<string, unknown>) => {
    const j = p.jobs.find((x) => x.sjn === sjn);
    const { error } = await sb.rpc('precall_put', { p_day: day, p_sjn: sjn, p_patch: { customer: j?.name, ...patch } });
    if (error) setMsg({ t: 'Couldn’t save a result: ' + error.message, k: 'bad' });
    setResults((cur) => {
      const old = cur[sjn] || { sjn, status: null, detail: null, message: null, sent_at: null, dry: null, reply: null };
      const n = { ...old } as PcResult;
      if ('status' in patch) { n.status = patch.status as string; n.detail = (patch.detail as string) ?? null; n.message = (patch.message as string) ?? null; n.sent_at = (patch.at as string) ?? null; }
      if ('dry' in patch) n.dry = patch.dry; if ('reply' in patch) n.reply = patch.reply;
      return { ...cur, [sjn]: n };
    });
  };
  const helper = async (path: string, method = 'GET', body?: unknown) => {
    const r = await bridgeCall('helper', { path, method, body }, 30000);
    if (!r.ok) throw new Error(r.status === 409 ? 'Harbor Helper is busy with another run. Try again when it finishes.' : r.error || 'Helper error');
    return r.data;
  };

  // template checks
  const bad = badChars(tpl + ' ' + iphoneText);
  const tplOk = !bad.length && asciiize(tpl).trim().length >= 5;
  const chosen = p.jobs.filter((j) => sel.has(j.sjn));
  const first = chosen[0] || p.jobs[0];
  const appleOne = chosen.find((j) => isApple(j) === true);
  const unknownDev = chosen.filter((j) => isApple(j) === null).length;

  const zipsFor = (list: PcJob[]) => { const n: Record<string, number> = {}; list.forEach((j) => { const k = j.name.toLowerCase(); n[k] = (n[k] || 0) + 1; }); return (j: PcJob) => (n[j.name.toLowerCase()] > 1 && zipOf(j.address) ? { zip: zipOf(j.address) } : {}); };

  // dry run / send
  async function startRun(mode: 'dry' | 'send') {
    if (!tplOk) { setMsg({ t: 'Fix the message first.', k: 'bad' }); return; }
    if (!(await checkHelper())) { setMsg({ t: 'Harbor Helper isn’t ready. Check the pill at the top right.', k: 'bad' }); return; }
    const list = chosen;
    if (!list.length) return;
    if (mode === 'send' && !window.confirm(`Send the Pre-call text to ${list.length} customer${list.length === 1 ? '' : 's'} from your phone?\n\n"${render(list[0])}"`)) return;
    const zip = zipsFor(list);
    const body = { mode, template: '{msg}', jobs: list.map((j) => ({ id: j.sjn, customer: j.name, date: dateLabel, ...zip(j), vars: { msg: render(j) } })) };
    let summary: any;
    try { summary = await helper('/precall/runs', 'POST', body); } catch (e: any) { setMsg({ t: e.message, k: 'bad' }); return; }
    const r = { id: summary.id as string, mode, total: list.length, done: 0, sent: 0, pending: new Set(list.map((j) => j.sjn)) };
    setRun(r);
    setMsg({ t: `${mode === 'send' ? 'Sending' : 'Dry run'}: 0 of ${r.total}…` });
    const savedIds = new Set<string>();
    let s: any = null, misses = 0;
    for (;;) {
      await sleep(2500);
      try { s = await helper(`/precall/runs/${r.id}`); misses = 0; } catch { if (++misses > 40) break; continue; }
      for (const x of s.results || []) {
        if (savedIds.has(x.id)) continue;
        savedIds.add(x.id);
        await put(x.id, mode === 'send' ? { status: x.status, detail: x.detail, message: x.message, at: x.at } : { dry: { status: x.status, detail: x.detail, at: x.at } });
        if (x.status === 'sent') setSel((c) => { const n = new Set(c); n.delete(x.id); return n; });
      }
      const sent = (s.results || []).filter((x: any) => x.status === 'sent').length;
      setRun({ ...r, done: s.processed ?? savedIds.size, sent, current: FINISHED.includes(s.state) ? undefined : list.find((j) => !savedIds.has(j.sjn))?.sjn, pending: new Set([...r.pending].filter((id) => !savedIds.has(id))) });
      setMsg({ t: `${mode === 'send' ? 'Sending' : 'Dry run'}: ${s.processed ?? savedIds.size} of ${r.total}${mode === 'send' ? ` · ${sent} sent` : ''}…` });
      if (FINISHED.includes(s.state)) break;
    }
    setRun(null);
    const sent = (s?.results || []).filter((x: any) => x.status === 'sent').length;
    if (!s) setMsg({ t: 'Lost touch with Harbor Helper. Reload the page to see what finished.', k: 'bad' });
    else if (s.state === 'failed') setMsg({ t: `Stopped: ${s.error}`, k: 'bad' });
    else setMsg({ t: (mode === 'send' ? `Done. ${sent} of ${r.total} sent.` : `Dry run done for ${r.total}. Nothing was sent.`) + (s.state === 'cancelled' ? ' (stopped early)' : ''), k: s.state === 'cancelled' ? '' : 'ok' });
    if (mode === 'send' && sent && watchOn) startWatch();
  }
  const cancel = async () => { if (!run) return; setMsg({ t: 'Stopping after the current customer…' }); helper(`/precall/runs/${run.id}/cancel`, 'POST').catch(() => {}); };

  // replies
  async function runReplies(mode: 'now' | 'preview' | 'auto') {
    if (busyRef.current) return;
    const list = p.jobs.filter((j) => results[j.sjn]?.status === 'sent' && !['replied', 'answered'].includes(results[j.sjn]?.reply?.status));
    if (!list.length) { if (mode !== 'auto') setMsg({ t: 'No pre-called customers waiting on a reply.' }); return; }
    if (!(await checkHelper())) { if (mode !== 'auto') setMsg({ t: 'Harbor Helper isn’t ready.', k: 'bad' }); return; }
    setReplyBusy(true); busyRef.current = true;
    try {
      const zip = zipsFor(list);
      const body = {
        mode: mode === 'preview' ? 'replies-dry' : 'replies',
        replyConfig: { rules: rules.map((r) => ({ ...r, reply: asciiize(r.reply || '') })), claimLines: { att: asciiize(att), verizon: asciiize(vz) } },
        jobs: list.map((j) => { const v = varsFor(j); return { id: j.sjn, customer: j.name, date: dateLabel, ...zip(j),
          ctx: { first: v.first, date: v.date, window: v.window, carrier: j.carrier, filedKinds: filedKindsOf(j, info(j)), precallPrefix: String(results[j.sjn]?.message || '').slice(0, 30) } }; }),
      };
      if (mode !== 'auto') setMsg({ t: mode === 'preview' ? 'Reading replies (nothing will be sent)…' : 'Checking replies…' });
      const start = await helper('/precall/runs', 'POST', body);
      let s: any;
      for (;;) {
        await sleep(3000);
        try { s = await helper(`/precall/runs/${start.id}`); } catch { continue; }
        if (mode !== 'auto') setMsg({ t: `${mode === 'preview' ? 'Reading replies' : 'Checking replies'}: ${s.processed} of ${s.total}…` });
        if (FINISHED.includes(s.state)) break;
      }
      for (const r of s.results || []) {
        let extra: any = {}; try { extra = JSON.parse(r.detail || '{}'); } catch { extra = { note: r.detail }; }
        await put(r.id, { reply: { status: r.status, reply: r.message || null, at: r.at, ...extra, ...(typeof r.detail === 'string' && !r.detail.startsWith('{') ? { detail: r.detail } : {}) } });
      }
      const c = (st: string) => (s.results || []).filter((r: any) => r.status === st).length;
      const text = `Replies: ${c('replied')} answered, ${c('needs-you')} need you, ${c('no-reply')} no reply yet${c('would-reply') ? `, ${c('would-reply')} would be answered` : ''}.`;
      if (s.state === 'failed') setMsg({ t: `Reply check stopped: ${s.error}`, k: 'bad' });
      else if (mode !== 'auto' || c('needs-you') || c('replied')) setMsg({ t: text, k: c('needs-you') ? 'bad' : 'ok' });
    } catch (e: any) { if (mode !== 'auto') setMsg({ t: e.message, k: 'bad' }); }
    finally { setReplyBusy(false); }
  }

  // reply watch: every 3 minutes for 30 minutes while this page is open
  const startWatch = (ms = WATCH_MIN * 60e3) => { const w = { day, until: Date.now() + ms }; writeWatch(w); setWatch(w); };
  const pauseWatch = () => { const w = readWatch(); if (!w || !(w.until > Date.now())) return; const n = { day: w.day, until: 0, paused: true, left: w.until - Date.now() }; writeWatch(n); setWatch(n); };
  useEffect(() => { setWatch(readWatch()); }, []);
  const runRepliesRef = useRef(runReplies); runRepliesRef.current = runReplies;
  useEffect(() => {
    const a = setInterval(() => tick((n) => n + 1), 30e3);
    const b = setInterval(() => { const w = readWatch(); if (w && w.day === day && w.until > Date.now() && !busyRef.current) runRepliesRef.current('auto'); }, EVERY_MIN * 60e3);
    return () => { clearInterval(a); clearInterval(b); };
  }, [day]);
  const mine = watch && watch.day === day;
  const watching = !!(mine && watch!.until > Date.now());
  const paused = !!(mine && watch!.paused && (watch!.left || 0) > 0);
  const mins = (ms: number) => Math.max(1, Math.ceil(ms / 60e3));
  const toggleWatch = () => {
    if (watching) return pauseWatch();
    startWatch(paused ? watch!.left : undefined);
    if (!busyRef.current) runReplies('auto');
  };

  // tags
  const precallTag = (j: PcJob) => {
    if (run?.pending.has(j.sjn)) return <span className="chip reply">{run.current === j.sjn ? 'on the phone' : 'in queue'}</span>;
    const r = results[j.sjn];
    if (!r) return null;
    if (r.status === 'sent') return <span className="chip ok" title={r.message || ''}>sent {r.sent_at ? new Date(r.sent_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }) : ''}</span>;
    if (r.status === 'unconfirmed') return <span className="chip bad" title="Sent, but the text wasn't seen in the chat afterward. Check the phone.">check phone</span>;
    if (r.status === 'skipped') return <span className="chip grey">{r.detail || 'skipped'}</span>;
    if (r.status === 'error') return <span className="chip bad" title={r.detail || ''}>error</span>;
    if (r.dry) return <span className="chip idle" title={r.dry.detail || ''}>dry run: {r.dry.status === 'dry-run' ? 'ready' : r.dry.detail || r.dry.status}</span>;
    return null;
  };
  const replyTag = (j: PcJob) => {
    const r = results[j.sjn]?.reply;
    if (!r) return null;
    const said = r.customerText ? <div className="small muted pc-said">{String(r.customerText).slice(0, 160)}</div> : null;
    const tip = `Customer: ${r.customerText || ''}${r.reply ? '\nWe answered: ' + r.reply : ''}`;
    const flags: string[] = r.flags || [];
    if (r.status === 'replied') { const other = flags.filter((f) => !r.mismatch || !/differ/i.test(f)); return <><span className={'chip ' + (other.length ? 'bad' : r.mismatch ? 'warn' : 'ok')} title={tip}>{r.mismatch ? 'claim differs · answered' : 'answered'}{other.length ? ' · ' + other.join(', ') : ''}</span>{said}</>; }
    if (r.status === 'needs-you') return <><span className="chip bad" title={tip}>needs you: {flags.join(', ') || 'check'}</span>{said}</>;
    if (r.status === 'would-reply') return <><span className="chip idle" title={tip}>would answer{r.mismatch ? ' (claim differs)' : ''}</span>{said}</>;
    if (r.status === 'answered') return <span className="chip grey" title={tip}>already answered</span>;
    if (r.status === 'no-reply') return <span className="chip grey">no reply yet</span>;
    if (r.status === 'error') return <span className="chip bad" title={r.detail || ''}>error</span>;
    return <span className="chip grey">{r.status}</span>;
  };

  const busy = !!run || replyBusy;
  const counts = { sent: p.jobs.filter((j) => results[j.sjn]?.status === 'sent').length, needs: p.jobs.filter((j) => results[j.sjn]?.reply?.status === 'needs-you').length, answered: p.jobs.filter((j) => results[j.sjn]?.reply?.status === 'replied').length };
  const autoRules = rules.filter((r) => r.action === 'reply' || r.action === 'both').length, flagRules = rules.filter((r) => r.action === 'flag' || r.action === 'both').length;

  return (<>
    <div className="mod-head"><div><h1>Pre-call</h1><div className="muted">{p.dayText} · {p.jobs.length} customers{p.hcAt ? ' · Dispatch ' + new Date(p.hcAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz }) : ''}</div></div>
      <span className={'chip ' + (!pill ? 'grey' : pill.ok ? 'ok' : 'bad')} title="Harbor Helper drives the phone on this PC">{pill ? pill.text : 'checking helper…'}</span></div>

    <div className="kpi-row" style={{ marginBottom: 16 }}>
      <div className="kpi"><div className="kpi-label">To confirm</div><div className="kpi-num">{p.jobs.filter((j) => !j.done).length}</div></div>
      <div className="kpi"><div className="kpi-label">Texted</div><div className="kpi-num ok">{counts.sent}</div></div>
      <div className="kpi"><div className="kpi-label">Answered</div><div className="kpi-num">{counts.answered}</div></div>
      <div className="kpi"><div className="kpi-label">Need you</div><div className={'kpi-num' + (counts.needs ? ' bad' : '')}>{counts.needs}</div></div>
    </div>

    <div className="pc-grid">
      <section className="widget">
        <div className="w-head"><h2>Message</h2><span className="from">{'{first} {last} {date} {window} {tech}'}</span></div>
        <textarea className="pc-tpl" rows={4} value={tpl} disabled={busy} onChange={(e) => setTpl(e.target.value)} onBlur={() => saveSettings({})} aria-label="Pre-call message" />
        {bad.length > 0 && <div className="msg bad">Remove these characters (the phone can&apos;t type them): {bad.map((c) => (/\S/.test(c) ? c : 'U+' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'))).join(' ')}</div>}
        {first && <div className="small pc-preview"><b>Preview:</b> {fillTpl(asciiize(tpl), varsFor(first))}</div>}
        <label className="toggle-row"><span>Add iPhone steps for iPhone customers<div className="small muted">Device comes from the RT Daily Sheet for this day.</div></span><input type="checkbox" checked={iphoneOn} disabled={busy} onChange={(e) => { setIphoneOn(e.target.checked); saveSettings({ iphoneOn: e.target.checked }); }} /></label>
        {iphoneOn && <textarea className="pc-tpl" rows={3} value={iphoneText} disabled={busy} onChange={(e) => setIphoneText(e.target.value)} onBlur={() => saveSettings({})} aria-label="iPhone steps" />}
        {iphoneOn && appleOne && <div className="small muted">iPhone customers (e.g. {appleOne.name}) also get the steps above.</div>}
        {iphoneOn && unknownDev > 0 && <div className="small muted">{unknownDev} selected customer{unknownDev === 1 ? ' has' : 's have'} no device info yet, so they won&apos;t get the iPhone steps. Send the RT Daily Sheet for this day first.</div>}
      </section>

      <section className="widget">
        <div className="w-head"><h2>Replies</h2><span className="from">{rules === DEFAULT_RULES ? 'default rules' : 'your rules'} · {autoRules} answer · {flagRules} flag</span></div>
        <div className="pc-watch">
          <button className={'pc-play' + (watching ? '' : ' paused')} onClick={toggleWatch} aria-label={watching ? 'Pause the reply watch' : 'Start watching for replies'} title={watching ? 'Pause the reply watch' : paused ? `Resume watching (${mins(watch!.left!)} min left)` : `Watch for replies (${WATCH_MIN} minutes)`}>
            {watching ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>}
          </button>
          <div><b>{watching ? `Watching · ${mins(watch!.until - Date.now())} min left` : paused ? `Paused · ${mins(watch!.left!)} min left` : 'Not watching'}</b><div className="small muted">Checks every {EVERY_MIN} minutes for {WATCH_MIN} minutes. Keep this page open.</div></div>
        </div>
        <label className="toggle-row"><span>Start watching after a send</span><input type="checkbox" checked={watchOn} onChange={(e) => { setWatchOn(e.target.checked); saveSettings({ watchOn: e.target.checked }); }} /></label>
        <div className="row"><button className="btn" disabled={busy} onClick={() => runReplies('now')}>Check replies now</button><button className="btn" disabled={busy} onClick={() => runReplies('preview')} title="Reads replies and shows what would be answered, without sending">Preview answers</button></div>
        <p className="small muted" style={{ margin: 0 }}>Claim lines, the reply logic tree and these defaults are in Settings → Pre-call.</p>
      </section>
    </div>

    <section className="widget" style={{ marginTop: 16 }}>
      <div className="w-head"><h2>Customers</h2><span className="from">{sel.size} selected</span>
        <span className="open"><button className="btn sm" disabled={busy} onClick={selectOpen}>Select not texted</button> <button className="btn sm" disabled={busy} onClick={() => setSel(new Set())}>None</button></span></div>
      <div className="pc-table"><table><thead><tr><th /><th>Customer</th><th>Device</th><th>Window</th><th>Tech</th><th>Status</th><th>Pre-call</th><th>Reply</th></tr></thead><tbody>
        {p.jobs.map((j) => { const ap = isApple(j); return (
          <tr key={j.sjn} className={(j.done ? 'pc-done ' : '') + (run?.current === j.sjn ? 'pc-active' : '')}>
            <td><input type="checkbox" aria-label={`Select ${j.name}`} checked={sel.has(j.sjn)} disabled={busy} onChange={(e) => setSel((c) => { const n = new Set(c); e.target.checked ? n.add(j.sjn) : n.delete(j.sjn); return n; })} /></td>
            <td><b>{j.name || '(no name)'}</b><div className="small muted">{[zipOf(j.address), j.type, j.carrier].filter(Boolean).join(' · ')}</div></td>
            <td className="small">{ap === null ? <span className="muted">unknown</span> : info(j)?.device}</td>
            <td className="small">{windowText(j, tz)}</td>
            <td className="small">{j.tech || <span className="muted">unassigned</span>}</td>
            <td className="small">{j.status}</td>
            <td>{precallTag(j)}</td>
            <td className="pc-reply">{replyTag(j)}</td>
          </tr>); })}
        {!p.jobs.length && <tr><td colSpan={8} className="muted">No customers from dispatch for this day. Press the dispatch sync button at the top.</td></tr>}
      </tbody></table></div>
      <div className="row pc-actions">
        <button className="btn" disabled={busy || !sel.size || !tplOk} onClick={() => startRun('dry')} title="Opens each chat on the phone and stops before typing. Nothing is sent.">Dry run</button>
        <button className="btn primary" disabled={busy || !sel.size || !tplOk} onClick={() => startRun('send')}>Send to {sel.size || 0}</button>
        {run && <button className="btn" onClick={cancel}>Stop</button>}
      </div>
      {msg.t && <div className={'msg ' + (msg.k || '')}>{msg.t}</div>}
    </section>
  </>);
}
