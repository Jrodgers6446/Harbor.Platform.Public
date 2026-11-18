// Field app driver. Everything app-specific lives here so an app update
// only means editing SELECTORS / the functions below.
const A = require("./adb");

const PKG = "com.asurion.fieldapp";
const MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";

// Mapped on a Samsung S-series phone; selectors match the app's visible text / content descriptions.
const SELECTORS = {
  futureHeader: (n) => n.text === "Future Jobs",
  todayTab: (n) => n.text === "Today",
  messagesTab: (n) => n.text === "Messages",
  jobCard: (n) => n.cls === "android.widget.Button",   // offscreen cards are in the tree too (with h = 0)
  chatIcon: (n) => n.desc === "chat-bubbles-circle",
  phoneIcon: (n) => n.desc === "phone",
  msgBox: (n) => n.cls === "android.widget.EditText",
  sendBtn: (n) => n.desc === "Send message",
  chatClosed: (n) => n.text === "This chat is now closed.",
};

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const todayLabel = () => { const d = new Date(); return `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}`; };

async function waitFor(pred, timeout = 10) {
  const end = Date.now() + timeout * 1000;
  let nodes = [];
  while (Date.now() < end) {
    nodes = await A.dump();
    const node = nodes.find(pred);
    if (node) return { node, nodes };
    await A.sleep(0.3);
  }
  return { node: null, nodes };
}

async function open() {
  if ((await A.currentPackage()) !== PKG) {
    await A.collapseShade();
    await A.launch(PKG);
    await A.sleep(3);
  }
}

/** Back out until the schedule (Future Jobs header or Today tab) is visible. */
async function toSchedule(tries = 6) {
  for (let i = 0; i < tries; i++) {
    const nodes = await A.dump();
    if (nodes.some(SELECTORS.futureHeader)) return true;
    if (!nodes.some((n) => n.pkg === PKG)) { await A.collapseShade(); await A.launch(PKG); await A.sleep(2.5); continue; }
    // The bottom tab bar's "Today" (the Messages screen also has a "Today" filter at the top).
    const today = nodes.filter((n) => SELECTORS.todayTab(n) && n.h > 0).sort((a, b) => b.y - a.y)[0];
    const onMessages = nodes.some((n) => n.text === "Upcoming");
    if (today && (onMessages || i >= 2)) { await A.tap(today); await A.sleep(1.2); continue; }
    await A.back();
    await A.sleep(0.8);
  }
  return (await A.dump()).some(SELECTORS.futureHeader);
}

/** Does this card belong to the job? Card text: "<Name> Nov 13 <address> <state> <zip> <carrier> <repair>" */
function cardMatches(card, job) {
  const t = norm(card.text);
  const name = norm(job.customer);
  if (!name || !(t === name || t.startsWith(name + " "))) return false;
  const hasDate = new RegExp(`\\b(${MONTHS.toLowerCase()}) \\d{1,2}\\b`).test(t);
  const date = norm(job.date || "");
  if (date) {
    if (hasDate && !new RegExp(`\\b${date}\\b`).test(t)) return false;
    if (!hasDate && date !== norm(todayLabel())) return false;
  }
  if (job.zip && !t.includes(String(job.zip))) return false;
  return true;
}

/** Find the job's card and tap it. The page lists every card (offscreen ones have no height), so we
 *  know right away whether the customer is on this account at all, and which way to scroll. */
