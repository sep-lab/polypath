# Strategy & Roadmap

Future vision for scaling from a personal VPN setup to a resilient, multi-server, app-driven platform.

## Current State (v5.9 — March 2026)

- 4 active servers (Helsinki, Oracle Madrid, GCP Dammam, Scaleway London)
- 15+ protocol types across TCP, UDP, CDN, DNS, and QUIC transports:
  - **CDN-fronted**: XHTTP-CDN, CDN-WS (all 4 servers) via Cloudflare + Vercel relay + Netlify relay
  - **Direct encrypted**: Reality, Hy2, XrayHTTP (all 4 servers)
  - **Advanced obfuscation**: Finalmask XDNS/XICMP (all 4), Hy2 Salamander+Hop (all 4), ShadowTLS v3 (all 4)
  - **Plan B**: SS2022 (all 4), NaiveProxy (HEL+ORC+SCW), Cloak (SCW), MTProto (all 4)
  - **Emergency**: DNS tunnel (HEL+ORC+SCW), EDtunnel (CF Pages)
- Smart subscription worker v5.11 at sub.example.com (~144 configs per premium user)
- Backup subscription at sub.example.net (Vercel Edge, full parity)
- Geo-aware: Iran users get ISP-specific TLS fragment + MUX padding (MCI, Irancell, Rightel)
- Xray-core v26.2.6 with Finalmask support on all servers
- Config distribution: Hiddify subscription link (auto-updates every 4h)
- Smart sub served via CF Pages Custom Domain (Workers account-level blocked)
- Users: small circle (family/friends)
- Cost: ~€12/mo (Helsinki €4.35 + Scaleway €3.36 + GCP ~$25 credit + Oracle free)

## Vision

A self-healing VPN platform where users install one app, tap connect, and it just works — regardless of what Iran's DPI is doing today.

---

## Track 1: Server Ocean

### Goal

Pool of diverse exit servers across providers/regions. When one gets blocked, others absorb traffic automatically.

### Tier 0 — Free/Credit Servers (deployed)

| Provider | Offer | Location | Status |
|---|---|---|---|
| **Oracle Cloud** | Always Free ARM (1 OCPU, 6GB) | Madrid | ✅ Active |
| **Google Cloud** | e2-medium ($300 credit) | Dammam, SA | ✅ Active |
| **CF Pages EDtunnel** | Serverless VLESS | Cloudflare edge | ✅ Deployed |

**Stack**: Same reality-ezpz + sing-box + xray-core sidecar + HAProxy. Same UUID. All in smart-sub v5.11.

### Tier 1 — Cheap Paid (deployed)

| Provider | Plan | Location | Cost | Status |
|---|---|---|---|---|
| **Hetzner** | CX23 | Helsinki, FI | €4.35/mo | ✅ Primary |
| **Scaleway** | PLAY2-PICO | London, UK | €3.36/mo | ✅ Active |

### Tier 1 — Future Expansion

| Provider | Plan | Location | Cost | Why |
|---|---|---|---|---|
| **Vultr** | Cloud Compute | Tokyo or Singapore | $2.50/mo | Asia route diversity, lower latency for some ISPs |
| **BuyVM** | 512MB | Luxembourg | $2/mo | Unmetered BW, good for high-traffic |

### ArvanCloud (Iranian Domestic Relay) — Planned

**What**: Provision an eco-small1 (1 CPU, 1GB RAM, ~$1.50/mo at market rate). Set up as VLESS relay — users connect domestically (free/cheap), relay forwards to our international servers.

**Architecture**:

```text
User (Iran)              ArvanCloud VPS (Iran)         Exit (abroad)
┌──────────┐  domestic  ┌──────────────────┐  intl    ┌──────────┐
│ App/     │──────────> │ VLESS relay      │────────> │ Helsinki │
│ Hiddify  │ free/cheap │ eco-small1       │          │ Madrid   │
│          │            │ ArvanCloud       │          │ London   │
└──────────┘            └──────────────────┘          └──────────┘
```

**Risk mitigation**:

- Relay only forwards, stores nothing
- If terminated, users fall back to direct international connections
- Don't put all users on it — offer as optional "fast mode"

**Decision**: Worth experimenting. Worst case = account terminated, $1.50 lost. Best case = free/cheap access for users on metered ISPs.

> See **Track 8: IP Hiding & Relay Strategies** below for a comprehensive breakdown of all IP-hiding approaches including ArvanCloud, CDN relays, and domestic cloud providers.

### Auto-Provisioning (Future)

```text
IP blocked → health monitor detects
  → API call: Hetzner create_server
  → cloud-init runs deploy.sh
  → New server joins pool
  → Config backend updates subscription
  → Users get new server on next connect
  → Total time: ~5 minutes, zero manual intervention
```

