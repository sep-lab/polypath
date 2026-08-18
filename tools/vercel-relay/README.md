# Vercel Edge Relay

CDN diversity layer for VPN traffic. If Cloudflare gets blocked from Iran, clients route through Vercel's edge network instead.

## How It Works

```text
Client (Iran) ──TLS──▶ Vercel Edge (anycast) ──HTTPS/WS──▶ VPN server (cdn*.example.com)
```

Iran's DPI sees TLS traffic to Vercel's IP range. Blocking Vercel breaks too many legitimate services.

## Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy (first time — link to a new project)
cd tools/vercel-relay
vercel --prod

# Subsequent deploys
vercel --prod
```

After deploy, note your production URL (e.g. `your-relay.vercel.app`).

### Custom Domain (optional)

For a cleaner URL, add a custom domain in Vercel dashboard:

1. Go to Project Settings > Domains
2. Add e.g. `relay.example.com`
3. Add the CNAME record in Cloudflare DNS (proxy OFF / DNS only)

## Usage

### Health Check

```bash
curl https://your-relay.vercel.app/health
```

### HTTPS Proxy (for XHTTP-CDN configs)

Route via path:

```bash
curl https://your-relay.vercel.app/relay/cdn.example.com/xhttp
```

Route via header:

```bash
curl -H "X-Target: cdn.example.com" https://your-relay.vercel.app/xhttp
```

### WebSocket Proxy (for CDN-WS configs)

Connect with WebSocket upgrade to:

```text
wss://your-relay.vercel.app/relay/cdn.example.com/ws
```

Or with header:

```text
wss://your-relay.vercel.app/ws
X-Target: cdn.example.com
```

## Client Configuration

### Hiddify / V2RayNG — XHTTP-CDN via Vercel

Take an existing XHTTP-CDN config and change:

- **Address**: `your-relay.vercel.app` (or custom domain)
- **SNI**: `your-relay.vercel.app`
- **Host**: `your-relay.vercel.app`
- **Path**: `/relay/cdn.example.com/xhttp`

### Hiddify / V2RayNG — CDN-WS via Vercel

Take an existing CDN-WS config and change:

- **Address**: `your-relay.vercel.app`
- **SNI**: `your-relay.vercel.app`
- **Host**: `your-relay.vercel.app`
- **Path**: `/relay/cdn.example.com/ws`

## Security

- **Not an open relay** — only proxies to hosts in the `ALLOWED_HOSTS` set
- **No secrets in code** — target host is derived from request path/headers
- **CORS enabled** — browser-based clients work out of the box
- **Body size limit** — 10 MB max to prevent abuse
- **Hop-by-hop headers stripped** — prevents header injection

## Allowed Backends

The relay only forwards to these hosts (edit `ALLOWED_HOSTS` in `api/relay.js`):

| Host | Server |
|---|---|
| `cdn.example.com` | Helsinki (HEL) |
| `cdn2.example.com` | Oracle Madrid (ORC) |
| `cdn3.example.com` | Scaleway London (SCW) |
| `cdn4.example.com` | GCP Dammam (GCP) |
| `sub.example.com` | Smart-sub worker |

## Architecture

```text
┌─────────────────────────────────────────────────┐
│  Iran Client                                     │
│  ┌───────────┐                                   │
│  │ Hiddify   │──TLS──▶ Vercel Edge (anycast)    │
│  └───────────┘         ┌──────────────────┐     │
│                        │ api/relay.js     │     │
│  DPI sees:             │ (Edge Runtime)   │     │
│  TLS → Vercel IP       │                  │     │
│  SNI: *.vercel.app     │ WS? ──▶ WS proxy │     │
│                        │ HTTP? ─▶ fetch() │     │
│                        └────────┬─────────┘     │
│                                 │               │
│                     ┌───────────▼──────────┐    │
│                     │  cdn*.example.com  │    │
│                     │  (VPN backend)        │    │
│                     └──────────────────────┘    │
└─────────────────────────────────────────────────┘
```

## Limitations

- Vercel Edge Functions have a 30-second max execution time (configurable up to 300s on Pro plan)
- WebSocket connections are subject to Vercel's connection timeout
- Free tier: 100 GB bandwidth/month, 500K edge function invocations/month
- For heavy VPN usage, consider Vercel Pro ($20/mo) for higher limits