const isDateCard = (n) => SELECTORS.jobCard(n) && new RegExp(`\\b(${MONTHS}) \\d{1,2}\\b`).test(n.text);
async function openJob(job, maxScrolls = 25) {
  if (!(await toSchedule())) throw new Error("Couldn't reach the schedule");
  const { w, h } = await A.screenSize();
  let lastSig = "", stuck = 0;
  // Some phones' screen readers (the fast bridge on a Pixel) only list the cards that are on screen. Then a
  // customer that isn't in the list yet has to be searched for: scroll down to the end, then back up.
  let searchDir = 1, searchStuck = 0, searchSig = "";
  for (let i = 0; i <= maxScrolls * 2; i++) {
    const nodes = await A.dump();
    const cards = nodes.filter((n) => SELECTORS.jobCard(n) && n.text);
    const matches = cards.filter((c) => cardMatches(c, job));
    if (!matches.length) {
      const fullTree = cards.some((c) => c.h <= 0);  // off-screen cards are listed too (zero height)
      if (fullTree || !cards.length) return false;                          // not on this account's schedule
      const sig = cards.map((c) => c.text).join("|");
      searchStuck = sig === searchSig ? searchStuck + 1 : 0; searchSig = sig;
      if (searchStuck >= 2) { if (searchDir === -1) return false; searchDir = -1; searchStuck = 0; }
      const d = 0.28;
      if (searchDir === 1) await A.swipe(w / 2, h * (0.5 + d), w / 2, h * (0.5 - d), 450);
      else await A.swipe(w / 2, h * (0.5 - d), w / 2, h * (0.5 + d), 450);
      await A.sleep(0.6);
      continue;
    }
    if (matches.length > 1) throw new Error(`ambiguous: ${matches.length} cards match - add zip to the job`);
    const m = matches[0];
    // Tappable when its middle is clear of the top bar and the bottom Today/Messages bar (cards at the very end
    // of the list never get further up than that). If the list stopped moving, take any part that shows.
    const visible = m.h > 40 && m.y >= h * 0.1 && m.y <= h * (stuck >= 1 ? 0.93 : 0.88);
    if (visible) {
      await A.sleep(0.4);                       // let any scroll come to rest, or the tap only stops it
      const fresh = (await A.dump()).find((c) => SELECTORS.jobCard(c) && c.text === m.text && c.h > 40) || m;
      for (let t = 0; t < 2; t++) {
        await A.tap(fresh);
        const left = await waitFor((n) => SELECTORS.chatIcon(n) || SELECTORS.msgBox(n) || SELECTORS.chatClosed(n), 5);
        if (left.node) return true;
        if (!left.nodes.some(SELECTORS.futureHeader)) return true;          // moved on to some other customer screen
      }
      return true;                                                          // openChat decides what happened
    }
    // Which way? Compare the target's place in the list with the cards on screen.
    const order = cards.filter(isDateCard).map((c) => c.text);
    const onScreen = cards.filter((c) => c.h > 40 && c.y1 >= 0 && c.y2 <= h);
    const idx = order.indexOf(m.text);
    const shownIdx = onScreen.map((c) => order.indexOf(c.text)).filter((x) => x >= 0);
    const down = m.h > 0 ? m.y > h / 2 : !shownIdx.length || idx > Math.max(...shownIdx);
    // Stay well inside the list: the top bar and the bottom Today/Messages bar swallow swipes.
    const dist = m.h > 0 ? 0.2 : 0.28;
    if (down) await A.swipe(w / 2, h * (0.5 + dist), w / 2, h * (0.5 - dist), 450);
    else await A.swipe(w / 2, h * (0.5 - dist), w / 2, h * (0.5 + dist), 450);
    await A.sleep(0.6);
    const sig = onScreen.map((c) => c.text).join("|");
    stuck = sig === lastSig ? stuck + 1 : 0; lastSig = sig;
    if (stuck >= 3) break;                                                  // the list isn't moving
  }
  return false;
}

/** From the customer screen, open the chat.
 *  Returns {state: "open"|"closed"|"no-chat-icon"|"no-message-box", box, nodes}. */
async function openChat() {
  // Some jobs open straight into the chat; others show the customer screen with a chat button first.
  const chatShown = (n) => SELECTORS.msgBox(n) || SELECTORS.chatClosed(n);
  const first = await waitFor((n) => SELECTORS.chatIcon(n) || chatShown(n), 15);
  if (!first.node) return { state: "no-chat-icon", nodes: first.nodes };
  if (SELECTORS.chatIcon(first.node) && !first.nodes.some(chatShown)) await A.tap(first.node);
  // Long chats can take a while before the page exposes the message box.
  const res = await waitFor(chatShown, 25);
  if (!res.node) return { state: "no-message-box", nodes: res.nodes };
  if (SELECTORS.chatClosed(res.node)) return { state: "closed" };
  await A.sleep(0.8); // let history load
  const nodes = await A.dump();
  return { state: "open", box: nodes.find(SELECTORS.msgBox) || res.node, nodes };
}

const chatContains = (nodes, text) => !!text && nodes.some((n) => n.text.includes(text));

/** Type + send in the open chat. Before tapping Send it reads the box back; if the text isn't exactly
 *  the message it clears and retypes (up to 3 tries) and never sends a garbled message. */
