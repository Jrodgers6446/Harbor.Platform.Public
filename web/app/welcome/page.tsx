import { EmailCodeLogin } from '@/components/EmailCodeLogin';
import { Logo } from '@/components/Logo';
import { Icon } from '@/components/shell/icons';
import { createClient } from '@supabase/supabase-js';
import { welcomeFrom } from '@/lib/siteContent';
import { TabletDemo } from '@/components/demo/TabletDemo';

export const metadata = { title: 'Harbor · your field team in one place' };
export const dynamic = 'force-dynamic';

// *word* in the title is coloured
const Title = ({ text }: { text: string }) => <>{text.split(/(\*[^*]+\*)/).map((p, i) => (p.startsWith('*') && p.endsWith('*') ? <em key={i}>{p.slice(1, -1)}</em> : p))}</>;


/** Public front page of the store site. Signed-out visitors to "/" see this; signed-in people go straight to Harbor. */
export default async function Welcome() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await sb.from('site_content').select('value').eq('key', 'welcome').maybeSingle();
  const c = welcomeFrom(data?.value);
  return (
    <div className="lp">
      <div className="lp-wrap">
        <nav className="lp-nav">
          <Logo size={36} /><span className="name">Harbor</span>
          <div className="links">
            <a className="hide-sm" href="#features">Features</a>
            <a className="hide-sm" href="#how">How it works</a>
            <a className="hide-sm" href="#demo">Demo</a>
            <a className="hide-sm" href="#tablet">Tablet</a>
            <a className="btn primary" href="#signin">Sign in</a>
          </div>
        </nav>

        <header className="lp-hero">
          <div>
            <span className="lp-eyebrow"><Icon name="routes" size={16} /> {c.eyebrow}</span>
            <h1><Title text={c.title} /></h1>
            <p className="lp-lead">{c.lead}</p>
            <div className="lp-cta">
              <a className="btn primary" href="#signin">Sign in</a>
              <a className="btn" href="#demo">Try the demo</a>
            </div>
            <div className="lp-note">{c.note}</div>
          </div>
          <div className="lp-peek" aria-hidden="true">
            <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className="kpi"><div className="kpi-label">Customers</div><div className="kpi-num">23</div></div>
              <div className="kpi"><div className="kpi-label">Confirmed</div><div className="kpi-num ok">17</div></div>
              <div className="kpi"><div className="kpi-label">Tablets</div><div className="kpi-num">4 <span className="kpi-of">/ 4</span></div></div>
            </div>
            <div className="row2">
              <div className="widget"><div className="w-head"><h2>Daily Forms</h2></div>
                {['Alex Rivera', 'Sam Patel', 'Jordan Lee'].map((n, i) => <div className="w-row" key={n}><span className={'dot ' + (i ? 'warn' : 'ok')} /><div className="w-grow"><b>{n}</b><div className="w-note">{[6, 5, 6][i]} customers</div></div></div>)}
              </div>
              <div className="widget"><div className="w-head"><h2>Pre-call</h2></div>
                {[['Confirmed', 'ok'], ['New time', 'warn'], ['Extra work', 'reply']].map(([t, k], i) => <div className="w-row" key={t}><div className="w-grow"><b>{['Dana W.', 'Marcus B.', 'Priya R.'][i]}</b></div><span className={'chip ' + k}>{t}</span></div>)}
              </div>
            </div>
          </div>
        </header>
      </div>

      <section className="lp-section" id="features"><div className="lp-wrap">
        <h2>{c.featuresTitle}</h2>
        <p className="muted">{c.featuresLead}</p>
        <div className="lp-grid">{c.features.map((f, i) => <div className="lp-card" key={i}><div className="ic"><Icon name={f.icon} /></div><h3>{f.title}</h3><p>{f.text}</p></div>)}</div>
      </div></section>

      <section className="lp-section" id="how"><div className="lp-wrap">
        <h2>{c.howTitle}</h2>
        <p className="muted">{c.howLead}</p>
        <div className="lp-steps">{c.steps.map((st, i) => <div className="lp-card" key={i}><h3>{st.title}</h3><p>{st.text}</p></div>)}</div>
      </div></section>

      <section className="lp-section" id="demo"><div className="lp-wrap">
        <h2>{c.demoTitle}</h2>
        <p className="muted">{c.demoText} <a href="/demo">Open full screen →</a></p>
        <div className="lp-demo"><iframe src="/demo?embed=1" title="Harbor demo" loading="lazy" /></div>
        <div className="lp-demo-cta"><b>The demo works best full screen on a phone.</b><span className="muted small">Every module with made-up data: routes, paperwork, Pre-call, the tablet map and Overwatch.</span><a className="btn primary" href="/demo">Open the demo</a></div>
      </div></section>

      <section className="lp-section" id="tablet"><div className="lp-wrap">
        <h2>{c.tabletTitle}</h2>
        <p className="muted">{c.tabletText}</p>
        <TabletDemo />
      </div></section>

      <section className="lp-section" id="signin"><div className="lp-wrap lp-signin">
        <div>
          <h2>{c.signinTitle}</h2>
          <p className="muted" style={{ fontSize: 17, margin: 0 }}>{c.signinText}</p>
          <p className="small muted" style={{ marginTop: 18 }}>Tech with a tablet? <a href="/get">Get the tablet app</a>.</p>
        </div>
        <div className="card"><EmailCodeLogin next="/" /></div>
      </div></section>

      <div className="lp-wrap"><footer className="lp-foot"><span>{c.footer}</span><a href="/demo">Demo</a><a href="/get">Tablet app</a><a href="#signin">Sign in</a></footer></div>
    </div>
  );
}
