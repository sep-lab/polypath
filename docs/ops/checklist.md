# Deployment Checklist

## Phase 0: Prerequisites

- [ ] Hetzner Cloud account created at <https://console.hetzner.cloud>
- [ ] Hetzner VPS provisioned (CX23, Helsinki hel1, ~€4.35/mo) → note `<SERVER_IP>`, `<SERVER_IPV6>`
- [ ] SSH key pair generated for server access
- [ ] Cloudflare account ready (for Pages + DNS)
- [ ] Domain `<DOMAIN>` registered (e.g. Porkbun)
- [ ] Domain NS delegated to Cloudflare
- [ ] Duck DNS dynamic DNS set up (`<DUCKDNS_SUBDOMAIN>.duckdns.org` → `<SERVER_IP>`)

## Phase 1: Server Base Setup
>
> See [server-setup.md](../guides/server-setup.md) steps 1-7

- [ ] SSH into server with key auth
- [ ] Update system (Ubuntu 24.04 LTS)
- [ ] Install Docker + Docker Compose (v2 plugin)
- [ ] SSH hardening (disable password auth)
- [ ] Configure UFW firewall
  - [ ] Allow 22/tcp (SSH)
  - [ ] Allow 80/tcp (HTTP redirect)
  - [ ] Allow 443/tcp (VLESS Reality)
  - [ ] Allow 8443/udp (Hysteria2)
  - [ ] Allow 53/udp + 53/tcp (DNS for dnstm)
  - [ ] Enable UFW
- [ ] Install and configure fail2ban
- [ ] Enable automatic security updates (unattended-upgrades)

## Phase 2: VLESS Reality + WARP Deployment
>
> See [server-setup.md](../guides/server-setup.md) step 8

- [ ] Clone reality-ezpz repo (`/opt/reality-ezpz`)
- [ ] Run `bash reality-ezpz.sh` — configure VLESS Reality + WARP outbound
  - [ ] SNI target: `www.google.com`
  - [ ] Transport: TCP
  - [ ] WARP: ON
- [ ] Save generated values: `<UUID>`, `<REALITY_PRIVATE_KEY>`, `<REALITY_PUBLIC_KEY>`, `<REALITY_SHORT_ID>`
- [ ] Verify VLESS Reality running: `docker compose ps`, `ss -tlnp | grep 443`
- [ ] Verify WARP outbound: `grep warp /opt/reality-ezpz/config`

## Phase 2b: Hysteria2 (Manual Injection)
>
> See [server-setup.md](../guides/server-setup.md) step 9

- [ ] Generate self-signed EC cert (`/opt/reality-ezpz/certs/`)
- [ ] Save cert hash as `<HY2_CERT_SHA256>`
- [ ] Inject Hysteria2 inbound into `engine.conf`
- [ ] Update `docker-compose.yml` (UDP port + cert volumes)
- [ ] Apply: `docker compose down && docker compose up -d`
- [ ] Verify Hysteria2 listening: `ss -ulnp | grep 8443`

## Phase 3: DNS Tunnel (dnstm) Deployment
>
> See [dnstt-setup.md](../guides/dnstt-setup.md) for detailed commands

- [ ] Create Cloudflare DNS records:
  - [ ] A record: `tns.<DOMAIN>` → `<SERVER_IP>`
  - [ ] AAAA record: `tns.<DOMAIN>` → `<SERVER_IPV6>`
  - [ ] NS record: `t.<DOMAIN>` → `tns.<DOMAIN>`
  - [ ] NS record: `t2.<DOMAIN>` → `tns.<DOMAIN>`
  - [ ] NS record: `s2.<DOMAIN>` → `tns.<DOMAIN>`
  - [ ] All records DNS-only (grey cloud, NOT proxied)
- [ ] Verify DNS propagation: `dig NS t.<DOMAIN>`
- [ ] Disable systemd-resolved (free port 53)
- [ ] Install dnstm v0.6.7+ (`/usr/local/bin/dnstm`)
- [ ] `dnstm install --mode multi`
- [ ] Add tunnel: slip-socks (Slipstream+SOCKS) on `t.<DOMAIN>:5310`
- [ ] Add tunnel: dnstt-socks (DNSTT+SOCKS) on `t2.<DOMAIN>:5311`
- [ ] Add tunnel: slip-ssh (Slipstream+SSH) on `s2.<DOMAIN>:5312`
- [ ] Start DNS router: `dnstm router start`
- [ ] Save crypto material: `<DNSTT_PUBKEY>`, `<SLIP_SOCKS_FP>`, `<SLIP_SSH_FP>`