Requires: Phase A automation (deploy.sh) + health monitoring + config backend API.

---

## Track 2: Smart Config Backend

### Status: ✅ Implemented (smart-sub v5.11)

Deployed as CF Pages project `your-pages-project` at `sub.example.com`.
Workers account-level blocked (error 1101) — mitigated by using CF Pages with `_worker.js`.

### Architecture (Deployed)

```text
┌──────────────────────────────────────────┐
│   CF Pages — your-pages-project      │
│                                          │
│  GET /sub/<UUID>                         │
│    1. Validate UUID                      │
│    2. Generate ~190 configs (15+ protocols)│
│    3. 13-tier fallback priority          │
│    4. Encode as base64 subscription      │
│    6. Return to client                   │
│                                          │
│  GET /health                             │
│    → Returns protocol inventory JSON     │
│                                          │
│  Custom domain: sub.example.com       │
└──────────────────────────────────────────┘
```

### What This Enables

| Feature | Static Sub URL | Smart Backend |
|---|---|---|
| Dead server in config | Yes, user gets errors | No, filtered out automatically |
| New server added | User must re-import | Auto-included on next refresh |
| ISP-specific optimization | No | Can detect ISP, return best servers |
| Free vs premium | Same config for all | Different server pools per tier |
| Server rotation | Manual | Automatic, transparent |
| Analytics | Blind | Know which servers users request |

### Next Steps

- **Phase 2**: Add UUID-based tiers (free/premium), KV store for server health
- **Phase 3**: ISP detection (via IP geolocation), serve optimized configs per carrier

---

## Track 3: Custom App

### Why Build an App

| Problem | Config-only Solution | App Solution |
|---|---|---|
| User imports wrong config | Confusing error | App has configs built in |
| Protocol blocked | User manually switches | App auto-rotates protocols |
| Server blocked | User re-imports sub URL | App fetches fresh list, switches silently |
| DPI changes | User adjusts TLS fragment | App adapts automatically |
| Non-technical users | Need hand-holding | Install → tap connect → done |
| Updates | Redistribute configs | Push OTA updates |

### App Architecture

```text
┌──────────────────────────────────────┐
│          Your App (Flutter)          │
│                                      │
│  ┌──────────────────────────────┐    │
│  │     Smart Controller          │    │
│  │  - Server health polling      │    │
│  │  - Protocol auto-selection    │    │
│  │  - ISP detection              │    │
│  │  - DPI fingerprint detection  │    │
│  │  - Telemetry (opt-in)        │    │
│  └──────────┬───────────────────┘    │
│             │                        │
│  ┌──────────▼───────────────────┐    │
│  │     sing-box (libbox)         │    │  ← Same engine as Hiddify
│  │  - VLESS Reality              │    │
│  │  - Hysteria2                  │    │
│  │  - VLESS+WS (CF Pages)       │    │
│  │  - DNS tunnel                 │    │
│  └──────────────────────────────┘    │
│                                      │
│  ┌──────────────────────────────┐    │
│  │     Config API Client         │    │
│  │  - Fetches from smart backend │    │
│  │  - Caches locally             │    │
│  │  - Updates on connect         │    │
│  └──────────────────────────────┘    │
└──────────────────────────────────────┘
```

### Build vs Fork Decision

| Option | Pros | Cons |
|---|---|---|
| **Fork Hiddify** (GPL, Flutter) | Fast start, proven UI, all protocols work | GPL = must open source, tied to their architecture, large codebase |
| **Build on libbox** (sing-box library) | Full control, clean architecture, can be closed source | More work, need to build UI from scratch |
| **Headless Hiddify + smart backend** | Zero app dev, works today | Limited control, can't customize UX |

**Recommendation**: Start with headless (smart backend + Hiddify), then build custom app on libbox when you have 20+ users and revenue to justify the effort.

### App Features Roadmap

| Version | Features | Effort |
|---|---|---|
| **v0.1** | Hardcoded server list, auto-connect best server, basic UI | 2-3 weeks |
| **v0.2** | Fetch server list from backend, health indicators, protocol selector | 1-2 weeks |
| **v0.3** | Auto protocol rotation, ISP detection, TLS fragment auto-tune | 2-3 weeks |
| **v1.0** | Free/premium tiers, user registration, push updates | 3-4 weeks |
| **v2.0** | Telemetry dashboard, AI protocol selection, auto-provisioning trigger | Ongoing |

### Distribution

| Channel | Platform | Notes |
|---|---|---|
| Direct APK | Android | Host on CF Pages, share via Telegram |
| TestFlight | iOS | 10k beta users, no App Store review |
| GitHub Releases | Desktop | Win/Mac/Linux |
| Telegram channel | All | Primary distribution for Iranian users |
| ArvanCloud Object Storage | All | Domestic download speed (if available) |

