// Harbor Bridge, runs inside the dispatch board page. Read-only: watches the board's own GraphQL responses for the
// day's jobs and tech shifts and hands them to dispatch-relay.js. It never sends requests of its own.
(() => {
  if (window.__harborBridgeHooked) return;
  window.__harborBridgeHooked = true;
  // Adjust to your system: the path of the board's GraphQL endpoint and the operation names it uses.
  const GQL_PATH = '/gql';
  const OP_JOBS = 'serviceJobs', OP_SHIFTS = 'shiftList';
  const isGql = (url) => typeof url === 'string' && url.includes(GQL_PATH);
  const opName = (body) => { try { const b = typeof body === 'string' ? JSON.parse(body) : body; return Array.isArray(b) ? b.map((x) => x && x.operationName) : b && b.operationName; } catch { return null; } };

  function handle(op, text) {
    let json; try { json = JSON.parse(text); } catch { return; }
    const ops = Array.isArray(op) ? op : [op];
    const results = Array.isArray(json) ? json : [json];
    ops.forEach((name, i) => {
      const data = results[i] && results[i].data;
      if (!data) return;
      let kind = name === OP_JOBS ? 'serviceJobs' : name === OP_SHIFTS ? 'shiftList' : null;
      if (!kind && Array.isArray(data.serviceJobs)) kind = 'serviceJobs';
      if (!kind && Array.isArray(data.shifts)) kind = 'shiftList';
      if (kind) window.postMessage({ __harborBridge: true, kind, data, url: location.href }, location.origin);
    });
  }

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0] && args[0].url;
      if (isGql(url)) { const op = opName(args[1] && args[1].body); res.clone().text().then((t) => handle(op, t)).catch(() => {}); }
    } catch {}
    return res;
  };
  const origOpen = XMLHttpRequest.prototype.open, origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url, ...rest) { this.__hbUrl = url; return origOpen.call(this, m, url, ...rest); };
  XMLHttpRequest.prototype.send = function (body) {
    if (isGql(String(this.__hbUrl))) { const op = opName(body); this.addEventListener('load', () => { try { handle(op, this.responseText); } catch {} }); }
    return origSend.call(this, body);
  };
})();
