/**
 * Vercel Edge Relay v1.0
 *
 * CDN diversity layer — proxies WebSocket and HTTPS traffic through Vercel's
 * edge network to VPN backend servers. If Cloudflare gets blocked from Iran,
 * clients switch their CDN domain to this Vercel relay.
 *
 * Traffic flow:
 *   Client (Iran) → Vercel Edge (anycast) → VPN server (cdn*.example.com)
 *
 * DPI sees: TLS to Vercel's IP range — blocking Vercel breaks too many services.
 *
 * Target resolution (checked in order):
 *   1. X-Target header (explicit backend, e.g. "cdn.example.com")
 *   2. Path prefix   /relay/<host>/...  (e.g. /relay/cdn.example.com/xhttp)
 *   3. Reject — no open relay
 *
 * Endpoints:
 *   GET  /health          → JSON health check (no secrets exposed)
 *   *    /relay/<host>/*  → Proxy to <host> (WebSocket or HTTPS)
 *   *    /* + X-Target    → Proxy to X-Target header value
 */

export const config = { runtime: 'edge' };

// ── Allowed Backends ──────────────────────────────────────────────────
// Data plane only. The subscription host is deliberately NOT listed:
// these relays present Netlify/Vercel edge IPs to the origin and set
// permissive CORS, so allowing the control plane through here would give
// anyone on the internet an anonymising, rate-limit-free path to
// /sub/<uuid>, /admin/* and /stats — defeating any WAF or rate limit
// applied at the origin.
const ALLOWED_HOSTS = new Set([
  'cdn.example.com',
  'cdn2.example.com',
  'cdn3.example.com',
  'cdn4.example.com',
]);

// Maximum request body size (10 MB)
const MAX_BODY_SIZE = 10 * 1024 * 1024;

// ── CORS Headers ────────────────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
  'Access-Control-Allow-Headers': 'Content-Type, X-Target, Upgrade, Connection',
  'Access-Control-Max-Age': '86400',
};

// ── Main Handler ────────────────────────────────────────────────────
export default async function handler(req) {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Health check
  if (path === '/health' || path === '/') {
    return handleHealth(req);
  }

  // Resolve target backend
  const target = resolveTarget(req, url);
  if (!target) {
    return jsonResponse(400, {
      error: 'missing_target',
      message: 'Set X-Target header or use /relay/<host>/path',
    });
  }

  if (!ALLOWED_HOSTS.has(target.hostname)) {
    return jsonResponse(403, {
      error: 'forbidden_host',
      message: 'Target host not in allowlist',
    });
  }

  // Check for WebSocket upgrade
  const upgradeHeader = req.headers.get('upgrade') || '';
  if (upgradeHeader.toLowerCase() === 'websocket') {
    return handleWebSocket(req, target);
  }

  // Regular HTTPS proxy
  return handleHTTPS(req, target);
}

// ── Health Check ────────────────────────────────────────────────────
function handleHealth(_req) {
  return jsonResponse(200, {
    status: 'ok',
    service: 'vercel-relay',
    version: '1.0.0',
    runtime: 'edge',
    timestamp: new Date().toISOString(),
    allowed_hosts: [...ALLOWED_HOSTS],
    features: ['websocket-proxy', 'https-proxy', 'cors'],
  });
}

// ── Target Resolution ───────────────────────────────────────────────
function resolveTarget(req, url) {
  // 1. Explicit header
  const headerTarget = req.headers.get('x-target');
  if (headerTarget) {
    return parseTarget(headerTarget, url);
  }

  // 2. Path-based: /relay/<host>/remaining/path
  const relayMatch = url.pathname.match(/^\/relay\/([^/]+)(\/.*)?$/);
  if (relayMatch) {
    const host = relayMatch[1];
    const remainingPath = relayMatch[2] || '/';
    const search = url.search || '';
    return {
      hostname: host,
      origin: `https://${host}`,
      path: remainingPath + search,
    };
  }

  return null;
}

