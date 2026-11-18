'use client';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type * as Leaflet from 'leaflet';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { ago, stateOf } from '@/lib/format';
import { DeviceRow } from './Devices';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { OwTech } from '@/lib/overwatch';

// Live tablet map for the Tablets section: every approved tablet's last position (refreshed every 20 seconds)
// plus the selected tablet's path. Below it the tablets as cards; more than 3 become small square tiles.

export type MapDevice = { id: string; name: string; model: string | null; status: string; tech_id: string | null; tech_name: string | null; van: string | null; app_version: string | null; battery: number | null; last_seen_at: string | null; last_lat: number | null; last_lon: number | null; last_accuracy: number | null; last_speed: number | null };

const COLORS = ['#8b5cf6', '#22c55e', '#f59e0b', '#38bdf8', '#f472b6', '#ef4444', '#14b8a6', '#eab308', '#a3e635', '#fb923c'];
const SELECT = 'id,name,model,status,tech_id,tech_name,van,app_version,battery,last_seen_at,last_lat,last_lon,last_accuracy,last_speed';
const TRAIL = [[60, '1 hour'], [180, '3 hours'], [480, 'Today (8 h)']] as const;
const initials = (s: string) => s.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
const mph = (ms: number | null) => (ms == null ? null : Math.round(ms * 2.23694));

export type OwProps = { techs: OwTech[]; day: string; today: string; range: [number, number]; tz: string };

