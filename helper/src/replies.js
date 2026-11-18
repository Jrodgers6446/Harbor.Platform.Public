// Reply rules for Pre-call: read what the customer wrote after the precall and decide the one automatic reply.
// Pure functions (no phone access) so they can be tested on their own.

const KINDS = {
  bg: /back (glass|cover|panel|of (the|my) phone)|rear glass|back (is|was) (cracked|broken|shattered)|cracked back/,
  battery: /battery|drain|dies (fast|quick)|won'?t hold (a )?charge|swollen|bulg/,
  charging: /charg(ing|e) port|won'?t charge|not charging|doesn'?t charge|\bport\b/,
  camera: /camera|lens/,
  water: /water|liquid|wet\b|dropped (it )?in/,
  screen: /screen|display|lcd|oled|digitizer|touch (screen|isn|is not|doesn|not)|ghost touch|lines (on|across)|front (glass|is|of)/,
};
const LABEL = { screen: "the screen", bg: "the back glass", battery: "the battery", charging: "the charging port", camera: "the camera", water: "water damage", other: "another repair" };

/** Repair types the customer mentions. Back-glass phrases are removed first so "back glass" isn't also "screen". */
function kindsIn(text) {
  // Add-on services, not repairs: "battery check", "enhanced cleaning", "performance check".
  let t = ` ${String(text || "").toLowerCase()} `.replace(/battery (check|health|test)|enhanced cleaning|performance (check|promise)|cleaning/g, " ");
  const out = new Set();
  if (KINDS.bg.test(t)) { out.add("bg"); t = t.replace(new RegExp(KINDS.bg.source, "g"), " "); }
  for (const k of ["battery", "charging", "camera", "water", "screen"]) if (KINDS[k].test(t)) out.add(k);
  return [...out];
}

const INTENTS = [
  ["stop", /\b(stop|unsubscribe)\b|wrong (number|person)|not me\b|who is this/],
  ["cancel", /\bcancel|don'?t need (it|the|this)|no longer need|already (got it )?(fixed|repaired)|never mind/],
  ["reschedule", /reschedul|another (day|time)|different (day|time)|can'?t make|won'?t be (home|available|there)|not (be )?(home|available)|move (it|my|the) (appointment|repair)|push (it )?back/],
  ["money", /how much|cost|price|deductible|pay\b|charge me|fee\b|claim status|was my claim/],
  ["upset", /ridiculous|unacceptable|terrible|worst|scam|angry|upset|complain|lawyer/],
];

/** Join a list into words: ["the screen","the battery"] -> "the screen and the battery" */
const joinWords = (a) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);

const fill = (tpl, v) => String(tpl || "").replace(/\{(\w+)\}/g, (m, k) => (k in v && v[k] != null ? String(v[k]) : m))
  .replace(/\s*\(\s*\)/g, "").replace(/\s+/g, " ").replace(/\s+([,.!?])/g, "$1").trim();

/**
 * Decide what to do with the customer's new messages.
 * ctx: { first, date, window, carrier, filedKinds: ["screen","bg",...] | null, templates: { thanks, mismatch }, claimLines: { att, verizon } }
 * returns { action: "reply" | "flag" | "none", reply, flags: [..], customerKinds, filedKinds, mismatch }
 */
function decide(customerText, ctx) {
  const t = String(customerText || "").toLowerCase();
  const flags = [];
  for (const [name, re] of INTENTS) if (re.test(t)) flags.push(name);
  const customerKinds = kindsIn(t);
  const filed = Array.isArray(ctx.filedKinds) ? ctx.filedKinds.filter((k) => k !== "rw") : null;
  // Anything the customer describes that wasn't filed. "other" filed parts can cover camera / port / audio.
  const extra = filed ? customerKinds.filter((k) => !filed.includes(k) && !(filed.includes("other") && ["camera", "charging", "water"].includes(k))) : [];
  const mismatch = !!(filed && filed.length && extra.length);

  // Things a person should handle: no automatic reply.
  const hard = flags.filter((f) => ["stop", "cancel", "reschedule", "money", "upset"].includes(f));
  if (hard.length) return { action: "flag", reply: null, flags: hard, customerKinds, filedKinds: filed, mismatch };

  const carrier = /verizon/i.test(ctx.carrier || "") ? "Verizon" : /at&?t|att/i.test(ctx.carrier || "") ? "AT&T" : null;
  const vars = { first: ctx.first, date: ctx.date, window: ctx.window, carrier, claimLine: carrier === "Verizon" ? ctx.claimLines.verizon : carrier === "AT&T" ? ctx.claimLines.att : null,
    filed: filed && filed.length ? joinWords(filed.map((k) => LABEL[k] || k)) : null };

  if (mismatch && carrier) {
    return { action: "reply", reply: fill(ctx.templates.mismatch, vars), flags: ["claim differs"], customerKinds, filedKinds: filed, mismatch, said: joinWords(extra.map((k) => LABEL[k] || k)) };
  }
  if (mismatch) flags.push("claim differs (carrier unknown, sent thank-you only)");
  return { action: "reply", reply: fill(ctx.templates.thanks, vars), flags, customerKinds, filedKinds: filed, mismatch };
}

// The editable logic tree (Harbor Settings > Pre-call > Reply logic). Same engine as the web tester.
const Rules = require("./rules");
function decideTree(customerText, ctx, rules) {
  const ev = Rules.evaluate(rules, customerText, ctx.filedKinds);
  const r = ev.rule;
  const base = { customerKinds: ev.kinds, filedKinds: ctx.filedKinds || null, mismatch: ev.extra.length > 0, path: ev.path };
  if (!r || !["reply", "both", "flag"].includes(r.action)) return { ...base, action: "flag", reply: null, flags: [r ? `no reply set for "${r.title}"` : "no rule matched"] };
  const flags = r.action === "reply" ? [] : [r.title];
  if (r.action === "flag") return { ...base, action: "flag", reply: null, flags };
  const reply = Rules.render(r.reply, ctx);
  if (!reply) return { ...base, action: "flag", reply: null, flags: [`${r.title} (couldn't fill the reply, e.g. unknown carrier)`] };
  return { ...base, action: "reply", reply, flags };
}

module.exports = { decide, decideTree, kindsIn, fill, LABEL };