**NOT recommended**: Google Play or App Store — they comply with takedown requests and would remove a VPN app targeting Iran.

---

## Track 4: Freemium Model

### Tier Design

| Feature | Free | Premium ($2-3/mo) |
|---|---|---|
| Servers | 1-2 (Helsinki + 1 free VM) | All servers (5-10+) |
| Protocols | Reality + CF Pages | All (Reality, Hy2, DNS tunnel, WS) |
| Speed | Shared, best-effort | Priority routing |
| Auto-switching | Basic (2 servers) | Full ocean (all servers, all protocols) |
| ArvanCloud relay | No | Yes (domestic billing benefit) |
| Support | Community (Telegram group) | Direct (Telegram DM) |
| Config updates | Manual refresh | Auto-push |

### Payment Methods (Iran-compatible)

| Method | Feasibility | Notes |
|---|---|---|
| **USDT (TRC-20)** | High | Most common crypto in Iran, low fees on Tron |
| **Telegram Stars** | Medium | Telegram's built-in payment, works in Iran |
| **Gift codes** | Medium | Generate codes, sell via trusted channels |

### Revenue Projections

| Users | Free | Premium | Monthly Revenue | Server Budget |
|---|---|---|---|---|
| 10 | 7 | 3 | $9/mo | Covers 2 servers |
| 30 | 20 | 10 | $30/mo | 5-6 servers |
| 100 | 70 | 30 | $90/mo | 10+ servers, full ocean |
| 500 | 400 | 100 | $300/mo | 20+ servers, dedicated infra |

---

## Track 5: AI & Automation

### Near-term AI (rule-based, not ML)

| Feature | How | Impact |
|---|---|---|
| **ISP detection** | GeoIP on user's IP → determine MCI/Irancell/Rightel | Serve ISP-optimized configs |
| **Protocol scoring** | Track success/fail rates per protocol per ISP | Auto-select best protocol |
| **DPI fingerprinting** | Detect which DPI technique is active (TLS inspection, UDP block, DNS poison) | Auto-adjust countermeasures |
| **Health scoring** | Latency + packet loss + uptime → composite score per server | Route users to best server |

### Long-term AI (with enough data)

| Feature | Requires | Impact |
|---|---|---|
| **Predictive blocking** | Historical block patterns | Pre-rotate servers before blocks hit |
| **Anomaly detection** | Traffic telemetry | Detect when a server is being probed/targeted |
| **Auto-deploy** | Provider APIs + deploy.sh | Spin up servers in response to blocks |
| **Optimal fragment tuning** | Per-connection TLS fragment experiments | Auto-find best fragment settings per ISP |

---

## Track 6: CI/CD & GitHub Actions

### Goal

Automate repetitive ops so adding a server, rotating creds, or pushing config updates is a git push, not an SSH session.

### Pipeline Architecture

```text
┌──────────────┐     ┌────────────────────┐     ┌──────────────┐
│  Git Push    │────>│  GitHub Actions     │────>│  Servers     │
│  (spec repo) │     │                    │     │  (via SSH)   │
└──────────────┘     │  1. Validate specs  │     └──────────────┘
                     │  2. Deploy configs  │
                     │  3. Health check    │     ┌──────────────┐
                     │  4. Update smart-sub│────>│  CF Worker   │
                     │  5. Notify Telegram │     └──────────────┘
                     └────────────────────┘
```

### Workflows

| Workflow | Trigger | What It Does |
|---|---|---|
| **health-check.yml** | Cron (every 30 min) | SSH into each server, check docker/ports/tunnels, alert Telegram if down |
| **deploy-server.yml** | Manual (workflow_dispatch) | Input: IP → runs deploy.sh on target server via SSH |
| **rotate-uuid.yml** | Manual | Generate new UUID, update all servers + CF Pages, output new client URIs |
| **update-smart-sub.yml** | Push to `tools/smart-sub/` | Auto-deploy CF Worker with `wrangler deploy` |
| **backup-download.yml** | Cron (weekly) | SCP backups from all servers to GitHub artifact or S3 |
| **validate-specs.yml** | Push to `*.md` | Lint markdown, check cross-references, verify placeholder syntax |

### Secrets Needed (GitHub Settings → Secrets)

| Secret | Value | Used By |
|---|---|---|
| `SSH_PRIVATE_KEY` | Your SSH private key | All deploy/health workflows |
| `HELSINKI_IP` | Helsinki server IP | Health check, backup |
| `ORACLE_IP` | Oracle Madrid server IP | Health check, backup |
| `GCP_IP` | GCP Dammam server IP | Health check, backup |
| `SCALEWAY_IP` | Scaleway London server IP | Health check, backup |
| `CF_API_TOKEN` | Cloudflare API token | Smart-sub deploy |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | Alert notifications |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID | Alert notifications |
| `UUID` | Shared UUID | UUID rotation workflow |

