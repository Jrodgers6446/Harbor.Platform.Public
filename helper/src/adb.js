// Thin ADB wrapper: screen dumps, taps, typing, keys. No npm packages.
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

async function adb(...args) {
  const { stdout } = await run("adb", args, { maxBuffer: 32 * 1024 * 1024, timeout: 30000, windowsHide: true });
  return stdout;
}
const shell = (...a) => adb("shell", ...a);

const decode = (s) =>
  s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/&#10;/g, " ").replace(/&amp;/g, "&");

// ---------------------------------------------------------------- which phone connection to use
// The phone can be on the USB cable, on Wi-Fi (Android "Wireless debugging"), or both at once (then adb
// sees it twice). mode: "auto" (cable first, Wi-Fi when unplugged) | "usb" | "wifi".
// The chosen serial goes in ANDROID_SERIAL, which adb (and the uiautomator2 bridge) use for every command.
const conn = { mode: "auto", serial: null, lastTry: 0, lastWifi: null, phone: null, onSave: null, lastError: null, okWifi: new Set() };
const isWifi = (serial) => /:\d+$|_adb-tls-connect/.test(serial || "");

function setMode(mode, lastWifi, phone) {
  if (["auto", "usb", "wifi"].includes(mode)) conn.mode = mode;
  if (lastWifi !== undefined) conn.lastWifi = lastWifi;
  if (phone !== undefined) conn.phone = phone;
  conn.lastTry = 0;
}

/** Every phone adb can see: [{ serial, state, transport: "usb"|"wifi", model }] */
async function devices() {
  let out;
  try { out = await run("adb", ["devices", "-l"], { timeout: 15000, windowsHide: true }).then((r) => r.stdout); } catch (e) {
    if (e.code === "ENOENT") throw new Error("adb not found on PATH");
    throw e;
  }
  return out.split(/\r?\n/).slice(1).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [serial, state] = l.split(/\s+/);
    return { serial, state, transport: isWifi(serial) ? "wifi" : "usb", model: (l.match(/model:(\S+)/) || [])[1] || null };
  }).filter((d) => d.serial && d.state);
}

function select(serial) {
  if (serial === conn.serial) return;
  conn.serial = serial;
  if (serial) process.env.ANDROID_SERIAL = serial; else delete process.env.ANDROID_SERIAL;
  // the fast bridge is tied to one connection; restart it on the new one
  if (bridge.proc) { try { bridge.proc.kill(); } catch {} }
  bridge.ready = false; bridge.failures = 0;
}

/** Hardware serial of a connected device (the same over cable and Wi-Fi). */
async function serialOf(target) {
  try { return (await run("adb", ["-s", target, "shell", "getprop", "ro.serialno"], { timeout: 8000, windowsHide: true })).stdout.trim() || null; } catch { return null; }
}

/** Look for the phone on Wi-Fi (mDNS) and connect. Throttled so status checks stay quick.
 *  Only ever connects to the phone that was paired / set up (conn.phone): on shared Wi-Fi another device
 *  could advertise itself, and customer messages must never be typed into it. */
async function ensureWifi(force = false) {
  if (!force && Date.now() - conn.lastTry < 15000) return false;
  conn.lastTry = Date.now();
  if (!conn.phone) { conn.lastError = "Wi-Fi isn't set up yet. Pair the phone first."; return false; }
  const addrs = [];
  try {
    const out = (await run("adb", ["mdns", "services"], { timeout: 8000, windowsHide: true })).stdout;
    for (const m of out.matchAll(/^(\S+)\s+_adb-tls-connect\._tcp\.?\s+([\d.]+:\d+)/gm)) if (m[1].includes(conn.phone)) addrs.push(m[2]);
  } catch {}
  if (conn.lastWifi && !addrs.includes(conn.lastWifi)) addrs.push(conn.lastWifi);
  for (const a of addrs) {
    try {
      const out = (await run("adb", ["connect", a], { timeout: 10000, windowsHide: true })).stdout;
      if (/connected to/i.test(out)) {
        if ((await serialOf(a)) !== conn.phone) { // not our phone: drop it
          await run("adb", ["disconnect", a], { timeout: 8000, windowsHide: true }).catch(() => {});
          conn.lastError = `Ignored a different device at ${a}`;
          continue;
        }
        conn.lastError = null; conn.okWifi.add(a);
        if (a !== conn.lastWifi) { conn.lastWifi = a; conn.onSave && conn.onSave({ lastWifi: a }); }
        await sleep(1);
        return true;
      }
      conn.lastError = out.trim();
    } catch (e) { conn.lastError = e.message; }
  }
  if (!addrs.length) conn.lastError = "Phone not found on Wi-Fi (is Wireless debugging on, on the same Wi-Fi?)";
  return false;
}

