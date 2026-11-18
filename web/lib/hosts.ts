// Two addresses, one deployment (set them in the environment):
//   OVERWATCH_HOST  only Overwatch accounts; opens on the Overwatch pages
//   STANDARD_HOST   the store site; Overwatch pages don't exist here
// REDIRECT_HOSTS is a comma list of old/alias hosts that redirect to the standard site. Any other host
// (previews, localhost) acts as the standard site so it can be tested. For local dev, open
// http://overwatch.localhost:3000 to see the Overwatch site.
export const OVERWATCH_HOST = process.env.OVERWATCH_HOST || 'overwatch.localhost';
export const STANDARD_HOST = process.env.STANDARD_HOST || 'localhost';
export const REDIRECT_HOSTS = (process.env.REDIRECT_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);

export type SiteKind = 'overwatch' | 'standard';
export function siteKind(host: string | null | undefined): SiteKind {
  const h = (host || '').split(':')[0].toLowerCase();
  if (h === OVERWATCH_HOST.toLowerCase() || h.startsWith('harbor-overwatch') || h.startsWith('overwatch.')) return 'overwatch';
  return 'standard';
}
