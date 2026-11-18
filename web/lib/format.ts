export function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return 'never';
  const m = Math.round((now - Date.parse(iso)) / 60e3);
  if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} h ${m % 60} min ago`;
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function stateOf(d: { status: string; last_seen_at: string | null }, now = Date.now()) {
  if (d.status === 'pending') return { key: 'pending', label: 'Waiting for approval' };
  if (d.status === 'revoked') return { key: 'revoked', label: 'Revoked' };
  if (!d.last_seen_at) return { key: 'offline', label: 'Never reported' };
  const m = Math.round((now - Date.parse(d.last_seen_at)) / 60e3);
  if (m <= 5) return { key: 'online', label: 'Online' }; if (m <= 30) return { key: 'idle', label: `Quiet ${m} min` };
  return { key: 'offline', label: 'Offline' };
}
export const clock = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—');
export const day = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
