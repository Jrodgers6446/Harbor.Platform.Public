// Harbor Bridge, runs on the Harbor website. Tells the page the Bridge is here and passes its refresh and its
// Phone connection / Harbor Helper requests to the background worker. The page sends its own sign-in token with each
// refresh; it is used for that one upload to Harbor and never stored.
(() => {
  const version = chrome.runtime.getManifest().version;
  document.documentElement.dataset.harborBridge = version;
  const post = (m) => window.postMessage({ source: 'harbor-bridge', version, ...m }, location.origin);
  const status = async () => { const s = await chrome.runtime.sendMessage({ type: 'bridge:status' }).catch(() => null); post({ type: 'status', dispatchAt: s && s.dispatchAt, workordersAt: s && s.workordersAt, connections: (s && s.connections) || [] }); };
  window.addEventListener('message', async (ev) => {
    if (ev.source !== window || !ev.data || ev.data.source !== 'harbor-site') return;
    const m = ev.data;
    if (m.type === 'ping') return status();
    if (m.type === 'call' && typeof m.id === 'number') {
      const r = await chrome.runtime.sendMessage({ type: 'bridge:call', op: m.op, args: m.args }).catch((e) => ({ ok: false, error: e.message }));
      post({ type: 'reply', id: m.id, ...(r || { ok: false, error: 'No answer' }) });
      return;
    }
    if (m.type === 'open' && typeof m.what === 'string') { chrome.runtime.sendMessage({ type: 'bridge:open', what: m.what }).catch(() => {}); return; }
    if (m.type === 'refresh' && typeof m.what === 'string') {
      const r = await chrome.runtime.sendMessage({ type: 'bridge:refresh', what: m.what, day: m.day, token: m.token, site: location.origin })
        .catch((e) => ({ ok: false, error: e.message }));
      post({ type: 'done', what: m.what, ok: !!(r && r.ok), error: r && r.error });
      status();
    }
  });
  status();
})();