## Phase 3b: SSH Tunnel User
>
> See [server-setup.md](../guides/server-setup.md) step 11

- [ ] Create restricted tunnel user: `sshtun-user create <SSH_TUNNEL_USER>`
- [ ] Apply SSH hardening: `sshtun-user configure`
- [ ] Verify: nologin shell, sshtunnel-password group

## Phase 3c: dns-tun-lb (Standby)
>
> See [server-setup.md](../guides/server-setup.md) step 12

- [ ] Install Go, build dns-tun-lb from source
- [ ] Create standby config (`/opt/dns-tun-lb/lb.yaml`) on `127.0.0.1:5354`
- [ ] Create systemd service, enable + start
- [ ] Create activation script (`/opt/dns-tun-lb/activate-lb.sh`)

## Phase 4: Cloudflare Pages (EDtunnel)
>
> See [cloudflare-pages.md](../guides/cloudflare-pages.md) for detailed commands

- [ ] Install wrangler CLI, authenticate
- [ ] Fork EDtunnel repo (use innocent project name)
- [ ] Create Pages project: `wrangler pages project create <CF_PROJECT_NAME>`
- [ ] Set UUID secret: `wrangler pages secret put UUID`
- [ ] Deploy: `wrangler pages deploy pages-dist`
- [ ] Verify production URL: `<CF_PAGES_URL>`
- [ ] Verify subscription endpoint: `<CF_PAGES_URL>/sub/<UUID>`
- **Note**: Use Pages, NOT Workers (Workers fail with Error 1101 on `cloudflare:sockets`)

## Phase 5: Automated Backups
>
> See [server-setup.md](../guides/server-setup.md) step 13

- [ ] Create backup script at `/opt/vpn-backups/backup-vpn-v2.sh`
- [ ] Schedule cron: daily at 2 AM UTC
- [ ] Run first manual backup
- [ ] Download backup to local machine: `scp root@<SERVER_IP>:/opt/vpn-backups/*.tar.gz ~/vpn-backups/`

## Phase 6: Client Configuration
>
> See [client-setup.md](../guides/client-setup.md) for detailed guides

- [ ] Install Hiddify App on test device
- [ ] Import VLESS Reality config (priority 1)
- [ ] Import Hysteria2 config (priority 2): `hy2://<UUID>@<SERVER_IP>:8443?insecure=1&sni=www.google.com`
- [ ] Import EDtunnel/CF Pages config (priority 3)
- [ ] Import DNS tunnel config via dnstc/SlipNet (priority 5)
- [ ] Configure Iran split routing rules
- [ ] Enable TLS Fragment (Length: 10-100, Interval: 10-50)
- [ ] Test auto-fallback between protocols
- [ ] Verify IP change: <https://whatismyipaddress.com>
- [ ] Verify no DNS leak: <https://www.dnsleaktest.com>
- [ ] Share Oblivion as standalone backup (priority 4, zero-config)

## Phase 7: Final Verification

- [ ] All services active + enabled for auto-start
- [ ] All ports listening (22, 80, 443/tcp + 8443/udp + 53/tcp+udp)
- [ ] VLESS Reality reachable from outside
- [ ] Hysteria2 UDP bindings confirmed
- [ ] All 3 DNS tunnels running
- [ ] microsocks proxy working
- [ ] SSH tunnel user verified
- [ ] DNS delegation confirmed for all 3 subdomains
- [ ] EDtunnel CF Pages live
- [ ] Firewall rules correct (6 rules)
- [ ] Security: SSH key-only, fail2ban active, unattended-upgrades active
- [ ] Backups: on disk, cron active
- [ ] All client configs extracted and shared

## ~~Phase 8: Second Server (France — OVH)~~ — SUPERSEDED

> **Superseded**: OVH France was never deployed. Instead, we deployed Oracle Madrid (free), GCP Dammam ($300 credit), and Scaleway London. See Phases 31-37 for the actual multi-server deployment and [multi-server.md](./multi-server.md) for the current 4-server inventory.

## Phase 9: Smart Subscription Worker ✅
>
> Deployed at `sub.example.com` — see [tools/smart-sub/](./tools/smart-sub/)

