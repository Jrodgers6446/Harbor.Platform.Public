// Harbor Bridge background worker. Starts with no connections: the user adds the systems their company uses from the
// popup and Chrome asks them to allow that one site. Each connection is read in the user's own signed-in browser and a
// slim copy is uploaded to Harbor with the website's sign-in. Read-only.

// Edit these before building: your Supabase project, its anon key, and the hosts your Harbor website runs on.
const SUPABASE = 'https://your-project.supabase.co';
const KEY = 'your-anon-key';
const SITES = ['https://harbor.example.com', 'https://harbor-overwatch.example.com'];

// The two systems the built-in connectors read. Replace these placeholders with your real hosts, and keep
// manifest.json (optional_host_permissions) and popup.js (MATCH) in step.
const DISPATCH = 'https://dispatch.example.com';
const WORKORDERS = 'https://workorders.example.com';
// Page paths on those hosts. Adjust to your system.
const DISPATCH_BOARD_PATH = '/board';
const WORKORDERS_PAGE_PATH = '/workorders';
// Optional. Filled in from the board's own URL the first time you open it.
const DEFAULT_LOCATION = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (k) => (await chrome.storage.local.get(k))[k];
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const minus = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') - n * 864e5).toISOString().slice(0, 10);

// ---------------------------------------------------------------- connections
// 'schedule' = the day's jobs and techs; 'workorders' = finished work.
const CONNECTORS = {
  dispatch: {
    name: 'Dispatch board', kind: 'schedule', origin: DISPATCH, match: DISPATCH + '/*',
    scripts: [
      { id: 'c-dispatch-main', matches: [DISPATCH + '/*'], js: ['dispatch-inject.js'], runAt: 'document_start', world: 'MAIN' },
      { id: 'c-dispatch-relay', matches: [DISPATCH + '/*'], js: ['dispatch-relay.js'], runAt: 'document_start' },
    ],
  },
  workorders: { name: 'Work orders', kind: 'workorders', origin: WORKORDERS, match: WORKORDERS + '/*', scripts: [] },
};
const enabledIds = async () => ((await get('bridge:connectors')) || []).filter((id) => CONNECTORS[id]);
async function syncScripts() {
  const want = (await enabledIds()).flatMap((id) => CONNECTORS[id].scripts);
  const have = (await chrome.scripting.getRegisteredContentScripts()).map((x) => x.id).filter((id) => id.startsWith('c-'));
  if (have.length) await chrome.scripting.unregisterContentScripts({ ids: have });
  if (want.length) await chrome.scripting.registerContentScripts(want.map((x) => ({ persistAcrossSessions: true, ...x })));
}
async function connectionList() {
  const ids = await enabledIds(); const at = (await get('bridge:at')) || {};
  return {
    available: Object.entries(CONNECTORS).filter(([id]) => !ids.includes(id)).map(([id, c]) => ({ id, name: c.name, kind: c.kind })),
    connected: ids.map((id) => ({ id, name: CONNECTORS[id].name, kind: CONNECTORS[id].kind, at: at[id] || null })),
  };
}
// The popup asks Chrome for the site permission first (it needs the click); this just records it.
async function addConnection(id) {
  const c = CONNECTORS[id]; if (!c) return { ok: false, error: 'Unknown connection.' };
  if (!(await chrome.permissions.contains({ origins: [c.match] }))) return { ok: false, error: 'Chrome didn’t allow that site.' };
  const ids = await enabledIds(); if (!ids.includes(id)) await chrome.storage.local.set({ 'bridge:connectors': [...ids, id] });
  await syncScripts();
  return { ok: true };
}
async function removeConnection(id) {
  const c = CONNECTORS[id]; if (!c) return { ok: false };
  await chrome.storage.local.set({ 'bridge:connectors': (await enabledIds()).filter((x) => x !== id) });
  await syncScripts();
  await chrome.permissions.remove({ origins: [c.match] }).catch(() => {});
  return { ok: true };
}
// Updating from 1.1 (built-in connections): keep them connected if Chrome still allows those sites.
chrome.runtime.onInstalled.addListener(async () => {
  if ((await get('bridge:connectors')) == null) {
    const keep = [];
    for (const [id, c] of Object.entries(CONNECTORS)) if (await chrome.permissions.contains({ origins: [c.match] })) keep.push(id);
    await chrome.storage.local.set({ 'bridge:connectors': keep });
  }
  await syncScripts().catch(() => {});
});

