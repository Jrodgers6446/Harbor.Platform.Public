// Harbor Helper - local API for the Harbor extension. Binds to 127.0.0.1 only.
//
//   GET  /status                     helper + phone status
//   POST /precall/runs               { jobs:[...], template, mode:"dry"|"send" } -> run summary
//   GET  /precall/runs/:id           run summary (poll)
//   GET  /precall/runs/:id/events    Server-Sent Events stream (token via ?token=)
//   POST /precall/runs/:id/cancel    stop after the current customer
//   GET/POST /connection             phone connection: { mode: auto|usb|wifi }, plus /pair /from-cable /reconnect /disconnect-wifi
//
// Every request needs header  X-Harbor-Token: <token>  (see ~/.harbor-helper/config.json)
const http = require("node:http");
const crypto = require("node:crypto");
const { URL } = require("node:url");
const cfgStore = require("./config");
const A = require("./adb");
const F = require("./fieldapp");
const { PrecallRun } = require("./precall");
const VERSION = require("../package.json").version;

const cfg = cfgStore.load();
// Phone connection: cable, Wi-Fi or automatic (saved in config.json)
A.setMode(cfg.connection || "auto", cfg.lastWifi || null, cfg.phone || null);
A.conn.onSave = (patch) => { Object.assign(cfg, patch); cfgStore.save(cfg); };
const runs = new Map();
let active = null;

const safeEq = (a, b) => {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function cors(req, res) {
  const origin = req.headers.origin || "";
  if (origin.startsWith("chrome-extension://")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Harbor-Token");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
}

const send = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const readJson = (req) => new Promise((resolve, reject) => {
  let data = "";
  req.on("data", (c) => { data += c; if (data.length > 1e6) req.destroy(); });
  req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error("Invalid JSON")); } });
});

