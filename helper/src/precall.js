// Pre-call run orchestrator. One run at a time (one phone). Emits events for the extension.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const A = require("./adb");
const F = require("./fieldapp");
const R = require("./replies");

/**
 * job: { id, customer, date?: "Nov 13", zip?, first?, window?, vars?: {} }
 * template placeholders: {first} {last} {customer} {date} {window} + any job.vars key
 */
function render(template, job) {
  const parts = String(job.customer || "").trim().split(/\s+/);
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : "");
  const vars = {
    first: cap(job.first || parts[0] || "there"),
    last: cap(parts.slice(1).join(" ")),
    customer: job.customer || "",
    date: job.date || "",
    window: job.window || "",
    ...(job.vars || {}),
  };
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)).replace(/\s+/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
}

class PrecallRun extends EventEmitter {
  constructor({ jobs, template, mode = "dry", cfg, replyConfig = null }) {
    super();
    this.id = crypto.randomUUID();
    this.jobs = jobs;
    this.template = template;
    this.mode = mode;               // "dry" | "type" | "send" | "replies" | "replies-dry"
    this.replyConfig = replyConfig; // { templates: { thanks, mismatch }, claimLines: { lineA, lineB } }
    this.cfg = cfg;
    this.state = "queued";          // queued | running | done | cancelled | failed
    this.results = [];
    this.startedAt = null;
    this.finishedAt = null;
    this.error = null;
    this._cancel = false;
    this.setMaxListeners(50);
  }

  cancel() { this._cancel = true; }

  summary() {
    return {
      id: this.id, state: this.state, mode: this.mode, engine: this.engine || null, total: this.jobs.length,
      processed: this.results.length, sent: this.results.filter((r) => r.status === "sent").length,
      startedAt: this.startedAt, finishedAt: this.finishedAt, error: this.error, results: this.results,
    };
  }

  _emit(type, data) { this.emit("event", { type, runId: this.id, at: new Date().toISOString(), ...data }); }

  _record(job, status, detail = null, message = null) {
    const r = { id: job.id, customer: job.customer, status, detail, message, at: new Date().toISOString() };
    this.results.push(r);
    this._emit("job", r);
  }

  async start() {
    this.state = "running";
    this.startedAt = new Date().toISOString();
    this._emit("run", { state: this.state });
    try {
      const dev = await A.device();
      if (!dev || dev.state !== "device") throw new Error(dev?.state === "unauthorized" ? "Phone unauthorized - tap Allow on the phone" : "No phone connected");
      if (!(await A.ensureAwake())) throw new Error("Phone is locked - unlock it and retry");
      this.engine = await A.prepare();
      this._emit("engine", { engine: this.engine });
      await F.open();
      if (this.mode.startsWith("replies")) { await this._replies(); if (this.state === "running") this.state = "done"; }

      for (let k = 0; !this.mode.startsWith("replies") && k < this.jobs.length; k++) {
        const job = this.jobs[k];
        if (this._cancel) { this.state = "cancelled"; break; }
        this._emit("progress", { id: job.id, customer: job.customer, step: "opening" });
        const message = render(this.template, job);
        try {
          if (!(await F.openJob(job))) { await this._debug(job, "not-on-schedule"); this._record(job, "skipped", "not found on the field app schedule"); continue; }
          const chat = await F.openChat();
          if (chat.state === "closed") { this._record(job, "skipped", "chat closed"); continue; }
          if (chat.state === "no-chat-icon") { await this._debug(job, chat.state); this._record(job, "skipped", "chat button not found on the customer screen"); continue; }
          if (chat.state !== "open") { await this._debug(job, chat.state); this._record(job, "skipped", "chat opened but no message box appeared"); continue; }
          const marker = this.cfg.alreadySentMarker || message.slice(0, 40);
          if (F.chatContains(chat.nodes, marker)) { this._record(job, "skipped", "precall already in chat"); continue; }
          if (this.mode === "type") {
            const r = await F.typeTest(chat.box, message);
            this._record(job, r.matches ? "type-ok" : "type-mismatch", `typed back: ${r.typed === null ? "(box text not readable)" : JSON.stringify(r.typed)} | cleared: ${r.clearedAfter}`, message);
            continue;
          }
          if (this.mode !== "send") { this._record(job, "dry-run", "would send", message); continue; }

          if (!(await A.ensureAwake())) throw new Error("Phone is locked - unlock it and retry");
          const ok = await F.send(chat.box, message);
          this._record(job, ok ? "sent" : "unconfirmed", ok ? null : "sent but not seen in chat", message);
          const [lo, hi] = this.cfg.pauseBetweenSends;
          await A.sleep(lo + Math.random() * (hi - lo));
        } catch (e) {
          // USB hiccup: wait for the phone to come back and retry this customer once.
          if (/no devices|device offline|device not found|device .* not found/i.test(e.message) && !job.__retried) {
            this._emit("progress", { id: job.id, customer: job.customer, step: "phone disconnected - waiting" });
            if (await A.waitForDevice(90)) { job.__retried = true; await A.prepare(); await F.open().catch(() => {}); k--; continue; }
            throw new Error("Phone disconnected (USB). Reconnect it and press Send again; it picks up where it stopped.");
          }
          await this._debug(job, "error");
          this._record(job, "error", e.message);
        } finally {
          await F.toSchedule().catch(() => {});
        }
      }
      if (this.state === "running") this.state = "done";
    } catch (e) {
      this.state = "failed";
      this.error = e.message;
    }
    this.finishedAt = new Date().toISOString();
    this._writeLog();
    this._emit("run", { state: this.state, error: this.error, summary: this.summary() });
  }

