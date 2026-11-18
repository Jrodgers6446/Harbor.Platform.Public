'use client';
import { useCallback, useEffect, useState } from 'react';
import { CloseIcon } from './icons';
import { bridgeCall } from './util';

// The extension's "Phone connection" card and dialog. On the website every helper request goes through
// Harbor Bridge, which keeps the helper token.

type Dev = { transport: 'usb' | 'wifi'; state: string; model?: string; serial?: string };
type Status = { ok: boolean; title: string; sub: string; via?: string; raw?: any; noBridge?: boolean };

export async function helperStatus(): Promise<Status> {
  const r = await bridgeCall('helper', { path: '/status' });
  if (r.error === 'NO_BRIDGE') return { ok: false, title: 'Harbor Bridge not installed', sub: 'Download it from the download button', noBridge: true };
  if (!r.ok) {
    if (r.error === 'Helper token not set') return { ok: false, title: 'Helper token not set', sub: 'Open settings' };
    if (r.error === 'Wrong helper token') return { ok: false, title: 'Wrong helper token', sub: 'Open settings' };
    return { ok: false, title: 'Helper not running', sub: 'Start Harbor Helper on this PC' };
  }
  const j = r.data || {};
  const phone = j.device && j.device.state === 'device';
  return { ok: phone, title: phone ? 'Phone connected' : 'Helper running, no phone', via: phone ? j.device.transport : undefined,
    sub: phone ? '' : j.connection && j.connection.mode === 'wifi' ? 'Phone not found on Wi-Fi. Click to reconnect.' : 'Plug in the phone or set up Wi-Fi. Click for options.', raw: j };
}

