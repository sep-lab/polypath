// ── Utility Functions ──────────────────────────────────────────────
import {
  FRAGMENT, ISP_FRAGMENTS, ASN_TO_ISP, SECURITY_HEADERS,
  ISP_BLOCKED_PROTOCOLS,
} from "./constants";
import type { FragmentSettings, User, Server } from "./types";

export function isValidUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

/**
 * Resolve the caller's ISP from their ASN.
 *
 * Cloudflare exposes the ASN on `request.cf.asn` (a number), NOT as a request
 * header — there is no `CF-IPRegion-ASN` or `cf-meta-asn`. Reading those headers
 * meant this always returned "unknown", which silently disabled every per-ISP
 * feature: fragment profiles, protocol filtering, host priority and config
 * ordering. Headers are still consulted as a fallback so non-Cloudflare
 * deployments (the Vercel backup) can supply the ASN explicitly, but a
 * client-supplied header must never override the platform's own value.
 */
export function detectIranISP(request: Request): string {
  const cf = (request as Request & { cf?: { asn?: number | string } }).cf;
  const platformAsn = cf?.asn;

  const raw = platformAsn !== undefined && platformAsn !== null
    ? String(platformAsn)
    : (request.headers.get("cf-asn") || "");

  const asnNum = raw.replace(/^AS/i, "").trim();
  return ASN_TO_ISP[asnNum] || "unknown";
}

export function getISPFragment(isp: string): FragmentSettings {
  return ISP_FRAGMENTS[isp] || FRAGMENT;
}

export function getServersForUser(
  user: User,
  servers: Server[],
  freeServerLimit: number,
  country: string | null = null
): Server[] {
  const upperCountry = country ? country.toUpperCase() : null;
  const enabled = servers.filter(s => {
    if (!s.enabled) return false;
    if (s.geo_restrict && s.geo_restrict.length > 0) {
      if (!upperCountry) return false;
      return s.geo_restrict.includes(upperCountry);
    }
    if (s.geo_exclude && s.geo_exclude.length > 0 && upperCountry) {
      return !s.geo_exclude.includes(upperCountry);
    }
    return true;
  });
  if (user.tier === "free") {
    return enabled.slice(0, freeServerLimit);
  }
  return enabled;
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...SECURITY_HEADERS,
    },
  });
}

/**
 * Detect if the client is Hiddify/sing-box based on User-Agent or query param.
 * Returns "hiddify" | "xray" | "auto".
 */
export function detectClient(request: Request, searchParams: URLSearchParams): string {
  const explicit = (searchParams.get("client") || "").toLowerCase();
  if (explicit === "hiddify" || explicit === "singbox" || explicit === "sing-box") return "hiddify";
  if (explicit === "xray" || explicit === "v2ray") return "xray";

  const ua = (request.headers.get("User-Agent") || "").toLowerCase();
  if (ua.includes("hiddify") || ua.includes("sfa/") || ua.includes("sfi/") || ua.includes("sing-box")) {
    return "hiddify";
  }
  return "auto";
}

/**
 * Filter config URIs to only include sing-box compatible ones (for Hiddify users).
 * Removes: kcp/mKCP, Cloak plugin, naive, awg.
 * Keeps: xhttp (sing-box 1.12+ supports it), headerType=http (xray-only but
 *   Hiddify passes it to xray-core backend — and it's the ONLY working protocol
 *   on Irancell, so removing it leaves users with nothing).
 */
export function filterForSingBox(lines: string[]): string[] {
  return lines.filter(uri => {
    if (uri.startsWith("hy2://")) return true;
    if (uri.startsWith("sing-box://")) return true;
    if (uri.startsWith("naive+")) return false;
    if (uri.startsWith("awg://")) return false;
    if (uri.startsWith("ss://")) return !uri.includes("plugin=ck-client");
    if (uri.startsWith("vless://")) {
      const qIdx = uri.indexOf("?");
      if (qIdx < 0) return false;
      const hash = uri.indexOf("#", qIdx);
      const qs = uri.substring(qIdx + 1, hash > 0 ? hash : undefined);
      const params = new URLSearchParams(qs);
      const type = params.get("type");
      // kcp (Finalmask) is truly unsupported in sing-box
      if (type === "kcp") return false;
      // xhttp: supported in sing-box 1.12+ (Hiddify 3.x+) — keep it
      // headerType=http: Hiddify routes these through xray backend — keep it
      return true;
    }
    return false;
  });
}

/**
 * Filter out protocols known to be broken on a specific ISP.
 * Uses the config name fragment (after #) to match against ISP_BLOCKED_PROTOCOLS.
 */