// ---------------------------------------------------------------- dispatch board capture (from dispatch-relay.js)
let queue = Promise.resolve();
const enabledIdsSync = new Set();
const refreshEnabledSet = async () => { enabledIdsSync.clear(); (await enabledIds()).forEach((i) => enabledIdsSync.add(i)); };
refreshEnabledSet(); chrome.storage.onChanged.addListener((c) => { if (c['bridge:connectors']) refreshEnabledSet(); });
async function saveDispatch(msg) {
  const key = `dispatch:${msg.date}`;
  const rec = (await get(key)) || { date: msg.date };
  rec[msg.kind] = msg.items; rec[msg.kind + 'At'] = Date.now();
  if (msg.locationId) { rec.locationId = msg.locationId; await chrome.storage.local.set({ 'bridge:loc': msg.locationId }); }
  const index = ((await get('dispatch:index')) || []).filter((d) => d !== msg.date);
  index.unshift(msg.date);
  const drop = index.splice(7); // keep a week; it holds customer names
  await chrome.storage.local.set({ [key]: rec, 'dispatch:index': index });
  if (drop.length) await chrome.storage.local.remove(drop.map((d) => `dispatch:${d}`));
}

function slimDispatch(rec) {
  const loc = rec.locationId;
  const techs = (rec.shiftList || []).filter((s) => s && s.technician && !s.deletedAt).map((s) => ({
    id: String(s.technician.technicianIdentifier), name: s.technician.technicianName || '',
    available: (s.calendarEvents || []).some((e) => e.eventType === 'AVAILABLE'),
  }));
  const jobs = (rec.serviceJobs || []).filter((j) => !loc || !j.location || j.location.externalIdentifier === loc).map((j) => {
    const a = j.address || {};
    return {
      sjn: j.serviceJobNumber || String(j.id),
      name: (j.customer && j.customer.displayName) || j.customerName || '',
      status: j.displayedStatus || '', type: j.displayedServiceJobType || j.serviceJobTypeIdentifier || '', carrier: j.purchasedFrom || '',
      ws: j.customerSelectedStartTime || j.scheduledServiceStartTime || null, we: j.customerSelectedEndTime || j.scheduledServiceEndTime || null,
      address: [[a.addressLine1, a.addressLine2].filter(Boolean).join(' '), a.city, [a.state, a.zipCode].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      techs: (j.assignedTechnicianIdentifiers || []).map(String), jeopardy: j.inJeopardy ? (j.jeopardyReason || 'In jeopardy') : null,
    };
  });
  return { locationId: loc || null, techs, jobs };
}

async function waitLoaded(tabId, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const t = await chrome.tabs.get(tabId).catch(() => null); if (!t) return null; if (t.status === 'complete') return t; await sleep(300); }
  return chrome.tabs.get(tabId).catch(() => null);
}
const onHost = (url, base) => { try { return new URL(url).origin === base; } catch { return false; } };
const boardUrl = (day, loc) => `${DISPATCH}${DISPATCH_BOARD_PATH}?${[day && `dateString=${day}`, loc && `locationId=${loc}`].filter(Boolean).join('&')}`;

async function readDispatch(day) {
  const loc = (await get('bridge:loc')) || DEFAULT_LOCATION;
  const started = Date.now();
  const tab = await chrome.tabs.create({ url: boardUrl(day, loc), active: false });
  let keep = false;
  try {
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      const rec = await get(`dispatch:${day}`);
      if (rec && rec.serviceJobsAt > started && rec.shiftListAt > started) return { ok: true, rec };
      if (i === 12 || i === 40) {
        const t = await chrome.tabs.get(tab.id).catch(() => null);
        if (!t) return { ok: false, error: 'The dispatch board tab was closed.' };
        if (!onHost(t.url || t.pendingUrl, DISPATCH) || /login|signin|oauth|authorize/i.test(t.url || '')) {
          keep = true; chrome.tabs.update(tab.id, { active: true }).catch(() => {});
          return { ok: false, error: 'Sign in to the dispatch board in the tab that just opened, then press refresh again.' };
        }
      }
    }
    keep = true; chrome.tabs.update(tab.id, { active: true }).catch(() => {});
    return { ok: false, error: "The dispatch board didn't load. Check the tab that opened (signed in?), then try again." };
  } finally { if (!keep) chrome.tabs.remove(tab.id).catch(() => {}); }
}

