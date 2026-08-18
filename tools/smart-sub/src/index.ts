// ── Smart Subscription Worker v5.9 — Entry Point ──────────────────
// Modular source. Bundled by esbuild → tools/smart-sub/worker.js

import { ISP_DNS_RESOLVERS, SECURITY_HEADERS, CF_CLEAN_IPS } from "./constants";
import { buildConfig } from "./config";
import {
  isValidUUID,
  detectIranISP,
  getISPFragment,
  getServersForUser,
  jsonResponse,
  filterByISP,
  sortConfigsByISP,
  detectClient,
  filterForSingBox,
  isAdminRequest,
  timingSafeEqual,
  escapeHtml,
  isValidHostOrIp,
} from "./utils";
import {
  getAllKvUsers,
  getKvUser,
  setKvUser,
  deleteKvUser,
  resolveUser,
  resolveAllUsers,
  getServerOverride,
  setServerOverride,
  deleteServerOverride,
  getAllServerOverrides,
  applyServerOverrides,
  storeProbeReport,
  getRecentProbeReports,
  getHealthData,
  setHealthData,
  trackSubRequest,
  getCleanIpOverrides,
  setCleanIpOverrides,
  deleteCleanIpOverrides,
  clientIdFor,
  isAuthThrottled,
  recordAuthFailure,
  AUTH_THROTTLE,
} from "./kv";
import { generateProbeScript } from "./probe";
import {
  generateRealityURI, generateHy2URI,
  generateIPv6RealityURI, generateIPv6Hy2URI,
  generateAmneziaWGURI,
  generateCdnWsURI, generateXhttpCdnURI, generateGrpcCdnURI,
  generateHttpObfsURI, generateHttpObfsMultiHostURIs,
  generateSs2022URI, generateNaiveURI,
  generateXhttpCdnCleanIPURIs, generateCdnWsCleanIPURIs,
  generateGrpcCdnCleanIPURIs,
  generateEdtunnelURIs, generateEdtunnelCleanIPURIs,
  generateFinalmaskXdnsURI, generateFinalmaskXicmpURI,
  generateFinalmaskWechatURI, generateFinalmaskDtlsURI,
  generateFinalmaskSrtpURI,
  generateHy2HopURI, generateShadowTLSURI, generateAnyTlsURI,
  generateCloakSs2022URI,
  generateRelayServerConfigs,
  generateRelayRealityURI, generateRelayHy2URI, generateRelaySs2022URI,
  generateMTProtoLink, generateRealityAltSNIURIs,
  generateRelayXhttpURIs, generateRelayCdnWsURIs,
} from "./generators";
import { buildSingBoxConfig } from "./singbox";
import type { Env } from "./types";

// ── Request Handler ──────────────────────────────────────────────

/** Re-key a sub_hits map by UUID prefix so /stats never returns a full credential. */
function truncateHitKeys(hits: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [uuid, count] of Object.entries(hits)) {
    out[uuid.substring(0, 8) + "..."] = count;
  }
  return out;
}

/**
 * Has this expiry passed?
 *
 * `new Date("garbage") > x` is false (NaN comparison), so an unparseable or
 * corrupt `expires` value used to mean the user never expired — a fail-open.
 * An expiry we cannot parse is treated as expired.
 */
function isExpired(expires: string): boolean {
  const t = new Date(expires).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() > t;
}

/**
 * Admin auth with a failed-attempt throttle.
 *
 * Returns null when authorised, or the Response to send. Failures are counted
 * per caller; successes never write to KV.
 */
async function adminGate(
  request: Request,
  url: URL,
  env: Env,
  adminUuid: string,
  status: 401 | 403 = 401,
  message = "Unauthorized"
): Promise<Response | null> {
  const clientId = clientIdFor(request);
  if (await isAuthThrottled(env, clientId)) {
    return jsonResponse({ error: "Too Many Requests" }, 429);
  }
  if (!await isAdminRequest(request, url, env.ADMIN_TOKEN, adminUuid)) {
    await recordAuthFailure(env, clientId);
    return jsonResponse({ error: message }, status);
  }
  return null;
}

/**
 * Normalise an admin-supplied expiry to an ISO string, or null.
 *
 * Written unvalidated, a malformed value combined with the old fail-open
 * comparison meant the user simply never expired. Storing only parseable
 * values keeps the stored data honest as well as the check.
 */
