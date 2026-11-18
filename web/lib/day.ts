/** Today's date (YYYY-MM-DD) in the store's time zone. Servers usually run in UTC, so never use the server's own date. */
export function storeToday(tz = 'America/New_York') {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch { return new Date().toLocaleDateString('en-CA'); }
}
export function plusDays(d: string, n: number) { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
/** The day a page should show: ?day=YYYY-MM-DD, otherwise tomorrow (same default as the Harbor extension). */
export function pickDay(param: string | undefined, tz?: string) {
  return param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : plusDays(storeToday(tz), 1);
}
export const WEB_VERSION = '2.0.0';
