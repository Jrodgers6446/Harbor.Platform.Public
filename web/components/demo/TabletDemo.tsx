'use client';
import { useEffect, useState } from 'react';
import { FakeMap, TECH_COLORS } from './FakeMap';

// Clickable mock-up of the Harbor tablet app with made-up data: a rail on the left with Paperwork, Route, Assist
// and Settings. The Phone switch shows the phone layout (bottom navigation, one screen at a time).

type Cust = { name: string; device: string; window: string; addr: string; part: string; status: 'used' | 'returned' | null; outcome: 'completed' | 'rescheduled' | 'unrepaired' | null; reason?: string };
const START: Cust[] = [
  { name: 'Dana Whitfield', device: 'Phone · Cracked screen', window: '8 – 10 AM', addr: '120 Oak St', part: 'P-48120', status: 'used', outcome: 'completed' },
  { name: 'Marcus Bell', device: 'Dishwasher · Not draining', window: '9 – 11 AM', addr: '48 Mill Rd', part: 'P-51207', status: 'used', outcome: 'completed' },
  { name: 'Priya Raman', device: 'HVAC · Annual tune-up', window: '11 AM – 1 PM', addr: '9 Lake Ave', part: '', status: null, outcome: null },
  { name: 'Lena Fischer', device: 'Internet · Router install', window: '1 – 3 PM', addr: '702 Pine Ct', part: '', status: null, outcome: null },
  { name: 'Omar Haddad', device: 'Phone · Charging port', window: '3 – 5 PM', addr: '15 Birch Ln', part: '', status: null, outcome: null },
];
const STEPS = ['Isolate power and check the unit is safe to open.', 'Swap the air filter and note its size on the paperwork.', 'Clean the coils and clear the condensate drain.', 'Check refrigerant pressures and the thermostat reading.', 'Run a full cycle, then show the customer and get their sign-off.'];

const Rail = ({ on, set }: { on: string; set: (t: string) => void }) => (
  <div className="tab-rail">
    <div className="tab-logo">⚓</div>
    {[['paper', '▤', 'Paperwork'], ['route', '➜', 'Route'], ['assist', '🔧', 'Assist']].map(([id, ic, l]) => (
      <button key={id} className={'tab-railbtn' + (on === id ? ' on' : '')} onClick={() => set(id)}><span>{ic}</span>{l}</button>))}
    <div style={{ flex: 1 }} />
    <button className={'tab-railbtn' + (on === 'settings' ? ' on' : '')} onClick={() => set('settings')}><span>⚙</span>Settings</button>
  </div>
);