- [x] Create Cloudflare Worker (smart-sub v5.9) with multi-server config generation
- [x] KV namespace for health data persistence + usage tracking
- [x] Endpoint: `GET /sub/<UUID>` → base64 subscription (~190 configs: 15+ protocol types × 4 servers)
- [x] User tiers: premium (all), free (limited servers), limited (CDN-WS only, hides IPs)
- [x] Expiry dates on user accounts
- [x] Health endpoint: `GET /health`, stats: `GET /stats?key=<ADMIN_UUID>`
- [x] Health report: `POST /health/report` (from GitHub Actions)
- [x] Deploy via CF Pages custom domain (`sub.example.com` → `your-pages-project.pages.dev`)
- [x] CDN WebSocket URI generation for IP-block-proof transport
- [ ] Test subscription import in Hiddify from Iran
- [ ] Verify auto-update interval (4 hours)

## Phase 10: CDN WebSocket Transport ✅
>
> IP-block-proof: traffic routes through Cloudflare CDN edge on 3 servers

- [x] Create Cloudflare DNS records (Proxied/orange cloud):
  - [x] `cdn.example.com` → Helsinki (<HEL_IP>)
  - [x] `cdn2.example.com` → Oracle (<ORC_IP>)
  - [x] `cdn3.example.com` → Scaleway (<SCW_IP>)
- [x] CF Flexible SSL Configuration Rule: `starts_with(http.host, "cdn")` → SSL off (CF→origin on port 80)
- [x] VLESS-WS inbound on port 8080 (Docker maps 80→8080) on all 4 servers
- [x] Verify CF is proxying: `dig cdn*.example.com` returns CF IPs, not server IPs
- [x] All 3 CDN-WS endpoints return HTTP 400 (WS handler alive)
- [ ] Test VLESS WS connection through CDN from Iran

## Phase 11: SNI Diversification & Rotation
>
> Prevent single-SNI blocking from taking down all servers

- [x] Diversify SNIs: Helsinki=google.com, Oracle=dl.google.com, Scaleway=microsoft.com
- [ ] Monitor which SNIs get blocked per ISP
- [ ] Prepare fallback SNI list per server (rotate if blocked)
- [ ] Document SNI rotation procedure in operations.md

## Phase 12: DNS Resolver Optimization (findns) — DEFERRED

> **Deferred**: Requires a device inside Iran. Low priority — DNS tunnels work acceptably with default resolvers. Revisit if DNS tunnel throughput becomes a bottleneck.

## Phase 13: DoH/DoT Tunnel Mode — DEFERRED

> **Deferred**: Raw DNS tunnels are working across 3 servers. DoH transport adds complexity with unclear benefit. Revisit if ISPs start throttling raw DNS.

## ~~Phase 14: DNS Tunnel on Additional Servers~~ — DONE (Phase 36)

> **Completed in Phase 36**: DNS tunnels expanded to Helsinki + Oracle Madrid + Scaleway London. See Phase 36 below.

## Phase 15: Server-Side Observability
>
> Connection-level logging for debugging and monitoring

- [x] Enable sing-box "info" log level on all 4 servers
- [x] Set up Docker log rotation (10m × 3 files) on all 4 servers
- [x] Create connection monitoring script (`tools/check-connections.sh`)
- [x] Enhanced health-check.yml with multi-protocol probes (Reality, CDN-WS)
- [ ] Optional: forward logs to Cloudflare Worker for centralized view
- [ ] Set up alerts for server down / high error rate

## ~~Phase 16: NoTLS HTTP Obfuscation~~ — SUPERSEDED (Phase 17)

> **Superseded by Phase 17 (XrayHTTP)**: WebSocket-based NoTLS approach **failed** — Iranian DPI detects `Upgrade: websocket` headers even to whitelisted hosts. Phase 17 uses xray-core TCP+HTTP header obfuscation instead, which works because it uses fake HTTP GET/response headers (no WebSocket upgrade).

## Phase 17: xray-core TCP+HTTP Header Obfuscation
>
> The transport that actually bypasses Iranian DPI — wraps VLESS in fake HTTP GET/response headers

**Key insight**: Iranian DPI detects WebSocket upgrade headers (`Upgrade: websocket`), which is why our Phase 16 NoTLS (WS) approach failed. Working Iranian VPN providers use xray-core's TCP+HTTP header obfuscation (`type=tcp, headerType=http`) which is indistinguishable from normal HTTP browsing. sing-box doesn't support this transport — requires xray-core.

