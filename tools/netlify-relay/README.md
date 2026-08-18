# Netlify Edge Relay

HTTPS relay running on Netlify's edge network (v1.1.0). Provides CDN diversity as a third path alongside Cloudflare and Vercel.

> **Note**: Netlify Edge Functions have a **30-second execution timeout**. This means WebSocket (CDN-WS) connections are killed after 30s — only XHTTP (HTTP-based, short-lived requests) configs are generated for Netlify relay. Vercel relay handles both XHTTP and CDN-WS.

## How It Works

All requests hit the Netlify Edge Function which proxies them to the upstream VPN server. The target is resolved from the URL path using path-based routing: `/relay/<origin_host>/<path>`. This means clients connect to a `*.netlify.app` domain, and Netlify forwards traffic to the actual server via Cloudflare CDN — the client IP is hidden behind two CDN layers.

### Security: ALLOWED_HOSTS

The relay validates that the target host is in an allowlist (`ALLOWED_HOSTS`) to prevent open relay abuse. Only configured CDN domains (e.g., `cdn.example.com`, `cdn2.example.com`, etc.) are permitted. Requests to unlisted hosts return 403 Forbidden.

## Endpoints

| Path | Method | Description |
|------|--------|-------------|
| `/health` | GET | Returns JSON status |
| `/relay/<host>/*` | ANY | Proxied to `<host>` (must be in ALLOWED_HOSTS) |

## Deploy

### 1. Install Netlify CLI

```bash
npm install -g netlify-cli
```

### 2. Login and link

```bash
cd tools/netlify-relay
netlify login
netlify init          # create new site, or link existing
```

### 3. Deploy

```bash
netlify deploy --prod
```

The site will be available at `https://<site-name>.netlify.app`.

### 4. (Optional) Custom domain

In Netlify dashboard: **Domain management > Add custom domain**. Point a CNAME to your Netlify site.

## Local Development

```bash
cd tools/netlify-relay
npx netlify dev
# Edge function runs at http://localhost:8888
curl http://localhost:8888/health
```

## Architecture

```text
Client (Iran)
  |
  | HTTPS / WSS
  v
Netlify Edge (global CDN)
  |
  | HTTPS / WSS
  v
cdn.example.com (Cloudflare CDN)
  |
  | HTTPS / WSS
  v
VPN Server (Helsinki / Oracle / GCP / Scaleway)
```

## Integration with Smart-Sub Worker

Add the Netlify relay domain as an additional CDN endpoint in the worker config. Only XHTTP (HTTP-based) configs are generated for Netlify — no CDN-WS due to the 30s timeout. Clients in Iran get configs that route through Netlify instead of (or in addition to) Cloudflare directly.

## Notes

- Netlify Edge Functions run on Deno (TypeScript).
- Path-based routing: `/relay/<host>/<path>` — target host is extracted from the URL path.
- ALLOWED_HOSTS security: only configured CDN domains are permitted (prevents open relay abuse).
- **30-second timeout**: Edge Functions are killed after 30s — WebSocket (long-lived) connections don't survive. Only XHTTP (short-lived HTTP) configs are generated.
- No secrets stored in code.
- Free tier: 100 GB bandwidth/month, unlimited edge function invocations.
- Blocking `*.netlify.app` would break thousands of developer/docs sites.