// ---------------------------------------------------------------- work orders
async function readWorkorders(day) {
  let tab = (await chrome.tabs.query({ url: WORKORDERS + '/*' }))[0], created = false, keep = false;
  if (!tab) { tab = await chrome.tabs.create({ url: WORKORDERS + WORKORDERS_PAGE_PATH, active: false }); created = true; await waitLoaded(tab.id); await sleep(1500); }
  try {
    const now = await chrome.tabs.get(tab.id);
    if (!onHost(now.url || now.pendingUrl, WORKORDERS)) { keep = true; chrome.tabs.update(tab.id, { active: true }).catch(() => {}); return { ok: false, error: 'Sign in to the work orders system in the tab that just opened, then press refresh again.' }; }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['workorders.js'] });
    const r = await chrome.tabs.sendMessage(tab.id, { type: 'bridge:workorders', since: minus(day, 6) });
    if (!r || !r.ok) {
      if (r && r.error === 'SIGN_IN') { keep = true; chrome.tabs.update(tab.id, { active: true }).catch(() => {}); return { ok: false, error: 'The work orders sign-in has expired. Sign in again in that tab, then press refresh again.' }; }
      return { ok: false, error: (r && r.error) || "Couldn't read the work orders system." };
    }
    return { ok: true, since: minus(day, 6), wos: r.wos };
  } catch (e) {
    if (/cannot access|permission|host/i.test(e.message || '')) { keep = true; chrome.tabs.update(tab.id, { active: true }).catch(() => {}); return { ok: false, error: 'Sign in to the work orders system in the tab that just opened, then try again.' }; }
    return { ok: false, error: e.message || String(e) };
  } finally { if (created && !keep) chrome.tabs.remove(tab.id).catch(() => {}); }
}

// ---------------------------------------------------------------- upload to Harbor
async function upload(source, day, payload, token) {
  if (!token) return { ok: false, error: 'Sign in to the Harbor website first.' };
  const r = await fetch(`${SUPABASE}/rest/v1/rpc/bridge_put`, {
    method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_source: source, p_day: day, p_payload: payload }),
  });
  if (r.ok) return { ok: true };
  let m = 'Harbor said ' + r.status; try { const j = await r.json(); m = j.message || j.msg || m; } catch {}
  if (r.status === 401) m = 'Your Harbor sign-in expired. Reload the website and try again.';
  return { ok: false, error: m };
}

async function refreshOne(id, day, token) {
  const c = CONNECTORS[id];
  let u;
  if (id === 'dispatch') {
    const r = await readDispatch(day);
    if (!r.ok) return r;
    u = await upload('dispatch', day, slimDispatch(r.rec), token);
  } else if (id === 'workorders') {
    const r = await readWorkorders(day);
    if (!r.ok) return r;
    u = await upload('workorders', day, { since: r.since, wos: r.wos }, token);
  } else return { ok: false, error: `No reader for ${c ? c.name : id}.` };
  if (u.ok) { const at = (await get('bridge:at')) || {}; at[id] = Date.now(); await chrome.storage.local.set({ 'bridge:at': at }); }
  return u;
}

// One refresh button on the website: every connection, schedule first (the day's jobs), then work orders.
async function refresh(what, day, token) {
  if (!isDay(day)) return { ok: false, error: 'Bad day.' };
  const ids = (await enabledIds()).sort((a, b) => (CONNECTORS[a].kind === 'schedule' ? 0 : 1) - (CONNECTORS[b].kind === 'schedule' ? 0 : 1));
  const list = what === 'all' ? ids : ids.filter((id) => id === what);
  if (!list.length) return { ok: false, error: 'Bridge has no connections yet. Click the Bridge icon in Chrome and add the systems your company uses.' };
  const errors = [];
  for (const id of list) { const r = await refreshOne(id, day, token); if (!r.ok) errors.push(`${CONNECTORS[id].name}: ${r.error}`); }
  return errors.length ? { ok: false, error: errors.join(' ') } : { ok: true };
}

