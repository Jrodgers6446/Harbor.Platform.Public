'use client';
import { useEffect, useState } from 'react';
import { useLocal } from './util';

/**
 * When this PC has the Harbor extension, show the extension's own module page inside the website
 * (for the Route Planner that's the optimiser, live map, tracking, Apply and its settings).
 * Without the extension, show the website's basic view (children).
 */
export function ExtensionModule({ page, day, title, children }: { page: string; day: string; title: string; children: React.ReactNode }) {
  const [ext, setExt] = useState<string | null>(null);
  const [basic, setBasic] = useLocal<boolean>('harbor:web:basic:' + page, false);
  useEffect(() => {
    const read = () => setExt(document.documentElement.dataset.harborExt || null);
    read(); const t = setTimeout(read, 800); return () => clearTimeout(t);
  }, []);
  if (!ext || basic) return (<>
    {ext && <div className="ext-note"><span>Showing the basic {title}.</span><button className="link" onClick={() => setBasic(false)}>Use the full {title} from the Harbor extension</button></div>}
    {children}
  </>);
  return (
    <div className="ext-frame-wrap">
      <iframe className="ext-frame" title={title} src={`chrome-extension://${ext}/${page}?date=${encodeURIComponent(day)}&embed=1`} allow="clipboard-write; geolocation" />
      <div className="ext-note small"><span>{title} from the Harbor extension on this PC.</span><button className="link" onClick={() => setBasic(true)}>Basic view</button></div>
    </div>
  );
}
