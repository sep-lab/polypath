# Hot Research & Contribution Topics

> **Game-changing areas** where contributors can have outsized impact. Each topic includes the problem, why it matters, trade-offs, and concrete next steps.

---

## Topic 1: Custom App vs Config Distribution — Trade-Offs

### The Dilemma

We currently distribute VPN access via Hiddify subscription URLs. Building a custom app unlocks massive potential but introduces new risks.

### Trade-Off Matrix

| Dimension | Config-Only (Current) | Custom App |
|---|---|---|
| **User onboarding** | Share link → import in Hiddify → connect | Install APK → tap connect |
| **Protocol rotation** | Manual (user switches) | Automatic (app adapts to DPI) |
| **DPI adaptation** | Static — user adjusts TLS fragment | Dynamic — app detects and adapts |
| **Distribution** | URL via Telegram/Signal (easy) | APK via Telegram/sideload (harder on iOS) |
| **Maintenance burden** | Near zero (Hiddify team maintains client) | High — you own the bugs, crashes, updates |
| **iOS support** | Hiddify on App Store (already approved) | TestFlight (10k users, 90-day builds) or no iOS |
| **Detection risk** | Low — Hiddify is a generic VPN app | Higher — custom app is a unique fingerprint |
| **Update delivery** | Sub URL auto-refreshes configs | Must push APK updates (no Play Store) |
| **Cost** | $0 | $99/yr Apple + dev time |
| **Time to market** | Already working | 2-3 months for MVP |

### Recommendation

**Phase approach:**

1. **Now**: Keep Hiddify + smart-sub (working, zero maintenance)
2. **At 20+ users**: Build headless controller that wraps Hiddify's engine (`libbox`/sing-box)
3. **At 50+ users**: Full custom app with DPI detection + auto-rotation

### What a Contributor Can Do