export function TabletDemo() {
  const [tab, setTab] = useState('paper');
  const [phone, setPhone] = useState(false);
  const [pane, setPane] = useState<'list' | 'form'>('list');   // phone: one pane at a time
  const [nav, setNav] = useState<'Google Maps' | 'Waze'>('Google Maps');
  const [note, setNote] = useState('');
  const say = (t: string) => { setNote(t); setTimeout(() => setNote(''), 3500); };
  useEffect(() => { if (window.innerWidth < 640) setPhone(true); }, []);
  const [list, setList] = useState(START);
  const [sel, setSel] = useState(2);
  const c = list[sel];
  const edit = (patch: Partial<Cust>) => setList(list.map((x, i) => (i === sel ? { ...x, ...patch } : x)));
  const done = list.filter((x) => x.outcome).length;
  const next = () => { if (!c.outcome) edit({ outcome: 'completed' }); const n = list.findIndex((x, i) => i > sel && !x.outcome); if (n >= 0) setSel(n); };

  const showList = !phone || pane === 'list', showForm = !phone || pane === 'form';
  return (<>
    <div className="seg dev-switch" role="tablist" aria-label="Screen size">
      {(['Tablet', 'Phone'] as const).map((d) => <button key={d} role="tab" aria-selected={phone === (d === 'Phone')} className={'seg-b' + (phone === (d === 'Phone') ? ' on' : '')} onClick={() => { setPhone(d === 'Phone'); setPane('list'); }}>{d}</button>)}
    </div>
    <div className={'tablet-frame' + (phone ? ' phone' : '')} aria-label="Tablet app demo">
      <div className="tablet-screen">
        <Rail on={tab} set={setTab} />
        <div className="tab-main">
          <div className="tab-top">{phone && tab === 'paper' && pane === 'form' && <button className="btn sm" onClick={() => setPane('list')}>‹ Back</button>}<b>{tab === 'paper' ? 'Daily Forms' : tab === 'route' ? 'Route' : tab === 'assist' ? 'Repair assist' : 'Settings'}</b>
            <span className="chip ok">T1 · Van 1</span><span className="muted small" style={{ marginLeft: 'auto' }}>{done} of {list.length} done</span></div>
          {note && <div className="msg ok small">{note}</div>}

          {tab === 'paper' && (
            <div className="tab-split">
              {showList && <div className="tab-list">{list.map((x, i) => (
                <button key={x.name} className={'tab-cust' + (i === sel ? ' on' : '')} onClick={() => { setSel(i); setPane('form'); }}>
                  <span className={'dot ' + (x.outcome === 'completed' ? 'ok' : x.outcome ? 'warn' : '')} />
                  <span className="w-grow"><b>{x.name}</b><span className="small muted" style={{ display: 'block' }}>{x.window}</span></span>
                </button>))}</div>}
              {showForm && <div className="tab-form">
                <div><b style={{ fontSize: 16 }}>{c.name}</b><div className="small muted">{c.device} · {c.window} · {c.addr}</div></div>
                <label className="f">Part SKU<input value={c.part} placeholder="e.g. P-48120" onChange={(e) => edit({ part: e.target.value })} /></label>
                <div className="f">Part status<div className="seg2">{(['used', 'returned'] as const).map((s) => <button key={s} className={'btn sm' + (c.status === s ? ' primary' : '')} onClick={() => edit({ status: s })}>{s === 'used' ? 'Installed' : 'Returned'}</button>)}</div></div>
                <div className="f">Outcome<div className="seg2">{(['completed', 'rescheduled', 'unrepaired'] as const).map((o) => <button key={o} className={'btn sm' + (c.outcome === o ? ' primary' : '')} onClick={() => edit({ outcome: o })}>{o[0].toUpperCase() + o.slice(1)}</button>)}</div></div>
                {c.outcome && c.outcome !== 'completed' && <label className="f">Reason<input value={c.reason || ''} placeholder="Customer not home, rebooked" onChange={(e) => edit({ reason: e.target.value })} /></label>}
                <button className="btn primary" onClick={next}>Done · next customer</button>
              </div>}
            </div>
          )}

          {tab === 'route' && (
            <div className="tab-split">
              <div style={{ flex: 1.4, minWidth: 0 }}><FakeMap height={250} techs={[{ label: 'T1', color: TECH_COLORS[0], van: [452, 150], stops: [[350, 130], [452, 150], [530, 60], [530, 205], [450, 280]], done, state: 'online' }]} /></div>
              <div className="tab-list" style={{ flex: 1 }}>
                <button className="btn primary" onClick={() => say(nav === 'Waze' ? 'Opens Waze to the next stop (Waze takes one stop at a time).' : `Opens all ${list.filter((x) => !x.outcome).length} remaining stops in Google Maps, in order.`)}>Open whole route in {nav}</button>
                <div className="small muted" style={{ padding: '6px 4px 8px' }}>Next stop</div>
                {list.map((x, i) => (<div key={x.name} className="stop"><span className="n" style={x.outcome ? { background: TECH_COLORS[0], color: '#09080c' } : undefined}>{i + 1}</span><div className="w-grow"><b>{x.name}</b><div className="w-note">{x.window} · {x.addr}</div></div></div>))}
              </div>
            </div>
          )}

          {tab === 'assist' && (
            <div className="tab-form" style={{ maxWidth: 520 }}>
              <div><b>HVAC · Annual tune-up</b> <span className="small muted">· guide for {list[2].name}</span></div>
              <ol className="steps">{STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
              <div className="small muted">Each location writes its own guides on the website (your location → Repair guides).</div>
            </div>
          )}

          {tab === 'settings' && (
            <div className="tab-form" style={{ maxWidth: 420 }}>
              <div className="small">Signed in as <b>t1@example.com</b></div>
              <div className="small muted">Location sharing: on · last sent 1 min ago · battery 82%</div>
              <div className="small muted">Paired to Example Store by QR code</div>
              <div className="f">Navigation app<div className="seg2">{(['Google Maps', 'Waze'] as const).map((n) => <button key={n} className={'btn sm' + (nav === n ? ' primary' : '')} onClick={() => setNav(n)}>{n}</button>)}</div></div>
              <button className="btn">Sign out</button>
            </div>
          )}
        </div>
      </div>
    </div>
  </>);
}