### Example: Health Check Workflow

```yaml
# .github/workflows/health-check.yml
name: Server Health Check
on:
  schedule:
    - cron: '*/30 * * * *'  # Every 30 minutes
  workflow_dispatch:         # Manual trigger

jobs:
  check:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        server:
          - { name: Helsinki, ip_secret: HELSINKI_IP, has_dns: true }
          - { name: Oracle-Madrid, ip_secret: ORACLE_IP, has_dns: true }
          - { name: GCP-Dammam, ip_secret: GCP_IP, has_dns: false }
          - { name: Scaleway-London, ip_secret: SCALEWAY_IP, has_dns: true }
    steps:
      - name: SSH Health Check
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets[matrix.server.ip_secret] }}
          username: root
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            echo "=== Docker ==="
            docker compose -f /opt/reality-ezpz/docker-compose.yml ps
            echo "=== Ports ==="
            ss -tulnp | grep -E '443|8443'
            echo "=== Disk ==="
            df -h / | tail -1

      - name: Alert on Failure
        if: failure()
        uses: appleboy/telegram-action@v1
        with:
          to: ${{ secrets.TELEGRAM_CHAT_ID }}
          token: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          message: |
            ⚠️ ${{ matrix.server.name }} health check FAILED
            Check: https://github.com/${{ github.repository }}/actions
```

### Example: One-Click Server Deploy

```yaml
# .github/workflows/deploy-server.yml
name: Deploy New Server
on:
  workflow_dispatch:
    inputs:
      server_ip:
        description: 'Server IP address'
        required: true
      server_tag:
        description: 'Server tag (e.g., france, oracle-1)'
        required: true
      sni:
        description: 'SNI target'
        default: 'www.google.com'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy VPN Stack
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ github.event.inputs.server_ip }}
          username: root
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script_stop: true
          script: |
            # deploy.sh content runs here
            # (or scp deploy.sh first, then run)

      - name: Notify Success
        uses: appleboy/telegram-action@v1
        with:
          to: ${{ secrets.TELEGRAM_CHAT_ID }}
          token: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          message: |
            ✅ Server deployed: ${{ github.event.inputs.server_tag }}
            IP: ${{ github.event.inputs.server_ip }}
```

### Implementation Order

1. **Now**: Add `health-check.yml` (most value, simplest)
2. **With first new server**: Add `deploy-server.yml`
3. **After smart-sub deployed**: Add `update-smart-sub.yml`
4. **Monthly**: Add `rotate-uuid.yml` and `backup-download.yml`

---

## Implementation Priority

### P0 — Done (formerly "Do This Week")

| # | Task | Status |
|---|---|---|
| 1 | **Provision Oracle Cloud free VM (Madrid)** | ✅ Active |
| 2 | **Provision GCP Dammam (e2-medium, $300 credit)** | ✅ Active |
| 3 | **Provision Scaleway London (PLAY2-PICO)** | ✅ Active |

### P1 — Done (formerly "This Month")

| # | Task | Status |
|---|---|---|
| 4 | **CF Pages smart subscription v5.11** | ✅ Deployed — sub.example.com, ~144 configs |
| 5 | **Health monitoring** (cron + Telegram bot) | ⏳ Not yet — use manual health-check.sh for now |
| 6 | **Google Cloud VM (Dammam)** | ✅ Active |

### P2 — Next (IP hiding & scale)

| # | Task | Why | Effort |
|---|---|---|---|
| 7 | **Dynamic smart-sub server list** | Move server config to KV/env vars so new servers auto-appear | Half day |
| 8 | **Gcore CDN relay** | Second CDN provider, IP-hidden fallback if CF throttled | 2-3 hours |
| 9 | **Vercel/Netlify edge relay** | Serverless IP-hidden configs on 2 more platforms | 2-3 hours each |
| 10 | **ArvanCloud domestic relay** | Domestic IP = free data, not subject to intl IP blocks | 2 hours |
| 11 | **IP rotation via Hetzner API** | Auto-replace blocked IPs in minutes | 1 day |
| 12 | **Freemium UUID management** | Revenue enables more servers | 1 day |

### P3 — Quarter (app)

| # | Task | Why | Effort |
|---|---|---|---|
| 10 | **Custom app v0.1** (Flutter + libbox) | Full control over user experience | 2-3 weeks |
| 11 | **Telegram payment bot** | Automate premium subscriptions | 1 week |
| 12 | **Auto-provisioning** | Self-healing infrastructure | 1 week |

---

## Decision Log

