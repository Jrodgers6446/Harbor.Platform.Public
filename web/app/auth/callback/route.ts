import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

// Email links land here (codes are typed instead, but a link in the email still works); swap it for a session cookie.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const desc = req.nextUrl.searchParams.get('error_description');
  if (code) {
    const { error } = await supabaseServer().auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL('/', req.url));
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, req.url));
  }
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(desc || 'Sign-in was cancelled')}`, req.url));
}
