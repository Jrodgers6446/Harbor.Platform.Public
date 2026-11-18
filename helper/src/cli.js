// Test the helper without the extension.
//   node src/cli.js token
//   node src/cli.js status
//   node src/cli.js precall --mode dry  --customer "Jane Doe" --date "Nov 13" [--zip 30043]
//   node src/cli.js precall --mode send --customer "Jane Doe" --date "Nov 13" --template "Hi {first}, ..."
// Talks to a running helper (npm start) so it exercises the same API the extension uses.
const cfg = require("./config").load();
const base = `http://127.0.0.1:${cfg.port}`;
const headers = { "Content-Type": "application/json", "X-Harbor-Token": cfg.token };

const argv = process.argv.slice(2);
const opt = (f, d = null) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);

const DEFAULT_TEMPLATE =
  "Hi {first}, this is Example Repair Co confirming your repair appointment for {date}. " +
  "Your technician will text you here with an ETA. Please reply with any questions!";

async function main() {
  const cmd = argv[0];
  if (cmd === "token") return console.log(cfg.token);

  if (cmd === "status") {
    const r = await fetch(`${base}/status`, { headers });
    return console.log(JSON.stringify(await r.json(), null, 2));
  }

  if (cmd === "precall") {
    const customer = opt("--customer");
    if (!customer) throw new Error('--customer "First Last" is required');
    const job = { id: "cli-1", customer, date: opt("--date"), zip: opt("--zip") };
    const body = { jobs: [job], template: opt("--template", DEFAULT_TEMPLATE), mode: opt("--mode", "dry") };
    const r = await fetch(`${base}/precall/runs`, { method: "POST", headers, body: JSON.stringify(body) });
    const run = await r.json();
    if (!r.ok) throw new Error(run.error);
    console.log(`Run ${run.id} started (${body.mode})`);
    for (;;) {
      await new Promise((s) => setTimeout(s, 2000));
      const s = await (await fetch(`${base}/precall/runs/${run.id}`, { headers })).json();
      if (["done", "failed", "cancelled"].includes(s.state)) {
        console.log(JSON.stringify(s, null, 2));
        break;
      }
    }
    return;
  }

  console.log("Commands: token | status | precall --customer \"Name\" [--date \"Nov 13\"] [--mode dry|send]");
}

main().catch((e) => {
  console.error(e.cause?.code === "ECONNREFUSED" ? "Helper isn't running - start it with: npm start" : e.message);
  process.exit(1);
});
