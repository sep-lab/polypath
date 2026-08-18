# Smart-Sub Worker API Reference

> **Machine-readable spec**: [`docs/openapi.yaml`](openapi.yaml) (OpenAPI 3.1).  
> Generate HTML docs: `npm run docs:api` → `docs/api-reference/index.html`.

Base URL: `https://sub.example.com`  
Backup URL: `https://sub.example.net` (Vercel Edge — full parity, no KV)

> **v5.9.0**: ~190 configs, 35 generators, 4 servers, multi-CDN (CF + Vercel + Netlify),
> geo-aware ISP tuning (MCI/Irancell/Rightel), MUX padding, MTProto proxy,
> `/probe` infrastructure, admin CRUD, account tiers, multi-host XrayHTTP for Iran.

## Endpoints

### GET /

Returns `404 Not Found` (no landing page). All functional endpoints are listed below.

### GET /health

Returns server status for all enabled VPN servers.

**Authentication**: None required (public). Pass `?key=<ADMIN_UUID>` for extended admin info.

**Response** (public):

```json
{
  "servers": [
    {
      "tag": "helsinki",
      "location": "Finland",
      "protocols": ["reality", "hysteria2", "dns-tunnel", "finalmask", "shadowtls-v3", "hy2-salamander", "naiveproxy"],
      "health": "unknown",
      "latency_ms": null,
      "last_check": null
    }
  ],
  "server_count": 4,
  "checked_at": "2026-03-09T12:00:00.000Z"
}
```

**Response** (admin — `?key=<ADMIN_UUID>`):

```json
{
  "servers": [
    {
      "tag": "helsinki",
      "location": "Finland",
      "protocols": ["reality", "hysteria2", "..."],
      "health": "healthy",
      "latency_ms": 45,
      "last_check": "2026-03-09T11:55:00.000Z",
      "ip": "<SERVER_IP>",
      "provider": "Hetzner",
      "enabled": true
    }
  ],
  "server_count": 4,
  "checked_at": "2026-03-09T12:00:00.000Z"
}
```

| Status Code | Meaning |
|-------------|---------|
| 200 | Success |
| 500 | Internal server error |

---

### POST /health/report

Submit health check results (from GitHub Actions or external monitoring).

**Authentication**: `Authorization: Bearer <ADMIN_UUID>`

**Request Body**:

```json
{
  "results": [
    {
      "tag": "helsinki",
      "status": "healthy",
      "latency_ms": 45
    },
    {
      "tag": "oracle-madrid",
      "status": "unhealthy",
      "latency_ms": null
    }
  ]
}
```

**Response**:

```json
{
  "ok": true,
  "updated": 2
}
```

| Status Code | Meaning |
|-------------|---------|
| 200 | Health data updated |
| 400 | Invalid JSON body |
| 401 | Missing or invalid Authorization header |

---

### GET /stats?key=<ADMIN_UUID>

Returns admin dashboard data: server status, user summary, subscription request counts.

**Authentication**: `?key=<ADMIN_UUID>` (query parameter)

**Response**:

```json
{
  "servers": [
    {
      "tag": "helsinki",
      "location": "Finland",
      "enabled": true,
      "health": { "status": "healthy", "latency_ms": 45, "last_check": "..." }
    }
  ],
  "users": [
    {
      "name": "Admin",
      "tier": "premium",
      "enabled": true,
      "uuid_prefix": "a1b2c3d4..."
    }
  ],
  "sub_requests": {
    "today": { "a1b2c3d4...": 12 },
    "yesterday": { "a1b2c3d4...": 8 }
  },
  "total_servers": 4,
  "total_users": 3,
  "worker_version": "5.9.0",
  "checked_at": "2026-03-09T12:00:00.000Z"
}
```

| Status Code | Meaning |
|-------------|---------|
| 200 | Success |
| 401 | Missing or invalid key |

---

### GET /sub/:uuid

Generate VPN subscription configs for a user.

**Authentication**: UUID in path must match a valid, enabled user.

**Query Parameters**:

| Param | Default | Options | Description |
|-------|---------|---------|-------------|
| `format` | `base64` | `base64`, `json` | Response format |
| `mode` | _(auto)_ | `shutdown` | **Internet Shutdown Mode**: Forces DNS-tunnel-only configs (Finalmask, ShadowTLS, gRPC-CDN) for use during full internet shutdowns when only domestic DNS resolvers work. Normally, the worker auto-detects Iran via geo headers. |

**Response** (`format=base64`):

```text
Base64-encoded string of VPN config URIs (one per line).
Decodable to individual protocol URIs (vless://, hysteria2://, ss://, etc.)
```

**Response Headers**:

```text
Content-Type: text/plain; charset=utf-8
Profile-Title: base64:<encoded "VPN Smart Sub">
Profile-Update-Interval: 4
Subscription-Userinfo: upload=0; download=0; total=53687091200; expire=0
Support-URL: https://sub.example.com/health
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Content-Security-Policy: default-src 'none'
Referrer-Policy: no-referrer
Permissions-Policy: interest-cohort=()
```

**Response** (`format=json`):

```json
{
  "configs": [
    "vless://uuid@cdn.example.com:443?...",
    "hysteria2://uuid@<SERVER_IP>:8443?..."
  ],
  "server_count": 4,
  "user": "Admin",
  "tier": "premium"
}
```

