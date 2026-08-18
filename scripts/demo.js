#!/usr/bin/env node
// ── Zero-cost demo ────────────────────────────────────────────────
// Runs the subscription worker against a committed fixture of fake servers
// and prints the configs it generates.
//
//   npm run demo
//
// No VPS, no domain, no Cloudflare account, no credentials from anyone.
// The worker is invoked directly as a module — there is no server to start
// and no port to collide with.
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = "tools/smart-sub/.dev.vars.demo";

function parseEnvFile(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

// Colour only when attached to a terminal, so piping into CI (or `| grep`)
// yields clean, parseable text.
const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code) => (s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = {
  dim: wrap(2), bold: wrap(1), green: wrap(32), cyan: wrap(36), yellow: wrap(33),
};

const env = parseEnvFile(resolve(root, FIXTURE));

let worker;
try {
  worker = (await import(resolve(root, "tools/smart-sub/worker.js"))).default;
} catch {
  console.error(`\nCould not load the worker bundle. Build it first:\n\n  npm run build\n`);
  process.exit(1);
}

async function sub(path, headers = {}) {
  const res = await worker.fetch(
    new Request(`https://sub.example.com${path}`, { headers: new Headers(headers) }),
    env
  );
  if (res.status !== 200) return { status: res.status, configs: [] };
  const body = await res.text();
  // The subscription payload is base64-encoded, newline-joined URIs.
  let text = body;
  try { text = Buffer.from(body, "base64").toString("utf8"); } catch { /* already plain */ }
  const configs = text.split("\n").map((l) => l.trim()).filter((l) => /^[a-z0-9+.-]+:\/\//i.test(l));
  return { status: res.status, configs };
}

function scheme(uri) {
  const m = uri.match(/^([a-z0-9+.-]+):\/\//i);
  if (!m) return "other";
  const s = m[1].toLowerCase();
  return s === "sing-box" ? "sing-box (AnyTLS/ShadowTLS)" : s;
}

console.log(`
${c.bold("polypath — demo")}
${c.dim("Generating subscription configs from a fixture of fictional servers.")}
${c.dim(`Fixture: ${FIXTURE}  (RFC5737 documentation IPs — these route nowhere)`)}
`);

const uuid = env.TEST_UUID;
const global = await sub(`/sub/${uuid}`);

if (!global.configs.length) {
  console.error(c.yellow(`No configs generated (HTTP ${global.status}). Try: npm run build`));
  process.exit(1);
}

const byScheme = new Map();
for (const u of global.configs) {
  const s = scheme(u);
  byScheme.set(s, (byScheme.get(s) || 0) + 1);
}

console.log(c.bold(`  ${global.configs.length} configs generated\n`));
for (const [s, n] of [...byScheme.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`   ${c.cyan(String(n).padStart(4))}  ${s}`);
}

console.log(`\n${c.bold("  Sample — one per protocol:")}\n`);
const seen = new Set();
for (const u of global.configs) {
  const s = scheme(u);
  if (seen.has(s)) continue;
  seen.add(s);
  console.log(`   ${c.dim(s)}\n   ${u.length > 150 ? u.slice(0, 150) + c.dim("…") : u}\n`);
}

// Geo-awareness: the same UUID from an Iranian IP gets a different, filtered set.
const iran = await sub(`/sub/${uuid}`, { "CF-IPCountry": "IR" });
console.log(`${c.bold("  Geo-aware filtering")}`);
console.log(`   ${c.dim("default   ")} ${c.green(String(global.configs.length).padStart(4))} configs`);
console.log(`   ${c.dim("CF-IPCountry: IR")} ${c.green(String(iran.configs.length).padStart(1))} configs  ${c.dim("(CDN-only + TLS fragment + ISP tuning)")}`);

console.log(`
${c.bold("  Next")}

   ${c.dim("Explore the API")}      npm test          ${c.dim("— 307 tests, no network")}
   ${c.dim("See the config data")}  config/servers.yaml, config/cdn.yaml, config/isp-tuning.yaml
   ${c.dim("Deploy your own")}      docs/guides/quickstart.md
   ${c.dim("Understand the risk")}  docs/threat-model.md
`);