function pick(list) {
  // Wi-Fi entries only count when they're the paired phone (checked when connecting; see ensureWifi).
  const ok = list.filter((d) => d.state === "device" && (d.transport === "usb" || conn.okWifi.has(d.serial)));
  const usb = ok.find((d) => d.transport === "usb"), wifi = ok.find((d) => d.transport === "wifi");
  return conn.mode === "usb" ? usb : conn.mode === "wifi" ? wifi : (usb || wifi);
}

/** The phone Harbor will use right now (or null). Reconnects Wi-Fi when that's allowed. */
async function device() {
  let list = await devices();
  // verify any Wi-Fi connection we haven't checked yet (e.g. adb reconnected it by itself)
  for (const d of list) {
    if (d.transport !== "wifi" || d.state !== "device" || conn.okWifi.has(d.serial)) continue;
    if (conn.phone && (await serialOf(d.serial)) === conn.phone) conn.okWifi.add(d.serial);
  }
  let d = pick(list);
  if (!d && conn.mode !== "usb" && (await ensureWifi())) { list = await devices(); d = pick(list); }
  if (!d) {
    select(null);
    const want = list.find((x) => conn.mode === "auto" || x.transport === conn.mode);
    if (want && want.state === "unauthorized") return { state: "unauthorized", transport: want.transport };
    return null;
  }
  select(d.serial);
  return { state: "device", serial: d.serial, model: d.model, transport: d.transport };
}

/** Pair with "Wireless debugging > Pair device with pairing code". Finds the pairing address by itself
 *  when the phone's pairing screen is open; `address` (ip:port) is only needed if that doesn't work. */
async function pair(code, address) {
  code = String(code || "").replace(/\D/g, "");
  if (code.length !== 6) throw new Error("The pairing code is 6 digits");
  let addr = address;
  if (!addr) {
    for (let i = 0; i < 4 && !addr; i++) {
      try {
        const out = (await run("adb", ["mdns", "services"], { timeout: 8000, windowsHide: true })).stdout;
        addr = (out.match(/_adb-tls-pairing\._tcp\.?\s+([\d.]+:\d+)/) || [])[1];
      } catch {}
      if (!addr) await sleep(1.5);
    }
  }
  if (!addr) throw new Error("Couldn't find the phone's pairing screen on Wi-Fi. Keep the pairing code on screen, or type the IP address & port shown under the code.");
  const out = (await run("adb", ["pair", addr, code], { timeout: 20000, windowsHide: true })).stdout;
  if (!/success/i.test(out)) throw new Error(out.trim() || "Pairing failed");
  await sleep(2);
  // Find the phone we just paired (its mDNS name carries its serial) and remember it as THE phone.
  let found = null;
  for (let i = 0; i < 5 && !found; i++) {
    try {
      const ms = (await run("adb", ["mdns", "services"], { timeout: 8000, windowsHide: true })).stdout;
      const ip = addr.split(":")[0];
      const m = [...ms.matchAll(/^(\S+)\s+_adb-tls-connect\._tcp\.?\s+([\d.]+:\d+)/gm)].find((x) => x[2].startsWith(ip + ":"));
      if (m) {
        const c = (await run("adb", ["connect", m[2]], { timeout: 10000, windowsHide: true })).stdout;
        if (/connected to/i.test(c)) found = { addr: m[2], serial: await serialOf(m[2]) };
      }
    } catch {}
    if (!found) await sleep(1.5);
  }
  if (!found || !found.serial) {
    const e = new Error("Paired. Now type the IP address & Port shown at the top of the phone's Wireless debugging screen (not the pairing code box).");
    e.needAddress = true; throw e;
  }
  conn.phone = found.serial; conn.lastWifi = found.addr; conn.lastError = null; conn.okWifi.add(found.addr);
  conn.onSave && conn.onSave({ phone: conn.phone, lastWifi: conn.lastWifi });
  return { paired: true, address: addr };
}

