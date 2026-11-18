// Pre-call reply rules (the "logic tree"), the same rules as the Harbor extension's core/rules.js and Harbor Helper.
// The website edits them (stored in store_settings 'precall_rules') and sends them to the helper with each reply check.
export type Rule = { id: string; depth: number; kind: 'when' | 'if' | 'else'; check: string; title: string; keys: string; action: string; reply: string };

export const DEFAULT_RULES: Rule[] = [
  { id: "r1", depth: 0, kind: "when", check: "reply", title: "Customer replies to the precall", action: "none", keys: "", reply: "" },
  { id: "r2", depth: 1, kind: "if", check: "keywords", title: "Opt-out or wrong number", keys: "stop, unsubscribe, wrong number, wrong person, not me, who is this", action: "flag", reply: "" },
  { id: "r3", depth: 1, kind: "if", check: "keywords", title: "Wants to cancel", keys: "cancel, don't need, dont need, no longer need, already fixed, already got it fixed, never mind", action: "both", reply: "Understood, {first}. I'll let the store know." },
  { id: "r4", depth: 1, kind: "if", check: "keywords", title: "Wants to reschedule", keys: "reschedule, another day, different day, different time, can't make it, cant make it, won't be home, wont be home, not be home, push it back, move my appointment", action: "both", reply: "No problem, {first}. Someone from the store will reach out to find a new time." },
  { id: "r5", depth: 1, kind: "if", check: "keywords", title: "Price, deductible or claim question", keys: "how much, cost, price, deductible, pay, fee, claim status", action: "both", reply: "Thanks, {first}. I'll have the store confirm that for you." },
  { id: "r6", depth: 1, kind: "if", check: "keywords", title: "Upset or complaint", keys: "ridiculous, unacceptable, terrible, worst, scam, angry, upset, complain, lawyer", action: "flag", reply: "" },
  { id: "r7", depth: 1, kind: "if", check: "issue", title: "Describes the issue", keys: "", action: "none", reply: "" },
  { id: "r8", depth: 2, kind: "if", check: "claimMatch", title: "Matches the filed claim", keys: "", action: "reply", reply: "Thank you, {first}! You're all set for {date} ({window}). Your technician will message you here with an ETA in the morning." },
  { id: "r9", depth: 2, kind: "else", check: "always", title: "Differs from the claim", keys: "", action: "both", reply: "Thank you, {first}! We understand you filed for {filed}. Your technician will try to update the claim when they meet you tomorrow. If you'd like to update it yourself before then, please contact {carrier} device protection at {claimLine}. Your technician will message you here with an ETA in the morning." },
  { id: "r10", depth: 1, kind: "else", check: "always", title: "Anything else", keys: "", action: "reply", reply: "Thank you, {first}! You're all set for {date} ({window}). Your technician will message you here with an ETA in the morning." },
  { id: "r11", depth: 0, kind: "when", check: "followup", title: "Customer writes again after our reply", keys: "", action: "flag", reply: "" },
  { id: "r12", depth: 0, kind: "when", check: "noreply", title: "No reply when the watch ends", keys: "", action: "mark", reply: "" },
];

// ---- repair types in free text ("back glass" is removed first so it isn't also "screen")
const KINDS: Record<string, RegExp> = {
  bg: /back (glass|cover|panel|of (the|my) phone)|rear glass|back (is|was) (cracked|broken|shattered)|cracked back/,
  battery: /battery|drain|dies (fast|quick)|won'?t hold (a )?charge|swollen|bulg/,
  charging: /charg(ing|e) port|won'?t charge|not charging|doesn'?t charge|\bport\b/,
  camera: /camera|lens/,
  water: /water|liquid|wet\b|dropped (it )?in/,
  screen: /screen|display|lcd|oled|digitizer|touch (screen|isn|is not|doesn|not)|ghost touch|lines (on|across)|front (glass|is|of)/,
};
export const LABEL: Record<string, string> = { screen: "the screen", bg: "the back glass", battery: "the battery", charging: "the charging port", camera: "the camera", water: "water damage", other: "another repair" };
export function kindsIn(text: string) {
  // add-on services, not repairs
  let t = ` ${String(text || "").toLowerCase()} `.replace(/battery (check|health|test)|enhanced cleaning|performance (check|promise)|cleaning/g, " ");
  const out = new Set<string>();
  if (KINDS.bg.test(t)) { out.add("bg"); t = t.replace(new RegExp(KINDS.bg.source, "g"), " "); }
  for (const k of ["battery", "charging", "camera", "water", "screen"]) if (KINDS[k].test(t)) out.add(k);
  return [...out];
}

