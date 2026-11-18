'use client';
import Link from 'next/link';
import { Logo } from '../Logo';
import { Chevron, DownloadIcon, GearIcon, HelpIcon, HoneycombIcon, Icon, SyncIcon } from './icons';
import { addDays, dayLabel, type BridgeState } from './util';

export type NavItem = { id: string; label: string; icon: string; href?: string; count?: string | number | null; countKind?: 'warn' };

type Props = {
  items: NavItem[];
  active: string;
  onSelect?: (id: string) => void;   // demo: switch views without links
  title: string;
  day: string;
  today: string;
  onDay: (d: string) => void;
  bridge: BridgeState;
  onSync: () => void;               // one button: every Bridge connection
  onDownload: () => void;
  generic?: boolean;                // demo: no company-specific system names
  footCard: React.ReactNode;        // the Phone connection card, like the extension
  onHelp: () => void;
  onSettings: () => void;
  version: string;
  brandSub?: string;
  banner?: React.ReactNode;
  children: React.ReactNode;
};

/** The extension's window rebuilt for the website: Modules sidebar, top bar with day + sync + help + settings. */
export function Chrome(p: Props) {
  const btn = (m: NavItem) => {
    const inner = <><Icon name={m.icon} /><span>{m.label}</span>{m.count != null && m.count !== '' && m.count !== 0 && <span className={'count' + (m.countKind ? ' ' + m.countKind : '')}>{m.count}</span>}</>;
    const cls = 'nav-btn' + (p.active === m.id ? ' on' : '');
    if (p.onSelect || !m.href) return <button key={m.id} className={cls} aria-current={p.active === m.id ? 'page' : undefined} onClick={() => p.onSelect?.(m.id)}>{inner}</button>;
    return <Link key={m.id} href={m.href} className={cls} aria-current={p.active === m.id ? 'page' : undefined}>{inner}</Link>;
  };
  // Fresh only when every connection was read: green under 2 hours, yellow older, red when one hasn't been read yet.
  const conns = p.bridge.connections || [];
  const oldest = conns.length && conns.every((c) => c.at) ? Math.min(...conns.map((c) => c.at as number)) : null;
  const syncDot = !p.bridge.installed || p.generic ? '' : oldest == null ? 'none' : Date.now() - oldest > 120 * 60e3 ? 'old' : 'ok';
  const clock = (t?: number | null) => (t ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'not yet');
  const syncTitle = p.generic ? 'Refresh from your scheduling and work-order systems (Harbor Bridge)'
    : !p.bridge.installed ? 'Refresh (needs the Harbor Bridge extension)'
    : !conns.length ? 'Refresh (add your systems in Harbor Bridge first)'
    : 'Refresh from ' + conns.map((c) => `${c.name} (${clock(c.at)})`).join(', ');
  const hcIcon = !p.generic && conns.some((c) => c.id === 'honeycomb');
  const rel = p.day === p.today ? 'Today · ' : p.day === addDays(p.today, 1) ? 'Tomorrow · ' : p.day === addDays(p.today, -1) ? 'Yesterday · ' : '';

  return (
    <div className="shell">
      <nav className="side" aria-label="Modules">
        <div className="brand"><Logo size={34} /><div><div className="brand-name">Harbor</div>{p.brandSub && <div className="brand-sub">{p.brandSub}</div>}</div></div>
        <div className="nav-label">Modules</div>
        <div className="nav">{p.items.map(btn)}</div>
        <div className="side-foot">
          {p.footCard}
          <div className="credit">Created by SageWorkx · v{p.version}</div>
        </div>
      </nav>
      <section className="main">
        <header className="top">
          <div className="day">
            <button className="icon-btn ghost" aria-label="Previous day" onClick={() => p.onDay(addDays(p.day, -1))}><Chevron dir="l" /></button>
            <label className="day-label"><span>{rel}{dayLabel(p.day)}</span><input type="date" aria-label="Day" value={p.day} onChange={(e) => e.target.value && p.onDay(e.target.value)} /></label>
            <button className="icon-btn ghost" aria-label="Next day" onClick={() => p.onDay(addDays(p.day, 1))}><Chevron dir="r" /></button>
          </div>
          <div className="title">{p.title}</div>
          <div className="top-right">
            <button className={'icon-btn sync' + (p.bridge.busy ? ' spin' : '')} title={syncTitle} aria-label={syncTitle} onClick={p.onSync}>{hcIcon ? <HoneycombIcon /> : <SyncIcon />}<span className={'sync-dot ' + syncDot} /></button>
            <button className="icon-btn" aria-label="Help and FAQ" title="How to use Harbor" onClick={p.onHelp}><HelpIcon /></button>
            <button className="icon-btn" aria-label="Downloads: tablet app or Harbor Bridge" title="Download the tablet app or Harbor Bridge" onClick={p.onDownload}><DownloadIcon /></button>
            <button className="icon-btn accent" aria-label="Settings" title="Settings" onClick={p.onSettings}><GearIcon /></button>
          </div>
        </header>
        {p.banner}
        <div className="view">{p.children}</div>
      </section>
    </div>
  );
}