export function TabletMap({ initial, overwatch }: { initial: MapDevice[]; overwatch?: OwProps }) {
  const [tab, setTab] = useState<'map' | 'ow'>(() => (typeof window !== 'undefined' && location.hash === '#overwatch' ? 'ow' : 'map'));
  const [owPath, setOwPath] = useState<OwTech | null>(null); // a past day's path from Overwatch
  const sb = useMemo(() => supabaseBrowser(), []);
  const [list, setList] = useState(initial);
  const [sel, setSel] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [trailMin, setTrailMin] = useState<number>(180);
  const [, tick] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const marks = useRef(new Map<string, Leaflet.Marker>());
  const trail = useRef<Leaflet.LayerGroup | null>(null);
  const fitted = useRef(false);

  const color = useCallback((id: string) => COLORS[Math.max(0, initial.findIndex((d) => d.id === id)) % COLORS.length], [initial]);
  const label = (d: MapDevice) => d.tech_name || d.name;
  const placed = list.filter((d) => d.last_lat != null && d.last_lon != null);

  // refresh positions
  useEffect(() => {
    const load = async () => { const { data } = await sb.from('devices').select(SELECT).eq('status', 'active').order('name'); if (data) setList(data as MapDevice[]); tick((n) => n + 1); };
    const t = setInterval(() => { if (!document.hidden) load(); }, 20000);
    return () => clearInterval(t);
  }, [sb]);

  // create the map once
  useEffect(() => {
    let dead = false;
    import('leaflet').then((mod) => {
      if (dead || !box.current || map.current) return;
      const Lf = (mod as any).default || mod; L.current = Lf;
      const m = Lf.map(box.current, { zoomControl: true, attributionControl: true }).setView([39.5, -98.35], 4);
      // Esri's free dark-gray tiles (CARTO now needs an API key); the street names sit on a second layer
      const esri = (p: string, o: object = {}) => Lf.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/${p}/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, maxNativeZoom: 16, attribution: 'Tiles &copy; Esri', ...o });
      esri('Canvas/World_Dark_Gray_Base').addTo(m);
      esri('Canvas/World_Dark_Gray_Reference', { pane: 'overlayPane' }).addTo(m);
      trail.current = Lf.layerGroup().addTo(m);
      map.current = m; tick((n) => n + 1);
    });
    return () => { dead = true; map.current?.remove(); map.current = null; marks.current.clear(); };
  }, []);

  // draw markers
  useEffect(() => {
    const Lf = L.current, m = map.current; if (!Lf || !m) return;
    const seen = new Set<string>();
    placed.forEach((d) => {
      seen.add(d.id);
      const st = stateOf(d).key, c = color(d.id);
      const icon = Lf.divIcon({ className: '', iconSize: [34, 34], iconAnchor: [17, 17], html: `<div class="tm-pin ${st}${sel === d.id ? ' sel' : ''}" style="--c:${c}">${initials(label(d))}</div>` });
      const tip = `${label(d)}${d.van ? ' · ' + d.van : ''} · ${stateOf(d).label}${mph(d.last_speed) ? ' · ' + mph(d.last_speed) + ' mph' : ''}`;
      let mk = marks.current.get(d.id);
      if (!mk) { mk = Lf.marker([d.last_lat!, d.last_lon!], { icon }).addTo(m); mk.on('click', () => setSel((s) => (s === d.id ? null : d.id))); mk.bindTooltip(tip, { direction: 'bottom', offset: [0, 14] }); marks.current.set(d.id, mk); }
      else { mk.setLatLng([d.last_lat!, d.last_lon!]); mk.setIcon(icon); mk.setTooltipContent(tip); }
    });
    for (const [id, mk] of marks.current) if (!seen.has(id)) { mk.remove(); marks.current.delete(id); }
    if (!fitted.current && placed.length) {
      fitted.current = true;
      if (placed.length === 1) m.setView([placed[0].last_lat!, placed[0].last_lon!], 13);
      else m.fitBounds(placed.map((d) => [d.last_lat!, d.last_lon!] as [number, number]), { padding: [50, 50], maxZoom: 13 });
    }
  });

  // selected tablet: its path
  useEffect(() => {
    const Lf = L.current, m = map.current, g = trail.current; if (!Lf || !m || !g) return;
    g.clearLayers();
    if (!sel) return;
    const d = list.find((x) => x.id === sel);
    if (d?.last_lat != null) m.panTo([d.last_lat, d.last_lon!]);
    let dead = false;
    const ow = owPath && owPath.deviceId === sel && overwatch ? overwatch : null;
    if (ow && owPath) owPath.jobs.forEach((j) => { if (j.geo) Lf.circleMarker([j.geo.lat, j.geo.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#0b0a10', fillOpacity: 1 }).bindTooltip(`Stop ${j.position + 1}: ${j.name}`, { permanent: true, direction: 'right', className: 'tm-jobtip' }).addTo(g); });
    let q = sb.from('locations').select('at,lat,lon').eq('device_id', sel);
    q = ow ? q.gte('at', new Date(ow.range[0]).toISOString()).lt('at', new Date(ow.range[1]).toISOString()) : q.gte('at', new Date(Date.now() - trailMin * 60e3).toISOString());
    q.order('at').limit(10000).then(({ data }) => {
      if (dead || !data?.length) return;
      const pts = data.map((p) => [p.lat, p.lon] as [number, number]);
      Lf.polyline(pts, { color: color(sel), weight: 4, opacity: 0.7 }).addTo(g);
      Lf.circleMarker(pts[0], { radius: 5, color: '#fff', weight: 2, fillColor: color(sel), fillOpacity: 1 }).bindTooltip('Start ' + new Date(data[0].at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })).addTo(g);
      if (ow) m.fitBounds(Lf.latLngBounds(pts).pad(0.1));
    });
    return () => { dead = true; };
  }, [sel, trailMin, list, sb, color, owPath, overwatch]);

  useEffect(() => { if (tab === 'map') setTimeout(() => map.current?.invalidateSize(), 50); }, [tab]);
  const showOnMap = (t: OwTech) => { setOwPath(t); setSel(t.deviceId); setTab('map'); };
  const small = list.length > 3;
  const owBad = overwatch ? overwatch.techs.filter((t) => t.flags.some((f) => f.sev !== 'low')).length : 0;
  const online = list.filter((d) => stateOf(d).key === 'online').length;
  const edit = list.find((d) => d.id === editing);
  return (<>
    <section className="tm-wrap">
      <div className="tm-head">
        <div className="seg" role="tablist"><button role="tab" aria-selected={tab === 'map'} className={'seg-b' + (tab === 'map' ? ' on' : '')} onClick={() => setTab('map')}>Live map</button>
          {overwatch && <button role="tab" aria-selected={tab === 'ow'} className={'seg-b' + (tab === 'ow' ? ' on' : '')} onClick={() => setTab('ow')}>Overwatch{owBad ? <span className="ow-ping" title={`${owBad} off route`}>{owBad}</span> : null}</button>}</div>
        {tab === 'map' && <span className="muted small">{online} of {list.length} online · {placed.length} with a location · updates every 20 s{owPath && sel === owPath.deviceId ? ` · showing ${owPath.tech}'s path on ${owPath.date}` : ''}</span>}
        {tab === 'map' && <span className="tm-tools">
          {owPath && sel === owPath.deviceId && <button className="btn sm" onClick={() => setOwPath(null)}>Back to live</button>}
          {sel && !(owPath && sel === owPath.deviceId) && <select aria-label="Path length" value={trailMin} onChange={(e) => setTrailMin(Number(e.target.value))}>{TRAIL.map(([v, t]) => <option key={v} value={v}>Path: {t}</option>)}</select>}
          <button className="btn sm" onClick={() => { const m = map.current; if (m && placed.length) m.fitBounds(placed.map((d) => [d.last_lat!, d.last_lon!] as [number, number]), { padding: [50, 50], maxZoom: 13 }); setSel(null); setOwPath(null); }}>Show all</button>
        </span>}
      </div>
      <div className="tm-map" ref={box} style={tab === 'map' ? undefined : { display: 'none' }} />
      {tab === 'ow' && overwatch && <OverwatchReport ow={overwatch} onMap={showOnMap} />}
      {tab === 'map' && !placed.length && <div className="tm-empty">No tablet has sent a location yet. Locations appear once a paired tablet is on and has location permission.</div>}
    </section>

    {list.length ? <div className={'tm-grid' + (small ? ' small' : '')}>
      {list.map((d) => { const st = stateOf(d); const c = color(d.id); return (
        <div key={d.id} className={'tm-card' + (sel === d.id ? ' sel' : '')} style={{ ['--c' as any]: c }} onClick={() => setSel(sel === d.id ? null : d.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setSel(sel === d.id ? null : d.id); }}>
          <div className="tm-card-top"><span className="tm-badge">{initials(label(d))}</span><span className={'dot ' + (st.key === 'online' ? 'ok' : st.key === 'idle' ? 'warn' : 'bad')} title={st.label} /></div>
          <b className="tm-name">{label(d)}</b>
          <div className="small muted">{[d.van, d.name !== label(d) ? d.name : null].filter(Boolean).join(' · ') || d.model}</div>
          <div className="tm-stats small">
            <span>{d.battery != null ? <span className={d.battery < 20 ? 'warn' : ''}>{d.battery}%</span> : '—'}</span>
            <span>{st.key === 'online' && mph(d.last_speed) ? `${mph(d.last_speed)} mph` : ago(d.last_seen_at)}</span>
          </div>
          {!small && <div className="small muted">{st.label}{d.app_version ? ' · app ' + d.app_version : ''}{d.last_lat == null ? ' · no location yet' : ''}</div>}
          <button className="btn sm tm-edit" onClick={(e) => { e.stopPropagation(); setEditing(editing === d.id ? null : d.id); }}>{editing === d.id ? 'Close' : 'Edit'}</button>
        </div>); })}
    </div> : <div className="card muted">No approved tablets yet.</div>}

    {edit && <div className="card tm-editor">
      <div className="row" style={{ alignItems: 'center' }}><b style={{ flex: 'none' }}>{edit.name}</b><span className="muted small">{edit.model} · app {edit.app_version || '—'} · {stateOf(edit).label} · seen {ago(edit.last_seen_at)}</span></div>
      <div className="row" style={{ alignItems: 'flex-start', marginTop: 10 }}><DeviceRow d={edit} mode="edit" /><span style={{ flex: 'none' }}><DeviceRow d={edit} mode="actions" /></span></div>
    </div>}
  </>);
}

const SEV: Record<string, string> = { high: 'bad', med: 'warn', low: 'grey' };
const KIND: Record<string, string> = { over: 'Long repair', late: 'Late arrival', longstop: 'Stop off route', missed: 'Missed stop', gap: 'GPS gap', order: 'Out of order' };

/** Overwatch: each tech, the date, and where they went off their route. */
function OverwatchReport({ ow, onMap }: { ow: OwProps; onMap: (t: OwTech) => void }) {
  const router = useRouter(), path = usePathname(), params = useSearchParams();
  const [open, setOpen] = useState<string | null>(null);
  const tm = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ow.tz });
  const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);
  const go = (d: string) => { const q = new URLSearchParams(params.toString()); q.set('ow', d); router.push(`${path}?${q.toString()}#overwatch`); };
  const dateText = new Date(ow.day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  return (<div className="ow">
    <div className="ow-bar"><span className="muted small">Where each tablet went compared with that tech&apos;s RT Daily Sheet route. Click a tech for details.</span>
      <input type="date" aria-label="Overwatch date" value={ow.day} max={ow.today} onChange={(e) => e.target.value && go(e.target.value)} /></div>
    {!ow.techs.length && <div className="w-empty">No approved tablets are linked to a tech yet. Set the tech on each tablet (Edit) so Overwatch can match it to their sheet.</div>}
    <table className="ow-table"><thead><tr><th>Tech</th><th>Date</th><th>Deviations</th><th>Customers reached</th><th>Drive</th><th /></tr></thead><tbody>
      {ow.techs.map((t) => { const hi = t.flags.filter((f) => f.sev === 'high').length, md = t.flags.filter((f) => f.sev === 'med').length, lo = t.flags.length - hi - md; const isOpen = open === t.deviceId; return (<Fragment key={t.deviceId}>
        <tr className={'ow-row' + (isOpen ? ' open' : '')} onClick={() => setOpen(isOpen ? null : t.deviceId)}>
          <td><b>{t.tech}</b>{t.van && <div className="small muted">{t.van}</div>}</td>
          <td className="small">{dateText}</td>
          <td>{t.noGps ? <span className="chip grey">no tablet location</span> : t.noRoute ? <span className="chip grey">no sheet this day</span> : !t.flags.length ? <span className="chip ok">on route</span>
            : <span className="ow-chips">{hi > 0 && <span className="chip bad">{hi} major</span>}{md > 0 && <span className="chip warn">{md} to check</span>}{lo > 0 && <span className="chip grey">{lo} minor</span>}</span>}
            {t.flags[0] && <div className="small muted ow-first">{t.flags[0].text}</div>}</td>
          <td className="small">{t.noRoute ? '—' : `${t.totals.jobsVisited} / ${t.totals.jobsTotal}`}</td>
          <td className="small">{t.noGps ? '—' : `${mins(t.totals.driveMin)} · ${t.totals.driveMiles.toFixed(1)} mi`}</td>
          <td className="small" style={{ textAlign: 'right' }}>{isOpen ? '▾' : '▸'}</td>
        </tr>
        {isOpen && <tr key={t.deviceId + '-d'} className="ow-detail"><td colSpan={6}>
          <div className="ow-detail-grid">
            <div><h3>Deviations</h3>
              {t.flags.length ? t.flags.map((f, i) => <div className="w-row" key={i}><span className={'chip ' + SEV[f.sev]}>{KIND[f.type]}</span><div className="w-grow small">{f.text}</div>{f.at && <span className="small muted">{tm(f.at)}</span>}</div>)
                : <div className="w-empty">{t.noGps ? 'The tablet sent no locations this day.' : t.noRoute ? 'No RT Daily Sheet was sent to this tech for this day, so there is no route to compare with.' : 'Nothing off route.'}</div>}
              <div className="small muted" style={{ marginTop: 8 }}>{t.points} location points · {mins(t.totals.jobMin)} at customers · {mins(t.totals.otherMin)} stopped elsewhere</div>
              {!t.noGps && <button className="btn sm" style={{ marginTop: 10 }} onClick={() => onMap(t)}>Show this day on the map</button>}
            </div>
            <div><h3>Time at each customer</h3>
              <table className="ow-visits"><thead><tr><th>#</th><th>Customer</th><th>Repair</th><th>Arrived</th><th>On site</th></tr></thead><tbody>
                {t.jobs.map((j) => { const v = t.visits.find((x) => x.jobId === j.id); const over = v && v.minutes > v.limit; return (
                  <tr key={j.id}><td className="muted">{j.position + 1}</td><td>{j.name}{j.canceled && <span className="chip grey" style={{ marginLeft: 6 }}>canceled</span>}{!j.geo && <div className="small muted">address not found</div>}</td>
                    <td className="small">{j.types.join(' + ') || '—'}{j.device && <div className="muted">{j.device}</div>}</td>
                    <td className="small">{v ? tm(v.arrive) : <span className="muted">not visited</span>}</td>
                    <td className="small">{v ? <span className={over ? 'ow-over' : ''}>{mins(v.minutes)}{v.ongoing ? ' (still there)' : ''}</span> : '—'}{v && <div className="muted">expected ~{v.limit} min</div>}</td></tr>); })}
                {!t.jobs.length && <tr><td colSpan={5} className="muted">No customers on a sheet this day.</td></tr>}
              </tbody></table>
            </div>
          </div>
        </td></tr>}
      </Fragment>); })}
    </tbody></table>
  </div>);
}