export function usePhone() {
  const [s, set] = useState<Status | null>(null);
  const check = useCallback(async () => { const h = await helperStatus(); set(h); return h; }, []);
  useEffect(() => {
    // the Bridge marks the page as soon as it loads; give it a moment, then keep the card fresh
    const t0 = setTimeout(check, 600); const t = setInterval(check, 30000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, [check]);
  return { phone: s, check };
}

export function PhoneCard({ phone, onClick }: { phone: Status | null; onClick: () => void }) {
  const title = !phone ? 'Checking…' : phone.ok ? 'Connected' : 'Not connected';
  const tip = !phone ? '' : phone.ok ? `Phone connected${phone.via ? ' by ' + (phone.via === 'wifi' ? 'Wi-Fi' : 'cable') : ''}. Click to change.` : `${phone.title}. ${phone.sub || ''}`.trim();
  return (
    <button className="helper-card" title={tip} onClick={onClick}>
      <span className={'dot ' + (!phone ? '' : phone.ok ? 'ok' : 'bad')} /><b>{title}</b>
      <span className="via">{phone?.ok && phone.via ? (phone.via === 'wifi' ? 'Wi-Fi' : 'Cable') : ''}</span>
    </button>
  );
}

const MODES: [string, string, string][] = [
  ['auto', 'Automatic', 'Cable when it’s plugged in, Wi-Fi when it isn’t'],
  ['usb', 'Cable', 'USB cable only'],
  ['wifi', 'Wi-Fi', 'Wireless debugging, no cable'],
];

export function PhoneDialog({ onClose, onSettings, onDownloadBridge, onDownloadHelper, refreshCard }: { onClose: () => void; onSettings: () => void; onDownloadBridge: () => void; onDownloadHelper?: () => void; refreshCard: () => void }) {
  const [c, setC] = useState<any>(null);
  const [fail, setFail] = useState<Status | null>(null);
  const [msg, setMsg] = useState<{ t: string; k?: string }>({ t: '' });
  const [code, setCode] = useState(''); const [pairAddr, setPairAddr] = useState(''); const [addr, setAddr] = useState('');
  const [busy, setBusy] = useState(false);
  const api = async (path: string, method = 'GET', body?: unknown) => {
    const r = await bridgeCall('helper', { path, method, body }, 60000);
    if (!r.ok) throw new Error(r.error || 'Helper error');
    return r.data;
  };
  const load = useCallback(async () => {
    const r = await bridgeCall('helper', { path: '/connection' });
    if (!r.ok) { setFail(await helperStatus()); return; }
    setFail(null); setC(r.data); if (r.data?.lastWifi && !addr) setAddr(r.data.lastWifi);
  }, [addr]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const after = () => { load(); refreshCard(); };
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e: any) { setMsg({ t: e.message, k: 'bad' }); } finally { setBusy(false); } };

  const list: Dev[] = c?.devices || [];
  const usb = list.find((d) => d.transport === 'usb'), wifi = list.find((d) => d.transport === 'wifi');
  const using = c?.device?.state === 'device' ? c.device.transport : null;
  const st = (d?: Dev) => !d ? 'Not connected' : d.state === 'device' ? 'Connected' : d.state === 'unauthorized' ? 'Tap Allow on the phone' : d.state;
  const wifiOn = wifi?.state === 'device';
  const showSetup = c && c.mode !== 'usb' && !wifiOn;

  return (
    <div className="scrim center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-label="Phone connection">
        <div className="drawer-head"><h2>Phone connection</h2><button className="icon-btn" aria-label="Close" onClick={onClose}><CloseIcon /></button></div>
        <div className="modal-body">
          {fail ? (
            <div className="conn-row"><span className="dot bad" /><div className="w-grow"><b>{fail.noBridge ? 'Harbor Bridge isn’t installed' : fail.title === 'Helper not running' ? 'Harbor Helper isn’t running' : fail.title}</b>
              <div className="muted small">{fail.noBridge ? 'The website reaches Harbor Helper through the Bridge extension.' : fail.title === 'Helper not running' ? 'Installed already? Double-click restart-helper.bat in the harbor-helper folder. Not yet? Get it below.' : ''}</div></div>
              {fail.noBridge ? <button className="btn" onClick={onDownloadBridge}>Get Bridge</button> : fail.title === 'Helper not running' && onDownloadHelper ? <button className="btn" onClick={onDownloadHelper}>Get Helper</button> : <button className="btn" onClick={onSettings}>Helper settings</button>}</div>
          ) : !c ? <div className="w-empty">Checking…</div> : c.mode === undefined ? <div className="w-empty">Update Harbor Helper to choose cable or Wi-Fi (gear → Harbor Helper → Restart helper).</div> : (<>
            <div className="choices" role="radiogroup" aria-label="Connect the phone with">{MODES.map(([v, t, d]) => (
              <button key={v} className={'choice' + (c.mode === v ? ' on' : '')} role="radio" aria-checked={c.mode === v} disabled={busy}
                onClick={() => run(async () => {
                  setMsg({ t: v === 'usb' ? 'Switching to the cable…' : 'Switching…' });
                  const n = await api('/connection', 'POST', { mode: v }); setC(n);
                  const ok = n.device?.state === 'device';
                  setMsg({ t: ok ? `Using the ${n.device.transport === 'wifi' ? 'Wi-Fi' : 'cable'}.` : v === 'usb' ? 'Plug the phone in.' : v === 'wifi' ? 'Not on Wi-Fi yet. Set it up below.' : 'No phone found. Plug it in or set up Wi-Fi below.', k: ok ? 'ok' : 'bad' });
                  refreshCard();
                })}><b>{t}</b><span>{d}</span></button>))}</div>
            <div>
              <div className="conn-row"><span className={'dot ' + (usb?.state === 'device' ? 'ok' : 'bad')} /><div className="w-grow"><b>Cable{using === 'usb' ? ' · in use' : ''}</b><div className="muted small">{st(usb)}</div></div></div>
              <div className="conn-row"><span className={'dot ' + (wifiOn ? 'ok' : 'bad')} /><div className="w-grow"><b>Wi-Fi{using === 'wifi' ? ' · in use' : ''}</b><div className="muted small">{wifi ? st(wifi) : c.lastWifi ? 'Not connected right now' : 'Not set up yet'}</div></div>
                {c.lastWifi && !wifiOn && <button className="btn" disabled={busy} onClick={() => run(async () => { setMsg({ t: 'Looking for the phone on Wi-Fi…' }); const r = await api('/connection/reconnect', 'POST'); setMsg({ t: r.ok ? 'Connected over Wi-Fi.' : r.lastError || 'Not found.', k: r.ok ? 'ok' : 'bad' }); after(); })}>Reconnect</button>}
                {wifiOn && <button className="btn" disabled={busy} onClick={() => run(async () => { await api('/connection/disconnect-wifi', 'POST'); setMsg({ t: 'Wi-Fi disconnected.' }); after(); })}>Disconnect</button>}
              </div>
            </div>
          </>)}
          {msg.t && <div className={'msg ' + (msg.k || '')}>{msg.t}</div>}
          {showSetup && (
            <div className="panel-box">
              <b>Set up Wi-Fi</b>
              <ol className="steps"><li>Phone and this PC on the same Wi-Fi.</li><li>On the phone: Settings &gt; Developer options &gt; <b>Wireless debugging</b> &gt; turn on.</li><li>Tap <b>Pair device with pairing code</b> and keep that screen open.</li><li>Type the 6-digit code here.</li></ol>
              <div className="row" style={{ alignItems: 'center' }}><input className="code-in" inputMode="numeric" maxLength={7} placeholder="000000" aria-label="Pairing code" value={code} onChange={(e) => setCode(e.target.value)} />
                <button className="btn primary" disabled={busy} onClick={() => run(async () => {
                  setMsg({ t: 'Pairing…' });
                  try { const r = await api('/connection/pair', 'POST', { code, address: pairAddr.trim() || undefined }); setMsg({ t: r.device?.transport === 'wifi' ? 'Paired and connected over Wi-Fi.' : 'Paired. Connecting over Wi-Fi…', k: 'ok' }); after(); }
                  catch (e: any) { setMsg({ t: e.message, k: /^Paired/.test(e.message) ? 'ok' : 'bad' }); }
                })}>Pair</button></div>
              <details><summary className="muted small" style={{ cursor: 'pointer' }}>Pairing can’t find the phone?</summary>
                <label className="f" style={{ marginTop: 8 }}>IP address &amp; port (shown under the code)<input placeholder="192.168.1.20:37123" value={pairAddr} onChange={(e) => setPairAddr(e.target.value)} /></label></details>
              <div className="step2"><b>Then connect</b><div className="muted small">On the phone’s <b>Wireless debugging</b> screen (not the pairing box), copy the <b>IP address &amp; Port</b> at the top. Only needed if Harbor doesn’t connect by itself, or after Wireless debugging was turned off and on.</div>
                <div className="row" style={{ alignItems: 'center' }}><input placeholder="192.168.1.23:41567" aria-label="IP address and port" value={addr} onChange={(e) => setAddr(e.target.value)} />
                  <button className="btn primary" disabled={busy} onClick={() => run(async () => { setMsg({ t: 'Connecting…' }); await api('/connection/connect', 'POST', { address: addr.trim() }); setMsg({ t: 'Connected over Wi-Fi.', k: 'ok' }); after(); })}>Connect</button></div></div>
              {usb?.state === 'device' && (<><div className="row" style={{ alignItems: 'center' }}><span className="muted small">Cable plugged in? Skip the code:</span>
                <button className="btn" disabled={busy} onClick={() => run(async () => { setMsg({ t: 'Switching the phone to Wi-Fi…' }); await api('/connection/from-cable', 'POST'); setMsg({ t: 'Wi-Fi is on. You can unplug the cable.', k: 'ok' }); after(); })}>Turn on Wi-Fi using the cable</button></div>
                <div className="muted small">(This way lasts until the phone restarts. Pairing with the code lasts.)</div></>)}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
