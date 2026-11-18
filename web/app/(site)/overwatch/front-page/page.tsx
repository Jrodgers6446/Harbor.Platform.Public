import { currentUser } from '@/lib/supabase-server';
import { welcomeFrom } from '@/lib/siteContent';
import { FrontPageEditor } from '@/components/FrontPageEditor';
import { STANDARD_HOST } from '@/lib/hosts';

export const dynamic = 'force-dynamic';

export default async function FrontPage() {
  const { sb } = await currentUser();
  const { data } = await sb.from('site_content').select('value,updated_at').eq('key', 'welcome').maybeSingle();
  return (<>
    <div className="mod-head"><div><h1>Front page</h1><div className="muted">What signed-out visitors see at {STANDARD_HOST}: the pitch, the features, the demo and sign-in. {data ? `Last saved ${new Date(data.updated_at).toLocaleString('en-US', { timeZone: 'America/New_York' })}.` : 'Showing the built-in text.'}</div></div>
      <a className="btn" href={`https://${STANDARD_HOST}/demo`} target="_blank" rel="noreferrer">Open the demo</a></div>
    <FrontPageEditor initial={welcomeFrom(data?.value)} custom={!!data} previewUrl={`https://${STANDARD_HOST}/welcome?preview=1`} />
  </>);
}