| Decision | Choice | Rationale |
|---|---|---|
| App framework | Flutter (libbox) | Cross-platform, Hiddify proves it works, large community |
| Config backend | CF Pages + _worker.js | Free, custom domain, Workers account blocked |
| Payment | USDT (TRC-20) primary | Most accessible crypto in Iran, low fees |
| ArvanCloud | Domestic relay experiment | Low risk ($1.50), high potential (domestic billing) |
| Open vs closed source | Closed source app, open source server scripts | Protect app from cloning, share server setup for trust |
| First new server | Oracle Cloud (free) | ✅ Validated — zero cost, stable, 4 servers now active |
| Workers vs Pages | CF Pages | Workers.dev blocked (error 1101), Pages custom domain works |

---

---

## Track 7: DPI Bypass Playbook

### Why DPI Is Beatable

Iran's DPI has fundamental constraints we can exploit:

| Weakness | Why It Exists | How We Exploit It |
|---|---|---|
| **Economic dependency** | Can't block Cloudflare/Google/Amazon CDNs without destroying domestic economy | CDN-fronted transports (XHTTP-CDN, domain fronting) |
| **Line-speed limits** | DPI inspects packets in real-time at backbone speed — can't do deep analysis | Transports that look like normal HTTP at packet level |
| **False positive fear** | Blocking too aggressively breaks legitimate services → political backlash | Use whitelisted domestic hosts (telewebion.com, myket.ir) |
| **Fingerprint lag** | New transports take 3-6 months for DPI vendors to fingerprint | Stay ahead with latest transports, rotate when detected |

### Current Arsenal (Deployed)

| Priority | Transport | Status | DPI Bypass | IP Hidden | Notes |
|---|---|---|---|---|---|
| 1 | **XHTTP-CDN** | Phase 18 | Yes (pure HTTP) | Yes (Cloudflare) | Best combo: no WS headers + CDN fronting |
| 2 | **Finalmask XDNS** | Phase 31 | Yes (DNS-like UDP) | No (direct) | mKCP headerType=dns, port 10053/udp |
| 3 | **Finalmask XICMP** | Phase 31 | Yes (UTP-like UDP) | No (direct) | mKCP headerType=utp, port 10054/udp |
| 4 | **XrayHTTP** | Phase 17 | Yes (fake HTTP) | No (direct) | Proven on Irancell — whitelisted host headers |
| 5 | **Reality** | Phase 2 | Partial (TLS frag) | No (direct) | Needs TLS Fragment, blocked by some ISPs |
| 6 | **Hy2 Salamander** | Phase 32 | Yes (random UDP) | No (direct) | Password-based, port 20000-50000/udp |
| 7 | **Hysteria2** | Phase 2b | No (QUIC) | No (direct) | Works when UDP isn't blocked |
| 8 | **Hy2 UDP Hop** | Phase 32 | Partial (port hop) | No (direct) | Port range 20000-50000/udp |
| 9 | **ShadowTLS v3** | Phase 33 | Yes (real TLS) | No (direct) | Genuine TLS handshake to google.com, HEL+SCW |
| 10 | **CDN-WS** | Phase 10 | No (WS detected) | Yes (Cloudflare) | DPI detects WebSocket upgrade headers |
| 11 | **SS2022** | Phase 21 | Yes (random bytes) | No (direct) | AEAD-2022, no known fingerprint, all 4 servers |
| 12 | **NaiveProxy** | Phase 34 | Yes (Chrome TLS) | No (direct) | Chrome's actual TLS stack, HEL+ORC+SCW |
| 13 | **Cloak** | Phase 22 | Yes (TLS camouflage) | No (direct) | Genuine TLS to google.com, SCW only |

### Plan B: Next Techniques to Deploy (Priority Order)

#### B1: naiveproxy (Chrome Network Stack) — ✅ DEPLOYED

**What**: Uses Chrome's actual TLS/HTTP stack (not reimplemented). Traffic is literally indistinguishable from Chrome browsing.

**Why it works**: DPI would have to block Chrome itself. naiveproxy's TLS fingerprint IS Chrome's fingerprint — no detectable difference.

**Deployed on**: Helsinki (web.example.com:2087), Oracle (web2:2087), Scaleway (web4:2087)

#### B2: Cloak (TLS Camouflage) — ✅ DEPLOYED

**What**: Wraps VPN traffic as normal TLS to a whitelisted domain, performing a real TLS handshake with the target server first.

**Why it works**: DPI sees a genuine TLS connection to google.com — can't tell the payload is VPN data without MitM.

**Deployed on**: Scaleway (port 2053/tcp, ServerName=www.google.com)

#### B3: Shadowsocks 2022 — ✅ DEPLOYED

**What**: Complete redesign of Shadowsocks protocol with modern crypto (AEAD-2022). No known DPI fingerprint.

**Deployed on**: All 4 servers via sing-box native ss2022 inbound (2022-blake3-aes-128-gcm)

