import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase-server';
import { ago } from '@/lib/format';
import { DeviceRow } from '@/components/Devices';
import { TabletMap, type MapDevice } from '@/components/TabletMap';
import { overwatchDay, overwatchRange } from '@/lib/overwatch';
import { storeToday } from '@/lib/day';

export const dynamic = 'force-dynamic';

export default async function Tablets({ searchParams }: { searchParams?: { ow?: string } }) {
  const { sb, profile } = await currentUser();
  if (profile!.role === 'tech') redirect('/');
  const { data } = await sb.from('devices').select('id,name,model,status,pair_code,requested_email,tech_id,tech_name,van,app_version,battery,last_seen_at,last_lat,last_lon,last_accuracy,last_speed,created_at').eq('franchise_id', profile!.franchise_id).order('created_at', { ascending: false });
  const list = data || [];
  const { data: fr } = await sb.from('franchises').select('timezone').eq('id', profile!.franchise_id).maybeSingle();
  const tz = (fr as { timezone?: string } | null)?.timezone || 'America/New_York';
  const today = storeToday(tz);
  const owDay = searchParams?.ow && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.ow) && searchParams.ow <= today ? searchParams.ow : today;
  const owTechs = await overwatchDay(sb, profile!.franchise_id, owDay, tz);
  const pending = list.filter((d) => d.status === 'pending'), active = list.filter((d) => d.status === 'active'), revoked = list.filter((d) => d.status === 'revoked');
  return (
    <>
      <h1>Tablets</h1>
      <div className="muted" style={{ marginBottom: 14 }}>Where each tablet is right now. Click a tablet (on the map or below) to see its path. Approving links a new tablet to the tech you pick.</div>
      {!!pending.length && (<><h2>Waiting for approval</h2><div className="cards">{pending.map((d) => (
        <div className="card" key={d.id}>
          <div><b>{d.name}</b> <span className="muted small">{d.model} · asked by {d.requested_email} · {ago(d.created_at)}</span></div>
          <div className="small muted" style={{ marginTop: 8 }}>Check this matches the tablet's screen</div>
          <div className="code">{d.pair_code}</div>
          <DeviceRow d={d} mode="approve" />
        </div>))}</div></>)}
      <TabletMap initial={active as unknown as MapDevice[]} overwatch={{ techs: owTechs, day: owDay, today, range: overwatchRange(owDay, tz), tz }} />
      {!!revoked.length && (<><h2>Revoked</h2><div className="card"><table><tbody>{revoked.map((d) => <tr key={d.id}><td>{d.name} <span className="muted small">{d.tech_name}</span></td><td style={{ textAlign: 'right' }}><DeviceRow d={d} mode="revoked" /></td></tr>)}</tbody></table></div></>)}
    </>
  );
}
