'use client';
import { useState } from 'react';
import { Chrome, type NavItem } from './shell/Chrome';
import { HelpDrawer, SettingsDrawer } from './shell/Panels';
import { PhoneCard } from './shell/Phone';
import { DEMO_MAP, FakeMap } from './demo/FakeMap';
import { TabletDemo } from './demo/TabletDemo';
import { TabletsDemo, OVERWATCH_OFF, DEMO_TABLETS } from './demo/TabletsDemo';
import { DEMO_JOBS, PaperworkDemo } from './demo/PaperworkDemo';
import { DownloadPanel } from './shell/DownloadPanel';
import { addDays } from './shell/util';

// All made up. Nothing here touches the real backend.
const TECHS = [
  { name: 'Alex Rivera', van: 'Van 1', tablet: 'Tablet 01', state: 'online', ago: '1 min ago', battery: 82, done: 4, total: 6, clock: '7:48 AM' },
  { name: 'Sam Patel', van: 'Van 2', tablet: 'Tablet 02', state: 'online', ago: 'just now', battery: 64, done: 3, total: 5, clock: '7:55 AM' },
  { name: 'Jordan Lee', van: 'Van 3', tablet: 'Tablet 03', state: 'idle', ago: '18 min ago', battery: 17, done: 2, total: 6, clock: '8:02 AM' },
  { name: 'Casey Brooks', van: 'Van 4', tablet: 'Tablet 04', state: 'offline', ago: '2 h 10 min ago', battery: 41, done: 6, total: 6, clock: '7:40 AM', submitted: true },
];
const PEOPLE = [
  { name: 'Morgan Diaz', email: 'manager@example.com', role: 'manager', tech: '—' },
  ...TECHS.map((t, i) => ({ name: t.name, email: t.name.split(' ')[0].toLowerCase() + '@example.com', role: 'tech', tech: String(41200 + i) })),
];
const JOBS = DEMO_JOBS.slice(0, 4);
const GUIDES = [['HVAC', 'Annual tune-up', 5], ['Dishwasher', 'Not draining', 6], ['Phone', 'Cracked screen', 6], ['Router', 'New install', 4]];
const REPLIES = [
  { c: 'Dana Whitfield', t: 'Alex Rivera', msg: 'Yes 8-10 works, gate code 1142', tag: 'Confirmed', k: 'ok' },
  { c: 'Marcus Bell', t: 'Alex Rivera', msg: 'Can you come after 10?', tag: 'Wants a new time', k: 'warn' },
  { c: 'Priya Raman', t: 'Sam Patel', msg: 'Also the battery dies fast', tag: 'Extra work', k: 'reply' },
  { c: 'Lena Fischer', t: 'Jordan Lee', msg: '', tag: 'No reply yet', k: 'idle' },
];

type View = 'home' | 'routes' | 'dps' | 'precall' | 'techdash' | 'devices' | 'store' | 'tablet';
type Sub = 'overview' | 'employees' | 'tablets' | 'sheets' | 'guides';
const SUBS: [Sub, string][] = [['overview', 'Overview'], ['employees', 'Employees'], ['tablets', 'Tablets'], ['sheets', 'Daily paperwork'], ['guides', 'Repair guides']];

