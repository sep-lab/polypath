# R&D: Advanced IP/DPI Bypass — 2026 State of the Art

> **Purpose**: Comprehensive research on techniques we're missing, newly available protocols, and prioritized action items to make our VPN unblockable from Iran.
>
> **Date**: March 2026
> **Context**: 4 servers, 15+ deployed techniques, ~190 configs (smart-sub v5.9). VPN works outside Iran; Iranian users face IP blocking, DPI fingerprinting, and protocol-based filtering.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [What We Have vs. What Exists](#what-we-have-vs-what-exists)
3. [Critical Missing Techniques (Priority Order)](#critical-missing-techniques)
4. [Xray-core v26.2.6 Breakthroughs](#xray-core-v2626-breakthroughs)
5. [sing-box 1.12/1.13 Breakthroughs](#sing-box-112113-breakthroughs)
6. [findns & DNS Tunnel Optimization](#findns--dns-tunnel-optimization)
7. [Per-ISP Strategy for Iran](#per-isp-strategy-for-iran)
8. [Upgrade Plan](#upgrade-plan)
9. [Risk Matrix](#risk-matrix)
10. [Implementation Roadmap](#implementation-roadmap)

---

## Executive Summary

### The Problem

Iranian DPI blocks VPN traffic through:

1. **IP blocking** — Blacklisting known VPS IP ranges (Hetzner, Oracle, etc.)
2. **Protocol fingerprinting** — Detecting VLESS/WS/QUIC patterns at line speed
3. **TLS fingerprinting** — Matching uTLS vs real browser TLS stacks
4. **SNI inspection** — Reading unencrypted Server Name Indication
5. **Traffic pattern analysis** — Packet size/timing heuristics
6. **DNS poisoning** — Hijacking DNS to block resolution

### Key Finding: 7 Critical Gaps

After auditing 30+ bypass techniques against our current deployment, we identified **7 critical gaps** that, if addressed, would dramatically improve Iran connectivity:

| # | Gap | Impact | Effort |
|---|---|---|---|
| 1 | **Finalmask (XICMP/XDNS)** — ✅ DEPLOYED v5.3 | Game-changing: tunnels via ICMP/DNS at protocol level | Medium |
| 2 | **AnyTLS** — not deployed | Eliminates TLS proxy fingerprint (sing-box 1.12+) | Low |
| 3 | **Xray-core outdated** — servers likely running old version | Missing XHTTP CDN anti-detection, Finalmask, Salamander | Low |
| 4 | **ECH not enabled** — Encrypted Client Hello not verified | Hides SNI from DPI entirely | Medium |
| 5 | **ShadowTLS v3** — ✅ DEPLOYED v5.3 | Looks like genuine TLS, even under active probing | Low |
| 6 | **DNS tunnel only on Helsinki** — single point of failure | If Helsinki DNS port blocked, no DNS tunnel fallback | Medium |
| 7 | **Hysteria2 UDP hop** — ✅ DEPLOYED v5.3 | Port hopping + Salamander on all 4 servers | Low |

---

## What We Have vs. What Exists

### Currently Deployed (14 Techniques)

| Technique | Servers | DPI Bypass | CDN Hidden | Notes |
|---|---|---|---|---|
| VLESS Reality | All 4 | Partial (needs TLS frag) | No | Gold standard, but fingerprinted by some ISPs |
| Hysteria2 | All 4 | Poor (QUIC blocked) | No | Static port, no hop |
| XHTTP-CDN | All 4 | Excellent | Yes (CF) | Best current transport |
| CDN-WS | 3 servers | Poor (WS detected) | Yes (CF) | Effectively dead in Iran |
| XrayHTTP | All 4 | Good | No | Direct IP exposure |
| SS2022 | All 4 | Good (random bytes) | No | No known fingerprint |
| naiveproxy | Scaleway | Excellent | No | Chrome TLS stack |
| Cloak | Scaleway | Good | No | TLS camouflage |
| DNS Tunnel | Helsinki, Oracle, Scaleway | Excellent | N/A | ~60 KB/s, last resort |
| EDtunnel | CF Pages | Excellent | Yes (CF) | Serverless VLESS |
| Finalmask XDNS | All 4 | Excellent | No | DNS-over-mKCP, built into Xray |
| Finalmask XICMP | All 4 | Excellent | No | ICMP tunneling, built into Xray |
| ShadowTLS v3 | All 4 | Excellent | No | Genuine TLS wrapper + SS2022 |
| Hy2 Salamander+Hop | All 4 | Good | No | Obfuscated UDP + port hopping |
| TLS Fragment | Client-side (auto) | Good | N/A | ISP-tuned in v5.4 |
| MUX Padding | CDN configs (Iran) | Good | Yes (CF) | H2 mux + random padding |
| IPv6 configs | Helsinki+Scaleway | Same per proto | Same | Dual-stack |
| Smart Subscription | CF Pages | N/A | N/A | v5.9, ~190 configs |
| Whitelisted hosts | All XrayHTTP | Good | No | telewebion/myket/aparat/divar |

### NOT Deployed But Available (10 Techniques)

| Technique | Source | Impact for Iran | Effort | Priority |
|---|---|---|---|---|
| **AnyTLS** | sing-box 1.12+ | HIGH — eliminates TLS proxy detection | Low | P0 |
| **XHTTP CDN anti-detection** | Xray v26.2.6 | HIGH — bypasses CDN proxy detection | Low | P0 |
| **ECH (Encrypted Client Hello)** | sing-box 1.5+ | GAME-CHANGER — hides SNI completely | Medium | P1 |
| **NaiveProxy + ECH** | sing-box 1.13+ | VERY HIGH — Chrome TLS + hidden SNI | Medium | P1 |
| **TCP Brutal** | sing-box 1.7+ | MEDIUM — better throughput on constrained links | Low | P2 |
| **XDRIVE** | Xray (coming soon) | HIGH — tunnel via cloud storage, no public IP | TBD | P2 |
| **Geneva AI DPI fuzzing** | github.com/geneva/geneva | HIGH — auto-discovers DPI bugs | Medium | P2 |
| **findns DoH scanning** | github.com/SamNet-dev/findns | MEDIUM — optimizes DNS tunnel resolvers | Low | P2 |
| **AmneziaWG** | AmneziaVPN | MEDIUM — obfuscated WireGuard | Medium | P3 |
| **Tor + Snowflake** | torproject.org | LOW — slow (~2-5 Mbps) | Low | P3 |

### Recently Deployed (6 Techniques — since v5.3)

| Technique | Deployed In | Servers | Status |
|---|---|---|---|
| **Finalmask XICMP** | v5.3 | All 4 | ✅ Active |
| **Finalmask XDNS** | v5.3 | All 4 | ✅ Active |
| **ShadowTLS v3** | v5.3 | Helsinki, Scaleway | ✅ Active |
| **Hy2 Salamander + UDP hop** | v5.3 | All 4 | ✅ Active |
| **Multiplex + Padding** | v5.4 | CDN configs (Iran) | ✅ Active |
| **DNS tunnel expansion** | v5.3 | Helsinki, Oracle, Scaleway | ✅ Active |

---

## Critical Missing Techniques

### 1. Finalmask (XICMP + XDNS) — Xray v26.2.6

**This is the single most important new development for Iran bypass.**

#### What It Is

Finalmask is Xray's new "final masking layer" — a layer below TLS/QUIC that wraps UDP packets in disguises:

- **XICMP**: Wraps traffic inside ICMP echo (ping) packets. Iran's DPI focuses on TCP/UDP — ICMP inspection is minimal.
- **XDNS**: Wraps traffic inside DNS query packets using mKCP reliability layer (like DNSTT, but built into Xray-core). No separate DNS server needed.
- **header-***: Adds custom protocol headers to look like other traffic
- **mkcp-***: Uses mKCP's various packet disguises (DTLS, WireGuard, WeChat video, etc.)

#### Why It's Critical for Iran

```text
Traditional DNS Tunnel (our current):
  Client → DNSTT client → DNS query over UDP:53 → ISP DNS resolver → Our DNS server → DNSTT server → SOCKS → Internet
  Speed: ~60 KB/s, external tools needed, complex setup

Finalmask XDNS (Xray built-in):
  Client → Xray client → XDNS packets (look like DNS) → Our Xray server → Internet
  Speed: Higher (mKCP), built into Xray, shareable config link, no external tools
```

```text
Finalmask XICMP:
  Client → Xray client → ICMP echo packets → Our Xray server → Internet
  Why unblockable: Blocking ICMP breaks ping/traceroute for every network device
```

#### What Changed in v26.2.6

- XDNS added (#5560) — relies on mKCP, functionally replaces DNSTT
- XICMP added (#5633) — relies on mKCP/QUIC or WireGuard
- Finalmask supports WireGuard & SS AEAD/2022 UDP traffic (#5643)
- Share link standard updated to support `fm` (finalmask), `pcs` (pinnedPeerCertSha256), `vcn` (verifyPeerCertByName)

#### Deployment Action

1. Upgrade Xray-core to v26.2.6 on all servers
2. Add XICMP + XDNS inbounds alongside existing transports
3. Add Finalmask configs to smart subscription worker
4. Test from inside the target network

---

### 2. AnyTLS — sing-box 1.12+

#### What It Is

AnyTLS is a new protocol in sing-box that specifically targets the TLS proxy traffic characteristics problem. When you run VLESS/Trojan over TLS, there are subtle differences vs regular HTTPS that DPI can detect:

- Connection duration patterns
- Packet size distributions
- Application-layer multiplexing behavior

AnyTLS introduces a new multiplexing scheme designed to eliminate these characteristics.

#### Why It Matters

Our current sing-box (via reality-ezpz) runs standard VLESS/Reality. While Reality borrows TLS from real sites, the **inner protocol behavior** can still be fingerprinted. AnyTLS addresses exactly this layer.

#### Status

- Available in sing-box 1.12.0-alpha.10+
- Supported as both inbound and outbound
- Compatible with our existing sing-box deployment (just needs config update)

---

### 3. XHTTP CDN Anti-Detection — Xray v26.2.6

#### What It Is

Xray v26.2.6 (#5414) adds new options to XHTTP specifically to bypass CDN's potential detection of proxy traffic. CDNs like Cloudflare can detect unusual HTTP patterns that indicate proxy usage. These new options make XHTTP traffic indistinguishable from normal HTTP requests.

#### Why It Matters

XHTTP-CDN is our best current transport (16 configs, works through Cloudflare). But if Cloudflare or DPI starts detecting the XHTTP pattern:

- Without anti-detection: All 16 XHTTP-CDN configs break simultaneously
- With anti-detection: Traffic looks like normal HTTP through the CDN

#### Also in v26.2.6

- Dynamic Chrome User-Agent for all HTTP requests by default (#5658) — no more Go user-agent fingerprint
- `allowInsecure` removed (auto-disabled by UTC 2026.6.1) — improved security

---

### 4. ECH (Encrypted Client Hello)

#### What It Is

The most important upcoming change to TLS on the internet. ECH encrypts the SNI field in TLS ClientHello, meaning DPI literally **cannot see which domain** you're connecting to.

```text
Without ECH (current):
  ClientHello → SNI: sub.example.com → DPI reads SNI → BLOCK

With ECH:
  ClientHello → SNI: [ENCRYPTED] → DPI sees nothing → PASS
```

#### Current Support

- **sing-box**: ECH server support since 1.5, ECH for NaiveProxy since 1.13-alpha.30
- **Xray-core**: ECH DOH timeout fix in v26.1.23
- **Browsers**: Chrome and Firefox have experimental support
- **Cloudflare**: Supports ECH on custom domains

#### Why This Is a Game-Changer

Once ECH is enabled on our servers:

- Reality transport becomes truly undetectable (no SNI to inspect)
- naiveproxy + ECH = Chrome TLS fingerprint + hidden SNI = perfect stealth
- XHTTP-CDN through Cloudflare with ECH = invisible

#### Action

1. Verify ECH status on our Cloudflare domains
2. Enable ECH on sing-box/Xray server configs with ACME certs
3. Test ECH-enabled NaiveProxy configs from Iran

---

### 5. ShadowTLS v3

#### What It Is

ShadowTLS performs a **real TLS handshake** with a target website (e.g., google.com), then hijacks the connection for proxy traffic. Unlike VLESS Reality which simulates TLS, ShadowTLS actually completes the handshake and passes active probing.

v3 adds strict mode that defends against replay attacks and active probing.

#### Why It Matters

Our Cloak deployment on Scaleway does something similar, but ShadowTLS v3 is:

- Native in sing-box (no separate binary)
- Supports wildcard SNI (sing-box 1.12+)
- Proven in China's GFW environment
- Chainable with other protocols (ShadowTLS wraps SS2022 or VLESS)

#### Typical Chain

```text
Client → ShadowTLS v3 (google.com TLS handshake) → SS2022 (inner proxy) → Internet
DPI sees: genuine TLS to google.com
Active probe sees: google.com responds normally
```

---

### 6. Hysteria2 UDP Hop + Salamander

#### Current Problem

Our Hysteria2 listens on static port 8443/UDP. Iran can:

1. Block all UDP traffic to specific ports
2. Block all UDP to our server IP
3. Throttle QUIC-like patterns

#### UDP Hop (Port Hopping)

Xray v26.1.23 added Hysteria2 transport with `udphop` — the client periodically changes the UDP port it communicates on. The server listens on a port range (e.g., 20000-50000).

```text
Without hop:  Client → UDP:8443 → Server        (easy to block single port)
With hop:     Client → UDP:23456 → Server        (changes every 30s)
              Client → UDP:41023 → Server
              Client → UDP:38891 → Server
              DPI: which port do we block? All 30,000?
```

#### Salamander

Salamander is Xray's new "UDP mask" that wraps Hysteria2 packets in a layer that obscures the QUIC fingerprint. DPI looking for QUIC/Hysteria patterns sees random-looking UDP packets instead.

```text
Without Salamander: UDP packet → QUIC Initial → DPI detects Hysteria2 → BLOCK
With Salamander:    UDP packet → [random bytes] → DPI sees noise → PASS
```

#### Action

1. Upgrade Xray to v26.2.6
2. Enable udphop on Hysteria2 listeners (port range 20000-50000)
3. Enable Salamander UDP masking
4. Add hop+salamander configs to smart subscription

---

### 7. DNS Tunnel Redundancy + findns

#### Current Problem

DNS tunnel runs only on Helsinki. If Helsinki's port 53 is blocked, DNS tunnel is dead. No redundancy.

#### findns Tool

[findns](https://github.com/SamNet-dev/findns) v0.1.7 is a DNS resolver scanner specifically designed for Iran:

- Scans 7,854 embedded Iranian resolvers covering 1,919 CIDR ranges (~10.8M IPs)
- Tests each resolver for: Ping → Resolve → NXDOMAIN → EDNS → Tunnel compatibility → End-to-End verification
- v0.1.7 fixes EDNS0 bug that caused NXDOMAIN and 0% results in earlier versions
- `local --discover` mode generates candidate IPs from all Iranian IP space
- Supports DoH (DNS-over-HTTPS) scanning — **critical** because DoH wraps DNS in HTTPS on port 443, nearly invisible to DPI (vs UDP DNS on port 53 which is monitored)
- Has specific DNSTT and Slipstream compatibility tests

#### Top Community-Tested Resolvers (March 2026)

| Resolver | Service | Best ISPs | DNSTT Freq | Stability |
|---|---|---|---|---|
| `77.88.8.8` | Yandex DNS | MCI | 2, 6, 9 | ★★★ hours-long sessions |
| `217.218.26.78` | Iranian | MCI, Irancell | 2–5 | ★★★ very stable on MCI |
| `208.67.222.222` | OpenDNS | MCI, Irancell | 1–6 | ★★☆ broad ISP support |
| `208.67.220.220` | OpenDNS | MCI | 2–6 | ★★☆ stable on MCI |
| `8.26.56.26` | Comodo DNS | MCI, Rightel | 2, 3, 5, 8 | ★★☆ cross-ISP |
| `102.22.195.106` | Irancell range | Rightel | 1–10 | ★★☆ DNSTT confirmed |
| `223.5.5.5` | Alibaba DNS | MCI, Mokhaberat | 2, 4 | ★★☆ Chinese DNS, bypasses Iranian DPI |

Resolver selection is deployment-specific: enumerate the resolvers your own ISP responds to and rank them by reliability. The per-ISP resolver database used in production is deliberately not published — it is operational data about third-party infrastructure.

#### DoH vs DNS-over-UDP for Tunneling

| Transport | Port | DPI Visibility | Speed | Recommendation |
|---|---|---|---|---|
| DNS-over-UDP | 53 | HIGH — monitored port | ~60 KB/s | Current, vulnerable |
| DNS-over-HTTPS (DoH) | 443 | LOW — looks like HTTPS | ~40-80 KB/s | Preferred for Iran |

#### Action

1. Deploy DNS tunnel on at least 2 more servers (Oracle Madrid, Scaleway London)
2. Run findns from inside the target network to find the best resolvers per ISP
3. Test DoH-based DNS tunneling as alternative to UDP:53
4. Add per-ISP resolver recommendations to client configs

---

## Xray-core v26.2.6 Breakthroughs

**Release date**: ~Feb 2026, latest stable.

### Key Features for Iran Bypass

| Feature | PR | Impact |
|---|---|---|
| XHTTP CDN anti-detection | #5414 | Evades CDN proxy detection for our XHTTP-CDN configs |
| Finalmask XICMP | #5633 | ICMP tunneling — near-unblockable |
| Finalmask XDNS | #5560 | DNS tunneling built into Xray (like DNSTT) |
| Salamander UDP mask | #5508 | Hides QUIC/Hysteria2 fingerprint |
| Hysteria2 udphop | #5508 | Port hopping for UDP |
| Dynamic Chrome User-Agent | #5658 | Eliminates Go UA fingerprint |
| TUN inbound | #5464 | System-wide proxy on client |
| Finalmask WireGuard+SS2022 | #5643 | UDP proxy traffic over Finalmask |
| XTLS Vision pre-connect | #5270 | Reduces latency by pre-establishing connections |

### Upcoming: XDRIVE Transport

From the Xray team (Telegram, Feb 2026):
> "We will launch the XDRIVE transport layer next month — uses cloud storage (S3, Google Drive, etc.) to transmit data. No public IP needed. Traffic goes through whitelisted cloud services."

This is potentially revolutionary: if it works, we'd need zero VPS. Traffic would flow through Google Drive or S3 buckets — services Iran can't block.

---

## sing-box 1.12/1.13 Breakthroughs

### Key Features

| Feature | Version | Impact |
|---|---|---|
| AnyTLS protocol | 1.12-alpha.10 | Eliminates TLS proxy traffic characteristics |
| TLS fragment route action | 1.12-alpha.1 | **Server-side** TLS fragmentation (not just client) |
| ShadowTLS wildcard SNI | 1.12-alpha.18 | Flexible SNI matching for ShadowTLS v3 |
| Certificate store (mozilla) | 1.13 | Filters China-based CA certs (anti-MITM) |
| ECH for NaiveProxy | 1.13-alpha.30 | Hidden SNI + Chrome TLS = perfect stealth |
| TLS record fragmentation | 1.12-beta.24 | Additional fragmentation layer |
| TLS kernel offloading | 1.13 | splice(2) for TLS 1.3 on Linux 5.1+ |

### Critical Warning: uTLS

> **sing-box 1.13-beta.6**: "uTLS is NOT recommended for censorship circumvention due to fundamental architectural limitations. Use NaiveProxy instead for TLS fingerprint resistance."

This means our VLESS Reality configs using uTLS fingerprints (chrome, firefox, etc.) are **potentially detectable**. The sing-box team explicitly recommends NaiveProxy (which uses Chrome's actual TLS stack, not a reimplementation).

### Implication for Our Setup

Our current priority order should shift:

```text
OLD (theoretical):  Reality > XHTTP-CDN > Hysteria2 > XrayHTTP > SS2022
NEW (evidence-based): XHTTP-CDN > naiveproxy+ECH > SS2022+ShadowTLS > Reality > Finalmask
```

Why:

- **XHTTP-CDN** hides IP behind Cloudflare AND uses pure HTTP (no TLS fingerprint issue)
- **naiveproxy+ECH** uses real Chrome TLS (not uTLS) + hidden SNI
- **SS2022+ShadowTLS** has no known fingerprint + genuine TLS handshake wrapper
- **Reality** still works but uTLS can theoretically be fingerprinted
- **Finalmask** is last-resort tunneling (ICMP/DNS) — always works

---

## findns & DNS Tunnel Optimization

### How findns Works

```bash
# Scan for Iranian DNS resolvers compatible with DNS tunneling
findns scan --mode tunnel --country IR --output resolvers.json

# Test specific resolvers
findns test --resolver 102.23.237.76:53 --tunnel-type dnstt --domain t.example.com

# DoH scan (wraps DNS in HTTPS — invisible to DPI)
findns scan --mode doh --country IR --output doh-resolvers.json
```

### Finding Best Resolvers Per ISP

Each Iranian ISP handles DNS differently:

- **Irancell (AS44244)**: Most aggressive DPI. findns found `102.23.237.76:53` as working resolver.
- **Rightel (AS57218)**: Less aggressive. findns found `102.22.72.46:53` as working resolver.
- **MCI (AS197207)**: Second most aggressive. Need findns scan.
- **Fixed-line (Shatel/Asiatech)**: Generally less DPI. Need findns scan.

### Per-ISP DNS Tunnel Config

The smart subscription worker could detect the user's ISP (via IP geolocation) and serve the optimal DNS resolver:

```javascript
// In worker.js — ISP-aware DNS tunnel configs
function getDNSTunnelConfig(userIP) {
  const isp = detectISP(userIP);
  const resolvers = {
    'irancell': '102.23.237.76',
    'rightel': '102.22.72.46',
    'mci': 'TBD',  // Run findns scan
    'shatel': 'TBD',
  };
  return buildDNSTunnelURI(resolvers[isp] || '8.8.8.8');
}
```

### DoH Mode (Recommended)

Standard DNS tunneling uses UDP:53, which is monitored by Iranian DPI. DoH mode wraps DNS queries in HTTPS on port 443:

```text
UDP DNS Tunnel:  Client → DNS query → UDP:53 → ISP sees DNS traffic → May inspect/block
DoH DNS Tunnel:  Client → HTTPS POST → TCP:443 → ISP sees HTTPS → Can't distinguish from normal browsing
```

findns supports DoH endpoint scanning. If Iranian ISP DoH resolvers can be found, DNS tunneling becomes virtually invisible.

---

## Per-ISP Strategy for Iran

### ISP Threat Model

| ISP | DPI Level | UDP Blocked | QUIC Blocked | TLS Inspection | Recommended Protocols |
|---|---|---|---|---|---|
| **Irancell** | Highest | Partial | Yes | Active probing | XHTTP-CDN, naiveproxy, Finalmask XDNS |
| **MCI** | High | Partial | Mostly | Passive | XHTTP-CDN, SS2022+ShadowTLS, Reality+TLS frag |
| **Rightel** | Medium | Rare | Sometimes | Passive | Most protocols work, Reality preferred |
| **Shatel** (fixed) | Low-Medium | Rare | Rarely | Minimal | All protocols, fastest speeds |
| **Asiatech** (fixed) | Low | Rare | Rarely | Minimal | All protocols, fastest speeds |

### Recommended Config Priority Per ISP

#### Irancell (Hardest)

1. XHTTP-CDN (hidden behind Cloudflare, pure HTTP)
2. naiveproxy (Chrome TLS stack, undetectable)
3. Finalmask XDNS/XICMP (tunneling fallback)
4. SS2022 + ShadowTLS v3 (no fingerprint + genuine TLS)
5. EDtunnel via CF Pages (serverless fallback)

#### MCI

1. XHTTP-CDN
2. Reality + TLS Fragment (length: 10-100, interval: 10-50)
3. naiveproxy
4. SS2022
5. Hysteria2 + UDP hop (if UDP open)

#### Rightel / Fixed-line

1. Reality (direct, fast)
2. Hysteria2 (UDP usually works)
3. XHTTP-CDN
4. SS2022
5. XrayHTTP with whitelisted hosts

---

## Upgrade Plan

### Phase 1: Upgrade Xray-core (All Servers) — Immediately

```bash
# On each server, upgrade Xray-core to v26.2.6
# This unlocks: XHTTP CDN anti-detection, Finalmask, Salamander, UDP hop
docker pull ghcr.io/xtls/xray-core:v26.2.6
# Update docker-compose.yml to use new image
# Restart services
```

**What this unblocks**: All Finalmask techniques, XHTTP improvements, dynamic Chrome UA, Salamander, UDP hop.

### Phase 2: Deploy New Protocols — This Week

| Protocol | Where | Config Change |
|---|---|---|
| Finalmask XICMP | All 4 servers | Add XICMP inbound (new port, e.g., raw ICMP) |
| Finalmask XDNS | All 4 servers | Add XDNS inbound (port 53 on non-Helsinki, or separate port) |
| Salamander | All 4 servers | Modify Hysteria2 config to add salamander mask |
| UDP hop | All 4 servers | Change Hysteria2 to listen on port range 20000-50000 |
| ShadowTLS v3 | At least 2 servers | Chain with SS2022 — ShadowTLS on 443, SS2022 inner |

### Phase 3: ECH + NaiveProxy Upgrade — This Month

| Task | Details |
|---|---|
| Verify ECH on CF domains | Check if `sub.example.com` serves ECH configs |
| Enable ECH on server TLS | Generate ECH key pairs, configure in sing-box/Xray |
| Upgrade NaiveProxy with ECH | sing-box 1.13+ supports ECH for NaiveProxy outbound |
| Add naiveproxy to more servers | Currently Scaleway only → deploy on Helsinki + Oracle |

### Phase 4: DNS Tunnel Expansion — This Month

| Task | Details |
|---|---|
| Deploy dnstt on Oracle Madrid | Second DNS tunnel endpoint (redundancy) |
| Deploy dnstt on Scaleway London | Third DNS tunnel endpoint |
| Run findns from Iran | Run `findns scan` per ISP from inside the network |
| Test DoH tunneling | Configure dnstt with DoH transport for stealth |

### Phase 5: Smart Subscription Upgrade — This Month

Update `worker.js` to include:

- Finalmask configs (XICMP, XDNS)
- ShadowTLS v3 + SS2022 combo configs
- ECH-enabled naiveproxy configs
- Hysteria2 + UDP hop + Salamander configs
- Per-ISP config prioritization (detect ISP, reorder configs)

---

## Risk Matrix

### Technique Resilience Against Iranian DPI Evolution

| Scenario | Vulnerable Techniques | Resilient Techniques |
|---|---|---|
| **Full UDP block** | Hysteria2, QUIC, WireGuard | XHTTP-CDN, naiveproxy, Reality, ShadowTLS |
| **TLS fingerprinting** | Reality (uTLS), Cloak | naiveproxy (real Chrome), ECH |
| **CDN detection** | CDN-WS (WebSocket headers) | XHTTP-CDN (with v26.2.6 anti-detection) |
| **SNI blocking** | Any direct TLS connection | ECH, CDN-fronted (CF handles TLS) |
| **IP blacklisting** | All direct connections | CDN-fronted (XHTTP-CDN, EDtunnel), DNS tunnel |
| **Deep content inspection** | XrayHTTP (fake headers) | SS2022 (random bytes), naiveproxy (real Chrome) |
| **DNS hijacking** | DNS tunnel (UDP:53) | DNS tunnel (DoH mode), all non-DNS transports |
| **Full internet shutdown** | Everything | DNS tunnel (if DNS works), Briar mesh, Satellite |

### Protocol Survival Probability in Iran (6-month outlook)

| Protocol | Current Status | 6-month Survival | Notes |
|---|---|---|---|
| XHTTP-CDN | Working | 90% | Protected by Cloudflare's economic importance |
| naiveproxy + ECH | Not deployed | 95% | Real Chrome TLS, undetectable if deployed |
| Finalmask XDNS | ✅ Deployed | 85% | DNS-based, hard to block without breaking DNS |
| Finalmask XICMP | ✅ Deployed | 80% | ICMP-based, some ISPs do filter ICMP |
| SS2022 + ShadowTLS | Partial | 85% | No known fingerprint + genuine TLS |
| Reality + TLS frag | Working | 60% | uTLS fingerprinting risk growing |
| Hysteria2 + hop | Partial | 50% | UDP increasingly targeted |
| CDN-WS | Effectively dead | 10% | WebSocket already fingerprinted |
| DNS Tunnel (DNSTT) | Working | 75% | UDP:53 monitored; needs DoH mode |

---

## Implementation Roadmap

### This Week (P0)

- [ ] Upgrade Xray-core to v26.2.6 on all 4 servers
- [ ] Enable XHTTP CDN anti-detection options
- [ ] Enable dynamic Chrome User-Agent (default in v26.2.6)
- [ ] Add Hysteria2 UDP hop (port range 20000-50000)
- [ ] Add Salamander UDP mask to Hysteria2

### Next Week (P1)

- [ ] Deploy Finalmask XICMP on Helsinki + Oracle
- [ ] Deploy Finalmask XDNS on Helsinki + Oracle
- [ ] Deploy ShadowTLS v3 + SS2022 combo on Helsinki + Scaleway
- [ ] Expand naiveproxy to Helsinki and Oracle (currently Scaleway only)
- [ ] Update smart subscription worker with new configs

### This Month (P1-P2)

- [ ] Verify and enable ECH on Cloudflare domains
- [ ] Deploy ECH-enabled NaiveProxy configs
- [ ] Deploy DNS tunnel on Oracle Madrid (redundancy)
- [ ] Run a findns scan per ISP from inside the target network
- [ ] Test all new configs from Iran
- [ ] Add per-ISP config ordering to smart subscription

### Next Quarter (P2-P3)

- [ ] Deploy AnyTLS when sing-box stable release supports it
- [ ] Monitor XDRIVE transport availability in Xray-core
- [ ] Run Geneva AI DPI fuzzing from Iran (find new TCP bypasses)
- [ ] Implement auto-provisioning with deploy.sh + health monitoring
- [ ] Deploy AmneziaWG on at least one server
- [ ] Build per-ISP verification matrix with systematic testing

---

## Summary: The 5 Most Impactful Actions

If you could only do 5 things right now, do these:

1. **Upgrade Xray-core to v26.2.6** — Unlocks 6+ new techniques in one update
2. **Deploy Finalmask (XICMP + XDNS)** — New tunneling layer Iran has no filter for yet
3. **Deploy naiveproxy on all servers + ECH** — The most undetectable transport possible
4. **Add Hysteria2 UDP hop + Salamander** — Makes UDP blocking impractical
5. **Deploy DNS tunnel on 2 more servers** — Eliminates single-point-of-failure for last resort

These 5 actions would take our bypass capability from **14 deployed techniques to 20+** and dramatically improve survival probability against Iran's DPI across all ISPs.

---

## References

- [Xray-core v26.2.6 Release](https://github.com/XTLS/Xray-core/releases/tag/v26.2.6)
- [Xray-core v26.1.23 Release](https://github.com/XTLS/Xray-core/releases/tag/v26.1.23)
- [sing-box Changelog](https://sing-box.sagernet.org/changelog/)
- [sing-box AnyTLS](https://sing-box.sagernet.org/configuration/inbound/anytls/)
- [sing-box ShadowTLS v3](https://sing-box.sagernet.org/configuration/inbound/shadowtls/)
- [findns DNS Scanner](https://github.com/SamNet-dev/findns)
- [XHTTP: Beyond REALITY](https://github.com/XTLS/Xray-core/discussions/4113)
- [Geneva DPI Bypass](https://github.com/geneva/geneva)
- [Project X Telegram](https://t.me/projectXtls)
