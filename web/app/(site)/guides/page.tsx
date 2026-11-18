import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase-server';
import { GuideEditor, GuideList } from '@/components/Guides';

export const dynamic = 'force-dynamic';

export default async function Guides() {
  const { sb, profile } = await currentUser();
  if (profile!.role === 'tech') redirect('/');
  const { data } = await sb.from('repair_guides').select('id,device,repair,steps,warnings,updated_at').eq('franchise_id', profile!.franchise_id).order('device').order('repair');
  return (
    <>
      <h1>Repair guides</h1>
      <div className="muted">What techs see under Repair assist on the tablet. Your store's guides replace the built-in starter ones for the same device and repair.</div>
      <h2>New guide</h2>
      <GuideEditor />
      <h2>Your guides</h2>
      <GuideList guides={(data || []) as any} />
    </>
  );
}
