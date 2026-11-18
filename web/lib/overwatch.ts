// OVERWATCH: compares where each tablet actually went with the tech's route for the day (the Daily Forms sent to
// their tablet). Stop detection and the deviation rules are the Harbor extension's (modules/routes/tracking.js
// analyzeDay), so the website and the extension's live map flag the same things.
import type { SupabaseClient } from '@supabase/supabase-js';

type Pt = { lat: number; lon: number; t: number };
export type OwJob = { id: string; name: string; address: string | null; ws: number | null; we: number | null; types: string[]; device: string | null; done: boolean; canceled: boolean; geo: { lat: number; lon: number } | null; position: number };
export type OwFlag = { type: 'over' | 'late' | 'longstop' | 'missed' | 'gap' | 'order'; sev: 'high' | 'med' | 'low'; text: string; at?: number; minutes?: number; jobId?: string };
export type OwVisit = { jobId: string; name: string; types: string[]; device: string | null; arrive: number; leave: number; minutes: number; limit: number; ongoing: boolean };
export type OwStop = { kind: 'job' | 'other'; jobId: string | null; name: string | null; start: number; end: number; minutes: number; lat: number; lon: number };
export type OwTech = { deviceId: string; tech: string; van: string | null; date: string; points: number; jobs: OwJob[]; visits: OwVisit[]; stops: OwStop[]; flags: OwFlag[];
  totals: { driveMin: number; driveMiles: number; jobMin: number; otherMin: number; jobsVisited: number; jobsTotal: number }; noRoute: boolean; noGps: boolean };
export type OwOptions = { stopMin: number; radiusM: number; overMin: number; extraMin: number; otherStopMin: number; gapMin: number };
export const OW_DEFAULTS: OwOptions = { stopMin: 3, radiusM: 400, overMin: 30, extraMin: 15, otherStopMin: 20, gapMin: 10 };

// ---- repair type from the daily forms' text
const TYPE_ORDER = ['Front screen', 'Inner screen', 'Back glass', 'Battery', 'Charging / power', 'Frame / housing', 'Camera', 'Audio', 'Liquid damage', 'Software', 'Cleaning', 'Other'];
export function issueLabel(raw: string) {
  const s = String(raw || '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  if (/back\s*(glass|cover|housing)|rear glass/.test(s)) return 'Back glass';
  if (/inner|fold|cover screen/.test(s)) return 'Inner screen';
  if (/front|screen|display|touch|lcd|digitizer|glass only|blank/.test(s)) return 'Front screen';
  if (/battery/.test(s)) return 'Battery';
  if (/charg|power|\bport\b/.test(s)) return 'Charging / power';
  if (/frame|housing|hinge|bent/.test(s)) return 'Frame / housing';
  if (/camera|lens/.test(s)) return 'Camera';
  if (/software|optimi|update|virus|slow/.test(s)) return 'Software';
  if (/clean|sanitiz/.test(s)) return 'Cleaning';
  if (/speaker|mic|audio|sound/.test(s)) return 'Audio';
  if (/water|liquid/.test(s)) return 'Liquid damage';
  return 'Other';
}
export function typesFrom(text: string | null) {
  const parts = String(text || '').split(/[,;/+&]|\band\b/i).map((x) => x.trim()).filter(Boolean);
  const set = new Set<string>(parts.map(issueLabel));
  if (set.size > 1) set.delete('Other');
  return TYPE_ORDER.filter((t) => set.has(t));
}

// ---- geometry + analysis (same rules as the extension)
export function distM(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371000, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function detectStops(pts: Pt[], stopMinMs: number, spotM: number) {
  const stops: { start: number; end: number; lat: number; lon: number; i: number; j: number }[] = []; const n = pts.length; let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && distM(pts[i], pts[j + 1]) <= spotM) j++;
    if (pts[j].t - pts[i].t >= stopMinMs) {
      const seg = pts.slice(i, j + 1);
      stops.push({ start: pts[i].t, end: pts[j].t, lat: seg.reduce((a, p) => a + p.lat, 0) / seg.length, lon: seg.reduce((a, p) => a + p.lon, 0) / seg.length, i, j });
      i = j + 1;
    } else i++;
  }
  const merged: typeof stops = [];
  stops.forEach((s) => { const last = merged[merged.length - 1]; if (last && s.start - last.end < 120000 && distM(last, s) < 150) { last.end = s.end; last.j = s.j; } else merged.push({ ...s }); });
  return merged;
}
const pathMeters = (pts: Pt[], a: number, b: number) => { let m = 0; for (let k = a + 1; k <= b; k++) m += distM(pts[k - 1], pts[k]); return m; };

