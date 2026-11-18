// Helper settings + auth token, stored in ~/.harbor-helper/config.json
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const DIR = path.join(os.homedir(), ".harbor-helper");
const FILE = path.join(DIR, "config.json");

const DEFAULTS = {
  port: 47800,
  token: null,                 // generated on first run; paste into Harbor > Settings > Helper
  pauseBetweenSends: [2, 4],   // random seconds between customers
  maxPerRun: 40,               // safety cap
  alreadySentMarker: null,     // optional text; if found in a chat, that customer is skipped
  logDir: path.join(DIR, "logs"),
  connection: "auto",          // phone: "auto" (cable first, then Wi-Fi) | "usb" | "wifi"
  lastWifi: null,              // last Wi-Fi address (ip:port) that worked
  phone: null,                 // serial of the phone paired for Wi-Fi (only this phone is ever used over Wi-Fi)
};

function load() {
  fs.mkdirSync(DIR, { recursive: true });
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch {}
  cfg = { ...DEFAULTS, ...cfg };
  // Older versions saved a 6-12 s pause into config files.
  if (JSON.stringify(cfg.pauseBetweenSends) === "[6,12]") { cfg.pauseBetweenSends = [2, 4]; save(cfg); }
  if (!cfg.token) {
    cfg.token = crypto.randomBytes(24).toString("hex");
    save(cfg);
  }
  fs.mkdirSync(cfg.logDir, { recursive: true });
  return cfg;
}

function save(cfg) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2));
}

module.exports = { load, save, FILE, DIR };