#### B4: Finalmask XDNS/XICMP — ✅ DEPLOYED

**What**: Xray-core v26.2.6 Finalmask feature. mKCP transport with headerType=dns (port 10053/udp) and headerType=utp (port 10054/udp).

**Deployed on**: All 4 servers. Requires xray-core sidecar (not sing-box).

#### B5: Hy2 Salamander + UDP Hop — ✅ DEPLOYED

**What**: Hysteria2 with Salamander obfuscation (password-based) and port hopping (20000-50000/udp).

**Deployed on**: All 4 servers. Salamander password: `<SALAMANDER_PASSWORD>` (stored in env vars).

#### B6: ShadowTLS v3 — ✅ DEPLOYED

**What**: ShadowTLS v3 wraps SS2022 in genuine TLS handshake to google.com:443.

**Deployed on**: Helsinki + Scaleway (port 10443/tcp).

### Plan C: Advanced / Experimental

#### C1: Geneva (AI-Powered DPI Bypass) — HIGH IMPACT, CLIENT-SIDE

**What**: University of Maryland research project. Uses genetic algorithms to automatically discover DPI bypass strategies by fuzzing TCP/IP behavior.

**Why it matters**: Has found dozens of previously unknown DPI bypasses in Iran, China, Kazakhstan. Fully automated — discovers new bypasses as DPI evolves.

**Usage**:

```bash
# Run from inside Iran (Linux)
pip install geneva
geneva-evolve --server <SERVER_IP> --port 443 --test-type echo
# Outputs: strategy strings like [TCP:flags:SA]-duplicate(tamper{TCP:flags:replace:R})-|
```

**GitHub**: <https://github.com/geneva/geneva>
**Best for**: Finding new TCP-level DPI bugs when all transport-level bypasses fail.

#### C2: Tor with Snowflake Bridge — MEDIUM IMPACT

**What**: Uses WebRTC (video call protocol) as transport. Blocking would break WhatsApp, Google Meet, Zoom.

**Why it works**: WebRTC is ubiquitous — blocking it causes massive economic damage.

**Setup**: Zero server-side. Client downloads Tor Browser with Snowflake bridge.

**Limitation**: Slow (~2-5 Mbps). Good for browsing, bad for streaming.

#### C3: Domain Fronting via Google/Amazon CDN — HIGH IMPACT

**What**: Connect to allowed-domain.google.com via CDN, but `Host:` header points to your actual server. CDN routes based on Host, DPI only sees the outer SNI.

**Why it works**: DPI sees TLS connection to `*.google.com` — can't block Google.

**Status**: Google/Amazon have cracked down on explicit domain fronting, but variations still work (cloud function fronting, CDN routing tricks). Our XHTTP-CDN is essentially a legal version of this through Cloudflare.

#### C4: HTTP/3 QUIC Multiplexing — FUTURE

**What**: QUIC encrypts everything including handshake metadata. As QUIC adoption grows, blocking it becomes economically impossible.

**Status**: Iran currently blocks QUIC. But as more web traffic moves to HTTP/3, the cost of blocking rises. Monitor and deploy when viable.

#### C5: ECH (Encrypted Client Hello) — FUTURE, GAME-CHANGER

**What**: Encrypts the SNI field in TLS. DPI literally cannot see which domain you're connecting to.

**Status**: Chrome/Firefox implementing now. When widely adopted, this breaks ALL SNI-based blocking. Our Reality transport becomes undetectable.

**Timeline**: ~6-12 months until mainstream browser support.

### Plan D: Nuclear / Last Resort

| Technique | How | Speed | Detectability |
|---|---|---|---|
| **DNS tunnel** (deployed) | Encodes data in DNS queries | ~60 KB/s | Nearly unblockable |
| **Steganography** | Hide data in images/video/audio streams | ~5-20 KB/s | Undetectable |
| **Satellite (Starlink)** | Bypasses all terrestrial filtering | Full speed | N/A (different medium) |
| **Bluetooth mesh (Briar)** | Phone-to-phone messaging, no internet | N/A | N/A (no network) |
| **Refraction Networking** | Friendly ISPs redirect traffic covertly | Full speed | Requires ISP cooperation |

### What Chinese Users Actually Use (Reference)

China's GFW is more advanced than Iran's DPI. What works there works here:

1. **naiveproxy** — #1 recommendation in Chinese bypass community
2. **Xray XTLS-Vision** — what we have (Reality), still works in China with TLS fragment
3. **Hysteria2** — works in China when QUIC isn't fully blocked
4. **Shadowsocks 2022** — redesigned from scratch, no known fingerprint
5. **Trojan** — looks like normal HTTPS browsing

### Technique Rotation Strategy

When DPI detects a transport:

1. **Immediate**: Smart-sub worker deprioritizes it, pushes users to next transport
2. **24h**: Deploy Plan B technique on affected servers
3. **1 week**: Analyze DPI fingerprint, create counter-measure
4. **Ongoing**: Geneva auto-discovers new TCP-level bypasses

**Key principle**: Never rely on one transport. Always have 2-3 ready to deploy. The bypass community moves faster than the blocking side.

---

## Track 8: IP Hiding & Relay Strategies

### The Problem

Iran's DPI has two blocking axes:

1. **Protocol detection** — solved by our 15+ transport types
2. **IP blocking** — when they blacklist our server IPs, direct protocols die

Currently only 2 of our 15+ protocols hide server IPs (XHTTP-CDN and CDN-WS, both through Cloudflare). We need more IP-hiding strategies so that when server IPs get blocked, users still have multiple fallback paths.

### Current IP-Hiding Status

| Protocol | IP Hidden? | How | Limitation |
|---|---|---|---|
| XHTTP-CDN | ✅ Yes | Cloudflare CDN | CF edge IPs can be throttled |
| CDN-WS | ✅ Yes | Cloudflare CDN | WS upgrade headers detectable |
| EDtunnel | ✅ Yes | CF Pages serverless | Very slow, emergency only |
| DNS tunnel | ✅ Yes | DNS queries via public resolvers | ~60 KB/s, emergency only |
| All others (Reality, Hy2, XrayHTTP, etc.) | ❌ No | Direct IP connection | Blocked when IP is blacklisted |

### Strategy 1: ArvanCloud Domestic Relay (Iran-based)

**Concept**: Iranian cloud provider → domestic IP → relay to international servers. Users connect to a domestic IP (not filtered by international IP blacklists), and the relay forwards to our exit servers.

**Implementation**:

```bash
# On ArvanCloud eco-small1 VPS (~$1.50/mo)
# Option A: nginx stream relay (simplest)
apt install nginx-extras
cat > /etc/nginx/stream.conf.d/vpn-relay.conf << 'EOF'
stream {
  upstream vpn_backends {
    server <HEL_IP>:443;         # Helsinki
    server <ORC_IP>:443;         # Oracle Madrid
    server <SCW_IP>:443;         # Scaleway London
  }
  server {
    listen 443;
    proxy_pass vpn_backends;
    proxy_timeout 300s;
  }
}
EOF

# Option B: VLESS relay via sing-box (more control)
# sing-box config with inbound VLESS → outbound to our servers
```

**Pros**:

- Domestic connection = free/cheap data on most Iranian ISPs
- ArvanCloud IPs are domestic (not subject to international IP blocks)
- DPI sees connection to known Iranian cloud provider = less suspicious
- $1.50/mo = very cheap

**Cons**:

- ArvanCloud can be pressured by Iranian authorities
- Whoever registers the account carries the legal exposure
- Single point of failure if ArvanCloud shuts down VPS
- Adds latency (Iran→ArvanCloud→International)

**Risk mitigation**:

- Relay stores nothing, forwards only
- Keep it optional — direct paths remain primary
- Rotate relay VPS monthly if paranoid

### Strategy 2: CDN Relay Providers (International)

Use multiple CDN providers beyond Cloudflare to relay traffic, so blocking one CDN doesn't kill everything.

| Provider | Method | IP Hidden | Cost | Status |
|---|---|---|---|---|
| **Cloudflare** | XHTTP-CDN, CDN-WS | ✅ | Free | ✅ Deployed |
| **Cloudflare Workers/Pages** | EDtunnel, smart-sub | ✅ | Free | ✅ Deployed |
| **Gcore CDN** | VLESS over CDN WebSocket | ✅ | Free tier | 🔲 To evaluate |
| **Fastly** | Compute@Edge with VLESS relay | ✅ | Free tier (limited) | 🔲 To evaluate |
| **AWS CloudFront** | Lambda@Edge relay | ✅ | ~$0.085/GB | 🔲 To evaluate |
| **Google Cloud CDN** | Cloud Functions relay | ✅ | Free tier credits | 🔲 To evaluate |

**Key advantage**: Iran can't block all CDNs simultaneously without destroying their own economy. Each CDN we add is another fallback.

**Implementation priority**:

1. Gcore CDN (free, Russian company = less likely to comply with Iran-specific blocks)
2. AWS CloudFront + Lambda (massive scale, hard to block Amazon)
3. Google Cloud CDN (already have GCP account)

### Strategy 3: Serverless Edge Relays

**Concept**: Deploy lightweight VLESS/trojan proxies on serverless platforms. Each deployment gets a unique URL with a platform-owned IP — blocking requires blocking the entire platform.