- [ ] Research `libbox` (sing-box's library) API surface — what can be controlled programmatically?
- [ ] Prototype a Flutter app using libbox that connects to one VLESS server
- [ ] Design the "Smart Controller" logic: given a list of configs + DPI signals, which protocol to try?
- [ ] Research APK distribution channels that work in Iran (Myket? Bazaar? Direct APK via Telegram?)
- [ ] Evaluate TestFlight limitations for iOS distribution inside Iran

### Key References

- [sing-box libbox documentation](https://sing-box.sagernet.org/clients/apple/)
- [Hiddify source code](https://github.com/hiddify/hiddify-app) (Flutter + libbox)
- Track 3 in [strategy-roadmap.md](./strategy-roadmap.md)

---

## Topic 2: Dynamic Runtime + Phone Resources

### The Opportunity

A phone is a powerful device sitting in the user's pocket 24/7. An app can leverage its resources in ways a config file cannot:

| Phone Resource | What It Enables | Current Usage |
|---|---|---|
| **CPU** | Run DPI detection algorithms, protocol fingerprinting, Geneva-style strategies | 0% (config is static) |
| **Network stack** | Detect ISP, measure latency, test protocols in background, find clean IPs | 0% |
| **Storage** | Cache configs, store DPI fingerprints, keep protocol success history | 0% |
| **Background execution** | Pre-test connections, rotate servers before user notices, health polling | 0% |
| **Local ML inference** | On-device DPI classifier, predict which protocol will work | 0% |
| **Peer mesh** | Share DPI intelligence with other users (what's blocked on MCI right now?) | 0% |

### Architecture Vision: Smart DPI-Aware Client

```text
┌────────────────────────────────────────────────────────┐
│                    SMART VPN APP                        │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │            DPI Detection Engine                   │  │
│  │                                                   │  │
│  │  1. TCP SYN → measure RST timing → DPI active?   │  │
│  │  2. TLS ClientHello → measure response → blocked? │  │
│  │  3. QUIC Initial → UDP reachable?                 │  │
│  │  4. DNS query for known domain → poisoned?        │  │
│  │  5. HTTP to whitelisted host → allowed?           │  │
│  │                                                   │  │
│  │  Output: DPI fingerprint (bitmask of what's       │  │
│  │          blocked on THIS ISP, RIGHT NOW)           │  │
│  └───────────────────┬──────────────────────────────┘  │
│                      │                                  │
│  ┌───────────────────▼──────────────────────────────┐  │
│  │          Protocol Selection Engine                │  │
│  │                                                   │  │
│  │  Input: DPI fingerprint + server list + history   │  │
│  │                                                   │  │
│  │  Algorithm:                                       │  │
│  │  1. Filter protocols blocked by DPI fingerprint   │  │
│  │  2. Rank remaining by: latency > success_rate >   │  │
│  │     bandwidth                                     │  │
│  │  3. Try top-ranked first, fallback on failure     │  │
│  │  4. Update success_rate history per (ISP, proto)  │  │
│  │                                                   │  │
│  │  Output: ordered list of protocol+server combos   │  │
│  └───────────────────┬──────────────────────────────┘  │
│                      │                                  │
│  ┌───────────────────▼──────────────────────────────┐  │
│  │          Connection Manager (sing-box / libbox)    │  │
│  │                                                   │  │
│  │  - Connects using selected protocol               │  │
│  │  - Monitors connection health (RTT, drops)        │  │
│  │  - Triggers re-selection on degradation           │  │
│  │  - Reports telemetry to backend (opt-in)          │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │          Background Intelligence                  │  │
│  │                                                   │  │
│  │  - Pre-test servers every 15 min (WiFi only)      │  │
│  │  - Cache DPI fingerprint per (ISP, time_of_day)   │  │
│  │  - Share anonymized DPI data with peers (P2P)     │  │
│  │  - Fetch updated server list from smart-sub       │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### Near-Term Research Tasks

- [ ] **DPI fingerprinting library**: Build a lightweight probe that detects what's blocked. Output: `{ tcp_blocked: false, quic_blocked: true, tls_inspection: true, dns_poisoned: true }`
- [ ] **Protocol success database**: Schema for storing per-(ISP, protocol, server, hour) success rates on-device
- [ ] **Background probe scheduler**: Android WorkManager / iOS BGTaskScheduler that tests all configs every 15min
- [ ] **Clean IP scanner integration**: Port [CFScanner](https://github.com/m-rambod/CFScanner) logic into the app for finding unblocked CF edge IPs
- [ ] **On-device Geneva**: Could we run simplified [Geneva](https://github.com/geneva/geneva) strategies on mobile? Analyze feasibility.

### Peer Intelligence Network (Advanced)

```text
Phone A (MCI, Tehran)  ──┐
Phone B (Irancell, Isfahan) ──┤──→ Anonymized DPI reports ──→ Backend aggregates
Phone C (Rightel, Mashhad) ──┘                                  ↓
                                                          DPI status map:
                                                          MCI: QUIC blocked, Reality works
                                                          Irancell: Everything blocked except CDN
                                                          Rightel: All protocols work
```

This crowdsourced DPI intelligence map would be **extremely valuable** — no one has built this for Iran yet.

---

## Topic 3: R&D — Algorithms & Protocols to Bypass Iranian DPI

### Current Iran DPI Capabilities (as of March 2026)

| Technique | ISPs Affected | Our Counter |
|---|---|---|
| **SNI inspection** | All | Reality (mimics google.com TLS), TLS Fragment |
| **TLS fingerprinting** | Irancell, MCI | NaiveProxy (Chrome's actual stack) |
| **QUIC/UDP blocking** | Irancell (partial) | Salamander obfuscation, port hopping |
| **DNS poisoning** | All | DNS-over-HTTPS, DNS tunnel |
| **HTTP Host header** | All | Whitelisted hosts (telewebion.com, myket.ir) |
| **IP blacklisting** | All (for known VPN IPs) | CDN fronting, domestic relay |
| **Active probing** | Unknown (China-style) | ShadowTLS v3, Cloak (pass active probes) |

### Research Area 1: Protocol Mutation / Polymorphism

**Problem**: DPI vendors eventually fingerprint every static protocol.

**Idea**: Protocols that change their fingerprint on every connection.

| Approach | How | Complexity | Impact |
|---|---|---|---|
| **Randomized padding** | Add random bytes in TLS records to break length-based fingerprints | Low | Medium |
| **Header rotation** | Rotate HTTP headers, User-Agent, Accept-Language per connection | Low | Medium |
| **Key schedule variation** | Vary TLS key exchange parameters (curves, ciphersuites) per connection | Medium | High |
| **Traffic shaping** | Mimic real browsing patterns (request sizes, timing, bursts) | High | Very High |
| **Protocol morphing** | Dynamically switch between VLESS/Trojan/SS mid-session | Very High | Game-changer |

**Research tasks:**

- [ ] Analyze what features Iran's DPI uses to classify protocols (payload length? timing? entropy?)
- [ ] Build a traffic shaper that makes VPN traffic match real HTTPS browsing patterns
- [ ] Test if randomized TLS record padding defeats length-based fingerprinting on Irancell

### Research Area 2: ECH (Encrypted Client Hello) — The Endgame

**What**: ECH encrypts the SNI field in TLS ClientHello. DPI literally cannot see which domain you're connecting to.

**Why this is the endgame**: If the DPI can't see the SNI, ALL SNI-based blocking breaks. Our Reality transport becomes theoretically perfect.

**Current status** (March 2026):

- Chrome 124+: ECH support (behind flag in some versions)
- Firefox 118+: ECH support enabled by default
- Cloudflare: ECH enabled on all domains
- Iran's response: **Unknown** — they may block ECH ClientHellos entirely

**Research tasks:**

- [ ] Test ECH from inside Iran — does the DPI block ECH-enabled ClientHellos?
- [ ] If ECH is blocked: can we fall back to non-ECH silently?
- [ ] Build a proxy that uses ECH to connect to Cloudflare, hiding the true destination
- [ ] Monitor browser adoption rates — when >50% of traffic uses ECH, blocking becomes impractical

### Research Area 3: Traffic Analysis Resistance

**Problem**: Even with perfect encryption, DPI can classify traffic by **statistical patterns** (packet sizes, inter-arrival times, burst patterns).

**Countermeasures to research:**

| Technique | Description | Effort |
|---|---|---|
| **Constant-rate padding** | Send fixed-size packets at fixed intervals (like Tor) | Medium |
| **Traffic morphing** | Shape VPN traffic to match a target distribution (e.g., YouTube streaming) | High |
| **Decoy traffic** | Generate fake browsing traffic alongside real VPN traffic | Medium |
| **Timing obfuscation** | Add random delays to break timing correlations | Low |
| **Multi-path splitting** | Split traffic across 2+ protocols simultaneously | High |

### Research Area 4: Iran-Specific IP Bypass Strategies

**Problem**: Iran blocks known VPN server IPs. We need IPs they can't block.

| Strategy | IP type | Why hard to block | Status |
|---|---|---|---|
| **CDN fronting** (current) | Cloudflare edge IPs | Would break half the internet | ✅ Deployed |
| **Cloud function relay** | AWS/GCP/Azure function IPs | Would break cloud services | Research needed |
| **Residential proxy** | Real home IPs in EU | No bulk-blocking pattern | Research needed |
| **Domain fronting v2** | SNI of allowed domain, Host of ours | Requires CDN cooperation | Partially deployed |
| **Tor Snowflake** | WebRTC peer IPs | Ephemeral, can't blacklist | To evaluate |
| **V2Ray mux** | Multiplex VPN inside legitimate TLS | Looks like regular browsing | To evaluate |
| **IPv6** | Most DPI focuses on IPv4 | IPv6 DPI often less mature | Partially deployed |

**Research tasks:**

- [ ] Test if AWS Lambda / GCP Cloud Functions can serve as VLESS relays from Iran
- [ ] Evaluate residential proxy APIs (Bright Data, SmartProxy) — cost vs reliability for VPN relay
- [ ] Systematic IPv6 testing: do Iranian ISPs filter IPv6 differently than IPv4?
- [ ] Test Snowflake bridge from Iran — does WebRTC work through DPI?

### Research Area 5: Geneva — AI-Powered DPI Bypass Discovery

[Geneva](https://github.com/geneva/geneva) uses genetic algorithms to automatically discover packet manipulation strategies that bypass DPI. It has found dozens of bypasses in Iran, China, and Kazakhstan.

**Why this is critical**: Geneva can discover bypasses AUTOMATICALLY. Instead of manually researching DPI behavior, we let an algorithm find weaknesses.

**Research tasks:**

- [ ] Run Geneva from inside Iran against each of our 4 servers
- [ ] Catalog discovered strategies per ISP (MCI, Irancell, Rightel)
- [ ] Build a library of Geneva strategies that can be applied client-side
- [ ] Evaluate if Geneva strategies can be integrated into sing-box or libbox
- [ ] Test if discovered strategies persist across DPI updates or need re-discovery

---

## Topic 4: Distributed Architecture — Eliminating Single Points of Failure

### Current Single Points of Failure

| Component | Risk | Impact if Down |
|---|---|---|
| **Cloudflare account** | Account blocked (ALREADY HAPPENED — error 1101/8000119) | Can't deploy worker updates, stale configs |
| **example.com domain** | Domain seized or DNS poisoned | Users can't reach subscription URL |
| **Smart-sub worker** | CF Pages blocked | No config updates for users |
| **4 server IPs** | All IPs blocked simultaneously | All direct protocols dead |
| **UUID** | Compromised | All users' configs exposed |

### Proposed Mitigations

| Risk | Mitigation | Priority |
|---|---|---|
| **CF account blocked** | Deploy smart-sub on 2nd platform (Vercel, Deno Deploy) | **P0 — Critical** |
| **Domain seized** | Register backup domain on different registrar + different TLD | **P0 — Critical** |
| **Smart-sub down** | Hardcode emergency configs in client app (offline fallback) | P1 |
| **All IPs blocked** | Auto-provisioning — spin new servers via API in <5min | P1 |
| **UUID compromised** | Per-user UUID + instant rotation capability | P2 |

### Research Tasks

- [ ] Deploy a minimal smart-sub clone on Vercel Edge Functions as hot standby
- [ ] Register a `.de` or `.nl` backup domain — test that configs work via backup URL
- [ ] Prototype Hetzner API auto-provisioner: IP blocked → new server in 5 minutes
- [ ] Design offline config bundle — 10 emergency configs baked into the app/file

---

## Topic 5: Freemium Revenue Engine

### Why Revenue Matters

Without revenue, the project dies when GCP credits expire or Hetzner bills aren't paid.

**Current cost**: ~€12/mo (sustainable for personal use).
**At 50 users**: Need ~€30-50/mo for more servers + diversity.
**At 200 users**: Need auto-provisioning, monitoring, support → €100+/mo.

### Payment Research Areas

| Method | Works in Iran? | Privacy | Implementation |
|---|---|---|---|
| **USDT (TRC-20)** | Yes — most common crypto | High | TronLink wallet + manual verification |
| **Telegram Stars** | Yes — built into Telegram | Medium | Telegram Bot API |
| **TON (Telegram crypto)** | Yes — rising adoption | High | TON SDK + Telegram Mini App |
| **Gift codes** | Yes — distribute via Telegram | High | Generate codes in worker.js, redeem via bot |

### Research Tasks

- [ ] Build a Telegram bot that manages subscriptions: `/subscribe` → payment instructions → auto-enable UUID
- [ ] Design gift code system: admin generates codes, users redeem for 30 days access
- [ ] Evaluate TON (Telegram's blockchain) for in-app payments via Telegram Mini Apps
- [ ] Create pricing page/bot that shows tier comparison and payment methods

---

## Topic 6: Other Game-Changers

### 6a: HTTP/3 QUIC Everywhere

**When**: As global HTTP/3 adoption exceeds 50% (currently ~30%), blocking QUIC becomes economically suicidal for Iran.

- [ ] Monitor Iran's QUIC blocking status per ISP monthly
- [ ] When QUIC is unblocked: Hysteria2 becomes the primary protocol (fastest, UDP-based)

### 6b: Refraction Networking

**What**: Friendly ISPs outside Iran install "refraction" middleboxes that covertly redirect traffic. The user connects to an allowed site, but the ISP-level middlebox redirects it to our server.

**Projects**: [Conjure](https://github.com/refraction-networking/conjure), [TapDance](https://github.com/ArmRuby/gotapdance)

- [ ] Research which transit ISPs Iran's traffic passes through
- [ ] Evaluate if any friendly ISPs in Turkey/UAE/Europe would cooperate

### 6c: Satellite Bypass (Starlink)

**What**: Starlink bypasses ALL terrestrial filtering.

- [ ] Track Starlink availability in Iran (currently not officially available)
- [ ] Evaluate smuggled Starlink terminals — cost, risk, coverage
- [ ] Research other LEO satellite internet options (OneWeb, Amazon Kuiper)

### 6d: Mesh Networking / Briar-Style Communication

**What**: When internet is completely shut down (as happened in Nov 2019), phone-to-phone mesh communication via Bluetooth/WiFi Direct.

- [ ] Evaluate [Briar](https://briarproject.org/) for text messaging during shutdowns
- [ ] Research WiFi Direct range and mesh topology feasibility in urban Iran
- [ ] Lightweight VPN-over-mesh: could a mesh relay chain reach a user with internet access?

### 6e: Steganography — Hiding VPN Configs in Plain Sight

**What**: Encode VPN subscription URLs or configs inside images, PDFs, or audio files. Share via Instagram, Telegram, or email without detection.

- [ ] Build a tool: input subscription URL → output innocent-looking image
- [ ] Image posted on Instagram/Telegram → user extracts config with companion app
- [ ] Useful for distribution when Telegram channels get banned

### 6f: WebTransport + HTTP/3

**What**: WebTransport is a new web API that provides bidirectional streaming over HTTP/3. It's designed for web apps but could carry VPN traffic.

- [ ] Research if WebTransport can be used as a VPN transport
- [ ] Advantage: runs on standard HTTP/3 ports, looks like normal web traffic
- [ ] Test browser support and performance characteristics

---

## Priority Ranking

| # | Topic | Impact | Effort | Who |
|---|---|---|---|---|
| **1** | **Distributed architecture (SPOF elimination)** | Critical | Medium | General Engineer |
| **2** | **DPI fingerprinting library + protocol selection engine** | Very High | High | Network Engineer |
| **3** | **ECH testing from Iran** | Very High | Low | Anyone in Iran |
| **4** | **Geneva strategy discovery** | Very High | Medium | Network Engineer |
| **5** | **Custom app prototype (Flutter + libbox)** | High | High | App Developer |
| **6** | **Peer DPI intelligence network** | High | Very High | Full-stack Engineer |
| **7** | **Cloud function relays (AWS/GCP)** | High | Low | General Engineer |
| **8** | **Revenue/payment bot** | High | Medium | General Engineer |
| **9** | **IPv6 systematic testing** | Medium | Low | Anyone in Iran |
| **10** | **Traffic analysis resistance** | Medium | Very High | Researcher |

---

## How to Contribute to These Topics

1. **Pick a topic** from the list above
2. **Create a branch**: `research/topic-name` (e.g., `research/ech-iran-testing`)
3. **Document findings** in a new file under the topic area (or update existing docs)
4. **If code is involved**: follow the patterns in [CONTRIBUTING.md](./CONTRIBUTING.md)
5. **Open a PR** with your findings — even partial results are valuable

### Especially Needed: Testers Inside Iran

Many of these research topics require testing from inside Iran. If you have access:

- Test ECH from different ISPs (Irancell, MCI, Rightel, fixed-line)
- Run Geneva against our servers
- Report which protocols work/fail per ISP
- Test IPv6 connectivity
- Measure latency to CDN edge IPs

**Your testing data is more valuable than code.** Document results in a structured format and open a PR.

---

Last updated: March 2026.