| Status Code | Meaning |
|-------------|---------|
| 200 | Subscription configs returned |
| 401 | Invalid UUID or user disabled |
| 403 | Subscription expired |
| 404 | Path not matched |

---

### GET /mtproto/:uuid

Generate MTProto proxy links for Telegram.

**Authentication**: UUID in path must match a valid, enabled user.

**Response**: Plain text list of `tg://proxy` and `https://t.me/proxy` links for all enabled servers.

| Status Code | Meaning |
|-------------|---------|
| 200 | MTProto links returned |
| 401 | Invalid UUID or user disabled |

---

### User Tiers

| Tier | Servers | Protocols | CDN Configs | Direct Configs |
|------|---------|-----------|-------------|----------------|
| `premium` | All servers | All 15+ protocols | ✅ | ✅ |
| `free` | First N servers | All protocols on those servers | ✅ | ✅ |
| `limited` | All servers | CDN-only (XHTTP-CDN, CDN-WS, EDtunnel) | ✅ | ❌ |

---

### Protocol URI Formats

The subscription endpoint returns standard proxy URIs compatible with Hiddify, V2RayNG, Clash, and other clients:

| Protocol | URI Scheme | Example |
|----------|-----------|---------|
| VLESS Reality | `vless://` | `vless://uuid@ip:443?security=reality&...` |
| Hysteria2 | `hysteria2://` | `hysteria2://uuid@ip:8443?...` |
| XHTTP-CDN | `vless://` | `vless://uuid@cdn.domain:443?type=xhttp&...` |
| CDN-WS | `vless://` | `vless://uuid@cdn.domain:443?type=ws&...` |
| SS2022 | `ss://` | `ss://method:password@ip:port#name` |
| ShadowTLS v3 | `ss://` | `ss://...` (with ShadowTLS wrapper) |
| NaiveProxy | `naive+https://` | `naive+https://user:pass@ip:port#name` |
| EDtunnel | `vless://` | `vless://uuid@workers-domain:443?type=ws&...` |

---

## Error Responses

All errors return JSON:

```json
{
  "error": "Error message description"
}
```

## Rate Limits

No explicit rate limits. Cloudflare's default limits apply:

- Workers free tier: 100,000 requests/day
- KV reads: 100,000/day
- KV writes: 1,000/day

---

## Probe API

### GET /probe

Returns a bash script that tests VPN server reachability from a client network.

**Authentication**: Admin credential required (the endpoint is gated by `adminGate`; unauthenticated callers get `403 Forbidden`).

**Usage**:

```bash
curl -sL https://sub.example.com/probe | bash
```

**What it tests**:

1. TCP connectivity to all servers (ports 443, 80, 8443/UDP)
2. TLS handshake with Reality SNI domains
3. DNS resolution of CDN domains
4. HTTPS fetch through CDN
5. Clean CF IP reachability

**Response**: Plain text bash script.

| Status Code | Meaning |
|-------------|---------|
| 200 | Script returned |

---

### POST /probe/report

Receives probe results from the bash script (or any client).

**Authentication**: `PROBE_TOKEN` (or an admin credential). Requests without a valid token are rejected; the token is a scoped value handed to trusted testers.

**Request Body**:

```json
{
  "timestamp": "2025-01-15T12:00:00Z",
  "isp": "AS44244 Irancell",
  "country": "IR",
  "city": "Tehran",
  "ip_prefix": "5.232.x.x",
  "total_tests": 25,
  "up": 20,
  "down": 3,
  "unknown": 2,
  "results": [
    {
      "test": "tcp_443",
      "target": "helsinki",
      "status": "up",
      "latency_ms": 120,
      "detail": "port 443 reachable"
    }
  ]
}
```

**Response**:

```json
{
  "ok": true,
  "stored": true,
  "timestamp": "2025-01-15T12:00:05Z"
}
```

| Status Code | Meaning |
|-------------|---------|
| 200 | Report stored |
| 400 | Invalid JSON |
| 503 | KV not available |

---

## Admin Probe API

### GET /admin/probes

List recent probe reports from Iranian testers with aggregated per-server reachability.

**Authentication**: `Authorization: Bearer <ADMIN_UUID>`

**Query Parameters**:

| Param | Default | Description |
|-------|---------|-------------|
| `limit` | 20 | Max reports to return (1-100) |

**Response**:

```json
{
  "summary": {
    "total_reports": 15,
    "unique_isps": ["AS44244 Irancell", "AS197207 MCI"],
    "unique_cities": ["Tehran", "Isfahan"],
    "latest_report": "2025-01-15T12:00:00Z",
    "aggregate": {
      "helsinki": { "up": 12, "down": 3, "total": 15 },
      "oracle-madrid": { "up": 14, "down": 1, "total": 15 }
    }
  },
  "reports": [ ... ]
}
```

| Status Code | Meaning |
|-------------|---------|
| 200 | Reports returned |
| 401 | Unauthorized |

### DELETE /admin/probes

Clear all stored probe reports.

**Authentication**: `Authorization: Bearer <ADMIN_UUID>`

**Response**:

```json
{
  "ok": true,
  "deleted": 15
}
```
