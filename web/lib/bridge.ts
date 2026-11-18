import type { SupabaseClient } from '@supabase/supabase-js';

// What the Harbor Bridge extension uploads (see bridge/background.js and migration 0007).
// The 'dispatch' snapshot source key is what the extension and the database use for the dispatch system's schedule.
export type DispatchJob = { sjn: string; name: string; status: string; type: string; carrier: string; ws: string | null; we: string | null; address: string; techs: string[]; jeopardy: string | null };
export type DispatchDay = { locationId: string | null; techs: { id: string; name: string; available: boolean }[]; jobs: DispatchJob[] };
export type WorkOrder = { id: string | number; state: 'closed' | 'cancelled'; outcome: string; status: string; program: string; name: string; device: string; createdAt: string | null; updatedAt: string | null };
export type WorkOrdersDay = { since: string; wos: WorkOrder[] };

export async function bridgeDay(sb: SupabaseClient, franchiseId: string, day: string) {
  const { data } = await sb.from('bridge_snapshots').select('source,payload,captured_at').eq('franchise_id', franchiseId).eq('day', day);
  const row = (s: string) => (data || []).find((r) => r.source === s);
  const dispatch = row('dispatch'), workorders = row('workorders');
  return {
    dispatch: (dispatch?.payload as DispatchDay) || null, dispatchAt: (dispatch?.captured_at as string) || null,
    workorders: (workorders?.payload as WorkOrdersDay) || null, workordersAt: (workorders?.captured_at as string) || null,
  };
}

export const DONE = /complete|closed|finished/i;
export const CANCELLED = /cancel/i;