- [x] Identify root cause: transport mismatch (our `type=ws` vs working `type=tcp&headerType=http`)
- [x] Create xray-core config: VLESS TCP inbound with HTTP header obfuscation (Host: telewebion.com)
- [x] Deploy xray-core Docker container alongside sing-box on all 4 servers
  - [x] Helsinki (<HEL_IP>) — xray-core on port 80, sing-box WS removed from port 80
  - [x] Oracle Madrid (<ORC_IP>) — same
  - [x] GCP Middle East (<GCP_IP>) — same
  - [x] Scaleway London (<SCW_IP>) — same
- [x] Update smart-sub worker v2.5: `generateHttpObfsURI()` now outputs `type=tcp&headerType=http`
- [x] Verify all 4 XrayHTTP URIs in subscription (`XrayHTTP-Finland`, `XrayHTTP-Madrid`, etc.)
- [x] All 4 servers responding on port 80 (TCP probe confirmed)
- [ ] **Test from Iran (Irancell)** — tester needs to refresh subscription in Hiddify
- [ ] Verify XrayHTTP works on other ISPs (MCI, Rightel, fixed-line)
- [x] Add WARP outbound to xray-core — WireGuard outbound with per-server WARP credentials
- [x] Restore CDN-WS via HAProxy TCP multiplexer on port 80 (path /ws → sing-box WS, / → xray)
- [x] Update client-setup.md troubleshooting to prioritize XrayHTTP configs

## Phase 18: XHTTP/splithttp through Cloudflare CDN
>
> The ultimate combo: hides server IP (CDN) + bypasses DPI (no WebSocket headers)
> Uses xray-core XHTTP transport — pure HTTP POST/GET that looks like normal browsing

**Why this matters**: CDN-WS failed because DPI detects `Upgrade: websocket`. XrayHTTP works but exposes server IP directly. XHTTP through CDN solves BOTH — traffic goes through Cloudflare (IP hidden) as normal HTTP requests (no detectable signature).

- [x] Add XHTTP inbound to xray-core on all 4 servers (port 10081, path `/xhttp`)
  - [x] Helsinki (<HEL_IP>)
  - [x] Oracle Madrid (<ORC_IP>)
  - [x] GCP Middle East (<GCP_IP>)
  - [x] Scaleway London (<SCW_IP>)
- [x] Update HAProxy: `/xhttp` → xray XHTTP, `/ws` → sing-box WS, `/` → xray TCP+HTTP
- [x] Deploy smart-sub worker v2.6 with `generateXhttpCdnURI()` (18 configs per premium user)
- [x] Verify XHTTP responds through CDN: all 3 CDN endpoints return HTTP 400 (handler alive)
- [x] Create `cdn4.example.com` → `<GCP_IP>` (Proxied) in CF dashboard — enables GCP CDN
- [x] Deploy smart-sub worker v2.8: GCP now has CDN support (25 configs per premium user)
- [ ] Test XHTTP-CDN from Iran — should bypass both IP blocking AND DPI
- [ ] Verify on multiple ISPs (Irancell, MCI, Rightel, fixed-line)

## Phase 19: Whitelisted Host Rotation for XrayHTTP ✅
>
> Diversify HTTP Host headers to prevent single-host blocking

- [x] Rotate hosts: Helsinki=telewebion.com, Oracle=myket.ir, GCP=aparat.com, Scaleway=divar.ir
- [x] Update xray-core configs with per-server Host headers
- [ ] Verify each host works from Iran
- [x] Document fallback hosts: see `config/cdn.yaml` → `whitelisted_hosts`
  - Tier 1 (government): telewebion.com, shad.ir, isna.ir, bale.ai, igap.net, tamin.ir, bmi.ir, mci.ir
  - Tier 2 (commercial): zula.ir (91+), myket.ir (27+), aparat.com, divar.ir, filimo.com, varzesh3.com
  - Per-server fallback rotation table documented
- [x] Create per-ISP verification matrix in operations.md
- [ ] Monitor which hosts get flagged per ISP (ongoing)

## Phase 20: naiveproxy (Chrome Network Stack)
>
> Traffic indistinguishable from Chrome HTTPS — uses Chrome's actual TLS implementation

