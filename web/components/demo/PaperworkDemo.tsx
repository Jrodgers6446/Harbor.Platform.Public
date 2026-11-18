'use client';
import { useState } from 'react';

// Kinds of daily paperwork a field team fills in on the tablet, with made-up data. Each company picks the
// forms it uses; the daily job sheet is one of them.

export const DEMO_JOBS = [
  { c: 'Dana Whitfield', d: 'Phone · Cracked screen', w: '8 – 10 AM', part: 'P-48120', st: 'Installed', out: 'Completed', a: '120 Oak St, Exampleton' },
  { c: 'Marcus Bell', d: 'Dishwasher · Not draining', w: '9 – 11 AM', part: 'P-51207', st: 'Installed', out: 'Completed', a: '48 Mill Rd, Exampleton' },
  { c: 'Priya Raman', d: 'HVAC · Annual tune-up', w: '11 AM – 1 PM', part: 'Filter 16x25', st: 'Installed', out: 'Completed', a: '9 Lake Ave, Testville' },
  { c: 'Lena Fischer', d: 'Internet · Router install', w: '1 – 3 PM', part: 'R-2200', st: 'Returned', out: 'Rescheduled', why: 'Customer not home, rebooked Monday', a: '702 Pine Ct, Testville' },
  { c: 'Omar Haddad', d: 'Laptop · Keyboard', w: '3 – 5 PM', part: 'K-7731', st: 'Installed', out: 'Completed', a: '15 Birch Ln, Exampleton' },
];

const FORMS = [
  { id: 'jobs', name: 'Daily job sheet', desc: 'Every stop: parts, outcome, reasons. Signed off at the end of the day.' },
  { id: 'vehicle', name: 'Vehicle check', desc: 'Start-of-day walk-around and mileage.' },
  { id: 'signoff', name: 'Customer sign-off', desc: 'Work done and the customer’s signature, per job.' },
  { id: 'parts', name: 'Parts & stock', desc: 'Parts taken out, used and returned.' },
  { id: 'safety', name: 'Safety checklist', desc: 'PPE and site checks before work starts.' },
];

const Sig = ({ w = 300 }: { w?: number }) => (
  <div className="sig" style={{ maxWidth: w, marginTop: 6 }}><svg viewBox="0 0 500 160"><path d="M30 110 C 60 40, 90 40, 95 100 S 130 150, 160 90 S 200 40, 215 100 C 225 130, 250 130, 270 80 C 285 50, 305 70, 310 100 S 350 120, 420 70" fill="none" stroke="#1d1630" strokeWidth="4" strokeLinecap="round" /></svg></div>
);
const Box = ({ on }: { on: boolean }) => <span style={{ display: 'inline-grid', placeItems: 'center', width: 16, height: 16, border: '1.5px solid #555', borderRadius: 3, marginRight: 8, fontSize: 12 }}>{on ? '✓' : ''}</span>;