function validateRun(body) {
  const { jobs, template, mode = "dry", replyConfig } = body;
  if (!Array.isArray(jobs) || !jobs.length) return "jobs must be a non-empty array";
  if (jobs.length > cfg.maxPerRun) return `too many jobs (max ${cfg.maxPerRun})`;
  for (const j of jobs) if (!j || !j.id || !j.customer) return "each job needs id and customer";
  if (!["dry", "type", "send", "replies", "replies-dry"].includes(mode)) return 'unknown mode';
  if (mode.startsWith("replies")) {
    const rules = replyConfig && replyConfig.rules, t = replyConfig && replyConfig.templates;
    if (Array.isArray(rules) && rules.length) {
      if (rules.some((r) => /[^\x20-\x7E]/.test(String(r.reply || "")))) return "reply texts must be plain ASCII (no emoji or smart quotes)";
      return null;
    }
    if (!t || typeof t.thanks !== "string" || typeof t.mismatch !== "string") return "replyConfig.rules (or templates.thanks and .mismatch) are required";
    if (/[^\x20-\x7E]/.test(t.thanks + t.mismatch)) return "reply templates must be plain ASCII (no emoji or smart quotes)";
    return null;
  }
  if (typeof template !== "string" || template.trim().length < 5) return "template is required";
  if (/[^\x20-\x7E]/.test(template)) return "template must be plain ASCII (no emoji or smart quotes)";
  return null;
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, "http://127.0.0.1");
  // The token goes in the X-Harbor-Token header. Only the live-progress stream (EventSource can't send
  // headers) may pass it in the address.
  const token = req.headers["x-harbor-token"] || (/\/events$/.test(url.pathname) ? url.searchParams.get("token") : null);
  if (!safeEq(token, cfg.token)) return send(res, 401, { error: "bad token" });

  try {
    const p = url.pathname.replace(/\/+$/, "");

    if (req.method === "GET" && p === "/status") {
      let dev = null, devErr = null, foreground = null;
      try { dev = await A.device(); if (dev?.state === "device") foreground = await A.currentPackage(); }
      catch (e) { devErr = e.message; }
      return send(res, 200, {
        ok: true, version: VERSION, device: dev, deviceError: devErr,
        fieldAppForeground: foreground === F.PKG, busy: !!active, activeRun: active?.id || null, engine: A.engine(),
        connection: A.connection(),
      });
    }

    // ---- phone connection (cable / Wi-Fi)
    if (req.method === "GET" && p === "/connection") {
      let dev = null, list = [];
      try { dev = await A.device(); list = (await A.devices()).filter((d) => d.transport === "usb" || A.conn.okWifi.has(d.serial)); } catch (e) { return send(res, 200, { ...A.connection(), error: e.message, devices: [] }); }
      return send(res, 200, { ...A.connection(), device: dev, devices: list, busy: !!active });
    }
    if (req.method === "POST" && p === "/connection") {
      const body = await readJson(req);
      if (!["auto", "usb", "wifi"].includes(body.mode)) return send(res, 400, { error: "mode must be auto, usb or wifi" });
      if (active) return send(res, 409, { error: "Wait until the current run finishes to switch connections" });
      A.setMode(body.mode); cfg.connection = body.mode; cfgStore.save(cfg);
      if (body.mode !== "usb") await A.ensureWifi(true);
      const dev = await A.device().catch(() => null);
      return send(res, 200, { ...A.connection(), device: dev, devices: (await A.devices().catch(() => [])).filter((d) => d.transport === "usb" || A.conn.okWifi.has(d.serial)) });
    }
    if (req.method === "POST" && p === "/connection/pair") {
      if (active) return send(res, 409, { error: "a run is in progress" });
      const body = await readJson(req);
      const address = body.address ? String(body.address).trim() : null;
      if (address && !/^[\d.]+:\d+$/.test(address)) return send(res, 400, { error: "Address looks like 192.168.1.20:37123" });
      try { const r = await A.pair(body.code, address); return send(res, 200, { ok: true, ...r, ...A.connection(), device: await A.device().catch(() => null) }); }
      catch (e) { return send(res, 400, { error: e.message, needAddress: !!e.needAddress }); }
    }
    if (req.method === "POST" && p === "/connection/connect") {
      if (active) return send(res, 409, { error: "a run is in progress" });
      const body = await readJson(req);
      const address = String(body.address || "").trim();
      if (!/^\d{1,3}(\.\d{1,3}){3}:\d{2,5}$/.test(address)) return send(res, 400, { error: "Type it like 192.168.1.23:41567 (IP address & Port on the Wireless debugging screen)" });
      try { const r = await A.connectAddress(address); return send(res, 200, { ok: true, ...r, ...A.connection(), device: await A.device().catch(() => null) }); }
      catch (e) { return send(res, 400, { error: e.message }); }
    }
    if (req.method === "POST" && p === "/connection/from-cable") {
      if (active) return send(res, 409, { error: "a run is in progress" });
      try { const r = await A.wifiFromCable(); return send(res, 200, { ok: true, ...r, ...A.connection() }); }
      catch (e) { return send(res, 400, { error: e.message }); }
    }
    if (req.method === "POST" && p === "/connection/reconnect") {
      const ok = await A.ensureWifi(true);
      return send(res, 200, { ok, ...A.connection(), device: await A.device().catch(() => null) });
    }
    if (req.method === "POST" && p === "/connection/disconnect-wifi") {
      if (active) return send(res, 409, { error: "a run is in progress" });
      await A.disconnectWifi();
      return send(res, 200, { ok: true, ...A.connection() });
    }

    if (req.method === "POST" && p === "/precall/runs") {
      if (active) return send(res, 409, { error: "a run is already in progress", activeRun: active.id });
      const body = await readJson(req);
      const err = validateRun(body);
      if (err) return send(res, 400, { error: err });
      body.jobs = body.jobs.map((j) => ({ ...j, customer: String(j.customer).trim(), date: j.date ? String(j.date).trim() : j.date }));
      const run = new PrecallRun({ jobs: body.jobs, template: body.template || "{msg}", mode: body.mode || "dry", cfg, replyConfig: body.replyConfig || null });
      runs.set(run.id, run);
      active = run;
      run.on("event", (e) => console.log(`[${e.type}]`, e.customer || "", e.status || e.state || e.step || "", e.detail || e.error || ""));
      run.start().finally(() => { active = null; });
      return send(res, 202, run.summary());
    }

    if (req.method === "GET" && p === "/debug/screen") {
      // What the phone shows right now (PNG), for troubleshooting.
      const png = await A.screencap();
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
      return res.end(png);
    }

    // Troubleshooting: screen layout as XML, and a tap / back for mapping new screens (only when no run is active).
    if (req.method === "GET" && p === "/debug/dump") {
      res.writeHead(200, { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(await A.rawXml());
    }
    if (req.method === "POST" && (p === "/debug/tap" || p === "/debug/back")) {
      if (active) return send(res, 409, { error: "a run is in progress" });
      await A.prepare();
      if (p === "/debug/back") await A.back();
      else await A.tap({ x: Number(url.searchParams.get("x")), y: Number(url.searchParams.get("y")) });
      return send(res, 200, { ok: true });
    }

    // Phone not showing up? Restart adb's background server and list what it sees.
    if (req.method === "POST" && p === "/admin/adb-reset") {
      if (active) return send(res, 409, { error: "a run is in progress" });
      await A.adb("kill-server").catch(() => {});
      await A.sleep(1);
      await A.adb("start-server").catch(() => {});
      await A.sleep(2);
      const raw = await A.adb("devices", "-l").catch((e) => "error: " + e.message);
      return send(res, 200, { ok: true, devices: raw });
    }
    if (req.method === "GET" && p === "/debug/mdns") {
      // Wi-Fi troubleshooting (read-only): adb version, mDNS backend, and the phones it can see.
      const r = async (...args) => A.adb(...args).catch((e) => "error: " + (e.stderr || e.message));
      return send(res, 200, { version: await r("version"), check: await r("mdns", "check"), services: await r("mdns", "services"), devices: await r("devices", "-l") });
    }
    if (req.method === "GET" && p === "/debug/adb") {
      const raw = await A.adb("devices", "-l").catch((e) => "error: " + e.message);
      return send(res, 200, { devices: raw });
    }

    if (req.method === "POST" && p === "/admin/restart") {
      // Exit; run-loop.bat starts the helper again with the newest code.
      send(res, 200, { ok: true, restarting: true, version: VERSION });
      if (active) active.cancel();
      setTimeout(() => process.exit(0), 300);
      return;
    }

    const m = p.match(/^\/precall\/runs\/([\w-]+)(\/events|\/cancel)?$/);
    if (m) {
      const run = runs.get(m[1]);
      if (!run) return send(res, 404, { error: "run not found" });
      if (req.method === "GET" && !m[2]) return send(res, 200, run.summary());
      if (req.method === "POST" && m[2] === "/cancel") { run.cancel(); return send(res, 200, { ok: true }); }
      if (req.method === "GET" && m[2] === "/events") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
        const push = (e) => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
        push({ type: "snapshot", runId: run.id, summary: run.summary() });
        if (["done", "failed", "cancelled"].includes(run.state)) return res.end();
        const onEvent = (e) => { push(e); if (e.type === "run" && e.state !== "running") res.end(); };
        run.on("event", onEvent);
        const ping = setInterval(() => res.write(": ping\n\n"), 15000);
        req.on("close", () => { clearInterval(ping); run.off("event", onEvent); });
        return;
      }
    }

    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

server.listen(cfg.port, "127.0.0.1", () => {
  console.log(`Harbor Helper v${VERSION} on http://127.0.0.1:${cfg.port}`);
  console.log(`Token: ${cfg.token}`);
  console.log(`Config: ${cfgStore.FILE}`);
});