function normalizeExpires(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
    const config = buildConfig(env);
    const url = new URL(request.url);
    const path = url.pathname;

    // ── Health endpoint ──
    if (path === "/health") {
      const isAdmin = await isAdminRequest(request, url, env.ADMIN_TOKEN, config.adminUuid);
      const healthData = await getHealthData(env);
      const visibleServers = isAdmin
        ? config.servers.filter(s => s.enabled)
        : config.servers.filter(s => s.enabled && (!s.geo_restrict || s.geo_restrict.length === 0));
      const results = visibleServers.map((server) => {
        const health = healthData[server.tag] || { status: "unknown", last_check: null };
        const entry: Record<string, unknown> = {
          tag: server.tag,
          location: server.location,
          protocols: [
            server.reality_pubkey ? "reality" : null,
            server.hy2_port ? "hysteria2" : null,
            server.has_dns_tunnel ? "dns-tunnel" : null,
            server.finalmask ? "finalmask" : null,
            server.shadowtls ? "shadowtls-v3" : null,
            server.hy2_hop ? "hy2-salamander" : null,
            server.naive ? "naiveproxy" : null,
            server.anytls ? "anytls" : null,
            server.is_relay ? "relay" : null,
          ].filter(Boolean),
          health: health.status,
          latency_ms: (health as Record<string, unknown>)["latency_ms"],
          last_check: health.last_check,
        };
        if (isAdmin) {
          entry["ip"] = server.ip;
          entry["provider"] = server.provider;
          entry["enabled"] = server.enabled;
        }
        return entry;
      });

      return jsonResponse({
        servers: results,
        server_count: results.length,
        checked_at: new Date().toISOString(),
      });
    }

    // ── Health report endpoint ──
    if (path === "/health/report" && request.method === "POST") {
      const healthGate = await adminGate(request, url, env, config.adminUuid);
      if (healthGate) return healthGate;
      let body: Record<string, unknown>;
      try {
        body = await request.json() as Record<string, unknown>;
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }
      const healthData = await getHealthData(env);
      const bodyResults = (body["results"] || []) as Array<Record<string, unknown>>;
      for (const result of bodyResults) {
        const tag = result["tag"] as string;
        healthData[tag] = {
          status: result["status"] as string,
          latency_ms: result["latency_ms"] as number | null,
          last_check: new Date().toISOString(),
        };
      }
      await setHealthData(env, healthData);
      return jsonResponse({ ok: true, updated: bodyResults.length });
    }

    // ── Admin API ──
    if (path.startsWith("/admin/")) {
      const adminApiGate = await adminGate(request, url, env, config.adminUuid);
      if (adminApiGate) return adminApiGate;

      // GET /admin/users
      if (path === "/admin/users" && request.method === "GET") {
        const allUsers = await resolveAllUsers(env, config.envUsers);
        const today = new Date().toISOString().slice(0, 10);
        const todayHits = env.HEALTH
          ? JSON.parse(await env.HEALTH.get(`sub_hits:${today}`) || "{}") as Record<string, number>
          : {} as Record<string, number>;

        const userList = Object.entries(allUsers).map(([uuid, u]) => ({
          uuid,
          name: u.name,
          tier: u.tier,
          enabled: u.enabled,
          source: u.source || "env",
          expires: u.expires || null,
          created_at: u.created_at || null,
          today_hits: todayHits[uuid] || 0,
        }));

        return jsonResponse({ users: userList, total: userList.length });
      }

      // POST /admin/users
      if (path === "/admin/users" && request.method === "POST") {
        let body: Record<string, unknown>;
        try { body = await request.json() as Record<string, unknown>; } catch {
          return jsonResponse({ error: "Invalid JSON" }, 400);
        }
        const name = body["name"] as string | undefined;
        if (!name) return jsonResponse({ error: "name is required" }, 400);

        const newUuid = crypto.randomUUID();
        const userData = {
          name,
          tier: (body["tier"] as string) || "premium",
          enabled: true,
          expires: normalizeExpires(body["expires"]),
          created_at: new Date().toISOString(),
        };

        const ok = await setKvUser(env, newUuid, { ...userData, tier: userData.tier as import("./types").UserTier });
        if (!ok) return jsonResponse({ error: "KV not available" }, 503);

        return jsonResponse({
          uuid: newUuid,
          sub_url: `${url.origin}/sub/${newUuid}`,
          ...userData,
        }, 201);
      }

      // PATCH /admin/users/<UUID>
      const patchMatch = path.match(/^\/admin\/users\/([0-9a-f-]+)$/i);
      if (patchMatch && request.method === "PATCH") {
        const targetUuid = patchMatch[1].toLowerCase();
        if (!isValidUUID(targetUuid)) {
          return jsonResponse({ error: "Invalid UUID" }, 400);
        }

        let body: Record<string, unknown>;
        try { body = await request.json() as Record<string, unknown>; } catch {
          return jsonResponse({ error: "Invalid JSON" }, 400);
        }

        const current = await resolveUser(env, targetUuid, config.envUsers);
        if (!current) return jsonResponse({ error: "User not found" }, 404);

        const updated = {
          name: body["name"] !== undefined ? body["name"] as string : current.name,
          tier: (body["tier"] !== undefined ? body["tier"] as string : current.tier) as import("./types").UserTier,
          enabled: body["enabled"] !== undefined ? body["enabled"] as boolean : current.enabled,
          expires: body["expires"] !== undefined ? normalizeExpires(body["expires"]) : (current.expires || null),
          created_at: current.created_at || new Date().toISOString(),
        };

        const ok = await setKvUser(env, targetUuid, updated);
        if (!ok) return jsonResponse({ error: "KV not available" }, 503);

        return jsonResponse({ uuid: targetUuid, ...updated, source: "kv" });
      }

      // DELETE /admin/users/<UUID>
      const deleteMatch = path.match(/^\/admin\/users\/([0-9a-f-]+)$/i);
      if (deleteMatch && request.method === "DELETE") {
        const targetUuid = deleteMatch[1].toLowerCase();
        if (!isValidUUID(targetUuid)) {
          return jsonResponse({ error: "Invalid UUID" }, 400);
        }
        if (targetUuid === config.adminUuid) {
          return jsonResponse({ error: "Cannot delete admin user" }, 403);
        }

        await deleteKvUser(env, targetUuid);
        return jsonResponse({ ok: true, deleted: targetUuid });
      }

      // GET /admin/servers
      if (path === "/admin/servers" && request.method === "GET") {
        const overrides = await getAllServerOverrides(env);
        const serverList = config.servers.map(s => {
          const ov = overrides[s.tag] || null;
          return {
            tag: s.tag,
            location: s.location,
            provider: s.provider,
            ip: ov?.ip || s.ip,
            ipv6: ov?.ipv6 !== undefined ? ov.ipv6 : (s.ipv6 || null),
            enabled: ov?.enabled !== undefined ? ov.enabled : s.enabled,
            has_override: !!ov,
            override: ov,
            env_ip: s.ip,
          };
        });
        return jsonResponse({ servers: serverList, total: serverList.length });
      }

      // PATCH /admin/servers/<TAG>
      const serverPatchMatch = path.match(/^\/admin\/servers\/([a-z0-9-]+)$/i);
      if (serverPatchMatch && request.method === "PATCH") {
        const tag = serverPatchMatch[1].toLowerCase();
        const server = config.servers.find(s => s.tag === tag);
        if (!server) return jsonResponse({ error: "Server not found" }, 404);

        let body: Record<string, unknown>;
        try { body = await request.json() as Record<string, unknown>; } catch {
          return jsonResponse({ error: "Invalid JSON" }, 400);
        }

        const current = await getServerOverride(env, tag) || {};
        const updated = { ...current };
        // These values are interpolated directly into generated proxy URIs,
        // so an unvalidated value here redirects every subscriber.
        if (body["ip"] !== undefined) {
          if (!isValidHostOrIp(body["ip"])) {
            return jsonResponse({ error: "ip must be a valid IPv4/IPv6 address or hostname" }, 400);
          }
          updated["ip"] = (body["ip"] as string).trim();
        }
        if (body["ipv6"] !== undefined) {
          if (!isValidHostOrIp(body["ipv6"])) {
            return jsonResponse({ error: "ipv6 must be a valid address" }, 400);
          }
          updated["ipv6"] = (body["ipv6"] as string).trim();
        }
        if (body["enabled"] !== undefined) updated["enabled"] = body["enabled"] as boolean;
        updated["updated_at"] = new Date().toISOString();

        const ok = await setServerOverride(env, tag, updated);
        if (!ok) return jsonResponse({ error: "KV not available" }, 503);

        return jsonResponse({ tag, override: updated, env_ip: server.ip });
      }

      // DELETE /admin/servers/<TAG>
      const serverDeleteMatch = path.match(/^\/admin\/servers\/([a-z0-9-]+)$/i);
      if (serverDeleteMatch && request.method === "DELETE") {
        const tag = serverDeleteMatch[1].toLowerCase();
        const server = config.servers.find(s => s.tag === tag);
        if (!server) return jsonResponse({ error: "Server not found" }, 404);

        await deleteServerOverride(env, tag);
        return jsonResponse({ ok: true, tag, reverted_to: server.ip });
      }

      // GET /admin/probes
      if (path === "/admin/probes" && request.method === "GET") {
        const limitParam = parseInt(url.searchParams.get("limit") || "20", 10);
        const limit = Math.min(Math.max(limitParam, 1), 100);
        const reports = await getRecentProbeReports(env, limit);

        const summary: {
          total_reports: number;
          unique_isps: string[];
          unique_cities: string[];
          latest_report: string | null;
          aggregate: Record<string, { up: number; down: number; total: number }>;
        } = {
          total_reports: reports.length,
          unique_isps: [...new Set(reports.map(r => r.isp).filter((v): v is string => Boolean(v)))],
          unique_cities: [...new Set(reports.map(r => r.city).filter((v): v is string => Boolean(v)))],
          latest_report: reports[0]?.timestamp || null,
          aggregate: {},
        };

        for (const report of reports) {
          for (const result of (report.results || [])) {
            if (result.tag && (result as unknown as Record<string, unknown>)["test"] === "tcp_443") {
              const key = result.tag;
              if (!summary.aggregate[key]) {
                summary.aggregate[key] = { up: 0, down: 0, total: 0 };
              }
              summary.aggregate[key].total++;
              if (result.status === "up") summary.aggregate[key].up++;
              if (result.status === "down") summary.aggregate[key].down++;
            }
          }
        }

        return jsonResponse({ summary, reports });
      }

      // DELETE /admin/probes
      if (path === "/admin/probes" && request.method === "DELETE") {
        if (!env.HEALTH) return jsonResponse({ error: "KV not available" }, 503);
        const list = await env.HEALTH.list({ prefix: "probe_report:" });
        let deleted = 0;
        for (const key of list.keys) {
          await env.HEALTH.delete(key.name);
          deleted++;
        }
        return jsonResponse({ ok: true, deleted });
      }

      // GET /admin/clean-ips — view current clean IPs (KV override or defaults)
      if (path === "/admin/clean-ips" && request.method === "GET") {
        const kvIps = await getCleanIpOverrides(env);
        return jsonResponse({
          source: kvIps ? "kv" : "default",
          ips: kvIps || CF_CLEAN_IPS,
          default_ips: CF_CLEAN_IPS,
          note: kvIps ? "Using KV override — DELETE to revert to defaults" : "Using built-in defaults — PATCH to override",
        });
      }

      // PATCH /admin/clean-ips — override clean IPs via KV (no redeploy needed)
      if (path === "/admin/clean-ips" && request.method === "PATCH") {
        let body: Record<string, unknown>;
        try { body = await request.json() as Record<string, unknown>; } catch {
          return jsonResponse({ error: "Invalid JSON" }, 400);
        }
        const ips = body["ips"] as string[] | undefined;
        if (!ips || !Array.isArray(ips) || ips.length === 0) {
          return jsonResponse({ error: "ips array is required" }, 400);
        }
        // Same config-poisoning risk as the server IP above.
        const badIp = ips.find(ip => !isValidHostOrIp(ip));
        if (badIp !== undefined) {
          return jsonResponse({ error: `invalid address in ips: ${String(badIp).slice(0, 40)}` }, 400);
        }
        const ok = await setCleanIpOverrides(env, ips);
        if (!ok) return jsonResponse({ error: "KV not available" }, 503);
        return jsonResponse({ ok: true, ips, note: "Clean IPs updated — takes effect on next subscription fetch" });
      }

      // DELETE /admin/clean-ips — revert to built-in defaults
      if (path === "/admin/clean-ips" && request.method === "DELETE") {
        await deleteCleanIpOverrides(env);
        return jsonResponse({ ok: true, reverted_to: CF_CLEAN_IPS });
      }

      return jsonResponse({ error: "Not found" }, 404);
    }

    // ── Diagnostic endpoint ──
    if (path === "/diagnostic") {
      const country = (request.headers.get("CF-IPCountry") || "").toUpperCase();
      const isIran = country === "IR";
      const isp = isIran ? detectIranISP(request) : "unknown";
      const asn = request.headers.get("CF-IPRegion-ASN") ||
                  request.headers.get("cf-meta-asn") || "";

      // ISP-specific protocol recommendations
      const recommendations: Record<string, { try_first: string[]; avoid: string[]; notes: string[] }> = {
        irancell: {
          try_first: [
            "XrayHTTP (tcp+http header obfuscation with whitelisted host)",
            "XHTTP-CDN (pure HTTP through Cloudflare — no WebSocket)",
            "ShadowTLS v3 (TLS camouflage to google.com, port 10443)",
          ],
          avoid: [
            "CDN-WS (WebSocket Upgrade header detected by DPI)",
            "Reality (TLS/443 encrypted protos blocked)",
            "Hysteria2 (QUIC/UDP blocked)",
            "gRPC-CDN (HTTP/2 gRPC detected)",
          ],
          notes: [
            "Most aggressive DPI — only HTTP-obfuscated and CDN-fronted protocols work",
            "Use V2rayNG or NekoBox for best XrayHTTP compatibility",
            "Hiddify 3.x+ should work with XHTTP-CDN and XrayHTTP configs",
            "If all configs fail, try DNS tunnel (SlipNet) — works during shutdowns",
          ],
        },
        mci: {
          try_first: [
            "XHTTP-CDN (most reliable on MCI)",
            "XrayHTTP (tcp+http with whitelisted host — confirmed working)",
            "ShadowTLS v3",
            "XHTTP via Vercel/Netlify relay (CDN diversity)",
          ],
          avoid: [
            "CDN-WS (WebSocket detected, less aggressive than Irancell)",
            "Hysteria2 (QUIC generally blocked)",
          ],
          notes: [
            "Second most aggressive DPI after Irancell",
            "Clean CF IPs tend to be more stable on MCI than Irancell",
            "Yandex DNS (77.88.8.8) is the most stable resolver for DNSTT on MCI",
          ],
        },
        rightel: {
          try_first: [
            "XHTTP-CDN",
            "XrayHTTP",
            "CDN-WS (often works on Rightel — less DPI)",
            "Reality (sometimes works — test it)",
          ],
          avoid: [],
          notes: [
            "Generally more lenient DPI than Irancell/MCI",
            "More protocols likely to work — test Reality and Hy2",
          ],
        },
        shatel: {
          try_first: [
            "XHTTP-CDN",
            "XrayHTTP",
            "CDN-WS",
            "Reality (often works on fixed-line ISPs)",
          ],
          avoid: [],
          notes: [
            "Fixed-line ISPs generally have less aggressive DPI than mobile",
            "TLS fragment settings are tuned for Shatel",
          ],
        },
      };

      const ispRec = recommendations[isp] || {
        try_first: ["XHTTP-CDN", "XrayHTTP", "ShadowTLS v3"],
        avoid: [],
        notes: ["ISP not detected — try configs in order, report what works"],
      };

      // App recommendations based on ISP
      const appRecommendation = isp === "irancell"
        ? "V2rayNG or NekoBox (best XrayHTTP support). Hiddify 3.x+ also works for XHTTP-CDN."
        : "Hiddify (easiest setup). V2rayNG/NekoBox for advanced users.";

      return jsonResponse({
        diagnostic: true,
        your_connection: {
          country,
          is_iran: isIran,
          isp: isp !== "unknown" ? isp : null,
          asn: asn || null,
        },
        recommendations: {
          try_first: ispRec.try_first,
          avoid: ispRec.avoid,
          notes: ispRec.notes,
          recommended_app: appRecommendation,
        },
        subscription_urls: {
          primary: "https://sub.example.com/sub/<your-uuid>",
          backup: "https://sub.example.net/sub/<your-uuid>",
          tip: "Add ?geo=ir to force Iran mode. Add ?client=hiddify or ?client=xray to filter.",
        },
        troubleshooting: {
          all_configs_fail: [
            "1. Try backup subscription URL (sub.example.net)",
            "2. Switch to V2rayNG/NekoBox and test XrayHTTP configs",
            "3. Try clean CF IP configs (XHTTP-CDN-CF1, CF2, etc.)",
            "4. If internet is completely down, use DNS tunnel (SlipNet app)",
          ],
          slow_connection: [
            "1. Try a different server (Finland, Dammam, London)",
            "2. Try XHTTP-CDN with clean CF IP — often faster",
            "3. Check if fragment settings match your ISP (auto-detected in subscription)",
          ],
          frequent_disconnects: [
            "1. Enable MUX padding in your client (auto-enabled for Iran mode)",
            "2. Try ShadowTLS v3 — most stable for long sessions",
            "3. Switch between servers — some routes are more stable",
          ],
        },
        dns_tunnel_fallback: {
          note: "DNS tunnel works even during complete internet shutdowns",
          app: "SlipNet (Android) — github.com/nickoala/SlipNet/releases",
          resolvers: isIran ? {
            mci: ["77.88.8.8:53", "208.67.222.222:53"],
            irancell: ["94.183.126.175:53", "102.22.254.232:53"],
            other: ["5.160.233.150:53", "164.138.206.100:53"],
          } : undefined,
        },
      });
    }

    // ── Probe endpoint ──
    if (path === "/probe" && request.method === "GET") {
      const probeGate = await adminGate(request, url, env, config.adminUuid, 403,
        "Forbidden — admin credential required");
      if (probeGate) return probeGate;
      await applyServerOverrides(env, config.servers);

      // The generated script is handed to volunteers who may be on hostile
      // networks. It must carry a credential scoped to /probe/report and
      // nothing else — never ADMIN_UUID, and never the Telegram bot token
      // (the report handler already alerts Telegram server-side).
      if (!env.PROBE_TOKEN) {
        return jsonResponse({
          error: "PROBE_TOKEN is not configured. Set it before generating probe scripts.",
        }, 503);
      }
      const reportUrl = `${url.origin}/probe/report?key=${env.PROBE_TOKEN}`;

      const script = generateProbeScript(config, reportUrl);

      return new Response(script, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": "inline; filename=\"vpn-probe.sh\"",
          ...SECURITY_HEADERS,
        },
      });
    }

    // ── Probe report endpoint ──
    if (path === "/probe/report" && request.method === "POST") {
      // Accepts the scoped PROBE_TOKEN (held by probe volunteers) or the
      // admin credential (held only by the operator).
      const reportKey = url.searchParams.get("key");
      const probeTokenOk = Boolean(env.PROBE_TOKEN) && Boolean(reportKey) &&
        await timingSafeEqual(reportKey as string, env.PROBE_TOKEN as string);
      if (!probeTokenOk && !await isAdminRequest(request, url, env.ADMIN_TOKEN, config.adminUuid)) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }
      let body: Record<string, unknown>;
      try {
        body = await request.json() as Record<string, unknown>;
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      body["cf_country"] = request.headers.get("CF-IPCountry") || "unknown";
      body["cf_ray"] = request.headers.get("CF-Ray") || null;
      // ASN comes from request.cf, not a header — see detectIranISP().
      // This previously read a header Cloudflare does not set, so every
      // stored probe report has an unlabelled ASN.
      const probeCf = (request as Request & { cf?: { asn?: number | string } }).cf;
      body["cf_asn"] = probeCf?.asn !== undefined && probeCf?.asn !== null
        ? String(probeCf.asn)
        : null;
      body["reported_at"] = new Date().toISOString();

      const stored = await storeProbeReport(env, body as unknown as import("./types").StoredProbeReport);
      if (!stored) {
        return jsonResponse({ error: "KV not available" }, 503);
      }

      const tgToken = env.TELEGRAM_BOT_TOKEN;
      const tgChat = env.TELEGRAM_CHAT_ID;
      if (tgToken && tgChat) {
        const up = body["up"] || 0;
        const down = body["down"] || 0;
        const msg = `📡 Probe from ${body["country"] || "??"} (${body["isp"] || "unknown"})\n` +
          `City: ${body["city"] || "?"}\n` +
          `✅ ${up} up | ❌ ${down} down\n` +
          `ASN: ${body["cf_asn"] || "?"}`;
        fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: tgChat,
            text: msg,
            parse_mode: "Markdown",
          }),
        }).catch(() => {});
      }

      return jsonResponse({ ok: true, stored: true, timestamp: body["reported_at"] });
    }

    // ── Stats endpoint ──
    if (path === "/stats") {
      const statsGate = await adminGate(request, url, env, config.adminUuid);
      if (statsGate) return statsGate;

      const healthData = await getHealthData(env);
      const allUsers = await resolveAllUsers(env, config.envUsers);

      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const todayHits = env.HEALTH
        ? JSON.parse(await env.HEALTH.get(`sub_hits:${today}`) || "{}") as Record<string, unknown>
        : {} as Record<string, unknown>;
      const yesterdayHits = env.HEALTH
        ? JSON.parse(await env.HEALTH.get(`sub_hits:${yesterday}`) || "{}") as Record<string, unknown>
        : {} as Record<string, unknown>;

      return jsonResponse({
        servers: config.servers.map(s => ({
          tag: s.tag,
          location: s.location,
          enabled: s.enabled,
          health: healthData[s.tag] || { status: "unknown" },
        })),
        users: Object.entries(allUsers).map(([uuid, u]) => ({
          name: u.name,
          tier: u.tier,
          enabled: u.enabled,
          source: u.source || "env",
          uuid_prefix: uuid.substring(0, 8) + "...",
        })),
        // Truncate here too. The user list above is careful to expose only a
        // UUID prefix; returning the raw hit maps undid that, since they are
        // keyed by full subscription UUID.
        sub_requests: {
          today: truncateHitKeys(todayHits),
          yesterday: truncateHitKeys(yesterdayHits),
        },
        total_servers: config.servers.filter(s => s.enabled).length,
        total_users: Object.values(allUsers).filter(u => u.enabled).length,
        worker_version: "5.11.0", // x-release-please-version
        checked_at: new Date().toISOString(),
      });
    }

    // ── MTProto endpoint ──
    const mtprotoMatch = path.match(/^\/mtproto\/([0-9a-f-]+)$/i);
    if (mtprotoMatch) {
      const mtUuid = mtprotoMatch[1].toLowerCase();
      if (!isValidUUID(mtUuid)) return new Response("Unauthorized", { status: 401 });
      const mtUser = await resolveUser(env, mtUuid, config.envUsers);
      if (!mtUser || !mtUser.enabled) return new Response("Unauthorized", { status: 401 });
      if (mtUser.expires && isExpired(mtUser.expires)) {
        return new Response("Expired", { status: 403 });
      }
      await applyServerOverrides(env, config.servers);
      const mtCountry = (request.headers.get("CF-IPCountry") || "").toUpperCase();
      const mtServers = getServersForUser(mtUser, config.servers, config.freeServerLimit, mtCountry);
      // Type predicate rather than filter(Boolean): the latter does not narrow
      // (string | null)[] to string[], which hid a real nullability hole here.
      const links = mtServers
        .map(s => generateMTProtoLink(s))
        .filter((l): l is string => Boolean(l));

      const format = url.searchParams.get("format");
      if (format === "json") {
        return jsonResponse({ mtproto: links, user: mtUser.name });
      }

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Telegram Proxy</title>
<style>body{font-family:system-ui;max-width:600px;margin:2em auto;padding:0 1em;background:#1a1a2e;color:#eee}
a{display:block;margin:1em 0;padding:1em;background:#16213e;border-radius:8px;color:#0088cc;text-decoration:none;font-size:1.1em}
a:hover{background:#1a3a5c}h1{color:#0088cc}</style></head><body>
<h1>Telegram Proxy</h1>
<p>Tap a link to add it to your Telegram app:</p>
${links.map((l, i) => `<a href="${escapeHtml(l)}">${escapeHtml(mtServers[i]?.location || "Server " + (i + 1))} (${escapeHtml(mtServers[i]?.tag || "")})</a>`).join("\n")}
<p style="color:#888;margin-top:2em">Tip: In Telegram → Settings → Data and Storage → Proxy → Add Proxy</p>
</body></html>`;
      return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8", ...SECURITY_HEADERS } });
    }

    // ── Subscription endpoint ──
    const subMatch = path.match(/^\/sub\/([0-9a-f-]+)$/i);
    if (!subMatch) {
      return new Response("Not Found", { status: 404 });
    }

    const uuid = subMatch[1].toLowerCase();

    // Throttle callers who keep failing. Counts failures only, so a legitimate
    // client never writes to KV — see the note in kv.ts.
    const subClientId = clientIdFor(request);
    if (await isAuthThrottled(env, subClientId)) {
      return new Response("Too Many Requests", {
        status: 429,
        headers: { "Retry-After": String(AUTH_THROTTLE.windowSeconds), ...SECURITY_HEADERS },
      });
    }

    if (!isValidUUID(uuid)) {
      await recordAuthFailure(env, subClientId);
      return new Response("Unauthorized", { status: 401 });
    }

    const user = await resolveUser(env, uuid, config.envUsers);
    if (!user || !user.enabled) {
      await recordAuthFailure(env, subClientId);
      return new Response("Unauthorized", { status: 401 });
    }

    if (user.expires && isExpired(user.expires)) {
      return new Response("Subscription expired", { status: 403 });
    }

    const trackPromise = trackSubRequest(env, uuid);
    await applyServerOverrides(env, config.servers);

    const format = url.searchParams.get("format") || "base64";

    const country = (request.headers.get("CF-IPCountry") || "").toUpperCase();
    const isIran = country === "IR";
    const geoParam = (url.searchParams.get("geo") || "").toLowerCase();
    const cdnOnly = geoParam === "ir" || (isIran && geoParam !== "global");
    const useFragment = cdnOnly;

    const isp = isIran ? detectIranISP(request) : "unknown";
    const ispFragment = useFragment ? getISPFragment(isp) : null;

    const modeParam = (url.searchParams.get("mode") || "").toLowerCase();
    let isShutdownMode = modeParam === "shutdown";

    // Auto-detect shutdown: if user is from Iran and recent probes show
    // widespread outage (>75% of tcp_443 tests failing), switch to shutdown mode.
    // Users can override with ?mode=normal to disable auto-detection.
    if (!isShutdownMode && isIran && modeParam !== "normal") {
      const recentProbes = await getRecentProbeReports(env, 5);
      const irProbes = recentProbes.filter(r =>
        r.country === "IR" &&
        r.timestamp &&
        (Date.now() - new Date(r.timestamp).getTime()) < 6 * 60 * 60 * 1000 // last 6 hours
      );
      if (irProbes.length >= 2) {
        let totalTcp = 0, downTcp = 0;
        for (const probe of irProbes) {
          for (const result of (probe.results || [])) {
            const test = (result as unknown as Record<string, unknown>)["test"];
            if (test === "tcp_443") {
              totalTcp++;
              if (result.status === "down") downTcp++;
            }
          }
        }
        if (totalTcp >= 4 && (downTcp / totalTcp) > 0.75) {
          isShutdownMode = true;
        }
      }
    }

    const userServers = getServersForUser(user, config.servers, config.freeServerLimit, country);
    const useMux = cdnOnly;

    const allLines: string[] = [];
    const effectiveCdnOnly = cdnOnly || user.tier === "limited";
    const cdnOpts = {
      fragment: useFragment,
      fragmentSettings: ispFragment,
      mux: useMux,
    };

    // Load KV-overridden clean IPs (allows rotation without redeploy)
    const cleanIps = await getCleanIpOverrides(env) || undefined;

    for (const server of userServers) {
      if (server.is_relay) {
        allLines.push(...generateRelayServerConfigs(server, uuid));
        continue;
      }

      const serverCdnOnly = effectiveCdnOnly ||
        (server.geo_restrict && server.geo_restrict.length > 0) ||
        (server.geo_cdn_only && server.geo_cdn_only.includes(country));

      if (isShutdownMode) {
        const xdnsUri = generateFinalmaskXdnsURI(server, uuid);
        if (xdnsUri) allLines.push(xdnsUri);
        const xicmpUri = generateFinalmaskXicmpURI(server, uuid);
        if (xicmpUri) allLines.push(xicmpUri);
        const wechatUri = generateFinalmaskWechatURI(server, uuid);
        if (wechatUri) allLines.push(wechatUri);
        const dtlsUri = generateFinalmaskDtlsURI(server, uuid);
        if (dtlsUri) allLines.push(dtlsUri);
        const srtpUri = generateFinalmaskSrtpURI(server, uuid);
        if (srtpUri) allLines.push(srtpUri);
        const httpObfsUri = generateHttpObfsURI(server, uuid);
        if (httpObfsUri) allLines.push(httpObfsUri);
        allLines.push(...generateHttpObfsMultiHostURIs(server, uuid, isp !== "unknown" ? isp : undefined));
        const ss2022Uri = generateSs2022URI(server, uuid);
        if (ss2022Uri) allLines.push(ss2022Uri);
        continue;
      }

      // CDN-fronted configs
      const xhttpUri = generateXhttpCdnURI(server, uuid, cdnOpts);
      if (xhttpUri) allLines.push(xhttpUri);
      allLines.push(...generateXhttpCdnCleanIPURIs(server, uuid, cdnOpts, cleanIps));
      allLines.push(...generateRelayXhttpURIs(server, uuid, config.vercelRelays, "Vercel", cdnOpts));
      allLines.push(...generateRelayXhttpURIs(server, uuid, config.netlifyRelays, "Netlify", cdnOpts));

      const grpcUri = generateGrpcCdnURI(server, uuid, cdnOpts);
      if (grpcUri) allLines.push(grpcUri);
      allLines.push(...generateGrpcCdnCleanIPURIs(server, uuid, cdnOpts, cleanIps));

      const httpObfsUri = generateHttpObfsURI(server, uuid);
      if (httpObfsUri) allLines.push(httpObfsUri);
      allLines.push(...generateHttpObfsMultiHostURIs(server, uuid, isp !== "unknown" ? isp : undefined));

      // SS2022 on port 80 disabled — DPI blocks non-TLS traffic on port 80;
      // ShadowTLS-wrapped SS2022 (port 10443) remains active.
      // const ss2022Uri = generateSs2022URI(server, uuid);
      // if (ss2022Uri) allLines.push(ss2022Uri);

      const xdnsUri = generateFinalmaskXdnsURI(server, uuid);
      if (xdnsUri) allLines.push(xdnsUri);
      const xicmpUri = generateFinalmaskXicmpURI(server, uuid);
      if (xicmpUri) allLines.push(xicmpUri);
      const wechatUri = generateFinalmaskWechatURI(server, uuid);
      if (wechatUri) allLines.push(wechatUri);
      const dtlsUri = generateFinalmaskDtlsURI(server, uuid);
      if (dtlsUri) allLines.push(dtlsUri);
      const srtpUri = generateFinalmaskSrtpURI(server, uuid);
      if (srtpUri) allLines.push(srtpUri);

      const shadowtlsUri = generateShadowTLSURI(server, uuid);
      if (shadowtlsUri) allLines.push(shadowtlsUri);

      if (!serverCdnOnly) {
        if (server.reality_pubkey) {
          allLines.push(generateRealityURI(server, uuid));
          allLines.push(...generateRealityAltSNIURIs(server, uuid));
        }
        if (server.hy2_port) {
          allLines.push(generateHy2URI(server, uuid));
        }

        const hy2HopUri = generateHy2HopURI(server, uuid);
        if (hy2HopUri) allLines.push(hy2HopUri);

        // IPv6 disabled — Iranian ISPs don't route IPv6 reliably
        // const ipv6Reality = generateIPv6RealityURI(server, uuid);
        // if (ipv6Reality) allLines.push(ipv6Reality);
        // const ipv6Hy2 = generateIPv6Hy2URI(server, uuid);
        // if (ipv6Hy2) allLines.push(ipv6Hy2);
      }

      const cdnUri = generateCdnWsURI(server, uuid, cdnOpts);
      if (cdnUri) allLines.push(cdnUri);
      allLines.push(...generateCdnWsCleanIPURIs(server, uuid, cdnOpts, cleanIps));
      // CDN-WS-Vercel disabled — Vercel Edge can't proxy WebSocket via fetch();
      // XHTTP-Vercel (HTTP-based) is the working relay method.
      // allLines.push(...generateRelayCdnWsURIs(server, uuid, config.vercelRelays, "Vercel", cdnOpts));
      // allLines.push(...generateRelayCdnWsURIs(server, uuid, config.netlifyRelays, "Netlify", cdnOpts));

      if (!serverCdnOnly) {
        const naiveUri = generateNaiveURI(server, uuid);
        if (naiveUri) allLines.push(naiveUri);
        const cloakUri = generateCloakSs2022URI(server, uuid);
        if (cloakUri) allLines.push(cloakUri);
        const awgUri = generateAmneziaWGURI(server, uuid);
        if (awgUri) allLines.push(awgUri);

        const relayReality = generateRelayRealityURI(server, uuid);
        if (relayReality) allLines.push(relayReality);
        const relayHy2 = generateRelayHy2URI(server, uuid);
        if (relayHy2) allLines.push(relayHy2);
        const relaySs = generateRelaySs2022URI(server, uuid);
        if (relaySs) allLines.push(relaySs);
      }
    }

    // EDtunnel disabled — CF Pages workers suspended/down
    // if (!isShutdownMode) {
    //   allLines.push(...generateEdtunnelURIs(uuid, config.edtunnel));
    //   allLines.push(...generateEdtunnelCleanIPURIs(uuid, config.edtunnel));
    // }

    // Filter out protocols known to be broken on this ISP (e.g. CDN-WS on Irancell)
    const ispFiltered = (cdnOnly && isp !== "unknown")
      ? filterByISP(allLines, isp)
      : allLines;

    // Detect client (Hiddify/sing-box vs Xray/v2ray) and filter incompatible configs
    const client = detectClient(request, url.searchParams);
    const filteredLines = client === "hiddify"
      ? filterForSingBox(ispFiltered)
      : ispFiltered;

    const sortedLines = (cdnOnly && isp !== "unknown")
      ? sortConfigsByISP(filteredLines, isp)
      : filteredLines;

    const mtprotoLinks: string[] = [];
    for (const server of userServers) {
      const link = generateMTProtoLink(server);
      if (link) mtprotoLinks.push(link);
    }

    if (format === "json") {
      await trackPromise;
      const dnsttServers = userServers
        .filter(s => s.has_dns_tunnel)
        .map(s => ({ tag: s.tag, location: s.location }));
      const dnsttInfo = dnsttServers.length > 0 ? {
        note: "DNS tunnel — most censorship-resistant. ONLY method that works during complete internet shutdowns.",
        warning: isShutdownMode ? "SHUTDOWN MODE: Use DNS tunnel (SlipNet/DNSTT) as primary connection method." : undefined,
        servers: dnsttServers,
        setup_url: "https://sub.example.com/diagnostic",
        clients: {
          android: "SlipNet — https://github.com/nickoala/SlipNet/releases",
          ios: "V2Box (supports DNSTT) or HTTP Injector",
          desktop: "dnstc — https://github.com/nickoala/dnstc/releases",
        },
        dns_resolvers: {
          note: "Use these ISP DNS resolvers with DNSTT/SlipNet. Try multiple — each city/neighborhood may differ.",
          mci: ISP_DNS_RESOLVERS["mci"].map((ip: string) => `${ip}:53`),
          irancell: ISP_DNS_RESOLVERS["irancell"].map((ip: string) => `${ip}:53`),
          other: ISP_DNS_RESOLVERS["other"].map((ip: string) => `${ip}:53`),
        },
        tools: {
          range_scout: "https://github.com/iampedii/range-scout — Find working DNS resolvers for your ISP",
          vaydns: "https://github.com/net2share/vaydns — DNSTT fork that works on more resolvers",
          chinvat_mx: "https://github.com/arielesfahani/chinvat-mx — DNS multiplexer for DNSTT stability",
        },
      } : undefined;
      return jsonResponse({
        configs: sortedLines,
        mtproto: isShutdownMode ? [] : mtprotoLinks,
        server_count: userServers.length,
        user: user.name,
        tier: user.tier,
        mode: isShutdownMode ? "shutdown" : (effectiveCdnOnly ? "iran" : "global"),
        auto_shutdown: isShutdownMode && modeParam !== "shutdown" ? true : undefined,
        geo: { country, cdn_only: effectiveCdnOnly, fragment: useFragment, isp: isp !== "unknown" ? isp : undefined, mux: useMux },
        client: client !== "auto" ? client : undefined,
        backup_sub: "https://sub.example.net",
        dnstt: dnsttInfo,
      });
    }

    // Native sing-box JSON format — Hiddify can import this directly
    if (format === "singbox" || format === "sing-box") {
      await trackPromise;
      const singboxConfig = buildSingBoxConfig(sortedLines);
      return new Response(JSON.stringify(singboxConfig, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": "inline; filename=\"singbox-config.json\"",
          "Profile-Title": "base64:" + btoa("VPN Smart Sub"),
          "Profile-Update-Interval": "4",
          ...SECURITY_HEADERS,
        },
      });
    }

    if (format === "text") {
      await trackPromise;
      const plain = sortedLines.join("\n");
      return new Response(plain, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          ...SECURITY_HEADERS,
        },
      });
    }

    // Default: base64
    const combined = sortedLines.join("\n");
    const base64 = btoa(combined);

    await trackPromise;

    return new Response(base64, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": "inline",
        "Profile-Title": "base64:" + btoa("VPN Smart Sub"),
        "Profile-Update-Interval": "4",
        "Subscription-Userinfo": `upload=0; download=0; total=${50 * 1073741824}; expire=0`,
        "Support-URL": "https://sub.example.com/health",
        ...SECURITY_HEADERS,
      },
    });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Internal Server Error" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...SECURITY_HEADERS,
          },
        }
      );
    }
  },
};

// ── Named exports for testing ────────────────────────────────────
// Re-export everything that the original worker.js exported.
export {
  // Constants
  CF_CLEAN_IPS, ALT_REALITY_SNIS, WHITELISTED_HOSTS,
  ISP_DNS_RESOLVERS, FRAGMENT, ISP_FRAGMENTS, ASN_TO_ISP, MUX,
  FINALMASK, SHADOWTLS_DEFAULTS, SALAMANDER_DEFAULTS,
} from "./constants";

export { buildConfig } from "./config";

export {
  isValidUUID, detectIranISP, getISPFragment,
  getServersForUser, jsonResponse, sortConfigsByISP,
} from "./utils";

export {
  getAllKvUsers, setKvUser, deleteKvUser,
  resolveUser, resolveAllUsers,
  getServerOverride, setServerOverride, deleteServerOverride,
  getAllServerOverrides, applyServerOverrides,
  storeProbeReport, getRecentProbeReports,
} from "./kv";

export { generateProbeScript } from "./probe";

export {
  generateRealityURI, generateHy2URI,
  generateIPv6RealityURI, generateIPv6Hy2URI,
  generateAmneziaWGURI,
  generateCdnWsURI, generateXhttpCdnURI, generateGrpcCdnURI,
  generateHttpObfsURI, generateHttpObfsMultiHostURIs,
  generateSs2022URI, generateNaiveURI,
  generateXhttpCdnCleanIPURIs, generateCdnWsCleanIPURIs,
  generateGrpcCdnCleanIPURIs,
  generateEdtunnelURIs, generateEdtunnelCleanIPURIs,
  generateFinalmaskXdnsURI, generateFinalmaskXicmpURI,
  generateFinalmaskWechatURI, generateFinalmaskDtlsURI,
  generateFinalmaskSrtpURI,
  generateHy2HopURI, generateShadowTLSURI, generateAnyTlsURI,
  generateCloakSs2022URI,
  generateRelayServerConfigs,
  generateRelayRealityURI, generateRelayHy2URI, generateRelaySs2022URI,
  generateMTProtoLink, generateRealityAltSNIURIs,
  generateRelayXhttpURIs, generateRelayCdnWsURIs,
} from "./generators";
