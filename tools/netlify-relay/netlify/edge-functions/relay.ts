// Netlify Edge Function — HTTPS/WebSocket relay for VPN traffic
// Deno runtime. Provides CDN diversity alongside Cloudflare and Vercel.
// No secrets in code. Target resolved from path prefix /relay/<host>/...
// or X-Target header, or falls back to DEFAULT_TARGET.

const DEFAULT_TARGET = "cdn.example.com";

// ── Allowed Backends ──────────────────────────────────────────────────
// Data plane only. The subscription host is deliberately NOT listed:
// these relays present Netlify/Vercel edge IPs to the origin and set
// permissive CORS, so allowing the control plane through here would give
// anyone on the internet an anonymising, rate-limit-free path to
// /sub/<uuid>, /admin/* and /stats — defeating any WAF or rate limit
// applied at the origin.
const ALLOWED_HOSTS = new Set([
  "cdn.example.com",
  "cdn2.example.com",
  "cdn3.example.com",
  "cdn4.example.com",
]);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Target, Upgrade, Connection",
};

function corsResponse(body: string, status: number, extra?: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", ...extra },
  });
}

// ── Target Resolution ─────────────────────────────────────────────────
// Checked in order:
//   1. Path prefix:  /relay/<host>/remaining/path
//   2. X-Target header (explicit backend hostname)
//   3. DEFAULT_TARGET fallback
interface ResolvedTarget {
  hostname: string;
  path: string;
}

function resolveTarget(req: Request, url: URL): ResolvedTarget {
  // 1. Path-based: /relay/<host>/remaining/path
  const relayMatch = url.pathname.match(/^\/relay\/([^/]+)(\/.*)?$/);
  if (relayMatch) {
    const host = relayMatch[1];
    const remainingPath = relayMatch[2] || "/";
    return { hostname: host, path: remainingPath + (url.search || "") };
  }

  // 2. Explicit X-Target header
  const headerTarget = req.headers.get("X-Target");
  if (headerTarget) {
    const hostname = headerTarget.split("/")[0].split(":")[0];
    return { hostname, path: url.pathname + (url.search || "") };
  }

  // 3. Default target
  return { hostname: DEFAULT_TARGET, path: url.pathname + (url.search || "") };
}

export default async function handler(req: Request): Promise<Response> {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return corsResponse("", 204);
  }

  const url = new URL(req.url);

  // Health check
  if (url.pathname === "/health") {
    return corsResponse(
      JSON.stringify({
        status: "ok",
        provider: "netlify-edge",
        runtime: "deno",
        version: "1.1.0",
        ts: new Date().toISOString(),
        allowed_hosts: [...ALLOWED_HOSTS],
        features: ["https-proxy", "path-routing", "cors"],
      }),
      200,
    );
  }

  // Resolve upstream target
  const target = resolveTarget(req, url);

  // Security: only proxy to allowed hosts
  if (!ALLOWED_HOSTS.has(target.hostname)) {
    return corsResponse(
      JSON.stringify({ error: "forbidden_host", message: "Target host not in allowlist" }),
      403,
    );
  }

  const upstream = `https://${target.hostname}${target.path}`;

  // WebSocket upgrade — NOTE: Netlify Edge Functions have a 30-second
  // execution timeout. Long-lived VPN WebSocket connections will be killed.
  // XHTTP (HTTP POST/GET) works fine since each request completes quickly.
  if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    return handleWebSocket(req, target.hostname, url);
  }

  // HTTPS proxy
  return handleHTTPS(req, upstream);
}

// --- WebSocket passthrough ---------------------------------------------------

async function handleWebSocket(
  req: Request,
  target: string,
  url: URL,
): Promise<Response> {
  const wsTarget = `wss://${target}${url.pathname}${url.search}`;

  // Build forwarded headers — pass along all original headers except hop-by-hop
  const HOP_BY_HOP = new Set([
    "connection",
    "upgrade",
    "sec-websocket-key",
    "sec-websocket-version",
    "sec-websocket-extensions",
    "sec-websocket-accept",
    "host",
  ]);

  const forwardHeaders = new Headers();
  for (const [k, v] of req.headers.entries()) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) {
      forwardHeaders.set(k, v);
    }
  }
  forwardHeaders.set("Host", target);

  // Deno WebSocket upgrade on the client side
  const { socket: clientWs, response } = Deno.upgradeWebSocket(req);

  // Connect to upstream
  const upstreamWs = new WebSocket(wsTarget);

  // Wire upstream -> client
  upstreamWs.onmessage = (e: MessageEvent) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(e.data);
    }
  };
  upstreamWs.onclose = () => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
    }
  };
  upstreamWs.onerror = () => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
    }
  };

  // Wire client -> upstream
  clientWs.onmessage = (e: MessageEvent) => {
    if (upstreamWs.readyState === WebSocket.OPEN) {
      upstreamWs.send(e.data);
    }
  };
  clientWs.onclose = () => {
    if (upstreamWs.readyState === WebSocket.OPEN) {
      upstreamWs.close();
    }
  };
  clientWs.onerror = () => {
    if (upstreamWs.readyState === WebSocket.OPEN) {
      upstreamWs.close();
    }
  };

  return response;
}

// --- HTTPS proxy -------------------------------------------------------------

async function handleHTTPS(req: Request, upstream: string): Promise<Response> {
  const upstreamUrl = new URL(upstream);

  // Forward headers, rewrite Host, strip CDN-specific and hop-by-hop headers
  const STRIP = new Set([
    "x-target", "x-nf-request-id", "x-nf-client-connection-ip",
    "cf-connecting-ip", "cf-ray", "cf-ipcountry",
    "x-forwarded-host", "x-forwarded-proto",
    // Never relay credentials — see note on ALLOWED_HOSTS.
    "authorization", "cookie", "proxy-authorization",
  ]);
  const headers = new Headers();
  for (const [k, v] of req.headers.entries()) {
    if (!STRIP.has(k.toLowerCase())) {
      headers.set(k, v);
    }
  }
  headers.set("Host", upstreamUrl.hostname);
  // Preserve original client IP
  headers.set("X-Forwarded-For",
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for") || "0.0.0.0");

  try {
    const resp = await fetch(upstream, {
      method: req.method,
      headers,
      body: req.body,
      redirect: "manual",
    });

    // Merge CORS headers into response
    const respHeaders = new Headers(resp.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      respHeaders.set(k, v);
    }

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
    });
  } catch (err) {
    return corsResponse(
      JSON.stringify({ error: "upstream_error", detail: String(err) }),
      502,
    );
  }
}

export const config = { path: "/*" };