  /** Check precalled customers for replies; send one automatic thank-you (or claim note) each. */
  async _replies() {
    const who = await F.customersWhoReplied(this.jobs).catch(() => null);
    for (const job of this.jobs) {
      if (this._cancel) { this.state = "cancelled"; break; }
      const c = job.ctx || {};
      if (who && who[job.id] === "me") { this._record(job, "no-reply", null); continue; }
      this._emit("progress", { id: job.id, customer: job.customer, step: "reading reply" });
      try {
        if (!(await F.openJob(job))) { this._record(job, "skipped", "not found on the field app schedule"); continue; }
        const chat = await F.openChat();
        if (chat.state !== "open") { this._record(job, "skipped", chat.state === "closed" ? "chat closed" : "chat didn't open"); continue; }
        const msgs = F.readChat(chat.nodes);
        const pre = c.precallPrefix ? msgs.map((m) => m.from === "me" && m.text.includes(c.precallPrefix)).lastIndexOf(true) : -1;
        if (pre < 0) { this._record(job, "skipped", "precall not found in this chat"); continue; }
        const after = msgs.slice(pre + 1);
        const theirs = after.filter((m) => m.from === "customer").map((m) => m.text);
        if (!theirs.length) { this._record(job, "no-reply", null); continue; }
        const marker = "auto-reply";
        const already = after.some((m) => m.from === "me");          // we (or a person) already answered after the precall
        const customerText = theirs.join(" | ");
        const d = Array.isArray(this.replyConfig.rules) && this.replyConfig.rules.length
          ? R.decideTree(customerText, { ...c, ...this.replyConfig }, this.replyConfig.rules)
          : R.decide(customerText, { ...c, ...this.replyConfig });
        const info = { customerText, flags: d.flags, mismatch: d.mismatch, filed: d.filedKinds, said: d.customerKinds, path: d.path || null };
        if (already) {
          // We already answered once. A newer customer message after that goes to a person, never a second auto-reply.
          const lastMe = after.map((m) => m.from === "me").lastIndexOf(true);
          const later = after.slice(lastMe + 1).filter((m) => m.from === "customer").map((m) => m.text);
          if (later.length) this._record(job, "needs-you", JSON.stringify({ ...info, customerText: later.join(" | "), flags: ["follow-up after our reply"] }));
          else this._record(job, "answered", JSON.stringify({ ...info, note: `already answered (${marker})` }));
          continue;
        }
        if (d.action !== "reply") { this._record(job, "needs-you", JSON.stringify(info)); continue; }
        if (this.mode === "replies-dry") { this._record(job, "would-reply", JSON.stringify(info), d.reply); continue; }
        if (!(await A.ensureAwake())) throw new Error("Phone is locked - unlock it and retry");
        const ok = await F.send(chat.box, d.reply);
        this._record(job, ok ? "replied" : "unconfirmed", JSON.stringify(info), d.reply);
      } catch (e) {
        await this._debug(job, "reply-error");
        this._record(job, "error", e.message);
      } finally {
        await F.toSchedule().catch(() => {});
      }
    }
  }

  /** Save what the phone showed, so a failure can be looked at afterwards. */
  async _debug(job, label) {
    try {
      const base = path.join(this.cfg.logDir, `debug_${new Date().toISOString().replace(/[:.]/g, "-")}_${label}_${String(job.customer).replace(/[^a-z0-9]+/gi, "-")}`);
      fs.writeFileSync(base + ".png", await A.screencap());
      fs.writeFileSync(base + ".xml", await A.rawXml());
    } catch {}
  }

  _writeLog() {
    try {
      const file = path.join(this.cfg.logDir, `precall_${this.startedAt.slice(0, 10)}.jsonl`);
      fs.appendFileSync(file, JSON.stringify(this.summary()) + "\n");
    } catch {}
  }
}

module.exports = { PrecallRun, render };