const words = (keys: string) => String(keys || "").split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
export const mentions = (text: string, keys: string) => { const t = ` ${String(text || "").toLowerCase().replace(/[’‘]/g, "'")} `; return words(keys).some((k) => t.includes(k)); };
const joinWords = (a: string[]) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);

export function children(rules: Rule[], i: number) {
  const out: number[] = [], d = rules[i].depth;
  for (let j = i + 1; j < rules.length && rules[j].depth > d; j++) if (rules[j].depth === d + 1) out.push(j);
  return out;
}

/**
 * Walk the tree for one customer message.
 * filedKinds: ["screen","bg",...] or null when unknown (then "claimMatch" always counts as a match).
 * returns { rule, path: [titles], kinds, extra: [repair kinds mentioned but not filed] }
 */
export function evaluate(rules: Rule[] | null, text: string, filedKinds: string[] | null, rootCheck?: string) {
  rules = Array.isArray(rules) && rules.length ? rules : DEFAULT_RULES;
  const kinds = kindsIn(text);
  const filed = Array.isArray(filedKinds) ? filedKinds.filter((k) => k !== "rw") : null;
  const extra = filed ? kinds.filter((k) => !filed.includes(k) && !(filed.includes("other") && ["camera", "charging", "water"].includes(k))) : [];
  const rootIdx = rules.findIndex((r) => r.depth === 0 && r.check === (rootCheck || "reply"));
  if (rootIdx < 0) return { rule: null, path: [], kinds, extra };
  const path: string[] = [rules[rootIdx].title];
  let hit = rootIdx, level = children(rules, rootIdx);
  while (level.length) {
    let found: number | null = null;
    for (const j of level) {
      const r = rules[j];
      const ok = r.check === "keywords" ? mentions(text, r.keys)
        : r.check === "issue" ? kinds.length > 0 || mentions(text, r.keys)
        : r.check === "claimMatch" ? !filed || !filed.length || extra.length === 0
        : r.check === "always";
      if (ok) { found = j; break; }
    }
    if (found === null) break;
    hit = found; path.push(rules[found].title); level = children(rules, found);
  }
  return { rule: rules[hit], path, kinds, extra };
}

export const fill = (tpl: string, v: Record<string, any>) => String(tpl || "").replace(/\{(\w+)\}/g, (m: string, k: string) => (k in v && v[k] != null && v[k] !== "" ? String(v[k]) : m))
  .replace(/\s*\(\s*\)/g, "").replace(/\s+/g, " ").replace(/\s+([,.!?])/g, "$1").trim();

/** Fill a reply. Returns null if it still has a {placeholder} that couldn't be filled (e.g. unknown carrier). */
export function render(tpl: string, ctx: Record<string, any>) {
  const carrier = /verizon/i.test(ctx.carrier || "") ? "Verizon" : /at&?t|\batt/i.test(ctx.carrier || "") ? "AT&T" : null;
  const lines = ctx.claimLines || {};
  const vars = {
    first: ctx.first, last: ctx.last, date: ctx.date, window: ctx.window, tech: ctx.tech, carrier,
    claimLine: carrier === "Verizon" ? lines.verizon : carrier === "AT&T" ? lines.att : null,
    filed: Array.isArray(ctx.filedKinds) && ctx.filedKinds.length ? joinWords(ctx.filedKinds.filter((k: string) => k !== "rw").map((k: string) => LABEL[k] || k)) : null,
  };
  const out = fill(tpl, vars);
  return /\{\w+\}/.test(out) ? null : out;
}


export const CHECKS: Record<string, string> = { reply: 'Customer replies', followup: 'Customer writes again', noreply: 'No reply', keywords: 'Message mentions…', issue: 'Describes a repair', claimMatch: 'Matches the filed claim', always: 'Anything else' };
export const ACTIONS: Record<string, string> = { reply: 'Send the reply', flag: 'Flag for me', both: 'Reply and flag', none: 'Just check below', mark: 'Mark it' };
