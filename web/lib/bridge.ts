import type { SupabaseClient } from '@supabase/supabase-js';

// What the Harbor Bridge extension uploads (see bridge/background.js and migration 0007).
// The 'honeycomb' snapshot source key is what the extension and the database use for the dispatch system's schedule.
export type HcJob = { sjn: string; name: string; status: string; type: string; carrier: string; ws: string | null; we: string | null; address: string; techs: string[]; jeopardy: string | null };
export type HcDay = { locationId: string | null; techs: { id: string; name: string; available: boolean }[]; jobs: HcJob[] };
export type PortalWo = { id: string | number; state: 'closed' | 'cancelled'; outcome: string; status: string; program: string; name: string; device: string; createdAt: string | null; updatedAt: string | null };
export type PortalDay = { since: string; wos: PortalWo[] };

export async function bridgeDay(sb: SupabaseClient, franchiseId: string, day: string) {
  const { data } = await sb.from('bridge_snapshots').select('source,payload,captured_at').eq('franchise_id', franchiseId).eq('day', day);
  const row = (s: string) => (data || []).find((r) => r.source === s);
  const hc = row('honeycomb'), portal = row('portal');
  return {
    hc: (hc?.payload as HcDay) || null, hcAt: (hc?.captured_at as string) || null,
    portal: (portal?.payload as PortalDay) || null, portalAt: (portal?.captured_at as string) || null,
  };
}

export const DONE = /complete|closed|finished/i;
export const CANCELLED = /cancel/i;