export function filterByISP(lines: string[], isp: string): string[] {
  const blocked = ISP_BLOCKED_PROTOCOLS[isp];
  if (!blocked || blocked.length === 0) return lines;

  return lines.filter(uri => {
    const hashIdx = uri.indexOf("#");
    if (hashIdx < 0) return true;
    const name = uri.substring(hashIdx + 1);
    // Check if config name starts with any blocked protocol prefix
    return !blocked.some(prefix => name.startsWith(prefix));
  });
}

export function sortConfigsByISP(lines: string[], isp: string): string[] {
  if (!isp || isp === "unknown") return lines;

  function priority(uri: string): number {
    switch (isp) {
      case "irancell":
        if (uri.includes("#XrayHTTP-") || uri.includes("headerType=http")) return 1;
        if (uri.startsWith("ss://") && !uri.includes("sing-box://")) return 2;
        if (uri.includes("#XHTTP-CDN-") || uri.includes("type=xhttp")) return 3;
        if (uri.includes("#Finalmask-") || uri.includes("type=kcp")) return 4;
        if (uri.includes("#gRPC-CDN-")) return 5;
        if (uri.includes("#ShadowTLS-")) return 6;
        if (uri.includes("#CDN-WS-") || uri.includes("type=ws")) return 7;
        return 10;
      case "mci":
        if (uri.includes("#XHTTP-CDN-") || uri.includes("type=xhttp")) return 1;
        if (uri.includes("#XrayHTTP-") || uri.includes("headerType=http")) return 2;
        if (uri.includes("#Finalmask-") || uri.includes("type=kcp")) return 3;
        if (uri.startsWith("ss://") && !uri.includes("sing-box://")) return 4;
        if (uri.includes("#gRPC-CDN-")) return 5;
        if (uri.includes("#ShadowTLS-")) return 6;
        if (uri.includes("#CDN-WS-") || uri.includes("type=ws")) return 7;
        return 10;
      case "rightel":
        if (uri.includes("#XHTTP-CDN-") || uri.includes("type=xhttp")) return 1;
        if (uri.includes("#XrayHTTP-") || uri.includes("headerType=http")) return 2;
        if (uri.includes("#CDN-WS-") || uri.includes("type=ws")) return 3;
        if (uri.includes("#Finalmask-") || uri.includes("type=kcp")) return 4;
        if (uri.startsWith("ss://") && !uri.includes("sing-box://")) return 5;
        return 10;
      default:
        return 10;
    }
  }

  return [...lines].sort((a, b) => priority(a) - priority(b));
}

/**
 * Constant-time string comparison.
 *
 * Compares SHA-256 digests rather than the raw strings: digests are fixed
 * length, so the loop below reveals nothing about the secret's length, and a
 * plain `===` on the digests would still short-circuit. Remotely exploiting
 * V8 string-compare timing across an edge network is close to theoretical, but
 * these are the checks guarding the admin API and they should not be the
 * weakest reasoning in the file.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

/**
 * Extract an admin credential from a request.
 *
 * Prefers `Authorization: Bearer <token>`. The `?key=` form is still accepted
 * because deployed probe scripts and workflows use it, but it leaks the
 * credential into edge logs, browser history and Referer headers — prefer the
 * header, and treat query-string support as deprecated.
 */
export function extractAdminCredential(request: Request, url: URL): string | null {
  const auth = request.headers.get("Authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7);
  return url.searchParams.get("key");
}

/**
 * Is this request authenticated as the operator?
 *
 * Accepts ADMIN_TOKEN when configured. Falls back to ADMIN_UUID so existing
 * deployments keep working — but note that ADMIN_UUID doubles as a normal
 * subscription credential, so a deployment relying on the fallback cannot
 * rotate its admin credential without also invalidating a user. Set
 * ADMIN_TOKEN to separate them.
 */
export async function isAdminRequest(
  request: Request,
  url: URL,
  adminToken: string | undefined,
  adminUuid: string
): Promise<boolean> {
  const presented = extractAdminCredential(request, url);
  if (!presented) return false;
  const expected = adminToken || adminUuid;
  return timingSafeEqual(presented, expected);
}

/**
 * Is this a plausible IPv4 address, IPv6 address, or hostname?
 *
 * Admin-supplied values flow straight into generated proxy URIs
 * (`vless://<uuid>@<ip>:<port>?...`). Without validation an entry like
 * `evil.com:443?x=#` rewrites the config to point somewhere else, silently
 * redirecting every subscriber — so this is a config-poisoning guard, not
 * input tidiness.
 */
export function isValidHostOrIp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!v || v.length > 253) return false;
  // Reject anything that could break out of the URI position.
  if (/[\s/@?#\\[\]<>"'`]/.test(v)) return false;

  const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  if (ipv4.test(v)) return true;
  // IPv6: hex groups and colons only. Deliberately permissive on form,
  // strict on character set.
  if (/^[0-9a-fA-F:]+$/.test(v) && v.includes(":")) return true;
  // Hostname
  return /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(v);
}

/** Escape a string for interpolation into HTML text or an attribute value. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
