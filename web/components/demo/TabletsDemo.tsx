'use client';
import { Fragment, useState } from 'react';
import { DEMO_MAP, FakeMap, TECH_COLORS, type MapTech } from './FakeMap';

// Demo Tablets section: a large live map, the tablets as tiles (small squares when there are more than 3), and the
// Overwatch tab comparing where each tech went with their route. All made up.

type Tab = { label: string; name: string; van: string; tablet: string; state: 'online' | 'idle' | 'offline'; battery: number; ago: string; mph?: number };
export const DEMO_TABLETS: Tab[] = [
  { label: 'T1', name: 'Alex Rivera', van: 'Van 1', tablet: 'Tablet 01', state: 'online', battery: 82, ago: '1 min ago', mph: 31 },
  { label: 'T2', name: 'Sam Patel', van: 'Van 2', tablet: 'Tablet 02', state: 'online', battery: 64, ago: 'just now' },
  { label: 'T3', name: 'Jordan Lee', van: 'Van 3', tablet: 'Tablet 03', state: 'idle', battery: 17, ago: '18 min ago' },
  { label: 'T4', name: 'Casey Brooks', van: 'Van 4', tablet: 'Tablet 04', state: 'offline', battery: 41, ago: '2 h 10 min ago' },
  { label: 'T5', name: 'Riley Chen', van: 'Van 5', tablet: 'Tablet 05', state: 'online', battery: 90, ago: '2 min ago', mph: 24 },
];
const MAP: MapTech[] = [...DEMO_MAP, { label: 'T5', color: TECH_COLORS[4], van: [560, 300], stops: [[530, 280], [560, 300], [620, 205], [620, 130]], done: 1, state: 'online' }];

type Flag = { sev: 'high' | 'med' | 'low'; kind: string; text: string; at: string };
type Visit = { n: number; c: string; repair: string; arrived: string | null; onsite: string | null; expected: string; over?: boolean };
type Row = { label: string; flags: Flag[]; reached: string; drive: string; visits: Visit[]; note?: string };
export const OVERWATCH: Row[] = [
  { label: 'T1', reached: '4 / 6', drive: '1 h 05 min · 28.4 mi', flags: [
    { sev: 'high', kind: 'Long repair', text: '1 h 20 min at Marcus Bell (Dishwasher · not draining); expected about 30 min', at: '9:12 AM' },
    { sev: 'med', kind: 'Stop off route', text: 'Stopped 34 min away from any customer, 11:05–11:39 AM', at: '11:05 AM' }],
    visits: [
      { n: 1, c: 'Dana Whitfield', repair: 'Phone · front screen', arrived: '8:04 AM', onsite: '42 min', expected: '30 min', over: true },
      { n: 2, c: 'Marcus Bell', repair: 'Dishwasher · not draining', arrived: '9:12 AM', onsite: '1 h 20 min', expected: '30 min', over: true },
      { n: 3, c: 'Priya Raman', repair: 'HVAC · tune-up + filter', arrived: '11:52 AM', onsite: '38 min', expected: '45 min' },
      { n: 4, c: 'Lena Fischer', repair: 'Router install', arrived: '1:20 PM', onsite: '25 min', expected: '30 min' },
      { n: 5, c: 'Omar Haddad', repair: 'Phone · charging port', arrived: null, onsite: null, expected: '30 min' },
      { n: 6, c: 'Rosa Alvarez', repair: 'Phone · battery', arrived: null, onsite: null, expected: '30 min' }] },
  { label: 'T2', reached: '3 / 5', drive: '52 min · 19.1 mi', flags: [], visits: [
    { n: 1, c: 'Grace Kim', repair: 'Phone · back glass', arrived: '8:10 AM', onsite: '28 min', expected: '30 min' },
    { n: 2, c: 'Tom Becker', repair: 'Washer · door seal', arrived: '9:30 AM', onsite: '35 min', expected: '30 min' },
    { n: 3, c: 'Ana Souza', repair: 'Router install', arrived: '11:15 AM', onsite: '22 min', expected: '30 min' }] },
  { label: 'T3', reached: '2 / 6', drive: '48 min · 16.7 mi', flags: [
    { sev: 'high', kind: 'Missed stop', text: 'Never stopped at Hannah Price (window ended 10:00 AM)', at: '10:00 AM' },
    { sev: 'med', kind: 'Late arrival', text: 'Got to Victor Ruiz at 12:41 PM, 41 min after the window ended', at: '12:41 PM' },
    { sev: 'low', kind: 'Out of order', text: 'Went to Victor Ruiz (stop 3) before Hannah Price (stop 2), out of route order', at: '12:41 PM' }],
    visits: [
      { n: 1, c: 'Ben Ortiz', repair: 'Phone · front screen', arrived: '8:20 AM', onsite: '31 min', expected: '30 min' },
      { n: 2, c: 'Hannah Price', repair: 'HVAC · no cooling', arrived: null, onsite: null, expected: '30 min' },
      { n: 3, c: 'Victor Ruiz', repair: 'Phone · charging port', arrived: '12:41 PM', onsite: '26 min', expected: '30 min' }] },
  { label: 'T4', reached: '6 / 6', drive: '1 h 12 min · 33.0 mi', flags: [
    { sev: 'low', kind: 'GPS gap', text: 'No location for 14 min (2:02–2:16 PM) while moving', at: '2:02 PM' }], visits: [] , note: 'Finished the route; tablet went offline after signing the day’s paperwork.' },
  { label: 'T5', reached: '1 / 4', drive: '18 min · 6.2 mi', flags: [], visits: [
    { n: 1, c: 'Ivy Morgan', repair: 'Phone · battery', arrived: '9:02 AM', onsite: '24 min', expected: '30 min' }] },
];
export const OVERWATCH_OFF = OVERWATCH.filter((r) => r.flags.some((f) => f.sev !== 'low'));

