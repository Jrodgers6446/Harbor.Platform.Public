'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './Logo';
import { SignOut } from './SignOut';
import type { Profile } from '@/lib/supabase-server';
import { ViewAsToggle } from './ViewAs';

export function Nav({ profile, features, site, canViewAs = false, viewingAs = false }: { profile: Profile; features: Record<string, boolean>; site: 'overwatch' | 'standard'; canViewAs?: boolean; viewingAs?: boolean }) {
  const p = usePathname();
  const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <Link href={href} className={'nav' + (p === href || (href !== '/' && p.startsWith(href)) ? ' on' : '')}>{children}</Link>
  );
  const manager = profile.role === 'manager' || profile.role === 'overwatch';
  return (
    <nav className="side">
      <div className="brand"><Logo /> {site === 'overwatch' ? 'Overwatch' : 'Harbor'}</div>
      <div className="small muted" style={{ padding: '0 12px 10px' }}>{profile.franchises?.name}{profile.franchises?.is_sandbox && <span className="chip warn" style={{ marginLeft: 8 }}>sandbox</span>}</div>
      {site === 'overwatch' && (<><A href="/overwatch">Franchises</A><A href="/overwatch/releases">Releases</A><div className="label">This store ({profile.franchises?.name})</div></>)}
      <A href="/">Overview</A>
      {manager && <A href="/employees">Employees</A>}
      {manager && <A href="/tablets">Tablets</A>}
      {manager && features['web.sheets'] !== false && <A href="/sheets">Daily forms</A>}
      {manager && features['web.guides'] !== false && <A href="/guides">Repair guides</A>}
      {manager && <A href="/settings">Store settings</A>}
      <div className="foot">
        <div>{profile.display_name || profile.email}</div>
        <div className="faint">{site === 'overwatch' ? 'Callsign Overwatch' : profile.role}</div>
        {canViewAs && <div style={{ marginTop: 8 }}><ViewAsToggle on={viewingAs} /></div>}
        <div style={{ marginTop: 8 }}><SignOut className="btn sm" /></div>
        <div style={{ marginTop: 10 }}>Created by SageWorkx</div>
      </div>
    </nav>
  );
}
