// Harbor Bridge: passes what dispatch-inject.js saw on the dispatch board to the background worker.
window.addEventListener('message', (ev) => {
  if (ev.source !== window || !ev.data || !ev.data.__harborBridge) return;
  const { kind, data, url } = ev.data;
  let date = null, locationId = null;
  try { const u = new URL(url); date = u.searchParams.get('dateString'); locationId = u.searchParams.get('locationId'); } catch {}
  if (kind === 'serviceJobs') { const j = (data.serviceJobs || []).find((x) => x && x.scheduledServiceDate); if (j) date = j.scheduledServiceDate; }
  if (kind === 'shiftList') { const s = (data.shifts || []).find((x) => x && x.startDate); if (s) date = String(s.startDate).slice(0, 10); }
  if (!date) return;
  chrome.runtime.sendMessage({ type: 'bridge:dispatch', kind, date, locationId, items: kind === 'serviceJobs' ? data.serviceJobs : data.shifts }).catch(() => {});
});
