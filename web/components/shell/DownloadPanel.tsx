'use client';
import { useEffect, useState } from 'react';
import { CloseIcon, Icon, TabletIcon } from './icons';
import { appDownloadQr, createTabletInvite } from '@/lib/actions';

const RELEASES = `${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co'}/storage/v1/object/public/releases`;
export const BRIDGE_ZIP = `${RELEASES}/bridge/harbor-bridge.zip`;
export const HELPER_ZIP = `${RELEASES}/helper/harbor-helper.zip`;

type Qr = { url: string; svg: string; expiresAt?: string } | null;

/** Download button: pick Tablet (QR that installs the app and pairs it), Helper, or Bridge (the Chrome extension zip). */
export function DownloadPanel({ manager, demo = false, start = null, onClose }: { manager: boolean; demo?: boolean; start?: 'tablet' | 'bridge' | 'helper' | null; onClose: () => void }) {
  const [pick, setPick] = useState<'tablet' | 'bridge' | 'helper' | null>(start);
  const [qr, setQr] = useState<Qr>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const pairs = manager && !demo;

  async function makeQr() {
    setBusy(true); setErr('');
    const r = pairs ? await createTabletInvite() : await appDownloadQr();
    setBusy(false);
    if (!r.ok) return setErr((r as { error: string }).error);
    setQr(r as Qr);
  }
  useEffect(() => { if (pick === 'tablet' && !qr) makeQr(); }, [pick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = qr?.expiresAt ? Math.max(0, Date.parse(qr.expiresAt) - now) : null;
  const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

  return (
    <div className="scrim center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-label="Downloads">
        <div className="drawer-head">
          {pick && <button className="icon-btn ghost" aria-label="Back" onClick={() => { setPick(null); setQr(null); setErr(''); }} style={{ marginLeft: 0 }}>‹</button>}
          <h2>{pick === 'tablet' ? 'Tablet app' : pick === 'bridge' ? 'Harbor Bridge' : pick === 'helper' ? 'Harbor Helper' : 'Download'}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="modal-body">
          {!pick && (<>
            <div className="muted">What are you setting up?</div>
            <div className="dl-choices">
              <button className="dl-choice" onClick={() => setPick('tablet')}><TabletIcon /><b>Tablet</b><span>A QR code the tablet scans to install Harbor{pairs ? ' and pair to Devices automatically' : ''}.</span></button>
              <button className="dl-choice" onClick={() => setPick('helper')}><Icon name="precall" size={26} /><b>Helper</b><span>The program on this PC that drives the phone for {demo ? 'customer texts' : 'Pre-call'}.</span></button>
              <button className="dl-choice" onClick={() => setPick('bridge')}><Icon name="bridge" size={26} /><b>Bridge</b><span>The Chrome extension that connects your scheduling and work-order systems.</span></button>
            </div>
          </>)}

          {pick === 'tablet' && (<>
            {err && <div className="msg bad">{err}</div>}
            {!qr && !err && <div className="w-empty">Making a code…</div>}
            {qr && (<>
              <div className="qr-box" dangerouslySetInnerHTML={{ __html: qr.svg }} aria-label="QR code" />
              {pairs ? (<>
                <ol className="steps">
                  <li>Open the tablet&apos;s camera and point it at this code. Tap the link.</li>
                  <li>Tap <b>Download app</b>, open the file and allow installing.</li>
                  <li>Back on that page, tap <b>Open Harbor</b>. The tech signs in with their emailed code and the tablet shows up in Devices, already approved.</li>
                </ol>
                <div className="row" style={{ alignItems: 'center' }}>
                  <span className={'small ' + (left === 0 ? 'bad' : 'muted')}>{left === 0 ? 'This code has expired.' : `Works once · expires in ${mmss(left || 0)}`}</span>
                  <button className="btn sm" style={{ flex: 'none' }} disabled={busy} onClick={makeQr}>New code</button>
                </div>
              </>) : (
                <ol className="steps"><li>Scan this with the tablet&apos;s camera and download the app.</li><li>{demo ? 'Signed-in managers get a code that also pairs the tablet automatically.' : 'Ask your manager to approve the tablet in Devices when it shows its 6-digit code.'}</li></ol>
              )}
              <div className="small faint" style={{ overflowWrap: 'anywhere' }}>{qr.url}</div>
            </>)}
          </>)}

          {pick === 'helper' && (<>
            <a className="btn primary" href={HELPER_ZIP} download>Download harbor-helper.zip</a>
            <ol className="steps">
              <li>Unzip it somewhere it will stay, like <b>Documents\harbor-helper</b>.</li>
              <li>Double-click <b>setup.bat</b>. It installs what it needs, starts the helper, and starts it again every time you log in.</li>
              <li>Copy the <b>token</b> it shows at the end.</li>
              <li>Here: gear → <b>Harbor Helper</b> → paste the token → <b>Save &amp; test</b>. (Needs Harbor Bridge on this PC.)</li>
              <li>Plug in the phone with USB debugging on, or set up Wi-Fi from the Phone connection card at the bottom of the sidebar.</li>
            </ol>
            <div className="small muted">Windows only. The helper only listens on this PC, and the token never leaves it.</div>
          </>)}

          {pick === 'bridge' && (<>
            <a className="btn primary" href={BRIDGE_ZIP} download>Download harbor-bridge.zip</a>
            <ol className="steps">
              <li>Unzip the file (right-click → Extract All). Keep the folder somewhere it won&apos;t be deleted.</li>
              <li>In Chrome open <b>chrome://extensions</b> and turn on <b>Developer mode</b> (top right).</li>
              <li>Click <b>Load unpacked</b> and pick the unzipped folder.</li>
              <li>Click the Bridge icon, pick each system your company uses and click <b>Add</b> (Chrome asks to allow that one site). Click <b>Open</b> and sign in once.</li>
              <li>Come back here and press the refresh button at the top. It reads every connection, and opens any that need you to sign in again.</li>
            </ol>
            <div className="small muted">Read-only: Bridge never changes anything in the systems it reads.</div>
          </>)}
        </div>
      </section>
    </div>
  );
}