export function analyze(points: Pt[], jobs: OwJob[], o: Partial<OwOptions> & { now?: number; tz: string }) {
  const opt = { ...OW_DEFAULTS, now: Date.now(), ...o };
  const tm = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: opt.tz });
  const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);
  const pts = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(p.t)).sort((a, b) => a.t - b.t);
  const live = jobs.filter((j) => !j.canceled && j.geo);
  const raw = detectStops(pts, opt.stopMin * 60000, 60);
  const stops = raw.map((s) => {
    let best: { j: OwJob; d: number } | null = null;
    live.forEach((j) => { const d = distM(s, j.geo!); if (d <= opt.radiusM && (!best || d < best.d)) best = { j, d }; });
    const job = best ? (best as { j: OwJob }).j : null;
    return { ...s, minutes: (s.end - s.start) / 60000, job, kind: (job ? 'job' : 'other') as 'job' | 'other', ongoing: opt.now - s.end < 5 * 60000 };
  });
  let driveMin = 0, driveM = 0;
  for (let k = 0; k + 1 < stops.length; k++) { driveMin += (stops[k + 1].start - stops[k].end) / 60000; driveM += pathMeters(pts, stops[k].j, stops[k + 1].i); }

  const visits = new Map<string, OwVisit>();
  stops.filter((s) => s.job).forEach((s) => {
    const j = s.job!;
    const v = visits.get(j.id) || { jobId: j.id, name: j.name, types: j.types, device: j.device, arrive: s.start, leave: s.end, minutes: 0, limit: 0, ongoing: false };
    v.minutes += s.minutes; v.leave = s.end; v.ongoing = s.ongoing; visits.set(j.id, v);
  });
  const flags: OwFlag[] = [];
  visits.forEach((v) => {
    const j = jobs.find((x) => x.id === v.jobId)!;
    v.limit = opt.overMin + Math.max(0, j.types.length - 1) * opt.extraMin;
    const what = v.types.length ? v.types.join(' + ') : 'repair';
    if (v.minutes > v.limit) flags.push({ type: 'over', sev: v.minutes > v.limit * 1.5 ? 'high' : 'med', jobId: j.id, at: v.arrive, minutes: v.minutes, text: `${mins(v.minutes)} at ${j.name} (${what}${j.device ? ', ' + j.device : ''}); expected about ${v.limit} min${v.ongoing ? ', still there' : ''}` });
    if (j.we) { const late = v.arrive - j.we * 1000; if (late > 5 * 60000) flags.push({ type: 'late', sev: late > 30 * 60000 ? 'high' : 'med', jobId: j.id, at: v.arrive, minutes: late / 60000, text: `Got to ${j.name} at ${tm(v.arrive)}, ${mins(late / 60000)} after the window ended` }); }
  });
  stops.filter((s) => s.kind === 'other' && s.minutes > opt.otherStopMin).forEach((s) => flags.push({ type: 'longstop', sev: s.minutes > opt.otherStopMin * 2 ? 'high' : 'med', at: s.start, minutes: s.minutes, text: `Stopped ${mins(s.minutes)} away from any customer, ${tm(s.start)}–${tm(s.end)}${s.ongoing ? ' (still there)' : ''}` }));
  live.forEach((j) => { if (!visits.has(j.id) && j.we && j.we * 1000 < opt.now - 15 * 60000) flags.push({ type: 'missed', sev: j.done ? 'low' : 'high', jobId: j.id, text: j.done ? `${j.name} is marked done but the tablet never stopped there` : `Never stopped at ${j.name} (window ended ${tm(j.we * 1000)})` }); });
  for (let k = 1; k < pts.length; k++) { const gap = (pts[k].t - pts[k - 1].t) / 60000; if (gap > opt.gapMin && distM(pts[k - 1], pts[k]) > 800) flags.push({ type: 'gap', sev: 'low', at: pts[k - 1].t, minutes: gap, text: `No location for ${mins(gap)} (${tm(pts[k - 1].t)}–${tm(pts[k].t)}) while moving` }); }
  const seen = [...visits.values()].sort((a, b) => a.arrive - b.arrive);
  for (let k = 1; k < seen.length; k++) {
    const a = jobs.find((x) => x.id === seen[k - 1].jobId)!, b = jobs.find((x) => x.id === seen[k].jobId)!;
    if (a.position > b.position) { flags.push({ type: 'order', sev: 'low', at: seen[k - 1].arrive, text: `Went to ${a.name} (stop ${a.position + 1}) before ${b.name} (stop ${b.position + 1}), out of route order` }); break; }
  }
  const rank = { high: 0, med: 1, low: 2 };
  flags.sort((a, b) => rank[a.sev] - rank[b.sev] || (a.at || 0) - (b.at || 0));
  return {
    visits: seen, flags, points: pts.length,
    stops: stops.map((s) => ({ kind: s.kind, jobId: s.job?.id || null, name: s.job?.name || null, start: s.start, end: s.end, minutes: s.minutes, lat: s.lat, lon: s.lon })),
    totals: { driveMin, driveMiles: driveM / 1609.34, jobMin: stops.filter((s) => s.kind === 'job').reduce((a, s) => a + s.minutes, 0), otherMin: stops.filter((s) => s.kind === 'other').reduce((a, s) => a + s.minutes, 0), jobsVisited: visits.size, jobsTotal: live.length },
  };
}