async function open(id) {
  const c = CONNECTORS[id]; if (!c || !(await enabledIds()).includes(id)) return;
  const t = (await chrome.tabs.query({ url: c.match }))[0];
  if (t) { await chrome.tabs.update(t.id, { active: true }); await chrome.windows.update(t.windowId, { focused: true }).catch(() => {}); return; }
  const loc = (await get('bridge:loc')) || DEFAULT_LOCATION;
  chrome.tabs.create({ url: id === 'workorders' ? WORKORDERS + WORKORDERS_PAGE_PATH : id === 'dispatch' ? boardUrl(null, loc) : c.origin });
}

// What the website shows: when each kind was last read, and the connection names (for the button's tooltip).
async function status() {
  const l = await connectionList();
  const kindAt = (k) => { const x = l.connected.filter((c) => c.kind === k); return x.length ? Math.min(...x.map((c) => c.at || 0)) || null : null; };
  return { dispatchAt: kindAt('schedule'), workordersAt: kindAt('workorders'), connections: l.connected };
}

// ---------------------------------------------------------------- Harbor Helper
// A web page can't reach 127.0.0.1, so the website's Phone connection card and Harbor Helper settings go through here.
// The helper token stays in this extension's storage; the page only learns whether one is set.
const helperCfg = async () => ({ url: 'http://127.0.0.1:47800', token: '', ...((await get('bridge:helper')) || {}) });
async function helperCall({ path, method = 'GET', body }) {
  if (typeof path !== 'string' || !/^\/[a-z0-9/_-]*$/i.test(path)) return { ok: false, error: 'Bad helper path.' };
  const c = await helperCfg();
  if (!c.token) return { ok: false, status: 0, error: 'Helper token not set' };
  try {
    const r = await fetch(c.url + path, { method, headers: { 'Content-Type': 'application/json', 'X-Harbor-Token': c.token }, body: body == null ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) return { ok: false, status: 401, error: 'Wrong helper token' };
    if (!r.ok) return { ok: false, status: r.status, error: j.error || `Helper error ${r.status}`, data: j };
    return { ok: true, status: r.status, data: j };
  } catch { return { ok: false, status: 0, error: "Harbor Helper isn't running" }; }
}
async function call(op, args = {}) {
  if (op === 'helper') return helperCall(args);
  if (op === 'helperConfig') { const c = await helperCfg(); return { ok: true, data: { url: c.url, hasToken: !!c.token } }; }
  if (op === 'helperConfigSet') {
    const cur = await helperCfg();
    const url = String(args.url || cur.url).trim().replace(/\/+$/, '');
    if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) return { ok: false, error: 'The helper address must be on this PC, like http://127.0.0.1:47800' };
    const next = { url, token: typeof args.token === 'string' && args.token.trim() ? args.token.trim() : cur.token };
    await chrome.storage.local.set({ 'bridge:helper': next });
    return { ok: true, data: { url, hasToken: !!next.token } };
  }
  return { ok: false, error: 'Unknown request.' };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('bridge:')) return;
  if (msg.type === 'bridge:call') {
    const from = sender.url ? new URL(sender.url).origin : '';
    if (!SITES.includes(from)) { sendResponse({ ok: false, error: 'Not allowed from this page.' }); return; }
    call(msg.op, msg.args).then(sendResponse).catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
    return true;
  }
  if (msg.type === 'bridge:dispatch') { if (onHost(sender.url, DISPATCH) && enabledIdsSync.has('dispatch')) queue = queue.then(() => saveDispatch(msg)).catch(() => {}); return; }
  if (msg.type === 'bridge:status') { status().then(sendResponse); return true; }
  // popup only (extension pages have no tab url on a site)
  if (msg.type === 'bridge:connections' || msg.type === 'bridge:add' || msg.type === 'bridge:remove') {
    if (sender.url && !sender.url.startsWith(chrome.runtime.getURL(''))) { sendResponse({ ok: false }); return; }
    (msg.type === 'bridge:connections' ? connectionList() : msg.type === 'bridge:add' ? addConnection(msg.id) : removeConnection(msg.id)).then(sendResponse);
    return true;
  }
  if (msg.type === 'bridge:open') { open(msg.what).then(() => sendResponse({ ok: true })); return true; }
  if (msg.type === 'bridge:refresh') {
    const from = sender.url ? new URL(sender.url).origin : '';
    if (!SITES.includes(from)) { sendResponse({ ok: false, error: 'Not allowed from this page.' }); return; }
    refresh(msg.what, msg.day, msg.token).then(sendResponse).catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
    return true;
  }
});
