'use client';
import { PrecallSettings } from '@/components/PrecallSettings';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Icon } from './icons';
import { bridgeCall, useLocal } from './util';
import type { SettingsTab } from './Panels';
import { SignOut } from '../SignOut';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { setViewAsManager } from '@/lib/actions';
import type { ShellUser } from './SiteShell';

// The extension's Settings (gear), on the website. Store-wide settings are saved for every manager of the store
// (store_settings); per-browser ones (Home widgets, sidebar, modules) stay in this browser.

export const MODULES = [
  { id: 'routes', label: 'Route Planner', desc: 'Each tech’s stops for the day, in order, with a Maps route.' },
  { id: 'dps', label: 'RT Daily Sheet', desc: 'The sheets sent to the tablets and what the techs filled in.' },
  { id: 'precall', label: 'Pre-call', desc: 'Confirmation texts and replies, through the phone on this PC.' },
  { id: 'techdash', label: 'Tech Dashboard', desc: 'Jobs done per tech and the week’s work orders.' },
  { id: 'devices', label: 'Devices', desc: 'The tech tablets: approve, link to techs, battery and location.' },
];
export const HOME_WIDGETS = [
  { id: 'kpis', title: 'Numbers', from: 'Home', desc: 'Customers, done, sheets signed, tablets online, employees' },
  { id: 'dps', title: 'RT Daily Sheet', from: 'RT Daily Sheet', desc: 'Each tech’s sheet and progress' },
  { id: 'devices', title: 'Devices', from: 'Devices', desc: 'Tablets, last report and battery' },
  { id: 'precall', title: 'Pre-call', from: 'Pre-call', desc: 'The next customers to confirm' },
  { id: 'techdash', title: 'Tech Dashboard', from: 'Tech Dashboard', desc: 'Jobs done per tech' },
];
export type ModPrefs = { hidden: string[]; order: string[] };
export const MOD_KEY = 'harbor:web:modules';
export const sortMods = <T extends { id: string }>(list: T[], order: string[]) => {
  const pos = (id: string) => { const i = order.indexOf(id); return i < 0 ? 100 + MODULES.findIndex((m) => m.id === id) : i; };
  return [...list].sort((a, b) => pos(a.id) - pos(b.id));
};

function useStoreSettings() {
  const [vals, setVals] = useState<Record<string, any>>({});
  useEffect(() => { supabaseBrowser().from('store_settings').select('key,value').then(({ data }) => setVals(Object.fromEntries((data || []).map((r) => [r.key, r.value])))); }, []);
  const save = async (key: string, value: unknown) => {
    const { error } = await supabaseBrowser().rpc('set_store_setting', { p_key: key, p_value: value });
    if (!error) setVals((v) => ({ ...v, [key]: value }));
    return error ? error.message.replace(/^.*?: /, '') : null;
  };
  return { vals, save };
}

const Msg = ({ m }: { m: { t: string; k?: string } }) => (m.t ? <div className={'msg ' + (m.k || '')}>{m.t}</div> : null);

