import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { currentSite, currentUser, features } from '@/lib/supabase-server';
import { SiteShell } from '@/components/shell/SiteShell';
import { WEB_VERSION, storeToday } from '@/lib/day';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const { sb, user, profile } = await currentUser();
  if (!user) redirect('/login');
  if (!profile || profile.disabled) redirect('/no-access');
  const site = currentSite();
  const viewAsManager = profile.role === 'overwatch' && cookies().get('harbor_view')?.value === 'manager';
  // The Overwatch address is for Overwatch accounts only.
  if (site === 'overwatch' && profile.role !== 'overwatch') redirect('/no-access?why=overwatch');
  const role = viewAsManager ? 'manager' : profile.role;
  const [f, fr, pending] = await Promise.all([
    features(),
    sb.from('franchises').select('timezone').eq('id', profile.franchise_id).maybeSingle(),
    role !== 'tech' ? sb.from('devices').select('id', { count: 'exact', head: true }).eq('franchise_id', profile.franchise_id).eq('status', 'pending') : Promise.resolve({ count: 0 }),
  ]);
  return (
    <Suspense>
      <SiteShell
        user={{ name: profile.display_name || profile.email || 'You', email: profile.email || user.email || '', role, store: profile.franchises?.name || 'My store', sandbox: !!profile.franchises?.is_sandbox }}
        site={viewAsManager ? 'standard' : site} canViewAs={profile.role === 'overwatch'} viewingAs={viewAsManager}
        features={f} today={storeToday((fr.data as { timezone?: string } | null)?.timezone || undefined)} version={WEB_VERSION}
        pendingTablets={(pending as { count: number | null }).count || 0}>
        {children}
      </SiteShell>
    </Suspense>
  );
}