**Deployment script**: `tools/deploy/deploy-naiveproxy.sh`
**Client limitation**: Hiddify does NOT support naive:// — users need NekoBox or standalone client

- [x] Create deployment script with Docker-based Caddy + forwardproxy build
- [x] Add `generateNaiveURI()` to smart-sub worker v2.8
- [x] Add `naive` config placeholder to all server definitions
- [x] Choose server: Scaleway (`bash deploy-naiveproxy.sh scaleway`)
- [x] Create DNS record: `web4.example.com` → <SCW_IP> (DNS-only, grey cloud in CF dashboard)
- [x] Open port 2087/tcp in UFW (Scaleway cloud firewall may also need update)
- [x] Run deployment script — Caddy with naive forwardproxy built and running
- [x] Copy output credentials into env vars (user: vpnuser, pass: `<NAIVE_PASS>` — stored in `.dev.vars` / Wrangler secrets)
- [x] Deploy worker v2.8: 25 configs per premium user
- [ ] Test from Iran — DPI cannot distinguish from Chrome browsing

## Phase 21: Shadowsocks 2022 (Zero Fingerprint Fallback)
>
> Brand-new protocol with AEAD-2022 crypto — no known DPI fingerprint, looks like random bytes
> Routes through HAProxy on port 80 — non-HTTP traffic → SS2022 (no new ports needed)

**Deployment script**: `tools/deploy/deploy-ss2022.sh`
**Client support**: Hiddify, V2RayNG, sing-box clients — all work natively

- [x] Create deployment script with key generation + HAProxy update
- [x] Add `generateSs2022URI()` to smart-sub worker v2.8
- [x] Add `ss2022` config placeholder to all server definitions
- [x] HAProxy routing: HTTP verbs → XrayHTTP, non-HTTP → SS2022 (default backend)
- [x] Run: `bash deploy-ss2022.sh` — deployed to all 4 servers (keys generated + HAProxy updated)
- [x] Copy output keys into worker.js server configs (4 unique server_keys + shared user_key)
- [x] Deploy worker v2.8: SS2022 configs now included in subscription
- [ ] Test from Iran — should pass as random encrypted traffic
- [x] **No new ports needed**: SS2022 shares port 80 via HAProxy protocol detection (verified)

## Phase 22: Cloak (TLS Camouflage)
>
> Wraps SS2022 traffic as genuine TLS 1.3 to whitelisted domain — DPI sees real TLS handshake to google.com
> Uses ck-server v2.12.0 with curve25519 crypto + SIP003 plugin mechanism

**Deployment script**: `tools/deploy/deploy-cloak.sh`
**Client limitation**: Hiddify does NOT support SIP003 plugins — users need NekoBox or Shadowsocks Android + Cloak-android APK
**Port**: 2053/tcp (avoids 443 conflict with Reality, CF-compatible HTTPS alt port)
**Backend**: SS2022 on engine:10082 (same sing-box inbound used by HAProxy)

- [x] Create deployment script with key generation + Docker setup
- [x] Add `generateCloakSs2022URI()` to smart-sub worker (SIP002+SIP003 format)
- [x] Add `cloak` config placeholder to all server definitions in worker.js
- [x] Choose test server: Scaleway (`bash deploy-cloak.sh scaleway`)
- [x] Pre-requisite: Open port 2053/tcp in UFW (Scaleway cloud firewall already allows all)
- [x] Pre-requisite: Verify SS2022 is working on Scaleway (ss2022 inbound on engine:10082)
- [x] Run deployment script — ck-server v2.12.0 binary + Docker container in reality-ezpz_reality network
- [x] Copy output credentials (PublicKey, UID) into worker.js Scaleway cloak config
- [x] Deploy worker v2.8: 26 configs per premium user (was 25)
- [x] Test from outside Iran — port 2053 reachable, unauthenticated probes rejected correctly
- [ ] Test from Iran — DPI should see genuine TLS to Google, not VPN signature
- [ ] If successful, deploy to more servers: `bash deploy-cloak.sh helsinki` etc.

## Phase 23: Geneva DPI Fuzzing (Client-Side Research)
>
> AI-powered tool that automatically discovers DPI bypass strategies