export function DemoApp({ embed = false }: { embed?: boolean }) {
  const today = new Date().toLocaleDateString('en-CA');
  const [view, setView] = useState<View>('home');
  const [sub, setSub] = useState<Sub>('overview');
  const [day, setDay] = useState(addDays(today, 1));
  const [panel, setPanel] = useState<'settings' | 'help' | 'download' | null>(null);
  const [toast, setToast] = useState('');
  const [focus, setFocus] = useState<number | null>(null);
  const demoOnly = (t = 'This is the demo. Sign in to make changes.') => { setToast(t); setTimeout(() => setToast(''), 2500); };
  const chip = (s: string) => <span className={'chip ' + (s === 'online' ? 'ok' : s === 'idle' ? 'warn' : 'bad')}>{s === 'online' ? 'Online' : s === 'idle' ? 'Quiet' : 'Offline'}</span>;
  const items: NavItem[] = [
    { id: 'home', label: 'Home', icon: 'home' }, { id: 'routes', label: 'Route Planner', icon: 'routes' }, { id: 'dps', label: 'Daily Paperwork', icon: 'dps' },
    { id: 'precall', label: 'Pre-call', icon: 'precall', count: '1 new' }, { id: 'techdash', label: 'Tech Dashboard', icon: 'techdash' },
    { id: 'devices', label: 'Devices', icon: 'devices', count: 1, countKind: 'warn' }, { id: 'store', label: 'Example Store', icon: 'store' },
    { id: 'tablet', label: 'Tablet app', icon: 'devices' },
  ];
  const go = (v: string) => { setView(v as View); if (v === 'store') setSub('overview'); };
  const rel = day === today ? 'Today' : day === addDays(today, 1) ? 'Tomorrow' : new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const title = items.find((i) => i.id === view)!.label + (view === 'store' && sub !== 'overview' ? ' · ' + SUBS.find((s) => s[0] === sub)![1] : '');
  const done = TECHS.reduce((a, t) => a + t.done, 0), total = TECHS.reduce((a, t) => a + t.total, 0);

  return (
    <div className="hb" style={embed ? { height: '100%' } : undefined}>
      {!embed && <div className="demo-bar">
        <span><b>Demo</b> · made-up store and data. Click around; nothing here is real.</span>
        <span style={{ display: 'flex', gap: 8 }}><a className="btn sm" href="/">About Harbor</a><a className="btn sm primary" href="/login">Sign in</a></span>
      </div>}
      <Chrome items={items} active={view} onSelect={go} title={title} day={day} today={today} onDay={setDay}
        bridge={{ installed: true, version: '1.0.0', hcAt: Date.now() - 6 * 60e3, portalAt: Date.now() - 40 * 60e3 }}
        generic onSync={() => demoOnly('In the real site this refreshes your scheduling and work-order systems through Harbor Bridge.')} onDownload={() => setPanel('download')}
        footCard={<PhoneCard phone={{ ok: true, title: 'Phone connected', sub: '', via: 'wifi' }} onClick={() => demoOnly('In the real site this opens the phone connection (cable or Wi-Fi) for Harbor Helper.')} />} onHelp={() => setPanel('help')} onSettings={() => setPanel('settings')} version="2.0.0">

        {view === 'home' && (<>
          <div className="home-head"><div><h1>{rel} at a glance</h1><p className="muted">{total} jobs · {TECHS.length} techs</p></div><button className="btn" onClick={() => demoOnly()}>Customize home</button></div>
          <div className="widgets">
            <section className="widget full"><a href="#" className="ow-home" style={{ textDecoration: 'none', color: 'inherit' }} onClick={(e) => { e.preventDefault(); go('devices'); }}>
              <span className="ow-pulse" />
              <div className="w-grow"><b>{OVERWATCH_OFF.length} techs are off route today</b>
                {OVERWATCH_OFF.map((r) => { const t = DEMO_TABLETS.find((x) => x.label === r.label)!; const f = r.flags.find((x) => x.sev !== 'low')!; return <div className="w-note" key={r.label}><b>{r.label} · {t.name}</b>: {f.text}{r.flags.length > 1 ? ` (+${r.flags.length - 1} more)` : ''}</div>; })}</div>
              <span className="small muted">Open Overwatch</span></a></section>
            <section className="widget full"><div className="kpi-row">
              <div className="kpi"><div className="kpi-label">Customers</div><div className="kpi-num">{total}</div><div className="kpi-sub">{TECHS.length} techs with paperwork</div></div>
              <div className="kpi"><div className="kpi-label">Done</div><div className="kpi-num">{done} <span className="kpi-of">/ {total}</span></div><div className="pbar"><i style={{ width: Math.round(done / total * 100) + '%' }} /></div></div>
              <div className="kpi"><div className="kpi-label">Confirmed</div><div className="kpi-num ok">17 <span className="kpi-of">/ {total}</span></div><div className="kpi-sub">from Pre-call replies</div></div>
              <div className="kpi"><div className="kpi-label">Tablets online</div><div className="kpi-num ok">3 <span className="kpi-of">/ 5</span></div><div className="kpi-sub">1 low battery</div></div>
            </div></section>
            <section className="widget half"><div className="w-head"><h2>Daily Paperwork</h2><span className="from">sent to tablets</span><a className="open" href="#" onClick={(e) => { e.preventDefault(); go('dps'); }}>Open</a></div>
              {TECHS.map((t) => <div className="w-row" key={t.name}><span className={'dot ' + (t.submitted ? 'ok' : 'warn')} /><div className="w-grow"><b>{t.name}</b><span className="muted small"> · {t.van}</span><div className="w-note">{t.done} of {t.total} customers done · clocked in {t.clock}</div></div>{t.submitted ? <span className="chip ok">Signed</span> : null}</div>)}
            </section>
            <section className="widget"><div className="w-head"><h2>Pre-call</h2><span className="from">via Bridge</span><a className="open" href="#" onClick={(e) => { e.preventDefault(); go('precall'); }}>Open</a></div>
              {REPLIES.slice(0, 3).map((r) => <div className="w-row" key={r.c}><div className="w-grow"><b>{r.c}</b><div className="w-note">{r.msg}</div></div><span className={'chip ' + r.k}>{r.tag}</span></div>)}
            </section>
            <section className="widget"><div className="w-head"><h2>Devices</h2><span className="from">tablets</span><a className="open" href="#" onClick={(e) => { e.preventDefault(); go('devices'); }}>Open</a></div>
              {TECHS.map((t) => <div className="w-row" key={t.tablet}><span className={'dot ' + (t.state === 'online' ? 'ok' : t.state === 'idle' ? 'warn' : 'bad')} /><div className="w-grow"><b>{t.name}</b><div className="w-note">{t.ago}</div></div><span className={'small ' + (t.battery < 20 ? 'warn' : 'muted')}>{t.battery}%</span></div>)}
            </section>
            <section className="widget"><div className="w-head"><h2>Tech Dashboard</h2><span className="from">via Bridge</span></div>
              {TECHS.map((t, i) => <div className="w-row" key={t.name}><div className="w-grow"><b>{t.name}</b><div className="pbar"><i style={{ width: [92, 86, 78, 95][i] + '%' }} /></div></div><span className="small muted">{[92, 86, 78, 95][i]}%</span></div>)}
            </section>
          </div>
        </>)}

        {view === 'routes' && (<>
          <div className="mod-head"><div><h1>Route Planner</h1><div className="muted">{rel} · stops in the order they were sent to each tablet</div></div></div>
          <section className="widget" style={{ marginBottom: 16 }}>
            <FakeMap techs={DEMO_MAP} focus={focus ?? undefined} height={340} />
            <div className="map-key">{DEMO_MAP.map((m, i) => <button key={m.label} className="link" style={{ color: '#c7c0d8', textDecoration: 'none', fontWeight: focus === i ? 700 : 500 }} onClick={() => setFocus(focus === i ? null : i)}><i style={{ background: m.color }} />{m.label} · {TECHS[i].name} · {m.done}/{m.stops!.length} done</button>)}</div>
          </section>
          <div className="tech-cols">{TECHS.slice(0, 2).map((t, ti) => <section className="widget" key={t.name}><div className="w-head"><h2><span className="t-badge" style={{ background: DEMO_MAP[ti].color }}>{DEMO_MAP[ti].label}</span>{t.name}</h2><span className="from">{t.van}</span><a className="open" href="#" onClick={(e) => { e.preventDefault(); demoOnly(); }}>Open in Maps</a></div>
            {JOBS.map((j, i) => <div className="stop" key={j.c}><span className="n">{i + 1}</span><div className="w-grow"><b>{j.c}</b> <span className="muted small">· {j.w}</span><div className="w-note">{j.a}</div></div></div>)}</section>)}</div>
        </>)}

        {view === 'dps' && (<>
          <div className="mod-head"><div><h1>Daily Paperwork</h1><div className="muted">{rel} · each tech’s daily paperwork form, on their tablet</div></div><button className="btn primary" onClick={() => demoOnly()}>Send to tablets</button></div>
          <section className="widget" style={{ marginBottom: 16 }}><div className="w-head"><h2>Today’s jobs</h2><span className="from">{TECHS[0].name} · {TECHS[0].van} · clocked in {TECHS[0].clock}</span></div>
            <table><thead><tr><th>#</th><th>Customer</th><th>Window</th><th>Job</th><th>Part</th><th>Outcome</th></tr></thead><tbody>
              {DEMO_JOBS.map((j, i) => <tr key={j.c}><td className="muted">{i + 1}</td><td><b>{j.c}</b><div className="small muted">{j.a}</div></td><td className="small">{j.w}</td><td className="small">{j.d}</td><td className="small">{j.part}<div className="muted">{j.st}</div></td><td><span className={'chip ' + (j.out === 'Completed' ? 'ok' : 'warn')}>{j.out}</span></td></tr>)}
            </tbody></table></section>
          <h2>Paperwork forms</h2>
          <div className="muted" style={{ marginBottom: 10 }}>Pick the forms your team fills in. Each one goes to the tablet and comes back filled in and signed.</div>
          <PaperworkDemo tech={TECHS[0].name} van={TECHS[0].van} />
        </>)}

        {view === 'precall' && (<>
          <div className="mod-head"><div><h1>Pre-call</h1><div className="muted">{rel} · texts to customers and how they replied</div></div><button className="btn primary" onClick={() => demoOnly()}>Send texts</button></div>
          <section className="widget">{REPLIES.map((r) => <div className="w-row" key={r.c}><div className="w-grow"><b>{r.c}</b> <span className="muted small">· {r.t}</span><div className="w-note">{r.msg || 'Text sent 6:02 PM'}</div></div><span className={'chip ' + r.k}>{r.tag}</span></div>)}</section>
        </>)}

        {view === 'techdash' && (<>
          <div className="mod-head"><div><h1>Tech Dashboard</h1><div className="muted">Jobs done and completion rate from your work-order system</div></div></div>
          <div className="kpi-row">{TECHS.map((t, i) => <div className="kpi" key={t.name}><div className="kpi-label">{t.name}</div><div className={'kpi-num' + ([92, 86, 78, 95][i] < 80 ? ' warn' : ' ok')}>{[92, 86, 78, 95][i]}%</div><div className="kpi-sub">{[41, 37, 29, 44][i]} work orders this month</div></div>)}</div>
        </>)}

        {view === 'tablet' && (<>
          <div className="mod-head"><div><h1>Tablet app</h1><div className="muted">What a tech sees. Click around: fill in the paperwork, check the route, open a repair guide.</div></div></div>
          <TabletDemo />
        </>)}
        {view === 'store' && <div className="subtabs">{SUBS.map(([k, l]) => <a key={k} href="#" className={'subtab' + (sub === k ? ' on' : '')} onClick={(e) => { e.preventDefault(); setSub(k); }}>{l}</a>)}</div>}
        {view === 'store' && sub === 'overview' && (<>
          <h1 style={{ fontSize: 30 }}>Good morning, Morgan</h1><div className="muted">Example Store · today</div>
          <div className="cards" style={{ marginTop: 20 }}>
            <div className="card kpi"><div className="l">Tablets online</div><div className="n ok">2 <span className="muted small">/ 4</span></div></div>
            <div className="card kpi"><div className="l">Low battery</div><div className="n warn">1</div></div>
            <div className="card kpi"><div className="l">Paperwork today</div><div className="n">1 <span className="muted small">/ 4 submitted</span></div></div>
            <div className="card kpi"><div className="l">Employees</div><div className="n">{PEOPLE.length}</div></div>
          </div>
          <h2>Today&apos;s paperwork</h2>
          <div className="card"><table><thead><tr><th>Tech</th><th>Van</th><th>Clocked in</th><th>Customers</th><th>Status</th></tr></thead><tbody>
            {TECHS.map((t) => <tr key={t.name}><td><a href="#" onClick={(e) => { e.preventDefault(); setSub('sheets'); }}>{t.name}</a></td><td>{t.van}</td><td>{t.clock}</td><td>{t.done} / {t.total} done</td><td>{t.submitted ? <span className="chip ok">Submitted</span> : <span className="chip grey">In progress</span>}</td></tr>)}
          </tbody></table></div>
        </>)}
{view === 'store' && sub === 'employees' && (<>
            <h1>Employees</h1><div className="muted">Add someone's email and they can sign in with a code we email them.</div>
            <h2>Add someone</h2>
            <div className="card"><div className="row"><label className="f">Email<input placeholder="name@example.com" /></label><label className="f">Role<select><option>Tech (tablet)</option><option>Manager</option></select></label><button className="btn primary" onClick={() => demoOnly()}>Add</button></div></div>
            <h2>People</h2>
            <div className="card"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Tech id</th><th></th></tr></thead><tbody>
              {PEOPLE.map((p) => <tr key={p.email}><td>{p.name}</td><td>{p.email}</td><td>{p.role}</td><td>{p.tech}</td><td style={{ textAlign: 'right' }}><button className="btn sm" onClick={() => demoOnly()}>Turn off</button> <button className="btn sm danger" onClick={() => demoOnly()}>Remove</button></td></tr>)}
            </tbody></table></div>
          </>)}

        {((view === 'store' && sub === 'tablets') || view === 'devices') && (<>
            <h1>Tablets</h1><div className="muted" style={{ marginBottom: 14 }}>Where each tablet is right now. Click a tablet to see its path, or open Overwatch to see who went off their route.</div>
            <TabletsDemo demoOnly={demoOnly} />
            <h2>Waiting for approval</h2>
            <div className="cards"><div className="card"><b>Tablet · SM-X230</b> <span className="muted small">asked by new.tech@example.com · 3 min ago</span><div className="small muted" style={{ marginTop: 8 }}>Check this matches the tablet's screen</div><div className="code">482 913</div><div className="row" style={{ marginTop: 10 }}><button className="btn primary" onClick={() => demoOnly()}>Approve</button><button className="btn danger" onClick={() => demoOnly()}>Deny</button></div></div></div>
          </>)}

          {view === 'store' && sub === 'sheets' && (<>
            <h1>Daily paperwork</h1><div className="muted">The paperwork techs filled in on their tablets (job sheets, vehicle checks, customer sign-offs and more), signed off by a manager at the end of the day.</div>
            <h2>Casey Brooks · Van 4 · today</h2>
            <PaperworkDemo />
          </>)}

          {view === 'store' && sub === 'guides' && (<>
            <h1>Repair guides</h1><div className="muted">What techs see under Repair assist on the tablet. Each location can write its own.</div>
            <h2>Your guides</h2>
            <div style={{ display: 'grid', gap: 10 }}>{GUIDES.map(([d, r, n]) => <div className="card" key={String(d) + r}><div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}><div><b>{d}</b> · {r} <span className="muted small">· {n} steps</span></div><div style={{ flex: 'none', display: 'flex', gap: 8 }}><button className="btn sm" onClick={() => demoOnly()}>Edit</button><button className="btn sm danger" onClick={() => demoOnly()}>Delete</button></div></div></div>)}</div>
          </>)}
      </Chrome>
      {panel === 'settings' && <SettingsDrawer onClose={() => setPanel(null)} tabs={[
        { id: 'account', label: 'Account', body: <><h3>Account</h3><dl className="kv"><dt>Name</dt><dd>Morgan Diaz</dd><dt>Email</dt><dd>manager@example.com</dd><dt>Role</dt><dd>manager</dd><dt>Store</dt><dd>Example Store</dd></dl><div className="muted small">You stay signed in on this computer for 30 days after your last visit.</div><div><a className="btn" href="/login">Sign in for real</a></div></> },
        { id: 'about', label: 'About', body: <><h3>About</h3><div className="muted small">Harbor. This is the demo; nothing here is real.</div></> },
      ]} />}
      {panel === 'download' && <DownloadPanel manager={false} demo onClose={() => setPanel(null)} />}
      {panel === 'help' && <HelpDrawer generic onClose={() => setPanel(null)} />}
      {toast && <div className="demo-toast">{toast}</div>}
    </div>
  );
}
