'use client';
import { createBrowserClient } from '@supabase/ssr';
import { SESSION_COOKIE } from './session';
export const supabaseBrowser = () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookieOptions: SESSION_COOKIE });
