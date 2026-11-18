'use server';
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import QRCode from 'qrcode';
import { supabaseServer } from './supabase-server';

/** Every mutation goes through a database function; RLS and the function decide who may do what. */
async function call(fn: string, args: Record<string, unknown>, path: string) {
  const { data, error } = await supabaseServer().rpc(fn, args);
  revalidatePath(path);
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true, data };
}
const friendly = (m: string) => m.replace(/^.*?: /, '').replace(/\(SQLSTATE.*$/, '').trim();

export async function inviteEmployee(_: unknown, form: FormData) {
  const franchise = String(form.get('franchise') || '');
  const args = { p_email: form.get('email'), p_role: form.get('role') || 'tech', p_tech_id: form.get('tech_id') || null, p_display_name: form.get('display_name') || null };
  return franchise ? call('invite_employee_in', { p_franchise: franchise, ...args }, `/overwatch/franchises/${franchise}`) : call('invite_employee', args, '/employees');
}
export async function updateEmployee(_: unknown, form: FormData) {
  return call('update_employee', { p_user_id: form.get('user_id'), p_role: form.get('role') || null, p_tech_id: form.get('tech_id') ?? null, p_display_name: form.get('display_name') || null }, String(form.get('path') || '/employees'));
}
export async function setDisabled(userId: string, disabled: boolean, path = '/employees') {
  return call('update_employee', { p_user_id: userId, p_disabled: disabled }, path);
}
export async function removeEmployee(userId: string, path = '/employees') { return call('remove_employee', { p_user_id: userId }, path); }

export async function deviceAction(id: string, action: 'approve' | 'revoke' | 'remove' | 'update', patch: Record<string, unknown> = {}) {
  const sb = supabaseServer();
  const q = action === 'remove' ? sb.from('devices').delete().eq('id', id)
    : sb.from('devices').update(action === 'approve' ? { ...patch, status: 'active' } : action === 'revoke' ? { status: 'revoked' } : patch).eq('id', id);
  const { error } = await q;
  revalidatePath('/tablets');
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}
export async function reopenSheet(id: string) { return call('reopen_sheet', { p_sheet_id: id }, '/sheets'); }
export async function newStoreCode() { return call('new_join_code', {}, '/settings'); }

export async function saveGuide(_: unknown, form: FormData) {
  const sb = supabaseServer();
  const steps = String(form.get('steps') || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [title, ...rest] = l.split(' - '); return { title: title.trim(), detail: rest.join(' - ').trim() };
  });
  const row = { device: String(form.get('device') || '').trim(), repair: String(form.get('repair') || '').trim(), warnings: String(form.get('warnings') || '').trim() || null, steps, updated_at: new Date().toISOString() };
  if (!row.device || !row.repair || !steps.length) return { ok: false, error: 'Device, repair and at least one step are needed.' };
  const id = String(form.get('id') || '');
  let error;
  if (id) ({ error } = await sb.from('repair_guides').update(row).eq('id', id));
  else {
    const { data: me } = await sb.from('profiles').select('franchise_id').maybeSingle();
    ({ error } = await sb.from('repair_guides').insert({ ...row, franchise_id: me?.franchise_id }));
  }
  revalidatePath('/guides');
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}
export async function deleteGuide(id: string) {
  const { error } = await supabaseServer().from('repair_guides').delete().eq('id', id);
  revalidatePath('/guides');
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

// ---- overwatch
export async function createFranchise(_: unknown, form: FormData) {
  return call('create_franchise', { p_name: form.get('name'), p_is_sandbox: form.get('sandbox') === 'on', p_timezone: form.get('timezone') || 'America/New_York' }, '/overwatch');
}
export async function setFeature(franchiseId: string, key: string, enabled: boolean | null) {
  const sb = supabaseServer();
  const { error } = enabled === null
    ? await sb.from('franchise_features').delete().eq('franchise_id', franchiseId).eq('key', key)
    : await sb.from('franchise_features').upsert({ franchise_id: franchiseId, key, enabled, set_at: new Date().toISOString() });
  revalidatePath(`/overwatch/franchises/${franchiseId}`);
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}
export async function publishRelease(_: unknown, form: FormData) {
  return call('publish_release', {
    p_platform: form.get('platform'), p_version: form.get('version'), p_notes: form.get('notes'), p_url: form.get('url') || '',
    p_channel: form.get('channel') || 'sandbox', p_confirm: form.get('confirm'), p_min_supported: form.get('min_supported') || null,
  }, '/overwatch/releases');
}
export async function updateFranchise(_: unknown, form: FormData) {
  const id = String(form.get('id'));
  const { error } = await supabaseServer().from('franchises').update({ name: form.get('name'), timezone: form.get('timezone'), store_address: form.get('store_address') || null, is_sandbox: form.get('sandbox') === 'on' }).eq('id', id);
  revalidatePath(`/overwatch/franchises/${id}`);
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

/** Overwatch only: see the site exactly as a store manager would (a cookie; changes nothing in the database). */
export async function setViewAsManager(on: boolean) {
  if (on) cookies().set('harbor_view', 'manager', { path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 60 * 60 * 12 });
  else cookies().delete('harbor_view');
  revalidatePath('/', 'layout');
  return { ok: true };
}

// ---- downloads: tablet QR codes
const siteOrigin = () => { const h = headers(); return `${h.get('x-forwarded-proto') || 'https'}://${h.get('host')}`; };
const qrSvg = (text: string) => QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#09080c', light: '#ffffff' } });

/** Manager: a one-time QR (30 minutes) that downloads the tablet app and pairs the tablet to this store without approval. */
export async function createTabletInvite() {
  const { data, error } = await supabaseServer().rpc('create_tablet_invite');
  if (error) return { ok: false as const, error: friendly(error.message) };
  const row = (data as { token: string; expires_at: string }[])[0];
  const url = `${siteOrigin()}/t/${row.token}`;
  revalidatePath('/m/devices');
  return { ok: true as const, url, expiresAt: row.expires_at, svg: await qrSvg(url) };
}

/** Anyone: a QR to the plain download page (no pairing). */
export async function appDownloadQr() {
  const url = `${siteOrigin()}/get`;
  return { ok: true as const, url, svg: await qrSvg(url) };
}

// ---- overwatch: front page text
export async function saveSiteContent(key: string, value: unknown | null) {
  const { error } = await supabaseServer().rpc('set_site_content', { p_key: key, p_value: value });
  revalidatePath('/welcome'); revalidatePath('/overwatch/front-page');
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}
