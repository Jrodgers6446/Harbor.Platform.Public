// Harbor Bridge, injected into the repair portal tab when Bridge asks. Read-only: reads the same Closed and Cancelled
// work order lists the portal's Workorders page shows and returns a slim copy (no phone numbers or IMEIs).
(() => {
  if (window.__harborBridgePortal) return;
  window.__harborBridgePortal = true;
  async function post(body) {
    const r = await fetch('/api/workorders', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
    const type = r.headers.get('content-type') || '';
    if (r.status === 401 || r.status === 403 || !type.includes('json')) throw new Error('SIGN_IN');
    if (!r.ok) throw new Error('The portal returned ' + r.status + '.');
    return r.json();
  }
  const slim = (w, state) => ({
    id: w.workorderId, state, outcome: w.serviceOutcome || '', status: w.workorderStatusName || '', program: w.programName || '',
    name: (w.customer && w.customer.fullName) || '', device: (w.customerDevice && (w.customerDevice.deviceName || w.customerDevice.model)) || '',
    createdAt: w.createdAt || null, updatedAt: w.updatedAt || null,
  });
  async function pull(primaryFilter, order, state, since, out, maxPages) {
    for (let page = 1; page <= maxPages; page++) {
      const j = await post({ page, pageSize: 50, deviceTypeIds: [], serviceOutcome: [], programIds: [], needsAttention: false, order, tab: null, primaryFilter });
      const rows = j.workOrders || [];
      rows.forEach((w) => out.push(slim(w, state)));
      if (rows.length < 50) break;
      const last = rows[rows.length - 1];
      const stamp = String(last.updatedAt || last.createdAt || '').slice(0, 10);
      if (stamp && stamp < since) break;
    }
  }
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== 'bridge:portal-wos') return;
    (async () => {
      const wos = [];
      await pull('Closed', 'closed,DESC', 'closed', msg.since, wos, 8);
      await pull('Cancelled', 'cancelled,DESC', 'cancelled', msg.since, wos, 8);
      const seen = new Set();
      sendResponse({ ok: true, wos: wos.filter((x) => { const k = x.state + x.id; if (seen.has(k)) return false; seen.add(k); return true; }) });
    })().catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
    return true;
  });
})();
