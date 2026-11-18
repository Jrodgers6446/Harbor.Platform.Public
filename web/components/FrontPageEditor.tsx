'use client';
import { useState, useTransition } from 'react';
import { saveSiteContent } from '@/lib/actions';
import { WELCOME_DEFAULT, type Welcome } from '@/lib/siteContent';
import { Icon } from './shell/icons';

const ICONS = ['routes', 'dps', 'precall', 'techdash', 'devices', 'store', 'home', 'bridge', 'overwatch'];

/** Overwatch > Front page: edit every piece of text on the public front page. */
export function FrontPageEditor({ initial, custom, previewUrl }: { initial: Welcome; custom: boolean; previewUrl: string }) {
  const [c, setC] = useState<Welcome>(initial);
  const [msg, setMsg] = useState<{ t: string; k: string } | null>(null);
  const [busy, start] = useTransition();
  const set = (k: keyof Welcome, v: string) => setC({ ...c, [k]: v });
  // a plain function (not a component) so inputs keep focus while typing
  const T = (k: keyof Welcome, label: string, rows?: number) => rows
    ? <label className="f" key={k}>{label}<textarea rows={rows} style={{ minHeight: 0 }} value={c[k] as string} onChange={(e) => set(k, e.target.value)} /></label>
    : <label className="f" key={k}>{label}<input value={c[k] as string} onChange={(e) => set(k, e.target.value)} /></label>;
  const save = (value: Welcome | null) => start(async () => {
    const r = await saveSiteContent('welcome', value);
    setMsg(r.ok ? { t: value ? 'Saved. The front page shows it now.' : 'Back to the built-in text.', k: 'ok' } : { t: r.error || 'Couldn’t save', k: 'bad' });
    if (r.ok && !value) setC(WELCOME_DEFAULT);
  });

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 900 }}>
      <section className="widget" style={{ display: 'grid', gap: 12 }}>
        <div className="w-head"><h2>Top of the page</h2></div>
        {T("eyebrow", "Small label above the title")}
        {T("title", "Title (wrap words in *stars* to colour them)")}
        {T("lead", "Intro", 3)}
        {T("note", "Note under the buttons")}
      </section>

      <section className="widget" style={{ display: 'grid', gap: 12 }}>
        <div className="w-head"><h2>Features</h2><span className="open"><button className="btn sm" disabled={c.features.length >= 12} onClick={() => setC({ ...c, features: [...c.features, { icon: 'dps', title: '', text: '' }] })}>+ Add feature</button></span></div>
        {T("featuresTitle", "Heading")}{T("featuresLead", "Intro", 2)}
        {c.features.map((f, i) => (
          <div key={i} className="panel-box" style={{ gap: 8 }}>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <label className="f" style={{ flex: 'none', minWidth: 0 }}>Icon<select value={f.icon} onChange={(e) => setC({ ...c, features: c.features.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)) })}>{ICONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}</select></label>
              <span style={{ flex: 'none', alignSelf: 'center', color: '#d9cbff' }}><Icon name={f.icon} /></span>
              <label className="f">Title<input value={f.title} onChange={(e) => setC({ ...c, features: c.features.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} /></label>
              <button className="btn sm danger" style={{ flex: 'none' }} onClick={() => setC({ ...c, features: c.features.filter((_, j) => j !== i) })}>Remove</button>
            </div>
            <label className="f">Text<textarea rows={2} style={{ minHeight: 0 }} value={f.text} onChange={(e) => setC({ ...c, features: c.features.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} /></label>
          </div>))}
      </section>

      <section className="widget" style={{ display: 'grid', gap: 12 }}>
        <div className="w-head"><h2>How it fits together</h2></div>
        {T("howTitle", "Heading")}{T("howLead", "Intro")}
        {c.steps.map((st, i) => (
          <div key={i} className="panel-box" style={{ gap: 8 }}>
            <label className="f">Step {i + 1} title<input value={st.title} onChange={(e) => setC({ ...c, steps: c.steps.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} /></label>
            <label className="f">Text<textarea rows={2} style={{ minHeight: 0 }} value={st.text} onChange={(e) => setC({ ...c, steps: c.steps.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} /></label>
          </div>))}
      </section>

      <section className="widget" style={{ display: 'grid', gap: 12 }}>
        <div className="w-head"><h2>Demo and sign-in</h2></div>
        {T("demoTitle", "Demo heading")}{T("demoText", "Demo text", 2)}
        {T("tabletTitle", "Tablet section heading")}{T("tabletText", "Tablet section text", 2)}
        {T("signinTitle", "Sign-in heading")}{T("signinText", "Sign-in text", 3)}
        {T("footer", "Footer")}
      </section>

      {msg && <div className={'msg ' + msg.k}>{msg.t}</div>}
      <div className="row" style={{ alignItems: 'center', position: 'sticky', bottom: 0, background: '#09080c', padding: '12px 0' }}>
        <button className="btn primary" style={{ flex: 'none' }} disabled={busy} onClick={() => save(c)}>{busy ? 'Saving…' : 'Save front page'}</button>
        <a className="btn" style={{ flex: 'none' }} href={previewUrl} target="_blank" rel="noreferrer">Preview (signed out)</a>
        {custom && <button className="btn danger" style={{ flex: 'none' }} disabled={busy} onClick={() => save(null)}>Back to built-in text</button>}
      </div>
    </div>
  );
}
