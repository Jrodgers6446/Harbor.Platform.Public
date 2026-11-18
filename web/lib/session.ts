// Sign-in is a one-time thing per computer: the session cookie lasts 30 days and is renewed on every visit.
export const SESSION_COOKIE = { maxAge: 60 * 60 * 24 * 30, sameSite: 'lax' as const, path: '/', secure: process.env.NODE_ENV === 'production' };
