// Text on the public front page. Overwatch edits it (Overwatch > Front page); this is the built-in default.
// Written for any field-service company, not one in particular.
export type Welcome = {
  eyebrow: string;
  title: string;          // wrap words in *stars* to colour them
  lead: string;
  note: string;
  featuresTitle: string;
  featuresLead: string;
  features: { icon: string; title: string; text: string }[];
  howTitle: string;
  howLead: string;
  steps: { title: string; text: string }[];
  demoTitle: string;
  demoText: string;
  tabletTitle: string;
  tabletText: string;
  signinTitle: string;
  signinText: string;
  footer: string;
};

export const WELCOME_DEFAULT: Welcome = {
  eyebrow: 'Built for field service teams',
  title: 'Your whole field team, in *one harbor*.',
  lead: 'Harbor plans tomorrow’s routes, builds each tech’s daily paperwork, confirms customers before the visit and keeps every tablet in sight. Managers run it here; techs carry it on a tablet.',
  note: 'Sign in once with a code we email you. You stay signed in for 30 days.',
  featuresTitle: 'Everything a field team runs on, in one place',
  featuresLead: 'The same modules your managers use every day, on the web for every manager, plus a space for each of your locations.',
  features: [
    { icon: 'routes', title: 'Route Planner', text: 'Every tech’s stops for the day in order, with time windows and one tap to open the route in Maps.' },
    { icon: 'dps', title: 'Daily paperwork', text: 'Builds tomorrow’s daily paperwork forms from the schedule and sends them to each tech’s tablet. Signed off at the end of the day.' },
    { icon: 'precall', title: 'Pre-call', text: 'Confirms tomorrow’s customers before the visit, then sorts the replies: confirmed, new time, extra work, no answer.' },
    { icon: 'techdash', title: 'Tech Dashboard', text: 'Jobs done, cancellations and completion rate per tech, from the systems you already use.' },
    { icon: 'devices', title: 'Tablets', text: 'Set up a tablet by scanning a QR code. A live map shows every van, and Overwatch flags long jobs, stops off route and missed customers.' },
    { icon: 'store', title: 'Your locations', text: 'Each location manages its own people, forms and repair guides, and keeps its data separate.' },
  ],
  howTitle: 'How it fits together',
  howLead: 'Three pieces, one set of data.',
  steps: [
    { title: 'Harbor Bridge', text: 'A small Chrome extension that reads your scheduling and work-order systems in your own browser and keeps Harbor up to date. Your passwords never leave your browser.' },
    { title: 'This website', text: 'Managers plan the day, send paperwork to tablets, watch progress and manage each location.' },
    { title: 'The tablet app', text: 'Techs see their daily paperwork, route and repair guides, fill in parts and outcomes, and the van’s location reports itself.' },
  ],
  demoTitle: 'Try it',
  demoText: 'A made-up company with made-up data. Click around the modules; nothing you do here is real.',
  tabletTitle: 'On the tablet',
  tabletText: 'What each tech carries: today’s paperwork form, the route (open it all in Google Maps or Waze), and repair guides. Works on tablets and phones. Try it: fill in a customer and press Done, or switch to Phone.',
  signinTitle: 'Sign in',
  signinText: 'Use your work email. New here? Choose Sign up, pick your store, and a manager there approves you. We email you a 6-digit code; after that, this computer stays signed in for 30 days.',
  footer: 'Harbor · Created by SageWorkx',
};

/** Saved content merged over the default, so a field left out never breaks the page. */
export function welcomeFrom(v: unknown): Welcome {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<Welcome>;
  const str = (k: keyof Welcome) => (typeof o[k] === 'string' && (o[k] as string).trim() ? (o[k] as string) : (WELCOME_DEFAULT[k] as string));
  return {
    ...(Object.fromEntries((Object.keys(WELCOME_DEFAULT) as (keyof Welcome)[]).filter((k) => typeof WELCOME_DEFAULT[k] === 'string').map((k) => [k, str(k)])) as any),
    features: Array.isArray(o.features) && o.features.length ? o.features.slice(0, 12).map((f) => ({ icon: String(f?.icon || 'dps'), title: String(f?.title || ''), text: String(f?.text || '') })) : WELCOME_DEFAULT.features,
    steps: Array.isArray(o.steps) && o.steps.length ? o.steps.slice(0, 6).map((f) => ({ title: String(f?.title || ''), text: String(f?.text || '') })) : WELCOME_DEFAULT.steps,
  };
}
