import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { siteKind } from './hosts';
import { SESSION_COOKIE } from './session';

/** Supabase client for server components and server actions. Uses the signed-in person's session, so RLS applies. */
export function supabaseServer() {
  const store = cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: SESSION_COOKIE,
    cookies: {
      getAll() { return store.getAll(); },
      setAll(all) { try { all.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* read-only in RSC */ } },
    },
  });
}

export type Profile = { user_id: string; role: 'tech' | 'manager' | 'overwatch'; display_name: string | null; email: string | null; tech_id: string | null; disabled: boolean; franchise_id: string; franchises: { name: string; is_sandbox: boolean } | null };

export async function currentUser() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { sb, user: null, profile: null as Profile | null };
  const { data } = await sb.from('profiles').select('user_id,role,display_name,email,tech_id,disabled,franchise_id,franchises(name,is_sandbox)').eq('user_id', user.id).maybeSingle();
  return { sb, user, profile: (data as unknown as Profile | null) };
}

export async function features(): Promise<Record<string, boolean>> {
  const sb = supabaseServer();
  const { data } = await sb.rpc('my_features');
  return (data as Record<string, boolean>) || {};
}

/** Which of the two sites this request is for (by host name). */
export const currentSite = () => siteKind(headers().get('host'));
