/**
 * Backup Smart Subscription — Vercel Edge Function
 *
 * This is a backup/fallback of the main smart-sub worker (CF Pages).
 * If Cloudflare suspends the account, blocks the domain, or has an outage,
 * users can switch to this Vercel-hosted subscription endpoint.
 *
 * Differences from the CF Pages version:
 *   - No KV storage (admin API, health tracking, probe reports disabled)
 *   - Geo detection via Vercel's x-vercel-ip-country header
 *   - Env vars via process.env (Vercel project settings)
 *   - Subset of endpoints: /sub/<UUID>, /health, /mtproto/<UUID>
 *
 * Deploy: cd tools/backup-sub && vercel deploy --prod
 * Build:  npm run build (from repo root — copies worker.js → core-worker.js)
 */

export const config = { runtime: 'edge' };

// ── Import the core worker logic ─────────────────────────────────
// npm run build bundles src/ → worker.js and copies it to core-worker.js.
//
// Since Vercel Edge Functions run in a V8 isolate (like CF Workers),
// the core logic is fully compatible — only the binding/header layer differs.

import workerModule from '../core-worker.js';

/**
 * Main handler — adapts Vercel request to CF Worker format
 */
export default async function handler(request) {
  // Build the `env` object that worker.js expects (CF Worker bindings → process.env)
  const env = buildEnvFromProcessEnv();

  // Map Vercel geo headers to CF-equivalent headers on the request
  const adaptedRequest = adaptRequestHeaders(request);

  // Delegate to the CF Worker's fetch handler
  try {
    return await workerModule.fetch(adaptedRequest, env);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal Server Error", platform: "vercel-backup" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * Map process.env to the env object that buildConfig(env) expects.
 * On CF Workers, env is the worker bindings. On Vercel, it's process.env.
 * Values are trimmed because `echo "val" | vercel env add` can include trailing newlines.
 */
function buildEnvFromProcessEnv() {
  const e = process.env;
  const t = (v) => v ? v.trim() : v; // trim helper
  return {
    // Core identity
    ADMIN_UUID: t(e.ADMIN_UUID),
    FAMILY_UUID: t(e.FAMILY_UUID),
    TEST_UUID: t(e.TEST_UUID),
    TEST_UUID_EXPIRES: t(e.TEST_UUID_EXPIRES),
    FREE_SERVER_LIMIT: t(e.FREE_SERVER_LIMIT),

    // Server IPs
    HEL_IP: t(e.HEL_IP),
    HEL_IPV6: t(e.HEL_IPV6),
    ORC_IP: t(e.ORC_IP),
    GCP_IP: t(e.GCP_IP),
    SCW_IP: t(e.SCW_IP),
    SCW_IPV6: t(e.SCW_IPV6),

    // ⛔ SECURITY: DO NOT add IR_IP or IR_ANYTLS_PASS here!
    // The Iran relay server is geo-restricted (geo_restrict: ["IR"]) and must
    // ONLY be served from the primary Cloudflare Pages worker where geo-fencing
    // is validated via CF-IPCountry headers. Vercel's x-vercel-ip-country is
    // less trusted and the backup sub should NEVER expose the Iran relay IP.
    // IR_IP: undefined,
    // IR_ANYTLS_PASS: undefined,
    // IR_SS_KEY: undefined,

    // Protocol secrets
    SHADOWTLS_PASSWORD: t(e.SHADOWTLS_PASSWORD),
    SALAMANDER_PASSWORD: t(e.SALAMANDER_PASSWORD),
    SS_USER_KEY: t(e.SS_USER_KEY),
    FINALMASK_SEED: t(e.FINALMASK_SEED),

    // Per-server SS2022 keys
    HEL_SS_KEY: t(e.HEL_SS_KEY),
    ORC_SS_KEY: t(e.ORC_SS_KEY),
    GCP_SS_KEY: t(e.GCP_SS_KEY),
    SCW_SS_KEY: t(e.SCW_SS_KEY),

    // NaiveProxy passwords
    HEL_NAIVE_PASS: t(e.HEL_NAIVE_PASS),
    ORC_NAIVE_PASS: t(e.ORC_NAIVE_PASS),
    SCW_NAIVE_PASS: t(e.SCW_NAIVE_PASS),

    // Cloak
    SCW_CLOAK_UID: t(e.SCW_CLOAK_UID),
    SCW_CLOAK_PUBKEY: t(e.SCW_CLOAK_PUBKEY),

    // EDtunnel
    EDTUNNEL_PAGES: t(e.EDTUNNEL_PAGES),

    // Multi-CDN relays
    VERCEL_RELAY_HOSTS: t(e.VERCEL_RELAY_HOSTS),
    NETLIFY_RELAY_HOSTS: t(e.NETLIFY_RELAY_HOSTS),

    // KV — null (no KV on Vercel; all KV-dependent features gracefully degrade)
    HEALTH: null,
  };
}

/**
 * Adapt Vercel request headers to CF-equivalent headers.
 * Vercel Edge provides:
 *   x-vercel-ip-country     → CF-IPCountry
 *   x-vercel-ip-as-number   → cf-asn (used by detectIranISP)
 *
 * We create a new Request with the mapped headers so the worker code
 * can read CF-IPCountry / cf-asn as usual.
 */
function adaptRequestHeaders(request) {
  const headers = new Headers(request.headers);

  // Map Vercel geo header to CF format.
  //
  // These MUST overwrite, never defer to an inbound value. On Cloudflare the
  // edge sets CF-IPCountry itself, so it is trustworthy; on Vercel it is
  // whatever the client sent. The previous `!headers.has(...)` guard let a
  // client-supplied CF-IPCountry win, which meant a caller could spoof their
  // country and unlock geo-restricted servers. Delete any inbound copy first.
  headers.delete('CF-IPCountry');
  headers.delete('cf-asn');

  const country = request.headers.get('x-vercel-ip-country');
  if (country) {
    headers.set('CF-IPCountry', country);
  }

  // Map Vercel ASN header to CF format (for ISP-specific TLS fragments)
  const asn = request.headers.get('x-vercel-ip-as-number');
  if (asn) {
    headers.set('cf-asn', asn);
  }

  return new Request(request.url, {
    method: request.method,
    headers,
    body: request.body,
  });
}
