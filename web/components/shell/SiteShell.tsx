'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Chrome, type NavItem } from './Chrome';
import { HelpDrawer, SettingsDrawer } from './Panels';
import { DownloadPanel } from './DownloadPanel';
import { PhoneCard, PhoneDialog, usePhone } from './Phone';
import { MODULES, MOD_KEY, sortMods, useSettingsTabs, type ModPrefs } from './Settings';
import { addDays, useBridge, useLocal } from './util';

export type ShellUser = { name: string; email: string; role: 'tech' | 'manager' | 'overwatch'; store: string; sandbox: boolean };

type Props = {
  user: ShellUser;
  site: 'overwatch' | 'standard';
  canViewAs: boolean;
  viewingAs: boolean;
  features: Record<string, boolean>;
  today: string;              // in the store's time zone
  version: string;
  pendingTablets: number;
  children: React.ReactNode;
};

const STORE_PATHS = ['/store', '/employees', '/tablets', '/sheets', '/guides', '/settings'];
const ICON: Record<string, string> = { routes: 'routes', dps: 'dps', precall: 'precall', techdash: 'techdash', devices: 'devices' };

export function SiteShell(p: Props) {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [panel, setPanel] = useState<'settings' | 'help' | 'download' | 'phone' | null>(null);
  const [dlStart, setDlStart] = useState<'tablet' | 'bridge' | 'helper' | null>(null);
  const day = params.get('day') || addDays(p.today, 1);
  const onDone = useCallback(() => router.refresh(), [router]);
  const { bridge, refresh } = useBridge(onDone);
  const { phone, check } = usePhone();
  const [mods] = useLocal<ModPrefs>(MOD_KEY, { hidden: [], order: [] });
  const manager = p.user.role !== 'tech';
  const f = (k: string) => p.features[k] !== false;
  const download = (what: 'tablet' | 'bridge' | 'helper' | null = null) => { setDlStart(what); setPanel('download'); };
  // One sync button: Bridge reads every connected system and brings up any tab that needs a new sign-in.
  const sync = () => (bridge.installed ? refresh(day) : download('bridge'));

  const items: NavItem[] = [{ id: 'home', label: 'Home', icon: 'home', href: '/' }];
  if (manager) {
    sortMods(MODULES.filter((m) => !mods.hidden.includes(m.id)), mods.order).forEach((m) =>
      items.push({ id: m.id, label: m.label, icon: ICON[m.id], href: '/m/' + m.id, ...(m.id === 'devices' ? { count: p.pendingTablets || null, countKind: 'warn' as const } : {}) }));
  }
  items.push({ id: 'store', label: p.user.store || 'My store', icon: 'store', href: '/store' });
  if (p.site === 'overwatch' && !p.viewingAs) items.push({ id: 'overwatch', label: 'Overwatch', icon: 'overwatch', href: '/overwatch' });

  const active = path === '/' ? 'home' : path.startsWith('/m/') ? path.split('/')[2] : path.startsWith('/overwatch') ? 'overwatch' : STORE_PATHS.some((s) => path === s || path.startsWith(s + '/')) ? 'store' : 'home';
  const withDay = items.map((i) => ({ ...i, href: i.href && (i.id === 'home' || ['routes', 'dps', 'precall', 'techdash'].includes(i.id)) && params.get('day') ? `${i.href}?day=${day}` : i.href }));

  const storeTabs = [
    { href: '/store', label: 'Overview', show: true },
    { href: '/employees', label: 'Employees', show: manager },
    { href: '/tablets', label: 'Tablets', show: manager },
    { href: '/sheets', label: 'Daily sheets', show: manager && f('web.sheets') },
    { href: '/guides', label: 'Repair guides', show: manager && f('web.guides') },
    { href: '/settings', label: 'Store settings', show: manager },
  ].filter((t) => t.show);
  const owTabs = [{ href: '/overwatch', label: 'Franchises' }, { href: '/overwatch/releases', label: 'Releases' }, { href: '/overwatch/front-page', label: 'Front page' }];
  const tabs = active === 'store' ? storeTabs : active === 'overwatch' ? owTabs : null;
  const tabOn = (href: string) => (href === '/store' || href === '/overwatch' ? path === href : path.startsWith(href));
  const sub = tabs?.find((t) => tabOn(t.href) || (t.href === '/overwatch' && path.startsWith('/overwatch/franchises')));
  const title = (items.find((i) => i.id === active)?.label || 'Home') + (sub && tabs && sub !== tabs[0] ? ` · ${sub.label}` : '');

  const settings = useSettingsTabs({ user: p.user, day, canViewAs: p.canViewAs, viewingAs: p.viewingAs, checkPhone: check, onDownload: (w) => download(w || null), refresh: sync, bridgeInstalled: bridge.installed });
  const [settingsTab, setSettingsTab] = useState<string | undefined>(undefined);

  return (
    <div className="hb">
      <Chrome items={withDay} active={active} title={title} day={day} today={p.today}
        onDay={(d) => router.push(`${path}?day=${d}`)}
        bridge={bridge} onSync={sync} onDownload={() => download(null)}
        footCard={<PhoneCard phone={phone} onClick={() => setPanel('phone')} />}
        onHelp={() => setPanel('help')} onSettings={() => { setSettingsTab(undefined); setPanel('settings'); }} version={p.version}
        brandSub={p.site === 'overwatch' && !p.viewingAs ? 'Overwatch' : undefined}
        banner={<>
          {p.viewingAs && <div className="viewas-bar"><span>Viewing as a store manager. Overwatch tools are hidden; your access hasn&apos;t changed.</span><Link className="btn sm" href="#" onClick={(e) => { e.preventDefault(); setSettingsTab('account'); setPanel('settings'); }}>Exit</Link></div>}
          {bridge.error && <div className="viewas-bar" style={{ background: '#321719', color: '#ff8f8f' }}><span>{bridge.error}</span></div>}
        </>}>
        {tabs && <div className="subtabs">{tabs.map((t) => <Link key={t.href} href={t.href} className={'subtab' + (t === sub ? ' on' : '')}>{t.label}</Link>)}</div>}
        {p.children}
      </Chrome>
      {panel === 'settings' && <SettingsDrawer tabs={settings} initial={settingsTab} onClose={() => setPanel(null)} />}
      {panel === 'help' && <HelpDrawer onClose={() => setPanel(null)} />}
      {panel === 'download' && <DownloadPanel manager={manager} start={dlStart} onClose={() => setPanel(null)} />}
      {panel === 'phone' && <PhoneDialog onClose={() => setPanel(null)} refreshCard={check}
        onSettings={() => { setSettingsTab('helper'); setPanel('settings'); }} onDownloadBridge={() => download('bridge')} onDownloadHelper={() => download('helper')} />}
    </div>
  );
}
