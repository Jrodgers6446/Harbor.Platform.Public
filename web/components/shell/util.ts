'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

export const addDays = (d: string, n: number) => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + n); return t.toLocaleDateString('en-CA'); };
export const dayLabel = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export type BridgeConnection = { id: string; name: string; kind: string; at: number | null };
export type BridgeState = { installed: boolean; version?: string; dispatchAt?: number | null; workordersAt?: number | null; connections?: BridgeConnection[]; busy?: boolean; error?: string | null };

/**
 * Talks to the Harbor Bridge extension through window messages (see bridge/site.js).
 *   Bridge -> page  { source: 'harbor-bridge', type: 'hello' | 'status', version, dispatchAt, workordersAt }
 *                   { source: 'harbor-bridge', type: 'done', what, ok, error? }
 *   page -> Bridge  { source: 'harbor-site', type: 'ping' | 'refresh' | 'open', what? ('all' on refresh), day?, token? }
 * The Bridge also sets <html data-harbor-bridge="version"> so a fresh page knows straight away.
 */
export function useBridge(onDone?: (what: string, ok: boolean) => void) {
  const [s, set] = useState<BridgeState>({ installed: false });
  useEffect(() => {
    const v = document.documentElement.dataset.harborBridge;
    if (v) set((o) => ({ ...o, installed: true, version: v }));
    const on = (e: MessageEvent) => {
      if (e.source !== window || e.data?.source !== 'harbor-bridge') return;
      const m = e.data;
      if (m.type === 'hello' || m.type === 'status') set((o) => ({ ...o, installed: true, version: m.version, dispatchAt: m.dispatchAt ?? o.dispatchAt, workordersAt: m.workordersAt ?? o.workordersAt, connections: m.connections ?? o.connections }));
      if (m.type === 'done') { set((o) => ({ ...o, busy: false, error: m.ok ? null : m.error || 'Refresh failed' })); onDone?.(m.what, !!m.ok); }
    };
    window.addEventListener('message', on);
    window.postMessage({ source: 'harbor-site', type: 'ping' }, location.origin);
    return () => window.removeEventListener('message', on);
  }, [onDone]);
  // The Bridge uploads with this page's own sign-in, sent per refresh and never stored by the Bridge.
  // One refresh reads every connected system ('all').
  const refresh = useCallback(async (day: string) => {
    set((o) => ({ ...o, busy: true, error: null }));
    const { data } = await supabaseBrowser().auth.getSession();
    window.postMessage({ source: 'harbor-site', type: 'refresh', what: 'all', day, token: data.session?.access_token }, location.origin);
  }, []);
  const open = useCallback((what: 'dispatch' | 'workorders') => window.postMessage({ source: 'harbor-site', type: 'open', what }, location.origin), []);
  return { bridge: s, refresh, open };
}

/** Small per-browser setting (hidden widgets, module order...). Falls back to the default.
 *  Components using the same key stay in step, so Settings changes show on Home right away. */
export function useLocal<T>(key: string, init: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(init);
  useEffect(() => {
    const read = () => { try { const r = localStorage.getItem(key); setV(r ? JSON.parse(r) : init); } catch { /* private window */ } };
    read();
    const on = (e: Event) => { if ((e as CustomEvent).detail === key) read(); };
    window.addEventListener('harbor:local', on);
    return () => window.removeEventListener('harbor:local', on);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [v, (n: T) => {
    setV(n);
    try { localStorage.setItem(key, JSON.stringify(n)); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('harbor:local', { detail: key }));
  }];
}

/** Ask the Bridge extension to do something this page can't (reach Harbor Helper on this PC). */
let callId = 0;
export function bridgeCall<T = any>(op: string, args: Record<string, unknown> = {}, timeout = 20000): Promise<{ ok: boolean; data?: T; error?: string; status?: number }> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !document.documentElement.dataset.harborBridge) return resolve({ ok: false, error: 'NO_BRIDGE' });
    const id = ++callId;
    const on = (e: MessageEvent) => {
      if (e.source !== window || e.data?.source !== 'harbor-bridge' || e.data.type !== 'reply' || e.data.id !== id) return;
      window.removeEventListener('message', on); clearTimeout(t); resolve(e.data);
    };
    const t = setTimeout(() => { window.removeEventListener('message', on); resolve({ ok: false, error: 'Harbor Bridge didn’t answer. Reload the page.' }); }, timeout);
    window.addEventListener('message', on);
    window.postMessage({ source: 'harbor-site', type: 'call', id, op, args }, location.origin);
  });
}