const squash = (t) => String(t || "").replace(/\s+/g, " ").trim();
async function readBox() {
  const n = (await A.dump()).find(SELECTORS.msgBox);
  return n ? n.text : null;
}
// Ways to put the message in the box, tried in this order until one reads back exactly right.
// Pasting and "set text" skip the keyboard entirely (Gboard on Pixels drops / autocorrects letters when typed fast).
const ENTRY = [
  { name: "paste", run: (m) => A.pasteText(m) },
  { name: "set text", run: (m) => A.setTextFocused(m) },
  { name: "bridge typing", run: (m) => A.setText(m) },
  { name: "slow typing", run: async (m) => { await A.clearFocused(); await A.sleep(0.2); await A.typeSlow(m); return true; } },
];
async function enterText(box, message, attempt) {
  await A.tap(box);
  await A.sleep(0.3);
  // without the fast bridge only key typing is possible: normal speed first, then slow
  const ways = ENTRY.slice(0);
  for (let i = attempt - 1; i < ways.length; i++) {
    const w = ways[i];
    if (await w.run(message)) { await A.sleep(0.6); return w.name; }
  }
  await A.clearFocused(); await A.sleep(0.2); await A.type(message); await A.sleep(0.6);
  return "typing";
}
async function send(box, message) {
  let typed = null;
  const tries = ENTRY.length;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const how = await enterText(box, message, attempt);
    typed = await readBox();
    if (typed === null) { await A.sleep(1); typed = await readBox(); } // the keyboard can hide the box for a moment
    if (typed === null) { await A.clearFocused(); throw new Error("Couldn't read the message box back, so nothing was sent"); }
    if (squash(typed) === squash(message)) break;
    if (attempt === tries) { await A.clearFocused(); throw new Error(`The message didn't come out right (${how}), so nothing was sent (last try: "${squash(typed).slice(0, 80)}")`); }
  }
  const btn = await waitFor(SELECTORS.sendBtn, 5);
  if (!btn.node) { await A.clearFocused(); throw new Error("Send button not found"); }
  await A.tap(btn.node);
  const sent = await waitFor((n) => n.text.includes(message.slice(0, 25)) && !SELECTORS.msgBox(n), 6);
  return !!sent.node;
}

/** Test only: type the message, read it back, then clear it. Never taps Send. */
async function typeTest(box, message) {
  await enterText(box, message, 1);
  let typed = await readBox();
  if (typed === null || squash(typed) !== squash(message)) { await enterText(box, message, 2); typed = await readBox(); }
  await A.clearFocused(); await A.sleep(0.5);
  const left = await readBox();
  return { typed, matches: typed !== null && squash(typed) === squash(message), clearedAfter: !left };
}

// ---------------------------------------------------------------- replies
const TIME_RE = /^\d{1,2}:\d{2}\s?(am|pm)$/i;
/** Messages in an open chat, oldest first: [{ from: "me" | "customer", text }].
 *  Bubbles come after the header's Call button in the page; ours sit on the right edge, theirs on the left. */
function readChat(nodes) {
  const start = nodes.findIndex((n) => n.desc === "Call customer");
  const out = [];
  for (const n of nodes.slice(start + 1)) {
    if (n.cls !== "android.widget.TextView" || !n.text.trim()) continue;
    const t = n.text.trim();
    if (TIME_RE.test(t) || /^(today|yesterday)$/i.test(t) || t === "This chat is now closed.") continue;
    if (n.x2 >= 1250 && n.x1 > 200) out.push({ from: "me", text: t });
    else if (n.x1 <= 140 && n.x2 < 1250) out.push({ from: "customer", text: t });
  }
  return out;
}

/** Open Messages > Upcoming and return { [jobId]: true } for customers whose latest message is theirs (not "You: ..."). */
async function customersWhoReplied(jobs) {
  await toSchedule();
  let nodes = await A.dump();
  const tab = nodes.filter((n) => SELECTORS.messagesTab(n) && n.h > 0).sort((a, b) => b.y - a.y)[0];
  if (!tab) return null;
  await A.tap(tab);
  const up = await waitFor((n) => n.text === "Upcoming", 6);
  if (!up.node) return null;
  await A.tap(up.node);
  await A.sleep(1.5);
  nodes = await A.dump();
  const texts = nodes.filter((n) => n.cls === "android.widget.TextView" && n.text).map((n) => n.text);
  const out = {};
  for (const job of jobs) {
    const name = norm(job.customer);
    const i = texts.findIndex((t) => norm(t).includes(name));
    if (i < 0) { out[job.id] = "unknown"; continue; }
    const t = texts[i];
    const after = norm(t) === name ? (texts[i + 1] || "") : t.slice(t.toLowerCase().indexOf(String(job.customer).toLowerCase().split(/\s+/).pop()) + String(job.customer).split(/\s+/).pop().length);
    out[job.id] = /^\s*you:/i.test(after) ? "me" : "customer";
  }
  // Back to the schedule through the bottom "Today" tab.
  const today = nodes.filter((n) => SELECTORS.todayTab(n) && n.h > 0).sort((a, b) => b.y - a.y)[0];
  if (today) { await A.tap(today); await A.sleep(1.2); }
  return out;
}

module.exports = { readChat, customersWhoReplied, typeTest, PKG, SELECTORS, open, toSchedule, openJob, openChat, chatContains, send, waitFor, cardMatches };
