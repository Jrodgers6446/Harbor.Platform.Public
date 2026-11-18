'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useLocal } from './util';

export type Widget = { id: string; title: string; from?: string; open?: string; size?: 'full' | 'half'; off?: boolean; node: React.ReactNode };

/** "Tomorrow at a glance" + Customize home, like the extension. Hidden widgets are remembered in this browser. */
export function HomeWidgets({ heading, sub, widgets }: { heading: string; sub: string; widgets: Widget[] }) {
  const [hidden, setHidden] = useLocal<string[]>('harbor:web:hidden', []);
  const [extra, setExtra] = useLocal<string[]>('harbor:web:shown', []); // widgets that start hidden (like the extension's) and were turned on
  const [edit, setEdit] = useState(false);
  const isOn = (w: Widget) => !hidden.includes(w.id) && (!w.off || extra.includes(w.id));
  const turn = (w: Widget, on: boolean) => { setHidden(on ? hidden.filter((h) => h !== w.id) : [...hidden, w.id]); if (w.off) setExtra(on ? [...extra, w.id] : extra.filter((h) => h !== w.id)); };
  const shown = widgets.filter(isOn);
  return (
    <>
      <div className="home-head">
        <div><h1>{heading}</h1><p className="muted">{sub}</p></div>
        <button className="btn" onClick={() => setEdit(!edit)}>{edit ? 'Done' : 'Customize home'}</button>
      </div>
      {edit && <div className="widget" style={{ marginBottom: 18 }}>
        <div className="w-head"><h2>Show on Home</h2><span className="from">saved in this browser</span></div>
        {widgets.map((w) => <label key={w.id} className="toggle-row"><span>{w.title}{w.from && <span className="muted small"> · {w.from}</span>}</span>
          <input type="checkbox" checked={isOn(w)} onChange={(e) => turn(w, e.target.checked)} /></label>)}
      </div>}
      <div className="widgets">
        {shown.map((w) => (
          <section key={w.id} className={'widget' + (w.size ? ' ' + w.size : '')} aria-label={w.title}>
            {w.size !== 'full' && <div className="w-head"><h2>{w.title}</h2>{w.from && <span className="from">{w.from}</span>}{w.open && <Link className="open" href={w.open}>Open</Link>}</div>}
            {w.node}
          </section>
        ))}
        {!shown.length && <div className="w-empty">Everything is hidden. Use Customize home to bring widgets back.</div>}
      </div>
    </>
  );
}
