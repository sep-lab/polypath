#!/usr/bin/env node
// Build config: reads YAML configs and writes a JS module for import
// Output: src/generated-config.js (gitignored)
// If SOPS_AGE_KEY is set, decrypts config/secrets/*.enc.yaml and merges secrets.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const servers = yaml.load(readFileSync(resolve(root, "config/servers.yaml"), "utf8"));
const cdn = yaml.load(readFileSync(resolve(root, "config/cdn.yaml"), "utf8"));
const ispTuning = yaml.load(readFileSync(resolve(root, "config/isp-tuning.yaml"), "utf8"));
const protocols = yaml.load(readFileSync(resolve(root, "config/protocols.yaml"), "utf8"));

// ── Secrets decryption (sops+age) ──────────────────────────────────
let secrets = null;
let usersSecrets = null;

function decryptSops(filePath) {
  try {
    const out = execSync(`sops --decrypt "${filePath}"`, {
      encoding: "utf8",
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    return yaml.load(out);
  } catch (e) {
    console.warn(`⚠ sops decrypt failed for ${filePath}: ${e.message.split("\n")[0]}`);
    return null;
  }
}

const serversEncPath = resolve(root, "config/secrets/servers.enc.yaml");
const usersEncPath = resolve(root, "config/secrets/users.enc.yaml");

if (process.env.SOPS_AGE_KEY || process.env.SOPS_AGE_KEY_FILE) {
  if (existsSync(serversEncPath)) {
    secrets = decryptSops(serversEncPath);
    if (secrets) console.log("✓ Decrypted config/secrets/servers.enc.yaml");
  }
  if (existsSync(usersEncPath)) {
    usersSecrets = decryptSops(usersEncPath);
    if (usersSecrets) console.log("✓ Decrypted config/secrets/users.enc.yaml");
  }
  if (!secrets && !usersSecrets) {
    console.warn("⚠ SOPS key set but no secrets could be decrypted — using placeholders");
  }
} else {
  console.log("ℹ No SOPS_AGE_KEY set — secrets will use placeholder values");
}

const output = `// AUTO-GENERATED — do not edit. Run: npm run build:config
// Generated from config/*.yaml at ${new Date().toISOString()}

export const SERVERS_CONFIG = ${JSON.stringify(servers, null, 2)};

export const CDN_CONFIG = ${JSON.stringify(cdn, null, 2)};

export const ISP_TUNING = ${JSON.stringify(ispTuning, null, 2)};

export const PROTOCOLS = ${JSON.stringify(protocols, null, 2)};

export const SECRETS = ${JSON.stringify(secrets, null, 2)};

export const USERS_SECRETS = ${JSON.stringify(usersSecrets, null, 2)};
`;

mkdirSync(resolve(root, "src"), { recursive: true });
writeFileSync(resolve(root, "src/generated-config.js"), output);
console.log("✓ src/generated-config.js written");

// NOTE: constants.ts is no longer auto-generated. It's the source of truth
// for ISP_HOST_PRIORITY, ISP_BLOCKED_PROTOCOLS, CDN subdomain hosts, etc.
// that cannot be derived from YAML alone. Update constants.ts directly.
console.log("ℹ Skipping generated-constants.ts — constants.ts is manually maintained");