/** With the cable plugged in: switch the phone to Wi-Fi mode on port 5555 and connect (lasts until the phone restarts). */
async function wifiFromCable() {
  const list = await devices();
  const usb = list.find((d) => d.transport === "usb" && d.state === "device");
  if (!usb) throw new Error("Plug the phone in with the cable first");
  const serial = (await serialOf(usb.serial)) || usb.serial;
  const ipOut = (await run("adb", ["-s", usb.serial, "shell", "ip", "-f", "inet", "addr", "show", "wlan0"], { timeout: 10000, windowsHide: true })).stdout;
  const ip = (ipOut.match(/inet ([\d.]+)/) || [])[1];
  if (!ip) throw new Error("The phone isn't on Wi-Fi");
  await run("adb", ["-s", usb.serial, "tcpip", "5555"], { timeout: 15000, windowsHide: true });
  await sleep(3);
  const out = (await run("adb", ["connect", `${ip}:5555`], { timeout: 10000, windowsHide: true })).stdout;
  if (!/connected to/i.test(out)) throw new Error(out.trim() || "Couldn't connect over Wi-Fi");
  if ((await serialOf(`${ip}:5555`)) !== serial) { await run("adb", ["disconnect", `${ip}:5555`]).catch(() => {}); throw new Error("Connected to a different device on Wi-Fi; disconnected it."); }
  conn.okWifi.add(`${ip}:5555`); conn.phone = serial; conn.lastWifi = `${ip}:5555`; conn.onSave && conn.onSave({ phone: conn.phone, lastWifi: conn.lastWifi });
  return { address: conn.lastWifi };
}

/** Connect to the address shown on the phone's Wireless debugging screen (when the PC can't find it on its own). */
async function connectAddress(address) {
  const out = (await run("adb", ["connect", address], { timeout: 12000, windowsHide: true })).stdout;
  if (!/connected to/i.test(out)) throw new Error(/refused|failed|cannot/i.test(out) ? "The phone didn't answer at " + address + ". Check the address on the Wireless debugging screen (it changes when Wireless debugging is turned off and on) and that both are on the same Wi-Fi." : out.trim());
  const serial = await serialOf(address);
  if (!serial) { await run("adb", ["disconnect", address]).catch(() => {}); throw new Error("Connected, but the phone didn't respond. Tap Allow on the phone if it asks, then try again."); }
  if (conn.phone && serial !== conn.phone) { await run("adb", ["disconnect", address]).catch(() => {}); throw new Error("That address is a different phone than the one set up for Harbor. If you switched phones, pair the new one."); }
  conn.okWifi.add(address); conn.phone = serial; conn.lastWifi = address; conn.lastError = null;
  conn.onSave && conn.onSave({ phone: conn.phone, lastWifi: conn.lastWifi });
  return { address, serial };
}

async function disconnectWifi() {
  await run("adb", ["disconnect"], { timeout: 10000, windowsHide: true }).catch(() => {});
  conn.lastTry = Date.now(); // don't reconnect straight away
}

const connection = () => ({ mode: conn.mode, paired: !!conn.phone, serial: conn.serial, transport: conn.serial ? (isWifi(conn.serial) ? "wifi" : "usb") : null, lastWifi: conn.lastWifi, lastError: conn.lastError });

async function screenSize() {
  if (bridge.ready && bridge.failures < 3) {
    try { const r = await call("size", {}, 8); if (r && r.w && r.h) return { w: r.w, h: r.h }; } catch { bridge.failures++; }
  }
  // Fallback: wm size is the panel in portrait; swap when the display is rotated sideways.
  const m = (await shell("wm", "size")).match(/(\d+)x(\d+)/g).pop().match(/(\d+)x(\d+)/);
  let w = Number(m[1]), h = Number(m[2]);
  const rot = (await shell("dumpsys", "input").catch(() => "")).match(/SurfaceOrientation:\s*(\d)/);
  if (rot && (rot[1] === "1" || rot[1] === "3")) [w, h] = [h, w];
  return { w, h };
}

/** Wait for the phone to come back after a USB hiccup. */
async function waitForDevice(seconds = 90) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    try { const d = await device(); if (d && d.state === "device") return true; } catch {}
    await sleep(3);
  }
  return false;
}

/** Close the notification shade / quick settings if someone pulled it down. */
const collapseShade = () => shell("cmd", "statusbar", "collapse").catch(() => {});

/** Wake the screen; returns false if it's locked behind a PIN/biometric. */
async function ensureAwake() {
  const power = await shell("dumpsys", "power");
  if (!/mWakefulness=Awake/.test(power)) {
    await shell("input", "keyevent", "224"); // WAKEUP
    await sleep(1);
  }
  const win = await shell("dumpsys", "window").catch(() => "");
  const locked = /mDreamingLockscreen=true|isKeyguardShowing=true|mShowingLockscreen=true/.test(win);
  return !locked;
}

