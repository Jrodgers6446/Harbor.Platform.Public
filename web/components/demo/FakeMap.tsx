// Invented map for the demo and front page: no real places, no map provider. Techs show only as T1, T2…
// Colours follow the Harbor theme.

export const TECH_COLORS = ['#8b5cf6', '#5ee0a8', '#fbc767', '#f0a5a5', '#7cb7ff'];

type Pt = [number, number];
export type MapTech = { label: string; color: string; van: Pt; stops?: Pt[]; done?: number; state?: 'online' | 'idle' | 'offline' };

const STORE: Pt = [300, 210];

const H = [60, 130, 205, 280, 350];
const V = [-290, -200, -110, -20, 70, 160, 250, 350, 450, 530, 620, 710, 800, 890];

export function FakeMap({ techs, height = 320, showRoutes = true, focus }: { techs: MapTech[]; height?: number; showRoutes?: boolean; focus?: number }) {
  return (
    <div style={{ height, borderRadius: 14, background: '#0d0b12', border: '1px solid #241f2f', overflow: 'hidden' }}>
    <svg viewBox="0 0 600 400" width="100%" height="100%" role="img" aria-label="Map (made-up)" preserveAspectRatio="xMidYMid meet" overflow="visible" style={{ display: 'block' }}>
      {/* parks + water */}
      <rect x="370" y="225" width="110" height="80" rx="10" fill="#122019" />
      <rect x="90" y="40" width="70" height="55" rx="10" fill="#122019" />
      <path d="M-400 345 C -200 300, -100 380, 0 340 C 120 300, 180 380, 300 350 S 480 300, 610 340 S 850 300, 1000 350 L 1000 500 L -400 500 Z" fill="#111827" />
      <rect x="-230" y="150" width="90" height="70" rx="10" fill="#122019" />
      <rect x="660" y="90" width="100" height="70" rx="10" fill="#122019" />
      {/* streets */}
      {H.map((y) => <line key={'h' + y} x1="-400" x2="1000" y1={y} y2={y} stroke="#1c1826" strokeWidth={y === 205 ? 7 : 4} />)}
      {V.map((x) => <line key={'v' + x} y1="-100" y2="500" x1={x} x2={x} stroke="#1c1826" strokeWidth={x === 250 ? 7 : 4} />)}
      <line x1="-400" y1="-167" x2="1000" y2="487" stroke="#1c1826" strokeWidth="5" />
      <line x1="680" y1="-75" x2="330" y2="430" stroke="#1c1826" strokeWidth="4" />
      {/* routes */}
      {showRoutes && techs.map((t, i) => t.stops && t.stops.length > 0 && (
        <polyline key={'r' + i} points={[STORE, ...t.stops].map((p) => p.join(',')).join(' ')} fill="none" stroke={t.color}
          strokeWidth={focus == null || focus === i ? 3.5 : 2} strokeOpacity={focus == null || focus === i ? 0.95 : 0.3} strokeLinejoin="round" strokeDasharray={focus === i ? undefined : '0'} />
      ))}
      {/* stops */}
      {showRoutes && techs.map((t, i) => (t.stops || []).map((p, j) => {
        const done = j < (t.done || 0);
        const dim = focus != null && focus !== i;
        return (
          <g key={`s${i}-${j}`} opacity={dim ? 0.35 : 1}>
            <circle cx={p[0]} cy={p[1]} r="10" fill={done ? t.color : '#121018'} stroke={t.color} strokeWidth="2.5" />
            <text x={p[0]} y={p[1] + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill={done ? '#09080c' : '#ede9f6'} fontFamily="Inter, sans-serif">{j + 1}</text>
          </g>
        );
      }))}
      {/* store */}
      <g>
        <rect x={STORE[0] - 13} y={STORE[1] - 13} width="26" height="26" rx="7" fill="#8b5cf6" />
        <path d={`M${STORE[0] - 6} ${STORE[1] + 5} v-6 l6 -5 l6 5 v6 z`} fill="#fff" />
      </g>
      {/* vans */}
      {techs.map((t, i) => {
        const dim = focus != null && focus !== i;
        const ring = t.state === 'offline' ? '#f87171' : t.state === 'idle' ? '#fbc767' : t.color;
        return (
          <g key={'t' + i} opacity={dim ? 0.4 : 1}>
            <circle cx={t.van[0]} cy={t.van[1]} r="17" fill={t.color} fillOpacity="0.18" />
            <circle cx={t.van[0]} cy={t.van[1]} r="12.5" fill="#09080c" stroke={ring} strokeWidth="3" />
            <text x={t.van[0]} y={t.van[1] + 4} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#fff" fontFamily="Inter, sans-serif">{t.label}</text>
          </g>
        );
      })}
    </svg>
    </div>
  );
}

// Shared made-up day: four techs, each with a route of stops.
export const DEMO_MAP: MapTech[] = [
  { label: 'T1', color: TECH_COLORS[0], van: [452, 150], stops: [[350, 130], [452, 150], [530, 60], [530, 205], [450, 280], [350, 280]], done: 4, state: 'online' },
  { label: 'T2', color: TECH_COLORS[1], van: [160, 160], stops: [[250, 130], [160, 160], [70, 130], [70, 280], [160, 350]], done: 3, state: 'online' },
  { label: 'T3', color: TECH_COLORS[2], van: [250, 300], stops: [[250, 280], [160, 280], [205, 330], [350, 350], [450, 350], [530, 350]], done: 2, state: 'idle' },
  { label: 'T4', color: TECH_COLORS[3], van: [345, 60], stops: [[300, 60], [345, 60], [250, 20], [160, 60], [70, 60], [70, 20]], done: 6, state: 'offline' },
];
