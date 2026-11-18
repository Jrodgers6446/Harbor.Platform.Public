import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { REDIRECT_HOSTS, STANDARD_HOST, siteKind } from './lib/hosts';
import { SESSION_COOKIE } from './lib/session';

// Keeps the Supabase session cookie fresh (30 days), shows signed-out visitors the front page or /login, and keeps the two sites apart:
// Overwatch pages only exist on the Overwatch address; hosts in REDIRECT_HOSTS forward to the store site.
export async function middleware(req: NextRequest) {
  const host = (req.headers.get('host') || '').split(':')[0].toLowerCase();
  if (REDIRECT_HOSTS.includes(host)) {
    // Old addresses keep working: same path and query on the store site (tablet QR links, /get, bookmarks).
    const to = new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${STANDARD_HOST}`);
    return NextResponse.redirect(to, 308);
  }
  const kind = siteKind(host);
  const p = req.nextUrl.pathname;
  if (kind === 'standard' && p.startsWith('/overwatch')) return NextResponse.redirect(new URL('/', req.url));

  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: SESSION_COOKIE,
    cookies: {
      getAll() { return req.cookies.getAll(); },
      setAll(all) {
        all.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        all.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await sb.auth.getUser();
  const open = ['/login', '/auth', '/no-access', '/get', '/demo', '/welcome', '/t/'].some((o) => p.startsWith(o));
  if (!user && kind === 'standard' && p === '/') {
    // Signed-out visitors to the store site get the front page (about Harbor, demo, sign in) at the same address.
    const r = NextResponse.rewrite(new URL('/welcome', req.url));
    res.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  }
  if (!user && !open) return NextResponse.redirect(new URL('/login', req.url));
  if (user && (p.startsWith('/login') || (p.startsWith('/welcome') && !req.nextUrl.searchParams.has('preview')))) return NextResponse.redirect(new URL(kind === 'overwatch' ? '/overwatch' : '/', req.url));
  if (user && kind === 'overwatch' && p === '/' && req.cookies.get('harbor_view')?.value !== 'manager') return NextResponse.redirect(new URL('/overwatch', req.url));
  return res;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|svg|jpg)).*)'] };