- [ ] Install Geneva on a Linux device inside Iran
- [ ] Run `geneva-evolve` against our servers to discover bypass strategies
- [ ] Document working strategy strings per ISP (Irancell, MCI, Rightel)
- [ ] Create iptables/nftables rules from discovered strategies
- [ ] Distribute as client-side DPI bypass instructions
- [ ] **GitHub**: <https://github.com/geneva/geneva>

## Phase 24: Advanced Techniques Documentation
>
> Document emerging techniques as future plan C/D options

- [x] **DPI Bypass Playbook** documented in strategy-roadmap.md Track 7
- [x] **Plan B/C/D techniques** added to client-setup.md troubleshooting
- [ ] **Tor Snowflake** — WebRTC transport (blocking would break WhatsApp/Meet)
- [x] **ECH (Encrypted Client Hello)** — documented verification steps + monitoring (Phase 28)
- [ ] **Domain fronting** via CDN routing tricks — high-value domains impossible to block
- [ ] **Refraction Networking** — if friendly ISP cooperation becomes available

## Phase 25: IPv6 Configs
>
> Bypass IPv4-only blocking — some Iranian ISPs block IPv4 but leave IPv6 untouched

- [x] Add `ipv6` field to all server configs in worker.js
- [x] Helsinki IPv6: `<HEL_IPV6>` (Hetzner)
- [x] Check Oracle Madrid IPv6 — **none** (Oracle Cloud free tier does not assign IPv6)
- [x] Check GCP Dammam IPv6 — **none** (external IPv6 not assigned)
- [x] Check Scaleway London IPv6: `<SCW_IPV6>`
- [x] Implement `generateIPv6RealityURI()` in worker.js — wraps IPv6 in brackets `[addr]:port`
- [x] Implement `generateIPv6Hy2URI()` in worker.js
- [x] Add IPv6 configs to subscription generation loop (after Reality/Hy2, before CDN-WS)
- [x] Deploy worker v3.1 to Cloudflare (code deployed, but Workers runtime blocked — see Phase 30)
- [x] Backup sub (CF Pages) serving v3.1 code with IPv6 configs via `sub.example.com`
- [ ] Test IPv6 Reality connection from Iran (mobile ISP with IPv6 support)
- [ ] Test IPv6 Hy2 connection from Iran

## Phase 26: AmneziaWG (Obfuscated WireGuard)
>
> WireGuard with DPI evasion — junk packets and timing manipulation to defeat WG fingerprinting

**Deploy script**: `tools/deploy/deploy-amneziawg.sh`
**Client**: AmneziaVPN (Android/iOS/Desktop) — <https://amnezia.org>
**Port**: 51820/udp

