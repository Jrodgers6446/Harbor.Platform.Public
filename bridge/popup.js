const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (t) => (t ? 'last read ' + new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'not read yet');
const dot = (t) => (t ? (Date.now() - t > 2 * 3600e3 ? 'dot old' : 'dot ok') : 'dot');
const KIND = { schedule: 'Schedule', workorders: 'Work orders' };
// Same hosts as DISPATCH and WORKORDERS in background.js; keep in sync with optional_host_permissions in manifest.json.
const MATCH = { dispatch: 'https://dispatch.example.com/*', workorders: 'https://workorders.example.com/*' };
// Your Harbor website (same as the first entry in SITES in background.js).
const SITE_URL = 'https://harbor.example.com/';

async function render() {
  const l = await chrome.runtime.sendMessage({ type: 'bridge:connections' });
  $('list').innerHTML = l.connected.length ? l.connected.map((c) => `<div class="row" style="margin-bottom:8px"><span class="${dot(c.at)}"></span><div class="grow"><b>${esc(c.name)}</b><span class="sub">${esc(KIND[c.kind] || c.kind)} · ${when(c.at)}</span></div><button data-open="${esc(c.id)}">Open</button><button class="x" data-remove="${esc(c.id)}" title="Remove ${esc(c.name)}">✕</button></div>`).join('')
    : '<div class="muted" style="margin-bottom:4px">No connections yet. Pick a system below.</div>';
  $('pick').innerHTML = l.available.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (${esc(KIND[c.kind] || c.kind)})</option>`).join('');
  $('addBox').style.display = l.available.length ? '' : 'none';
  $('list').querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'bridge:open', what: b.dataset.open }).then(() => window.close())));
  $('list').querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'bridge:remove', id: b.dataset.remove }); render(); }));
}
$('add').addEventListener('click', async () => {
  const id = $('pick').value; $('msg').textContent = '';
  const ok = await chrome.permissions.request({ origins: [MATCH[id]] }).catch(() => false);
  if (!ok) { $('msg').textContent = 'Chrome needs your OK to read that site.'; return; }
  const r = await chrome.runtime.sendMessage({ type: 'bridge:add', id });
  if (!r.ok) $('msg').textContent = r.error || 'Couldn’t add it.';
  render();
});
$('site').onclick = () => { chrome.tabs.create({ url: SITE_URL }); window.close(); };
$('ver').textContent = 'Version ' + chrome.runtime.getManifest().version;
render();