export function useSettingsTabs(p: { user: ShellUser; day: string; canViewAs: boolean; viewingAs: boolean; checkPhone: () => Promise<any>; onDownload: (what?: 'tablet' | 'bridge' | 'helper') => void; refresh: () => void; bridgeInstalled: boolean }): SettingsTab[] {
  const manager = p.user.role !== 'tech';
  const store = useStoreSettings();
  const [hidden, setHidden] = useLocal<string[]>('harbor:web:hidden', []);
  const [mods, setMods] = useLocal<ModPrefs>(MOD_KEY, { hidden: [], order: [] });
  const [busy, start] = useTransition();

  // Harbor Helper
  const [helper, setHelper] = useState<{ url: string; hasToken: boolean } | null>(null);
  const [hUrl, setHUrl] = useState(''); const [hTok, setHTok] = useState('');
  const [hMsg, setHMsg] = useState<{ t: string; k?: string }>({ t: '' }); const [hInfo, setHInfo] = useState<any>(null); const [sure, setSure] = useState(false);
  const loadHelper = async () => {
    const r = await bridgeCall('helperConfig');
    if (r.ok) { setHelper(r.data); setHUrl(r.data.url); } else setHelper(null);
    setHInfo(await p.checkPhone());
  };
  useEffect(() => { loadHelper(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // per-store values
  const [addr, setAddr] = useState(''); const [goal, setGoal] = useState(75); const [vans, setVans] = useState<Record<string, string>>({});
  const [sMsg, setSMsg] = useState<{ t: string; k?: string }>({ t: '' });
  useEffect(() => { setAddr(store.vals.routes?.storeAddress || ''); setGoal(store.vals.techdash?.goal || 75); setVans(store.vals.vans || {}); }, [store.vals]);
  const [techs, setTechs] = useState<{ id: string; name: string }[] | null>(null);
  useEffect(() => {
    if (!manager) return;
    supabaseBrowser().from('bridge_snapshots').select('payload').eq('source', 'honeycomb').eq('day', p.day).maybeSingle()
      .then(({ data }) => setTechs(((data?.payload as any)?.techs || []).map((t: any) => ({ id: t.id, name: t.name }))));
  }, [p.day, manager]);
  const saved = async (key: string, value: unknown) => { const e = await store.save(key, value); setSMsg(e ? { t: e, k: 'bad' } : { t: 'Saved for everyone at this store.', k: 'ok' }); };
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => { if (manager) supabaseBrowser().rpc('my_store_code').then(({ data }) => setCode((data as string) || null)); }, [manager]);

  const orderIds = sortMods(MODULES, mods.order).map((m) => m.id);
  const move = (id: string, d: number) => { const ids = [...orderIds]; const i = ids.indexOf(id), j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; setMods({ ...mods, order: ids }); };

  const tabs: SettingsTab[] = [
    { id: 'home', label: 'Home page', body: <>
      <h3>What shows on Home</h3><p className="muted small" style={{ margin: 0 }}>Pick the results from each module. Saved in this browser.</p>
      {HOME_WIDGETS.map((w) => <label key={w.id} className="toggle-row"><span><span className="t-title">{w.title}</span><span className="t-desc">{w.desc}</span></span>
        <input type="checkbox" checked={!hidden.includes(w.id)} onChange={(e) => setHidden(e.target.checked ? hidden.filter((h) => h !== w.id) : [...hidden, w.id])} /></label>)}
      <div><button className="btn" onClick={() => setHidden([])}>Back to the default widgets</button></div>
      {manager && (<><h3 style={{ marginTop: 14 }}>Sidebar order</h3><p className="muted small" style={{ margin: 0 }}>Use the arrows. Home stays on top; your store and Overwatch stay at the bottom.</p>
        <div className="order-list">{orderIds.map((id, i) => { const m = MODULES.find((x) => x.id === id)!; return (
          <div className="order-row" key={id}><Icon name={id} /><span className="order-name">{m.label}</span>
            <button className="icon-btn sm" disabled={i === 0} aria-label={`Move ${m.label} up`} onClick={() => move(id, -1)}>↑</button>
            <button className="icon-btn sm" disabled={i === orderIds.length - 1} aria-label={`Move ${m.label} down`} onClick={() => move(id, 1)}>↓</button></div>); })}</div>
        <div><button className="btn" onClick={() => setMods({ ...mods, order: [] })}>Back to the default order</button></div></>)}
    </> },
    { id: 'helper', label: 'Harbor Helper', body: <>
      <h3>Harbor Helper</h3><p className="muted small" style={{ margin: 0 }}>The program on this PC that drives the field app on your phone. The token is in HELPER-TOKEN.txt in the harbor-helper folder. The website reaches it through Harbor Bridge, which keeps the token.</p>
      {!p.bridgeInstalled ? (<div className="conn-row"><span className="dot bad" /><div className="w-grow"><b>Harbor Bridge isn’t installed</b><div className="muted small">Install it on this PC to connect Harbor Helper.</div></div><button className="btn" onClick={() => p.onDownload('bridge')}>Get Bridge</button></div>) : (<>
        <label className="f">Helper address<input value={hUrl} onChange={(e) => setHUrl(e.target.value)} /></label>
        <label className="f">Helper token<input type="password" autoComplete="off" value={hTok} placeholder={helper?.hasToken ? 'Saved (type a new one to change it)' : 'Paste the token'} onChange={(e) => setHTok(e.target.value)} /></label>
        <div className="row" style={{ alignItems: 'center' }}>
          <button className="btn primary" onClick={async () => {
            const r = await bridgeCall('helperConfigSet', { url: hUrl, token: hTok }); setHTok('');
            if (!r.ok) return setHMsg({ t: r.error || 'Couldn’t save', k: 'bad' });
            setHelper(r.data); const h = await p.checkPhone(); setHInfo(h);
            setHMsg(h.ok ? { t: 'Saved. Helper and phone are ready.', k: 'ok' } : { t: `Saved. ${h.title}.`, k: 'bad' });
          }}>Save &amp; test</button>
          <button className="btn" onClick={async () => {
            const s = await bridgeCall('helper', { path: '/status' });
            if (s.ok && s.data?.busy && !sure) { setSure(true); return setHMsg({ t: 'Pre-call is running. Click Restart again to restart anyway.', k: 'bad' }); }
            setSure(false); await bridgeCall('helper', { path: '/admin/restart', method: 'POST' });
            setHMsg({ t: 'Restarting…' }); await new Promise((r) => setTimeout(r, 5000));
            const h = await p.checkPhone(); setHInfo(h);
            setHMsg(h.raw ? { t: 'Helper restarted.', k: 'ok' } : { t: 'Helper didn’t come back. Run restart-helper.bat in the harbor-helper folder.', k: 'bad' });
          }}>{sure ? 'Pre-call is running. Click again to restart anyway' : 'Restart helper'}</button>
        </div>
        <Msg m={hMsg} />
        {hInfo && !hInfo.raw && <div className="row" style={{ alignItems: 'center' }}><span className="muted small">No Harbor Helper on this PC yet?</span><button className="btn sm" style={{ flex: 'none' }} onClick={() => p.onDownload('helper')}>Download Helper</button></div>}
        <div className="panel-box small"><b>{hInfo ? hInfo.title : 'Checking…'}</b><div className="muted">{hInfo?.sub}</div>{hInfo?.raw?.device && <div className="muted">Phone: {hInfo.raw.device.model || hInfo.raw.device.serial || hInfo.raw.device.state}</div>}</div>
      </>)}
    </> },
  ];

  if (manager) tabs.push(
    { id: 'precall', label: 'Pre-call', body: <PrecallSettings /> },
    { id: 'routes', label: 'Route Planner', body: <>
      <h3>Route Planner</h3>
      <label className="f">Store address (routes start here)<input value={addr} placeholder="123 Main St, Springfield, IL 62701" onChange={(e) => setAddr(e.target.value)} onBlur={() => saved('routes', { ...(store.vals.routes || {}), storeAddress: addr.trim() })} /></label>
      <p className="muted small" style={{ margin: 0 }}>“Open in Maps” starts each tech’s route from this address. Drive-time and tracking settings stay in the extension’s Route Planner.</p>
      <Msg m={sMsg} />
    </> },
    { id: 'dps', label: 'RT Daily Sheet', body: <>
      <h3>RT Daily Sheet</h3><p className="muted small" style={{ margin: 0 }}>Van for each tech, shared by every manager here. Techs come from the dispatch data for the day picked at the top.</p>
      {techs === null ? <div className="w-empty">Loading…</div> : techs.length ? techs.map((t) => (
        <div className="van-row" key={t.id}><b>{t.name}</b><input placeholder="Van" aria-label={`Van for ${t.name}`} value={vans[t.id] || ''} onChange={(e) => setVans({ ...vans, [t.id]: e.target.value })} onBlur={() => saved('vans', vans)} /></div>))
        : <div className="w-empty">No techs for this day yet. Press the refresh button at the top, or pick a day that has data.</div>}
      <Msg m={sMsg} />
    </> },
    { id: 'techdash', label: 'Tech Dashboard', body: <>
      <h3>Tech Dashboard</h3>
      <label className="f">Success-rate goal (%)<input type="number" min={1} max={100} value={goal} onChange={(e) => setGoal(Number(e.target.value))} onBlur={() => saved('techdash', { ...(store.vals.techdash || {}), goal: Math.min(100, Math.max(1, Math.round(goal) || 75)) })} /></label>
      <p className="muted small" style={{ margin: 0 }}>Rates at or above the goal show green, below it red.</p>
      <div className="row" style={{ alignItems: 'center' }}><Link className="btn" href="/m/techdash">Open Tech Dashboard</Link><button className="btn" onClick={p.refresh}>Update outcomes now</button></div>
      <Msg m={sMsg} />
    </> },
    { id: 'devices', label: 'Devices', body: <>
      <h3>Devices</h3><p className="muted small" style={{ margin: 0 }}>Tablets sign in with an emailed code. The quickest setup is the QR code: it installs the app and pairs the tablet with no approval step.</p>
      <div className="row" style={{ alignItems: 'center' }}><button className="btn primary" onClick={() => p.onDownload('tablet')}>Tablet QR code</button><Link className="btn" href="/m/devices">Open Devices</Link></div>
      <div className="group-label">Store code</div>
      <div className="code">{code || '—'}</div>
      <p className="muted small" style={{ margin: 0 }}>Without the QR, a tech types this on the tablet after signing in, then you approve its 6-digit code in Devices. Make a new code in your store → Store settings.</p>
    </> },
    { id: 'modules', label: 'Modules', body: <>
      <h3>Modules</h3><p className="muted small" style={{ margin: 0 }}>Turning one off hides it from the sidebar in this browser. Your store’s module is always on.</p>
      {MODULES.map((m) => <label key={m.id} className="toggle-row"><span><span className="t-title">{m.label}</span><span className="t-desc">{m.desc}</span></span>
        <input type="checkbox" checked={!mods.hidden.includes(m.id)} onChange={(e) => setMods({ ...mods, hidden: e.target.checked ? mods.hidden.filter((h) => h !== m.id) : [...mods.hidden, m.id] })} /></label>)}
    </> },
  );

  tabs.push({ id: 'account', label: 'Account', body: <>
    <h3>Account</h3>
    <dl className="kv"><dt>Name</dt><dd>{p.user.name}</dd><dt>Email</dt><dd>{p.user.email}</dd><dt>Role</dt><dd>{p.user.role === 'overwatch' ? 'Overwatch' : p.user.role}</dd><dt>Store</dt><dd>{p.user.store}{p.user.sandbox && <span className="chip warn" style={{ marginLeft: 8 }}>sandbox</span>}</dd></dl>
    <div className="muted small">You stay signed in on this computer for 30 days after your last visit. Sign out on shared computers.</div>
    <div><SignOut className="btn" /></div>
    {p.canViewAs && (<><div className="group-label">Overwatch</div><div className="muted small">See the site the way a store manager does. Your access doesn&apos;t change.</div>
      <div><button className="btn" disabled={busy} onClick={() => start(async () => { await setViewAsManager(!p.viewingAs); location.href = '/'; })}>{p.viewingAs ? 'Back to Overwatch view' : 'View as manager'}</button></div></>)}
  </> });
  return tabs;
}