// ---- loading a day for the store
async function geocode(addr: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const r = await fetch('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=' + encodeURIComponent(addr), { next: { revalidate: 60 * 60 * 24 * 30 } } as RequestInit);
    const m = (await r.json())?.result?.addressMatches?.[0]?.coordinates;
    return m ? { lat: m.y, lon: m.x } : null;
  } catch { return null; }
}
const dayStartMs = (day: string, tz: string) => {
  // midnight in the store's time zone
  const guess = Date.parse(day + 'T00:00:00Z');
  const off = new Date(guess).toLocaleString('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).match(/GMT([+-]\d+)(?::(\d+))?/);
  const h = off ? Number(off[1]) : 0, m = off && off[2] ? Number(off[2]) * Math.sign(h || 1) : 0;
  return guess - (h * 60 + m) * 60000;
};

export const overwatchRange = (day: string, tz: string): [number, number] => { const s = dayStartMs(day, tz); return [s, s + 864e5]; };

type SheetRow = { tech_id: string; tech_name: string | null; van: string | null; sheet_jobs: { id: string; position: number; customer_name: string | null; address: string | null; window_start: string | null; window_end: string | null; device: string | null; problem: string | null; filed_parts: string | null; outcome: string | null; lat: number | null; lon: number | null }[] };

/** Every tablet with a tech, for one day: where it went vs that tech's daily forms. */
export async function overwatchDay(sb: SupabaseClient, franchiseId: string, day: string, tz: string, opts?: Partial<OwOptions>): Promise<OwTech[]> {
  const start = dayStartMs(day, tz), end = start + 864e5;
  const [{ data: devs }, { data: sheets }] = await Promise.all([
    sb.from('devices').select('id,name,tech_id,tech_name,van').eq('franchise_id', franchiseId).eq('status', 'active'),
    sb.from('sheets').select('tech_id,tech_name,van,sheet_jobs(id,position,customer_name,address,window_start,window_end,device,problem,filed_parts,outcome,lat,lon)').eq('franchise_id', franchiseId).eq('sheet_date', day),
  ]);
  const sh = (sheets || []) as unknown as SheetRow[];
  const out = await Promise.all((devs || []).filter((d) => d.tech_id || d.tech_name).map(async (d) => {
    const sheet = sh.find((s) => d.tech_id && s.tech_id === d.tech_id) || sh.find((s) => d.tech_name && s.tech_name && s.tech_name.toLowerCase() === d.tech_name.toLowerCase());
    const { data: locs } = await sb.from('locations').select('at,lat,lon').eq('device_id', d.id).gte('at', new Date(start).toISOString()).lt('at', new Date(end).toISOString()).order('at').limit(10000);
    const pts = (locs || []).map((p) => ({ lat: p.lat, lon: p.lon, t: Date.parse(p.at) }));
    const jobs: OwJob[] = await Promise.all([...(sheet?.sheet_jobs || [])].sort((a, b) => a.position - b.position).map(async (j, i) => ({
      id: j.id, name: j.customer_name || 'Customer ' + (i + 1), address: j.address, position: i,
      ws: j.window_start ? Date.parse(j.window_start) / 1000 : null, we: j.window_end ? Date.parse(j.window_end) / 1000 : null,
      types: typesFrom([j.filed_parts, j.problem].filter(Boolean).join(', ')), device: j.device,
      done: /complete/i.test(j.outcome || ''), canceled: /cancel|resched/i.test(j.outcome || ''),
      geo: j.lat != null && j.lon != null ? { lat: j.lat, lon: j.lon } : j.address ? await geocode(j.address) : null,
    })));
    const a = analyze(pts, jobs, { ...opts, tz, now: Math.min(Date.now(), end) });
    return { deviceId: d.id, tech: d.tech_name || sheet?.tech_name || d.name, van: d.van || sheet?.van || null, date: day, points: a.points, jobs, visits: a.visits, stops: a.stops, flags: sheet ? a.flags : [], totals: a.totals, noRoute: !sheet, noGps: !pts.length } as OwTech;
  }));
  return out.sort((a, b) => a.tech.localeCompare(b.tech));
}
