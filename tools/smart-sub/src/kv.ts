// ── KV-backed Operations ──────────────────────────────────────────
import type {
  Env, User, KvUserData, ServerOverrideData, StoredProbeReport, HealthData, Server,
} from "./types";

// ── User Management ──

export async function getAllKvUsers(env: Env): Promise<Record<string, User>> {
  if (!env.HEALTH) return {};
  const list = await env.HEALTH.list({ prefix: "user:" });
  const users: Record<string, User> = {};
  for (const key of list.keys) {
    const uuid = key.name.replace("user:", "");
    const raw = await env.HEALTH.get(key.name);
    if (raw) {
      try {
        users[uuid] = { ...(JSON.parse(raw) as KvUserData), source: "kv" };
      } catch { /* skip corrupt entries */ }
    }
  }
  return users;
}

export async function getKvUser(env: Env, uuid: string): Promise<KvUserData | null> {
  if (!env.HEALTH) return null;
  const raw = await env.HEALTH.get(`user:${uuid}`);
  if (!raw) return null;
  try { return JSON.parse(raw) as KvUserData; } catch { return null; }
}

export async function setKvUser(env: Env, uuid: string, userData: KvUserData): Promise<boolean> {
  if (!env.HEALTH) return false;
  await env.HEALTH.put(`user:${uuid}`, JSON.stringify(userData));
  return true;
}

export async function deleteKvUser(env: Env, uuid: string): Promise<boolean> {
  if (!env.HEALTH) return false;
  await env.HEALTH.delete(`user:${uuid}`);
  return true;
}

export async function resolveUser(
  env: Env,
  uuid: string,
  envUsers: Record<string, User>
): Promise<User | null> {
  const kvUser = await getKvUser(env, uuid);
  if (kvUser) return { ...kvUser, source: "kv" };
  return envUsers[uuid] || null;
}

export async function resolveAllUsers(
  env: Env,
  envUsers: Record<string, User>
): Promise<Record<string, User>> {
  const kvUsers = await getAllKvUsers(env);
  const merged = { ...envUsers };
  for (const [uuid, user] of Object.entries(kvUsers)) {
    merged[uuid] = user;
  }
  return merged;
}

// ── Server Overrides ──

export async function getServerOverride(env: Env, tag: string): Promise<ServerOverrideData | null> {
  if (!env.HEALTH) return null;
  const raw = await env.HEALTH.get(`server_override:${tag}`);
  if (!raw) return null;
  try { return JSON.parse(raw) as ServerOverrideData; } catch { return null; }
}

export async function setServerOverride(
  env: Env,
  tag: string,
  data: ServerOverrideData
): Promise<boolean> {
  if (!env.HEALTH) return false;
  await env.HEALTH.put(`server_override:${tag}`, JSON.stringify(data));
  return true;
}

export async function deleteServerOverride(env: Env, tag: string): Promise<boolean> {
  if (!env.HEALTH) return false;
  await env.HEALTH.delete(`server_override:${tag}`);
  return true;
}

export async function getAllServerOverrides(env: Env): Promise<Record<string, ServerOverrideData>> {
  if (!env.HEALTH) return {};
  const list = await env.HEALTH.list({ prefix: "server_override:" });
  const overrides: Record<string, ServerOverrideData> = {};
  for (const key of list.keys) {
    const tag = key.name.replace("server_override:", "");
    const raw = await env.HEALTH.get(key.name);
    if (raw) {
      try { overrides[tag] = JSON.parse(raw) as ServerOverrideData; } catch { /* skip corrupt */ }
    }
  }
  return overrides;
}

export async function applyServerOverrides(env: Env, servers: Server[]): Promise<Server[]> {
  const overrides = await getAllServerOverrides(env);
  for (const server of servers) {
    const ov = overrides[server.tag];
    if (!ov) continue;
    if (ov.ip) server.ip = ov.ip;
    if (ov.ipv6 !== undefined) server.ipv6 = ov.ipv6 as string | null;
    if (ov.enabled !== undefined) server.enabled = ov.enabled;
  }
  return servers;
}

// ── Probe Reports ──

export async function storeProbeReport(env: Env, report: StoredProbeReport): Promise<boolean> {
  if (!env.HEALTH) return false;
  const key = `probe_report:${report.timestamp || new Date().toISOString()}`;
  await env.HEALTH.put(key, JSON.stringify(report), { expirationTtl: 60 * 60 * 24 * 30 });
  return true;
}