export function PaperworkDemo({ tech = 'Casey Brooks', van = 'Van 4' }: { tech?: string; van?: string }) {
  const [form, setForm] = useState('jobs');
  return (
    <div>
      <div className="paper-picker">{FORMS.map((f) => (
        <button key={f.id} className={'paper-pick' + (form === f.id ? ' on' : '')} onClick={() => setForm(f.id)}><b>{f.name}</b><span>{f.desc}</span></button>))}</div>

      <div className="sheet-print" style={{ marginTop: 14 }}>
        {form === 'jobs' && (<>
          <h3>Daily Job Sheet</h3>
          <div>Technician: <b>{tech}</b> &nbsp; Vehicle: {van} &nbsp; Clock in: 7:40 AM &nbsp; Vehicle check: Done</div>
          <div style={{ marginTop: 10, textDecoration: 'underline' }}>Jobs</div>
          {DEMO_JOBS.map((j, i) => <div className="cust" key={j.c}>
            <div>{i + 1}. <b>{j.c}</b> &nbsp; {j.d} <span style={{ color: '#666' }}>{j.w}</span></div>
            <div>Part: {j.part} &nbsp; Part status: <b>{j.st}</b> &nbsp; Outcome: <b>{j.out}</b> {j.why && <span>· Reason: {j.why}</span>}</div>
          </div>)}
          <div style={{ marginTop: 12 }}>Clock out: 5:41 PM &nbsp; End mileage: 48,213 &nbsp; End-of-day check: Done</div>
          <div style={{ marginTop: 12 }}><b>Manager sign-off:</b> Morgan Diaz</div>
          <Sig w={420} />
        </>)}

        {form === 'vehicle' && (<>
          <h3>Vehicle Check · start of day</h3>
          <div>Technician: <b>{tech}</b> &nbsp; Vehicle: {van} &nbsp; Start mileage: 48,104 &nbsp; Fuel: ¾</div>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px 20px' }}>
            {[['Tires and pressure', true], ['Lights and indicators', true], ['Mirrors and windows', true], ['Fluids (oil, washer)', true], ['Dash warning lights', false], ['Load secured', true], ['First-aid kit', true], ['Body damage (new)', false]].map(([l, ok]) => <div key={String(l)}><Box on={!!ok} />{l}{!ok && <span style={{ color: '#b45309' }}> · noted</span>}</div>)}
          </div>
          <div style={{ marginTop: 10 }}>Notes: Tire pressure light came on at 7:35, topped up at the depot. Small scratch on rear bumper (photo attached).</div>
          <div style={{ marginTop: 12 }}><b>Technician signature</b></div><Sig />
        </>)}

        {form === 'signoff' && (<>
          <h3>Customer Sign-off</h3>
          <div>Job: <b>{DEMO_JOBS[1].c}</b> · {DEMO_JOBS[1].d} &nbsp; {DEMO_JOBS[1].a}</div>
          <div style={{ marginTop: 8 }}>Arrived 9:12 AM &nbsp; Finished 10:05 AM &nbsp; Technician: {tech}</div>
          <div style={{ marginTop: 10, textDecoration: 'underline' }}>Work done</div>
          <div>Cleared blocked drain hose, replaced pump filter ({DEMO_JOBS[1].part}). Ran a full cycle: draining normally.</div>
          <div style={{ marginTop: 10 }}><Box on />Customer shown the work &nbsp; <Box on />Area left clean &nbsp; <Box on={false} />Follow-up needed</div>
          <div style={{ marginTop: 12 }}><b>Customer signature:</b> {DEMO_JOBS[1].c}</div><Sig />
        </>)}

        {form === 'parts' && (<>
          <h3>Parts &amp; Stock</h3>
          <div>Technician: <b>{tech}</b> &nbsp; Vehicle: {van}</div>
          <table style={{ marginTop: 10, color: '#111' }}><thead><tr><th style={{ color: '#555' }}>Part</th><th style={{ color: '#555' }}>Taken out</th><th style={{ color: '#555' }}>Used</th><th style={{ color: '#555' }}>Returned</th><th style={{ color: '#555' }}>Job</th></tr></thead><tbody>
            {DEMO_JOBS.map((j) => <tr key={j.part}><td style={{ borderColor: '#ddd' }}>{j.part}</td><td style={{ borderColor: '#ddd' }}>1</td><td style={{ borderColor: '#ddd' }}>{j.st === 'Installed' ? 1 : 0}</td><td style={{ borderColor: '#ddd' }}>{j.st === 'Returned' ? 1 : 0}</td><td style={{ borderColor: '#ddd' }}>{j.c}</td></tr>)}
          </tbody></table>
          <div style={{ marginTop: 12 }}><b>Checked in by:</b> Morgan Diaz · 5:50 PM</div>
        </>)}

        {form === 'safety' && (<>
          <h3>Safety Checklist</h3>
          <div>Technician: <b>{tech}</b> &nbsp; Date: today</div>
          <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
            {['Gloves and eye protection on hand', 'Power isolated before opening any unit', 'Ladder inspected (if used)', 'Customer pets and children clear of the work area', 'Ventilation checked for HVAC and appliance jobs'].map((l) => <div key={l}><Box on />{l}</div>)}
          </div>
          <div style={{ marginTop: 12 }}><b>Technician signature</b></div><Sig />
        </>)}
      </div>
    </div>
  );
}