function parseTarget(value, url) {
  // Accept bare hostname or full URL
  let hostname;
  let basePath = '';
  try {
    if (value.includes('://')) {
      const parsed = new URL(value);
      hostname = parsed.hostname;
      basePath = parsed.pathname === '/' ? '' : parsed.pathname;
    } else {
      hostname = value.split('/')[0].split(':')[0];
    }
  } catch {
    return null;
  }
  // Forward the original request path (minus /relay prefix if any)
  const forwardPath = basePath + url.pathname + (url.search || '');
  return {
    hostname,
    origin: `https://${hostname}`,
    path: forwardPath,
  };
}

// ── WebSocket Proxy ─────────────────────────────────────────────────
// Vercel Edge supports WebSocket upgrade via fetch() to the backend.
// The client opens a WS to Vercel; Vercel opens a WS to the backend;
// frames are relayed bidirectionally.
async function handleWebSocket(req, target) {
  const backendUrl = target.origin + target.path;

  // Build headers to forward — strip hop-by-hop except Upgrade/Connection
  const forwardHeaders = buildForwardHeaders(req, target);
  forwardHeaders.set('upgrade', 'websocket');
  forwardHeaders.set('connection', 'Upgrade');

  try {
    // Vercel Edge: fetch with upgrade header triggers WS passthrough
    const backendResp = await fetch(backendUrl, {
      method: req.method,
      headers: forwardHeaders,
      // @ts-ignore — Vercel Edge supports duplex streaming
      duplex: 'half',
    });

    // Return the backend response as-is (Vercel handles the upgrade)
    return backendResp;
  } catch (err) {
    return jsonResponse(502, {
      error: 'websocket_proxy_failed',
      message: err.message || 'Failed to connect to backend WebSocket',
    });
  }
}

// ── HTTPS Proxy ─────────────────────────────────────────────────────
async function handleHTTPS(req, target) {
  const backendUrl = target.origin + target.path;
  const forwardHeaders = buildForwardHeaders(req, target);

  // Read request body if present (with size limit)
  let body = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_BODY_SIZE) {
      return jsonResponse(413, { error: 'payload_too_large' });
    }
    body = req.body;
  }

  try {
    const backendResp = await fetch(backendUrl, {
      method: req.method,
      headers: forwardHeaders,
      body,
      // @ts-ignore
      duplex: body ? 'half' : undefined,
      redirect: 'manual',
    });

    // Build response with CORS headers added
    const respHeaders = new Headers(backendResp.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      respHeaders.set(k, v);
    }
    // Remove hop-by-hop headers from backend response
    respHeaders.delete('transfer-encoding');

    return new Response(backendResp.body, {
      status: backendResp.status,
      statusText: backendResp.statusText,
      headers: respHeaders,
    });
  } catch (err) {
    return jsonResponse(502, {
      error: 'https_proxy_failed',
      message: err.message || 'Failed to reach backend',
    });
  }
}

// ── Header Forwarding ───────────────────────────────────────────────
// Forward client headers to backend, rewriting Host and stripping internals.
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding',
]);
const STRIP_HEADERS = new Set([
  'x-target', 'x-vercel-id', 'x-vercel-ip-country', 'x-vercel-ip-city',
  'x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-host', 'x-forwarded-proto',
  'x-forwarded-for', 'cf-connecting-ip', 'cf-ray',
  // Never relay credentials — see note on ALLOWED_HOSTS.
  'authorization', 'cookie', 'proxy-authorization',
]);

function buildForwardHeaders(req, target) {
  const headers = new Headers();
  for (const [key, value] of req.headers.entries()) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower) || STRIP_HEADERS.has(lower)) continue;
    headers.set(key, value);
  }
  // Set Host to the backend target
  headers.set('host', target.hostname);
  // Preserve original client IP for logging
  headers.set('x-forwarded-for', req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || '0.0.0.0');
  return headers;
}

// ── Helpers ──────────────────────────────────────────────────────────
function jsonResponse(status, body) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}