function parseNodes(xml) {
  return [...xml.matchAll(/<node ([^>]*?)\/?>/g)].map(([, attrs]) => {
    const a = {};
    for (const [, k, v] of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) a[k] = decode(v);
    const [x1, y1, x2, y2] = (a.bounds || "[0,0][0,0]").match(/\d+/g).map(Number);
    return {
      cls: a.class || "", text: a.text || "", desc: a["content-desc"] || "", id: a["resource-id"] || "",
      x: (x1 + x2) >> 1, y: (y1 + y2) >> 1, x1, y1, x2, y2, w: x2 - x1, h: y2 - y1,
      pkg: a.package || "",
    };
  });
}

// ---------------------------------------------------------------- fast path: uiautomator2 bridge (python)
// Keeps one uiautomator2 session open (src/u2bridge.py). Screen reads drop from 1-3 s to ~0.3 s and text
// goes in as one piece. If python / uiautomator2 isn't available, everything falls back to plain adb.
const { spawn } = require("node:child_process");
const path = require("node:path");
const bridge = { proc: null, ready: false, error: null, seq: 0, waiting: new Map(), buf: "", info: null, failures: 0, starting: null };

function startBridge() {
  if (bridge.starting) return bridge.starting;
  bridge.starting = new Promise((resolve) => {
    let settled = false;
    const done = (ok, err) => { if (settled) return; settled = true; bridge.ready = ok; bridge.error = err || null; bridge.starting = null; resolve(ok); };
    let p;
    try { p = spawn(process.env.HARBOR_PYTHON || "python", ["-u", path.join(__dirname, "u2bridge.py")], { windowsHide: true }); }
    catch (e) { return done(false, e.message); }
    bridge.proc = p; bridge.buf = "";
    p.on("error", (e) => done(false, "python not available: " + e.message));
    p.on("exit", () => { bridge.ready = false; bridge.proc = null; bridge.waiting.forEach((w) => w.reject(new Error("bridge exited"))); bridge.waiting.clear(); done(false, bridge.error || "bridge exited"); });
    p.stderr.on("data", () => {});
    p.stdout.on("data", (chunk) => {
      bridge.buf += chunk.toString();
      let i;
      while ((i = bridge.buf.indexOf("\n")) >= 0) {
        const line = bridge.buf.slice(0, i); bridge.buf = bridge.buf.slice(i + 1);
        let m; try { m = JSON.parse(line); } catch { continue; }
        if ("ready" in m) { bridge.info = m; done(!!m.ready, m.error); continue; }
        const w = bridge.waiting.get(m.id); if (!w) continue;
        bridge.waiting.delete(m.id); clearTimeout(w.timer);
        m.ok ? w.resolve(m.result) : w.reject(new Error(m.error));
      }
    });
    setTimeout(() => done(false, "bridge took too long to start"), 45000);
  });
  return bridge.starting;
}

function call(cmd, args, timeoutSec = 15) {
  return new Promise((resolve, reject) => {
    if (!bridge.proc || !bridge.ready) return reject(new Error("bridge not ready"));
    const id = ++bridge.seq;
    const timer = setTimeout(() => { bridge.waiting.delete(id); reject(new Error("bridge timeout: " + cmd)); }, timeoutSec * 1000);
    bridge.waiting.set(id, { resolve, reject, timer });
    bridge.proc.stdin.write(JSON.stringify({ id, cmd, args }) + "\n");
  });
}

/** Use the bridge when it works; after 3 failures in a row, stop using it until the next run. */
async function viaBridge(cmd, args, fallback, timeoutSec) {
  if (bridge.ready && bridge.failures < 3) {
    try { const r = await call(cmd, args, timeoutSec); bridge.failures = 0; return r; }
    catch (e) { bridge.failures++; }
  }
  return fallback();
}

async function prepare() {
  bridge.failures = 0;
  if (!bridge.ready && process.env.HARBOR_NO_BRIDGE !== "1") await startBridge();
  return engine();
}
const engine = () => (bridge.ready && bridge.failures < 3 ? "uiautomator2" : `adb${bridge.error ? " (" + bridge.error + ")" : ""}`);

/** Dump the UI tree as a flat node list. Retries because WebView content can lag. */
async function dump(retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const xml = await viaBridge("dump", {}, () => adb("exec-out", "uiautomator", "dump", "/dev/tty"), 12);
      if (/could not get idle state|ERROR/i.test(xml) && !/<node/.test(xml)) throw new Error(xml.trim());
      const nodes = parseNodes(xml);
      if (nodes.length > 5) return nodes;
    } catch (e) { lastErr = e; if (/no devices|device offline|not found/i.test(e.message)) throw e; }
    await sleep(0.6);
  }
  if (lastErr && /idle state|already|registered/i.test(lastErr.message))
    throw new Error("Screen reader busy - close uiautodev / other automation tools");
  return [];
}