export async function getRecentProbeReports(env: Env, limit = 20): Promise<StoredProbeReport[]> {
  if (!env.HEALTH) return [];
  const list = await env.HEALTH.list({ prefix: "probe_report:" });
  const keys = list.keys.sort((a, b) => b.name.localeCompare(a.name)).slice(0, limit);
  const reports: StoredProbeReport[] = [];
  for (const key of keys) {
    const raw = await env.HEALTH.get(key.name);
    if (raw) {
      try { reports.push(JSON.parse(raw) as StoredProbeReport); } catch { /* skip */ }
    }
  }
  return reports;
}

// ── Health Helpers ──

export async function getHealthData(env: Env): Promise<HealthData> {
  if (!env.HEALTH) return {};
  const raw = await env.HEALTH.get("server_health");
  if (!raw) return {};
  try { return JSON.parse(raw) as HealthData; } catch { return {}; }
}

export async function setHealthData(env: Env, data: HealthData): Promise<void> {
  if (!env.HEALTH) return;
  await env.HEALTH.put("server_health", JSON.stringify(data));
}

// ── Clean IP Overrides ──

export async function getCleanIpOverrides(env: Env): Promise<string[] | null> {
  if (!env.HEALTH) return null;
  const raw = await env.HEALTH.get("clean_ips");
  if (!raw) return null;
  try { return JSON.parse(raw) as string[]; } catch { return null; }
}

export async function setCleanIpOverrides(env: Env, ips: string[]): Promise<boolean> {
  if (!env.HEALTH) return false;
  await env.HEALTH.put("clean_ips", JSON.stringify(ips));
  return true;
}

export async function deleteCleanIpOverrides(env: Env): Promise<boolean> {
  if (!env.HEALTH) return false;
  await env.HEALTH.delete("clean_ips");
  return true;
}

export async function trackSubRequest(env: Env, uuid: string): Promise<void> {
  if (!env.HEALTH) return;
  const key = `sub_hits:${new Date().toISOString().slice(0, 10)}`;
  const raw = await env.HEALTH.get(key);
  const hits: Record<string, number> = raw ? (JSON.parse(raw) as Record<string, number>) : {};
  hits[uuid] = (hits[uuid] || 0) + 1;
  hits["_total"] = (hits["_total"] || 0) + 1;
  await env.HEALTH.put(key, JSON.stringify(hits), { expirationTtl: 60 * 60 * 24 * 30 });
}

// ── Failed-authentication throttle ─────────────────────────────────
//
// There was no rate limiting anywhere, and every credentialed endpoint returns
// a clean 401-vs-200 oracle with no backoff. 122 bits of UUID makes brute force
// impractical, but "impractical" is not a control, and it says nothing about a
// leaked-then-revoked credential being retried, or about someone simply
// hammering the endpoint.
//
// This deliberately counts FAILURES only. Counting every request would burn the
// free tier's 1k KV writes/day on legitimate traffic — the exact self-inflicted
// outage a naive limiter causes here. Successful callers never write.
//
// Volumetric protection is a separate concern and belongs in Cloudflare Rate
// Limiting rules at the edge; see docs/threat-model.md.

const AUTH_FAIL_WINDOW_SECONDS = 15 * 60;
const AUTH_FAIL_LIMIT = 20;

function authFailKey(clientId: string): string {
  return `authfail:${clientId}`;
}

/** Identify the caller for throttling. Falls back to a shared bucket. */
export function clientIdFor(request: Request): string {
  return request.headers.get("CF-Connecting-IP")
    || request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || "unknown";
}

/** Has this caller exceeded the failed-auth budget? */
export async function isAuthThrottled(env: Env, clientId: string): Promise<boolean> {
  if (!env.HEALTH) return false;
  const raw = await env.HEALTH.get(authFailKey(clientId));
  if (!raw) return false;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= AUTH_FAIL_LIMIT;
}

/** Record one failed authentication attempt. */
export async function recordAuthFailure(env: Env, clientId: string): Promise<void> {
  if (!env.HEALTH) return;
  const key = authFailKey(clientId);
  const raw = await env.HEALTH.get(key);
  const n = raw ? parseInt(raw, 10) : 0;
  await env.HEALTH.put(key, String((Number.isFinite(n) ? n : 0) + 1), {
    expirationTtl: AUTH_FAIL_WINDOW_SECONDS,
  });
}

export const AUTH_THROTTLE = {
  windowSeconds: AUTH_FAIL_WINDOW_SECONDS,
  limit: AUTH_FAIL_LIMIT,
} as const;
