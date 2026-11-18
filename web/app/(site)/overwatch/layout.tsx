import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase-server';

export default async function OverwatchLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await currentUser();
  if (profile?.role !== 'overwatch') redirect('/');
  return <>{children}</>;
}