const tap = (n) => viaBridge("click", { x: n.x, y: n.y }, () => shell("input", "tap", String(n.x), String(n.y)));
const back = () => viaBridge("back", {}, () => shell("input", "keyevent", "4"));
const swipe = (x1, y1, x2, y2, ms = 400) => viaBridge("swipe", { x1: Math.round(x1), y1: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2), duration: ms / 1000 },
  () => shell("input", "swipe", ...[x1, y1, x2, y2, ms].map((v) => String(Math.round(v)))));

/** Type ASCII text. Split into word-sized chunks FIRST, then escape each chunk, so a chunk never
 *  ends in the middle of an escape or a "%s" space code. Short pause between chunks so the page keeps up. */
const escapeForInput = (t) => t.replace(/([\\'"`$&|;()<>*?~!#[\]{}^%])/g, "\\$1").replace(/ /g, "%s");
/** Put the whole message in the focused box at once (bridge). Returns false if the bridge isn't available. */
async function setText(text) {
  if (!(bridge.ready && bridge.failures < 3)) return false;
  try { await call("type", { text, clear: true }, 20); return true; } catch { bridge.failures++; return false; }
}

/** Paste the text through the phone's clipboard (bridge only). Returns false when the bridge isn't available. */
async function pasteText(text) {
  if (!(bridge.ready && bridge.failures < 3)) return false;
  try { await call("paste", { text }, 15); return true; } catch { bridge.failures++; return false; }
}
/** Accessibility "set text" on the focused field (bridge only). */
async function setTextFocused(text) {
  if (!(bridge.ready && bridge.failures < 3)) return false;
  try { return !!(await call("settext", { text }, 15)); } catch { bridge.failures++; return false; }
}

/** Key-by-key typing, slow: small chunks with long pauses so keyboards like Gboard keep up. */
async function typeSlow(text) {
  if (/[^\x20-\x7E]/.test(text)) throw new Error("Message has non-ASCII characters (emoji, smart quotes) - adb can't type them");
  const words = text.split(/(?<= )/);
  const chunks = []; let cur = "";
  for (const w of words) { if (cur && (cur + w).length > 18) { chunks.push(cur); cur = ""; } cur += w; }
  if (cur) chunks.push(cur);
  for (const c of chunks) { await shell("input", "text", escapeForInput(c)); await sleep(0.7); }
}

async function type(text) {
  if (/[^\x20-\x7E]/.test(text)) throw new Error("Message has non-ASCII characters (emoji, smart quotes) - adb can't type them");
  const words = text.split(/(?<= )/); // keep the trailing space on each word
  const chunks = []; let cur = "";
  for (const w of words) { if (cur && (cur + w).length > 60) { chunks.push(cur); cur = ""; } cur += w; }
  if (cur) chunks.push(cur);
  for (const c of chunks) {
    await shell("input", "text", escapeForInput(c));
    await sleep(0.25);
  }
}

async function clearFocused() {
  if (bridge.ready && bridge.failures < 3) { try { await call("clear", {}, 8); return; } catch { bridge.failures++; } }
  await shell("input", "keycombination", "113", "29").catch(() => {}); // Ctrl+A
  await shell("input", "keyevent", "67");                             // Del
}

/** Screenshot (PNG buffer) and raw UI XML, for failure reports. */
async function screencap() {
  const { stdout } = await run("adb", ["exec-out", "screencap", "-p"], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024, timeout: 30000, windowsHide: true });
  return stdout;
}
async function rawXml() {
  // while the fast bridge holds the screen reader, a plain adb dump gets killed, so ask the bridge
  if (bridge.ready && bridge.failures < 3) { try { return await call("dump", {}, 12); } catch {} }
  try { return await adb("exec-out", "uiautomator", "dump", "/dev/tty"); } catch (e) { return "dump failed: " + e.message; }
}

const launch = (pkg) => shell("monkey", "-p", pkg, "-c", "android.intent.category.LAUNCHER", "1");
const currentPackage = async () => {
  const out = await shell("dumpsys", "window").catch(() => "");
  return (out.match(/mCurrentFocus=.*?\s([\w.]+)\//) || [])[1] || null;
};

module.exports = { pasteText, setTextFocused, typeSlow, connectAddress, conn, setMode, devices, pair, wifiFromCable, disconnectWifi, ensureWifi, connection, isWifi, prepare, engine, setText, waitForDevice, collapseShade, parseNodes, escapeForInput, screencap, rawXml, adb, shell, sleep, device, screenSize, ensureAwake, dump, tap, back, swipe, type, clearFocused, launch, currentPackage };
