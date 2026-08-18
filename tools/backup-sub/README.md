# Backup Smart Subscription (Vercel)

Failover subscription endpoint hosted on Vercel Edge. If the primary Cloudflare
Pages worker goes down (account suspension, domain seizure, outage), users switch
to this backup URL.

## How It Works

- `core-worker.js` = generated copy of `tools/smart-sub/worker.js` (produced by `npm run build` at repo root)
- `api/sub.js` = thin adapter: maps Vercel env + headers to CF Worker format
- All config generation logic is identical — same ~190 configs

## Differences from Primary (CF Pages)

| Feature | CF Pages (primary) | Vercel (backup) |
|---|---|---|
| KV storage | ✅ Full (users, health, probes) | ❌ Disabled (graceful no-op) |
| Geo detection | CF-IPCountry header | x-vercel-ip-country → mapped |
| ISP detection | CF ASN headers | ❌ falls back to default fragments |
| Admin API | ✅ CRUD users/servers | ❌ Disabled (no KV) |
| Subscription | ✅ Full | ✅ Full |
| Health | ✅ With health data | ✅ Static (no KV health) |
| MTProto | ✅ Full | ✅ Full |

## Setup

### 1. Build worker code

```bash
# From repo root:
npm run build
# This bundles src/ → worker.js AND copies to core-worker.js
```

### 2. Set env vars on Vercel

```bash
cd tools/backup-sub

# Copy from smart-sub/.dev.vars — all the same env vars
vercel env add ADMIN_UUID        # ad379645-...
vercel env add FAMILY_UUID
vercel env add TEST_UUID
vercel env add TEST_UUID_EXPIRES
vercel env add FREE_SERVER_LIMIT
vercel env add HEL_IP
vercel env add ORC_IP
vercel env add GCP_IP
vercel env add SCW_IP
vercel env add HEL_IPV6
vercel env add SCW_IPV6
vercel env add SHADOWTLS_PASSWORD
vercel env add SALAMANDER_PASSWORD
vercel env add SS_USER_KEY
vercel env add FINALMASK_SEED
vercel env add HEL_SS_KEY
vercel env add ORC_SS_KEY
vercel env add GCP_SS_KEY
vercel env add SCW_SS_KEY
vercel env add HEL_NAIVE_PASS
vercel env add ORC_NAIVE_PASS
vercel env add SCW_NAIVE_PASS
vercel env add SCW_CLOAK_UID
vercel env add SCW_CLOAK_PUBKEY
vercel env add EDTUNNEL_PAGES
vercel env add VERCEL_RELAY_HOSTS
vercel env add NETLIFY_RELAY_HOSTS
```

### 3. Deploy

```bash
vercel deploy --prod --yes
```

### 4. Add custom domain

Production domain: `sub.example.net` (Gandi DNS → A record → 76.76.21.21)

```bash
vercel domains add sub.example.net
# DNS: A record  sub → 76.76.21.21  (Vercel's anycast IP)
# SSL: vercel certs issue sub.example.net
```

Backup Vercel URL: `your-backup.vercel.app`

## Update Workflow

When src/ changes:

```bash
# From repo root:
npm run build    # Bundles src/ → worker.js + copies → core-worker.js
cd tools/backup-sub && vercel deploy --prod --yes
```