- [x] Create deployment script with key generation + obfuscation parameters
- [x] Add `amneziawg` config placeholder to all server configs in worker.js
- [x] Implement `generateAmneziaWGURI()` in worker.js (awg:// URI with base64 config)
- [x] Add AmneziaWG to subscription generation loop (after Cloak, before relay variants)
- [x] Dry-run: `bash deploy-amneziawg.sh --dry-run helsinki` — verified script runs correctly
- [ ] Open port 51820/udp in UFW on target server
- [ ] Run deployment: `bash deploy-amneziawg.sh helsinki`
- [ ] Copy output config into worker.js server `amneziawg` field
- [ ] Deploy updated worker: `cd tools/smart-sub && npx wrangler pages deploy`
- [ ] Test from Iran — AmneziaVPN client should connect where WireGuard fails

## Phase 27: Backup Subscription URL (CF Pages)
>
> Deploy smart-sub worker as CF Pages for redundancy when primary Workers domain is blocked

**Deploy script**: `tools/deploy/deploy-backup-sub.sh`
**Primary**: `sub.example.com` (CF Workers custom domain)
**Backup**: `<project>.pages.dev` (CF Pages — different hostname, same configs)

- [x] Create deployment script (`_worker.js` Advanced Mode for CF Pages)
- [x] Run: deployed as `your-pages-project` Pages project (replaced old `your-backup-project` which was blocked)
- [x] Bind KV namespace via API: HEALTH → `0000000000000000000000000000cafe`
- [x] Verify health: `curl https://your-pages-project.pages.dev/health` ✅ 4 servers shown
- [x] Verify subscription: ~190 configs returned for premium user (v5.9) ✅
- [x] Add Pages Custom Domain: `sub.example.com` → `your-pages-project.pages.dev` ✅
- [x] CNAME updated: `sub.example.com` now served by CF Pages (not Workers)
- [x] Production verified: all 15+ protocol types, all 4 servers, all labels correct ✅
- [ ] Share backup URL with users as fallback
- **Note**: Workers.dev subdomain blocked (1101) — see Phase 30

## Phase 28: ECH (Encrypted Client Hello) Verification
>
> Monitor ECH support on Cloudflare for our domains — when active, DPI can't read SNI

**What is ECH**: Encrypts the SNI field in TLS ClientHello using HPKE. DPI sees only the
"public name" (usually cloudflare-ech.com), not your actual domain. This makes all our
CDN-proxied configs (XHTTP-CDN, CDN-WS, EDtunnel) fundamentally undetectable by SNI filtering.

**Current status**: Cloudflare enables ECH automatically for proxied domains. Chrome 117+
supports it. Firefox supports it behind `network.dns.echconfig.enabled` flag.

- [ ] Verify ECH DNS records exist for our CDN domains:

  ```bash
  dig +short TYPE65 cdn.example.com    # Should show ech= parameter
  dig +short TYPE65 cdn2.example.com
  dig +short TYPE65 cdn3.example.com
  dig +short TYPE65 cdn4.example.com
  dig +short TYPE65 sub.example.com
  ```

- [ ] Verify ECH negotiation in Chrome:
  - Visit `chrome://flags/#encrypted-client-hello` → Enabled
  - Connect to `https://cdn.example.com` → DevTools → Security → check "ECH" status
  - Or: `curl --ech hard https://cdn.example.com -v 2>&1 | grep ECH`
- [ ] Verify ECH in Firefox:
  - `about:config` → `network.dns.echconfig.enabled` = true
  - `about:config` → `network.dns.http3_echconfig.enabled` = true
- [ ] Test from Iran: Does ECH prevent SNI-based blocking of our CDN configs?
- [ ] Document ECH status in client-setup.md troubleshooting
- [ ] Monitor: Re-check monthly — ECH support expanding to more browsers/platforms

## Phase 29: ProxyIP for EDtunnel
>
> Set PROXYIP environment variable on CF Pages EDtunnel projects for better routing

- [x] Document PROXYIP setup in worker.js EDtunnel section
- [x] Set PROXYIP on `your-cover-site-a` (CF API: environment variable set to `cdn.xn--b6gac.eu.org`)
- [x] Set PROXYIP on `your-cover-site-b` (CF API: environment variable set to `cdn.xn--b6gac.eu.org`)
- [ ] Redeploy both Pages projects after setting env vars (blocked by CF abuse detection 8000119)
- [ ] Test EDtunnel connections improve with PROXYIP set

## Phase 30: Cloudflare Abuse Block Remediation
>
> Account-level CF abuse detection blocking Workers (1101) and Pages redeployment (8000119)

**Discovery**: Worker deployed successfully but returns error 1101 at runtime. Even a minimal
hello-world worker under a different name returns 1101. `wrangler dev --remote` works (different
execution path). CF Pages first-time deploys still serve, but redeployments fail with error 8000119.

**Root cause**: Account-level Cloudflare abuse detection — all Workers on `example.workers.dev`
are blocked. Pages are partially restricted (existing deployments serve, new ones rejected).

**Mitigation applied**: `sub.example.com` CNAME switched from Workers to CF Pages Custom Domain
on `your-backup-project.pages.dev`. Service restored.

- [x] Diagnose 1101: confirmed account-level block (hello-world also fails, remote dev works)
- [x] Delete stale Worker route from zone (was intercepting CNAME traffic)
- [x] Switch `sub.example.com` to CF Pages Custom Domain → service restored
- [x] Old `your-backup-project` project blocked → created new `your-pages-project` project
- [x] Deployed worker.js v4.0 as `_worker.js` to new Pages project
- [x] Custom domain `sub.example.com` active on new project (status: active/verified)
- [ ] Email `abusereply@cloudflare.com` to dispute account flag / get Workers unblocked
- [ ] Once Workers unblocked: re-enable routes in wrangler.toml and redeploy
- [ ] Consider creating a second CF account as contingency

## Phase 31: Xray-core Upgrade to v26.2.6 ✅
>
> Required for Finalmask (mKCP) support — deploy script: `tools/deploy/upgrade-xray.sh`

- [x] Create upgrade script with Docker image rebuild
- [x] Verify Xray-core v26.2.6 running on all 4 servers
- [x] Confirm backward compatibility with XHTTP, XrayHTTP, SS2022 transports

## Phase 32: Finalmask XDNS + XICMP ✅
>
> UDP-based mKCP transport disguised as DNS queries (XDNS) or game/P2P traffic (XICMP)
> Deploy script: `tools/deploy/deploy-finalmask.sh`

- [x] Create deployment script with xray-core mKCP inbound configuration
- [x] Deploy XDNS (port 10053/udp, headerType=dns) to all 4 servers
- [x] Deploy XICMP (port 10054/udp, headerType=utp) to all 4 servers
- [x] Add `generateFinalmaskURI()` to smart-sub worker v4.0
- [x] Verify 8 Finalmask configs in subscription (4 XDNS + 4 XICMP)
- [ ] Test from Iran — should work when TCP is blocked

## Phase 33: Hysteria2 Salamander + UDP Hop ✅
>
> Obfuscated QUIC + port cycling across 20000-50000 UDP range
> Deploy script: `tools/deploy/deploy-salamander-udphop.sh`

- [x] Create deployment script with Salamander obfuscation + port range
- [x] Deploy to all 4 servers with password `<SALAMANDER_PASSWORD>` (stored in `.dev.vars` / Wrangler secrets)
- [x] Add `generateSalamanderHopURI()` to smart-sub worker v4.0
- [x] Verify 4 Hy2-Hop configs in subscription (ports=20000-50000, obfs=salamander)
- [ ] Test from Iran — should bypass QUIC fingerprinting

## Phase 34: ShadowTLS v3 + SS2022 ✅
>
> Real TLS handshake to google.com wrapping SS2022 inner tunnel
> Deploy script: `tools/deploy/deploy-shadowtls.sh`

- [x] Create deployment script with ShadowTLS v3 + SS2022 config
- [x] Deploy to Helsinki (port 10443/tcp) and Scaleway (port 10443/tcp)
- [x] Password: `<SHADOWTLS_PASSWORD>` (stored in `.dev.vars` / Wrangler secrets), handshake: google.com:443
- [x] Add ShadowTLS configs to smart-sub worker v4.0 (sing-box JSON format)
- [x] Verify 2 ShadowTLS configs in subscription (HEL + SCW)
- [ ] Test from Iran — DPI should see real TLS to Google

## Phase 35: NaiveProxy Expansion ✅
>
> Expanded NaiveProxy from Scaleway-only to Helsinki + Oracle + Scaleway
> Deploy script: `tools/deploy/deploy-naiveproxy-expand.sh`

- [x] Create expansion deployment script
- [x] Deploy to Helsinki (web.example.com:2087)
- [x] Deploy to Oracle Madrid (web2.example.com:2087)
- [x] DNS records: A web → <HEL_IP>, A web2 → <ORC_IP> (DNS only)
- [x] Update smart-sub worker: 3 NaiveProxy configs (Naive-HEL, Naive-ORC, Naive-SCW)
- [ ] Test from Iran — Chrome TLS stack should be undetectable

## Phase 36: DNS Tunnel Expansion ✅
>
> Expanded DNS tunnels from Helsinki-only to Helsinki + Oracle + Scaleway
> Deploy script: `tools/deploy/deploy-dnstunnel-expand.sh`

- [x] Create expansion deployment script
- [x] Deploy dnstm to Oracle Madrid (tns2 nameserver)
- [x] Deploy dnstm to Scaleway London (tns4 nameserver)
- [x] DNS records: A tns2 → <ORC_IP>, A tns4 → <SCW_IP>, NS t2 → tns2, NS s2 → tns4
- [x] Update smart-sub worker: 3 DNS tunnel configs (DNS-HEL, DNS-ORC, DNS-SCW)
- [ ] Test from Iran — DNS tunnel redundancy across 3 servers

## Phase 37: Master Deployment Orchestrator ✅
>
> One-command deployment of all v4.0 upgrades
> Script: `tools/deploy/deploy-all-upgrades.sh`

- [x] Create orchestrator script (7 steps, --dry-run/--step/--from support)
- [x] Steps: upgrade-xray → finalmask → salamander → shadowtls → naiveproxy → dnstunnel → deploy-sub
- [x] Verify all ~190 configs generated correctly in subscription
- [x] Production deployment of worker.js v4.0 to CF Pages verified
