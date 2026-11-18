'use client';
import { useState } from 'react';
import { CloseIcon } from './icons';

export function Drawer({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="drawer" role="dialog" aria-label={title}>
        <div className="drawer-head"><h2>{title}</h2>{sub && <span className="muted">{sub}</span>}<button className="icon-btn" aria-label="Close" onClick={onClose}><CloseIcon /></button></div>
        {children}
      </section>
    </div>
  );
}

export type SettingsTab = { id: string; label: string; body: React.ReactNode };
export function SettingsDrawer({ tabs, initial, onClose }: { tabs: SettingsTab[]; initial?: string; onClose: () => void }) {
  const [on, setOn] = useState(initial || tabs[0]?.id);
  const cur = tabs.find((t) => t.id === on) || tabs[0];
  return (
    <Drawer title="Settings" sub="all modules" onClose={onClose}>
      <div className="drawer-body">
        <div className="tabs">{tabs.map((t) => <button key={t.id} className={'tab' + (t.id === cur.id ? ' on' : '')} onClick={() => setOn(t.id)}>{t.label}</button>)}</div>
        <div className="tab-body">{cur.body}</div>
      </div>
    </Drawer>
  );
}

const FAQ: { g: string; q: string; a: string }[] = [
  { g: 'Getting around', q: 'What is this site?', a: 'The Harbor website is the same Harbor you know from the Chrome extension, for your whole store. The sidebar lists the modules. Your store has its own module (it has your store’s name) with employees, tablets, daily sheets, repair guides and store settings.' },
  { g: 'Getting around', q: 'What does the day picker do?', a: 'It picks which day Home, Route Planner and RT Daily Sheet show. It starts on tomorrow, like the extension. Use the arrows or click the date.' },
  { g: 'Getting around', q: 'How long do I stay signed in?', a: 'Signing in is a one-time thing on each computer. You stay signed in for 30 days after your last visit. Use Settings → Account → Sign out on a shared computer.' },
  { g: 'Bridge', q: 'What is Harbor Bridge?', a: 'A small Chrome extension for the website. It reads your dispatch system and repair portal in your own browser and copies the day’s jobs and work orders to Harbor, and it lets the website talk to Harbor Helper for the Phone connection card. The website never sees your dispatch or portal password or the helper token.' },
  { g: 'Getting around', q: 'What is the Phone connection card?', a: 'Same as the extension: it shows whether Harbor Helper on this PC can reach the phone (cable or Wi-Fi). Click it to switch between cable and Wi-Fi or set up Wi-Fi. Settings → Harbor Helper holds the helper address and token.' },
  { g: 'Bridge', q: 'What does the refresh button do?', a: 'It reads the picked day from every system you added to Harbor Bridge (for this store: the dispatch system, then the repair portal). If one has signed you out, its tab comes up so you can sign in again; press the button again after. The dot is green when all are fresh, yellow after two hours, and red when one hasn’t been read yet.' },
  { g: 'Bridge', q: 'How do I install Bridge?', a: 'Download button (top right) → Bridge. Unzip the file, open chrome://extensions, turn on Developer mode, click Load unpacked and pick the unzipped folder. Then click the Bridge icon and add the systems you use (the dispatch system and the repair portal here); Chrome asks to allow each site once.' },
  { g: 'Bridge', q: 'Which modules need Bridge?', a: 'Pre-call and Tech Dashboard read live from the dispatch system and the portal, so they need Bridge. RT Daily Sheet and Route Planner show what was sent to the tablets, which works without it.' },
  { g: 'Your store', q: 'How do I add a tech?', a: 'Open your store’s module → Employees → Add someone. They sign in on the tablet with a code we email them, then type your store code (Store settings).' },
  { g: 'Your store', q: 'How do I set up a tablet?', a: 'Download button (top right) → Tablet shows a QR code. Scan it with the tablet’s camera, install the app, then tap Open Harbor on the same page. The tech signs in with their emailed code and the tablet is approved automatically. The code works once and lasts 30 minutes.' },
  { g: 'Your store', q: 'How does a tablet get approved without the QR?', a: 'The tablet shows a 6-digit code. Open Devices (or your store → Tablets) and approve the one with the matching code.' },
];
// The demo's help: the same ideas, without naming any company's systems.
const FAQ_GENERIC: { g: string; q: string; a: string }[] = [
  { g: 'Getting around', q: 'What is Harbor?', a: 'One place for a field service team: routes, daily paperwork forms, pre-visit confirmations, tech results and the techs’ tablets. Each location gets its own module with its people, paperwork, repair guides and settings.' },
  { g: 'Getting around', q: 'What does the day picker do?', a: 'It picks which day Home, Route Planner and Daily Paperwork show. It starts on tomorrow, because that’s the day you plan.' },
  { g: 'Getting around', q: 'How long do I stay signed in?', a: 'Signing in is a one-time thing on each computer: you stay signed in for 30 days after your last visit.' },
  { g: 'Bridge', q: 'What is Harbor Bridge?', a: 'A small Chrome extension that reads the scheduling and work-order systems your company already uses, in your own browser, and keeps Harbor up to date. Your passwords for those systems never leave your browser.' },
  { g: 'Bridge', q: 'What does the refresh button do?', a: 'It reads the picked day from your systems through Bridge. If one of them has signed you out, Bridge opens it so you can sign back in.' },
  { g: 'Tablets', q: 'How do I set up a tablet?', a: 'Download button → Tablet shows a QR code. Scan it with the tablet, install the app and open it from the same page. The tech signs in with an emailed code and the tablet is approved automatically.' },
  { g: 'Tablets', q: 'What do techs do on the tablet?', a: 'Fill in their daily paperwork form as they go (parts, outcome, reasons), follow their route, and use repair guides. The manager signs the paperwork off at the end of the day.' },
  { g: 'Phone', q: 'What is the Phone connection card?', a: 'Harbor Helper on the manager’s PC can drive a phone for texting customers. The card shows whether the phone is connected by cable or Wi-Fi.' },
];

export function HelpDrawer({ onClose, generic = false }: { onClose: () => void; generic?: boolean }) {
  const [q, setQ] = useState('');
  const hits = (generic ? FAQ_GENERIC : FAQ).filter((f) => !q || (f.q + ' ' + f.a).toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(hits.map((h) => h.g))];
  return (
    <Drawer title="Help" sub="how Harbor works" onClose={onClose}>
      <div className="help-search"><input type="search" placeholder="Search help (e.g. tablet, Bridge, sign in)" aria-label="Search help" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="help-body">
        {groups.map((g) => <div key={g} style={{ display: 'contents' }}><div className="group-label">{g}</div>
          {hits.filter((h) => h.g === g).map((h) => <details key={h.q}><summary>{h.q}</summary><div className="a">{h.a}</div></details>)}</div>)}
        {!hits.length && <div className="w-empty">Nothing matches “{q}”.</div>}
      </div>
    </Drawer>
  );
}