const SEV: Record<string, string> = { high: 'bad', med: 'warn', low: 'grey' };
const st = (s: string) => (s === 'online' ? 'ok' : s === 'idle' ? 'warn' : 'bad');

export function TabletsDemo({ demoOnly }: { demoOnly: (t?: string) => void }) {
  const [tab, setTab] = useState<'map' | 'ow'>('map');
  const [sel, setSel] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>('T1');
  const small = DEMO_TABLETS.length > 3;
  const off = OVERWATCH_OFF.length;
  const byLabel = (l: string) => DEMO_TABLETS.find((t) => t.label === l)!;
  return (<>
    <section className="tm-wrap">
      <div className="tm-head">
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={tab === 'map'} className={'seg-b' + (tab === 'map' ? ' on' : '')} onClick={() => setTab('map')}>Live map</button>
          <button role="tab" aria-selected={tab === 'ow'} className={'seg-b' + (tab === 'ow' ? ' on' : '')} onClick={() => setTab('ow')}>Overwatch{off ? <span className="ow-ping">{off}</span> : null}</button>
        </div>
        {tab === 'map' && <span className="muted small">3 of 5 online · updates every 20 s{sel != null ? ` · showing ${MAP[sel].label}'s path` : ''}</span>}
        {tab === 'map' && <span className="tm-tools"><button className="btn sm" onClick={() => setSel(null)}>Show all</button></span>}
      </div>
      {tab === 'map' && <div style={{ padding: 10 }}><FakeMap techs={MAP} showRoutes={sel != null} focus={sel ?? undefined} height={420} /></div>}
      {tab === 'ow' && <div className="ow">
        <div className="ow-bar"><span className="muted small">Where each tablet went compared with that tech&apos;s route for the day. Click a tech for details.</span>
          <input type="date" aria-label="Overwatch date" defaultValue="2026-11-14" onChange={() => demoOnly('In the real site this shows the report for any past day.')} /></div>
        <table className="ow-table"><thead><tr><th>Tech</th><th>Date</th><th>Deviations</th><th>Customers reached</th><th>Drive</th><th /></tr></thead><tbody>
          {OVERWATCH.map((r) => { const t = byLabel(r.label); const hi = r.flags.filter((f) => f.sev === 'high').length, md = r.flags.filter((f) => f.sev === 'med').length, lo = r.flags.length - hi - md; const isOpen = open === r.label; return (<Fragment key={r.label}>
            <tr className={'ow-row' + (isOpen ? ' open' : '')} onClick={() => setOpen(isOpen ? null : r.label)}>
              <td><b><span className="t-badge" style={{ background: MAP.find((m) => m.label === r.label)!.color }}>{r.label}</span>{t.name}</b><div className="small muted">{t.van}</div></td>
              <td className="small">Sat, Nov 14</td>
              <td>{!r.flags.length ? <span className="chip ok">on route</span> : <span className="ow-chips">{hi > 0 && <span className="chip bad">{hi} major</span>}{md > 0 && <span className="chip warn">{md} to check</span>}{lo > 0 && <span className="chip grey">{lo} minor</span>}</span>}
                {r.flags[0] && <div className="small muted ow-first">{r.flags[0].text}</div>}</td>
              <td className="small">{r.reached}</td><td className="small">{r.drive}</td><td className="small" style={{ textAlign: 'right' }}>{isOpen ? '▾' : '▸'}</td>
            </tr>
            {isOpen && <tr className="ow-detail"><td colSpan={6}><div className="ow-detail-grid">
              <div><h3>Deviations</h3>
                {r.flags.length ? r.flags.map((f, i) => <div className="w-row" key={i}><span className={'chip ' + SEV[f.sev]}>{f.kind}</span><div className="w-grow small">{f.text}</div><span className="small muted">{f.at}</span></div>) : <div className="w-empty">Nothing off route.</div>}
                {r.note && <div className="small muted" style={{ marginTop: 8 }}>{r.note}</div>}
                <button className="btn sm" style={{ marginTop: 10 }} onClick={() => { setSel(MAP.findIndex((m) => m.label === r.label)); setTab('map'); }}>Show this day on the map</button>
              </div>
              <div><h3>Time at each customer</h3>
                {r.visits.length ? <table className="ow-visits"><thead><tr><th>#</th><th>Customer</th><th>Job</th><th>Arrived</th><th>On site</th></tr></thead><tbody>
                  {r.visits.map((v) => <tr key={v.n}><td className="muted">{v.n}</td><td>{v.c}</td><td className="small">{v.repair}</td><td className="small">{v.arrived || <span className="muted">not visited</span>}</td>
                    <td className="small">{v.onsite ? <span className={v.over ? 'ow-over' : ''}>{v.onsite}</span> : '—'}<div className="muted">expected ~{v.expected}</div></td></tr>)}
                </tbody></table> : <div className="w-empty">All 6 customers visited within their expected time.</div>}
              </div>
            </div></td></tr>}
          </Fragment>); })}
        </tbody></table>
      </div>}
    </section>

    <div className={'tm-grid' + (small ? ' small' : '')}>
      {DEMO_TABLETS.map((t, i) => { const c = MAP[i].color; return (
        <div key={t.label} className={'tm-card' + (sel === i ? ' sel' : '')} style={{ ['--c' as any]: c }} role="button" tabIndex={0} onClick={() => { setSel(sel === i ? null : i); setTab('map'); }}>
          <div className="tm-card-top"><span className="tm-badge">{t.label}</span><span className={'dot ' + st(t.state)} /></div>
          <b className="tm-name">{t.name}</b>
          <div className="small muted">{t.van} · {t.tablet}</div>
          <div className="tm-stats small"><span className={t.battery < 20 ? 'warn' : ''}>{t.battery}%</span><span>{t.state === 'online' && t.mph ? `${t.mph} mph` : t.ago}</span></div>
          <button className="btn sm tm-edit" onClick={(e) => { e.stopPropagation(); demoOnly('In the real site this edits the tablet: tech, tech id and van.'); }}>Edit</button>
        </div>); })}
    </div>
  </>);
}