| Platform | How | Unique URLs? | Free Tier | Blockable? |
|---|---|---|---|---|
| **Cloudflare Pages** | _worker.js (EDtunnel) | Yes | ✅ 500 deploys/mo | Would break all CF Pages sites |
| **Vercel Edge Functions** | Edge runtime + relay | Yes | ✅ 100GB/mo | Would break all Vercel sites |
| **Deno Deploy** | Edge function relay | Yes | ✅ 100K req/day | Small enough to block |
| **Netlify Edge** | Edge function relay | Yes | ✅ 125K req/mo | Would break all Netlify sites |
| **Railway** | Docker container relay | Yes | $5 credit/mo | Small enough to block |

**Best approach**: Deploy simple VLESS relay functions on 2-3 platforms. Each gets a unique `*.vercel.app` or `*.netlify.app` URL. Share via smart-sub as emergency fallbacks.

### Strategy 4: Domestic Cloud Providers (Other Countries)

Use cloud providers in countries that Iran trades with heavily, whose IPs are unlikely to be blocked:

| Provider | Country | Why Hard to Block | Cost |
|---|---|---|---|
| **ArvanCloud** | Iran | Domestic, free data | ~$1.50/mo |
| **Yandex Cloud** | Russia | Major trade partner | $10 free credit |
| **Alibaba Cloud** | China | Massive Iranian trade | Free trial |
| **DigitalOcean** | US | Too many Iranian businesses use it | $5/mo |
| **Linode/Akamai** | US | Major CDN, can't block Akamai IPs | $5/mo |

### Strategy 5: IP Rotation / Disposable Servers

**Concept**: When an IP gets blocked, automatically spin up a new server with a fresh IP, deploy in minutes, and push to users via smart-sub.

```text
IP blocked → health monitor detects (5min)
  → API call: Hetzner/Vultr create_server ($0.007/hr)
  → cloud-init runs deploy.sh (3 min)
  → Smart-sub adds new server to config
  → Users get fresh IP on next subscription refresh (4h or manual)
  → Kill old server
  → Cost: ~$0.05 per IP rotation
```

**Requirements** (not yet built):

- Automated health monitoring (Track 6)
- Provider API integration (Hetzner, Vultr, Oracle have APIs)
- deploy.sh that works as cloud-init script
- Smart-sub dynamic server list (currently hardcoded)

**Cost model**: At $0.007/hr (Hetzner hourly), rotating IPs weekly costs ~$1.20/mo. Daily rotation = ~$5/mo. Still cheap.

### Strategy 6: Tor-style Relay Network

**Concept**: Contributors who already run their own VPSes or always-on devices can peer them as lightweight relays. Users connect to relay → relay forwards to exit server.

```text
User -> Contributor Relay (unknown IP) -> Exit Server
```

**Advantages**: the IP pool grows with each contributor. Blocking requires finding all relays.
**Disadvantages**: Trust model, relay operators see traffic metadata, coordination overhead.

### Strategy 7: Domain Fronting via Multiple CDNs

**Concept**: Use CDN routing to hide the true destination. Connect TLS to `allowed-domain.cdn.com`, but `Host:` header routes to our worker.

| CDN | Domain Fronting Status | Notes |
|---|---|---|
| **Cloudflare** | Working (XHTTP-CDN) | ✅ Our primary method |
| **Azure CDN** | Partially works | Azure Functions as relay |
| **AWS CloudFront** | Cracked down | But Lambda@Edge still viable |
| **Fastly** | Works with Compute@Edge | Less scrutiny than AWS |
| **Akamai** | Hard to block (massive scale) | Expensive, enterprise only |

### Implementation Priority

| # | Strategy | Effort | Impact | Priority |
|---|---|---|---|---|
| 1 | **Gcore CDN relay** | 2-3h | High — second CDN provider | P1 |
| 2 | **Vercel/Netlify edge relays** | 2-3h each | High — serverless, unique URLs | P1 |
| 3 | **ArvanCloud domestic relay** | 2h | Medium — domestic bypass | P2 |
| 4 | **IP rotation via Hetzner API** | 1 day | High — self-healing infra | P2 |
| 5 | **AWS CloudFront + Lambda** | 3-4h | High — Amazon can't be blocked | P2 |
| 6 | **Dynamic smart-sub server list** | Half day | Critical — enables all above | P1 |

---

## Quick Wins Verification

Hypotheses validated or pending:

| Hypothesis | Status | Result |
|---|---|---|
| Multi-server fallback works | ✅ Verified | 4 servers active, Hiddify auto-switches via subscription |
| Free VMs run sing-box | ✅ Verified | Oracle (Madrid) + GCP (Dammam) both stable |
| ArvanCloud relay works | ⏳ Not tested | Needs a domestically-registered eco-small1 |
| CF Pages subscription works | ✅ Verified | smart-sub v5.11 at sub.example.com, ~144 configs |
| Users will pay | ⏳ Not tested | Currently family/friends only |
