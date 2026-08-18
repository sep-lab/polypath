# Client Setup Guide

## Recommended Client: Hiddify App

**Why Hiddify**: Built by Iranians, for Iranians. Supports all our protocols, auto-fallback, subscription links, and Iran routing rules out of the box.

### Downloads

| Platform | Link |
|---|---|
| **Android** | <https://github.com/hiddify/hiddify-app/releases> (APK) or Google Play |
| **iOS** | App Store: search "Hiddify" |
| **Windows** | <https://github.com/hiddify/hiddify-app/releases> (.exe) |
| **macOS** | <https://github.com/hiddify/hiddify-app/releases> (.dmg) |
| **Linux** | <https://github.com/hiddify/hiddify-app/releases> (.AppImage) |

### Setup with Subscription Link (Easiest)

reality-ezpz generates a subscription URL that auto-updates configs:

1. Open Hiddify App
2. Tap "+" or "Add Profile"
3. Select "Add from subscription link"
4. Paste your subscription URL
5. Hiddify will auto-import all protocols (Reality, Hysteria2, etc.)
6. Tap the connect button

### Setup with Manual Links

If subscription isn't available, import individual protocol links:

1. Copy the `vless://...` link from your server
2. Open Hiddify → "+" → "Add from clipboard"
3. Repeat for `hy2://...` (Hysteria2) link
4. Repeat for CF Workers VLESS link (backup)

### Multi-Server Setup (Smart Subscription)

All 4 servers are managed through a single smart subscription endpoint:

1. Open Hiddify → "+" → "Add from subscription link"
2. Paste: `https://sub.example.com/sub/<UUID>`
3. Hiddify imports all ~190 configs across all servers and protocols
4. Enable auto-fallback — Hiddify auto-tries the next protocol if current fails

Backup subscription (if primary is down): `https://sub.example.net/sub/<UUID>`

The smart-sub v5.9 worker serves configs in 13-tier fallback priority:

1. XHTTP-CDN (CF-fronted, IP hidden, DPI-proof)
2. Finalmask XDNS/XICMP (mKCP obfuscated UDP)
3. XrayHTTP (fake HTTP to whitelisted hosts)
4. Reality (TLS to SNI, needs fragment)
5. Hy2 Salamander (obfuscated UDP)
6. Hy2 standard + UDP Hop
7. ShadowTLS v3 + SS2022 (genuine TLS wrapper)
8. CDN-WS (WebSocket through CF)
9. SS2022 direct (random bytes)
10. NaiveProxy (Chrome TLS stack)
11. Cloak (TLS camouflage)
12. DNS tunnel (last resort, ~60 KB/s)
13. EDtunnel (CF Pages serverless)

### Hysteria2 Connection Details

Hysteria2 configs are included in the smart subscription. Manual connection details:

| Setting | Value |
|---|---|
| Protocol | Hysteria2 |
| Server | Server IP (see below) |
| Port | `8443` (routed through HAProxy on 443) |
| Password | `<UUID>` |
| SNI | `www.google.com` |
| Skip cert verify | Yes (self-signed cert) |
| Transport | UDP/QUIC |

**Servers**: Helsinki (`<HEL_IP>`), Oracle Madrid (`<ORC_IP>`), GCP Dammam (`<GCP_IP>`), Scaleway London (`<SCW_IP>`)

> **Note**: Use the smart subscription link instead of manual configs — it includes all ~190 configs with proper fallback priority.

### Configure Iran Split Routing

Hiddify supports Iran routing rules natively:

1. Go to Settings → Routing
2. Enable "Iran" routing mode (or "Custom")
3. This routes Iranian domains/IPs directly, only international traffic through VPN
4. Reduces server load and makes domestic browsing faster

### Configure Auto-Fallback

1. Go to Settings → General
2. Enable auto-switch/fallback
3. Hiddify will automatically try the next protocol if the current one fails

## Alternative Clients

### Android: V2RayNG

1. Download: <https://github.com/2dust/v2rayNG/releases>
2. Import: Tap "+" → "Import from clipboard" → paste `vless://` link
3. Connect: Tap the play button

### iOS: Shadowrocket (~$3)

1. Download from App Store
2. Tap "+" → Type: VLESS
3. Enter server details manually or scan QR code
4. Toggle connection on

### Windows: V2RayN

1. Download: <https://github.com/2dust/v2rayN/releases>
2. Import: Servers → Import from clipboard
3. Start: Right-click tray icon → Start

### macOS: V2RayU

1. Download: <https://github.com/yanue/V2rayU/releases>
2. Import via menu bar icon → Server Settings → Import

### Desktop Alternative: NekoRay / NekoBox

1. Download: <https://github.com/MatsuriDayo/nekoray/releases>
2. Supports sing-box and Xray cores
3. Good for advanced users who want more control

## DNS Tunnel Clients (Last Resort)

When all other methods are blocked, DNS tunnels still work because they encode traffic inside DNS queries.

### Desktop: dnstc (Linux/Mac/Windows)

**Repo**: <https://github.com/nickoala/dnstc>

```bash
# Download from https://github.com/nickoala/dnstc/releases

# Slipstream+SOCKS (fastest, ~63 KB/s):
./dnstc --type slipstream \
  --domain t.<DOMAIN> \
  --fingerprint "<SLIP_SOCKS_FP>" \
  --listen 127.0.0.1:1080

# DNSTT+SOCKS (~42 KB/s):
./dnstc --type dnstt \
  --domain t2.<DOMAIN> \
  --pubkey <DNSTT_PUBKEY> \
  --listen 127.0.0.1:1080

# This creates a local SOCKS5 proxy on 127.0.0.1:1080
# Configure your browser/apps to use it
```

### Android: SlipNet

**Repo**: <https://github.com/nickoala/SlipNet>

1. Download APK from <https://github.com/nickoala/SlipNet/releases>
2. Install and open
3. Add tunnel:
   - **Domain**: `t.<DOMAIN>`
   - **Type**: Slipstream
   - **Fingerprint**: `<SLIP_SOCKS_FP>`
4. Connect — creates local SOCKS proxy

### iOS: HTTP Injector

1. Install from App Store
2. Configure DNS tunnel with DNSTT public key or Slipstream fingerprint
3. Set tunnel subdomain: `t.<DOMAIN>`

> **Note**: DNS tunnels are very slow (~42-63 KB/s). Use only when everything else is blocked.

## Oblivion / Cloudflare WARP (Standalone - No Server Needed)

The simplest option for non-technical users. No server, no config, just install and tap connect.

### Desktop (Windows/Mac/Linux)

1. Download: <https://github.com/bepass-org/oblivion-desktop/releases>
2. Install and open
3. Enable **Warp-in-Warp (WiW)** mode (Settings → Connection → WiW)
4. Tap Connect
5. If WiW doesn't work, try **Gool** mode

### Android

1. Download: <https://github.com/bepass-org/oblivion/releases> (APK)
2. Install and open
3. Enable WiW or Gool mode in settings
4. Tap Connect

### iOS

No official Oblivion for iOS yet. Use **1.1.1.1 (WARP)** app from App Store as alternative, though it may be blocked without additional tricks.

### When to use Oblivion

- Give to family/friends who can't handle config files
- When your VPS is down or IP is blocked
- As quick temporary access while you fix the main server

## TLS Fragment (CRITICAL for Iran — Enable on ALL Connections)

TLS fragmentation splits the TLS ClientHello into small pieces so Iranian DPI can't pattern-match the SNI. **This is the #1 client-side technique** that makes Reality connections reliable from Iran. Zero server changes needed.

**How it works**: Your client sends a TLS ClientHello containing the SNI (e.g., `www.google.com`). Iran's DPI reads this SNI to decide whether to block. TLS fragmentation splits this message into tiny pieces (10-100 bytes) with delays between them, so DPI can't reassemble it fast enough.

### Hiddify App (Recommended)

1. Settings → Config Options → TLS Fragment
2. Set: **Enabled**
3. Length: `10-100`
4. Interval: `10-50` (milliseconds between fragments)
5. Mode: `SNI` (fragment only the SNI portion)

**ISP-tuned values** (if default doesn't work):

| ISP | Fragment Length | Fragment Interval | Notes |
|---|---|---|---|
| همراه اول (MCI) | `10-100` | `10-50` | Standard works well |
| ایرانسل (Irancell) | `1-3` | `1-5` | Needs smaller fragments |
| رایتل (Rightel) | `10-100` | `10-50` | Standard works well |
| مخابرات (Fixed/ADSL) | `50-100` | `10-30` | Larger fragments OK |

### V2RayNG

1. Settings → Fragment Settings
2. Enable Fragment: **On**
3. Fragment Length: `10-100`
4. Fragment Interval: `10-50`

### Clash Meta / Mihomo

```yaml
tls-fragment:
  enable: true
  size: 10-100
  sleep: 10-50
```

### NekoBox / sing-box Client

In the outbound TLS settings:

```json
"tls": {
  "fragment": {
    "enabled": true,
    "size": "10-100",
    "sleep": "10-50"
  }
}
```

> **Note**: TLS fragment only helps TLS-based protocols (Reality, VLESS+TLS). It does NOT affect Hysteria2 (QUIC/UDP). If Reality is blocked but Hy2 works, switch protocol instead of tweaking fragment.

## ISP-Specific Settings (Iran)

Each Iranian ISP's DPI behaves differently. Use the correct DNS servers and frequency/fragment settings for your carrier:

### همراه اول (Hamrah-e Aval / MCI) - Frequency: 2.4.5

| DNS Servers |
|---|
| `udp://217.218.26.78` |
| `udp://77.88.8.1` (Yandex) |
| `udp://77.88.8.8` (Yandex) |
| `udp://195.46.39.39` (SafeDNS) |
| `udp://8.26.56.26` (Comodo) |

### ایرانسل (Irancell) - Frequency: 1.3.5

| DNS Servers |
|---|
| `udp://8.8.8.8` (Google) |
| `udp://8.8.4.4` (Google) |
| `udp://1.1.1.1` (Cloudflare) |
| `udp://1.0.0.1` (Cloudflare) |
| `udp://208.67.222.222` (OpenDNS) |

### رایتل (Rightel) - Frequency: 2.4.6

| DNS Servers |
|---|
| `udp://208.67.220.220` (OpenDNS) |
| `udp://9.9.9.9` (Quad9) |
| `udp://149.112.112.112` (Quad9) |
| `udp://4.2.2.2` (Level3) |
| `udp://216.146.36.36` (DynDNS) |

### عمومی (General / Any ISP) - Frequency: 1.3.5

| DNS Servers |
|---|
| `udp://8.26.56.26` (Comodo) |
| `udp://64.6.64.6` (Verisign) |
| `udp://64.6.65.6` (Verisign) |
| `udp://198.101.242.72` (Alternate) |
| `udp://198.101.242.73` (Alternate) |

**How to use**: In Warp/Oblivion or similar tools, set the DNS server and frequency values matching your carrier. The "frequency" values configure fragment timing optimized per ISP's DPI behavior.

## CF Clean IP Scanner (For CF Workers Connections)

Users in Iran may find some Cloudflare edge IPs throttled. Use a scanner to find the fastest ones.

### CFScanner

- Download: <https://github.com/m-rambod/CFScanner>
- Run from inside Iran (or have someone there run it)
- It outputs the fastest clean Cloudflare IPs
- Use these IPs in your CF Workers client config as the server address instead of the default

### Manual method

Replace the server address in your CF Workers VLESS config:

```text
# Instead of:
vless://UUID@<CF_PAGES_URL>:443?...

# Use a clean IP:
vless://UUID@CLEAN_CF_IP:443?host=<CF_PAGES_URL>&...
```

## Client-Side DPI Bypass (Optional Extra Layer)

These tools manipulate packets on the client side to bypass Deep Packet Inspection, even without a VPN:

### Windows: GoodbyeDPI

```text
Download: https://github.com/ValdikSS/GoodbyeDPI/releases
Run as Administrator
Can work alongside VPN for extra protection
```

### Linux: zapret

```bash
# Install zapret
# See: https://github.com/bol-van/zapret

# Or use the easier installer:
# https://github.com/Snowy-Fluffy/zapret.installer
bash <(curl -Ls https://raw.githubusercontent.com/Snowy-Fluffy/zapret.installer/main/install.sh)
```

### OpenWrt Router: zapret-openwrt

```text
See: https://github.com/remittor/zapret-openwrt
Installs DPI bypass directly on your router
All devices on the network benefit automatically
```

## Telegram Proxy (Access Telegram Without VPN)

If you only need Telegram (not full internet), use our MTProto proxy. It works independently of the VPN and is configured directly in Telegram's settings.

### Quick Setup

1. Open your browser on your phone/computer
2. Go to: `https://sub.example.com/mtproto/<YOUR-UUID>`
3. Tap the server link — Telegram opens and asks to add the proxy
4. Tap "Connect" — done!

### Manual Setup (All Platforms)

1. Open Telegram → Settings → Data and Storage → Proxy
2. Tap "Add Proxy"
3. Select "MTProto"
4. Enter your server details:

| Server | IP | Port | Secret |
|---|---|---|---|
| Your server 1 | `<SERVER_IP>` | `3443` | `<MTPROTO_SECRET>` |
| Your server 2 | `<SERVER_IP>` | `3443` | `<MTPROTO_SECRET>` |

Values come from your own deployment — `tools/deploy/deploy-mtproto.sh` prints the
secret for each server when it runs. They are also available from
`config/servers.yaml` via the `mtproto.secret_env` env var for each server.

> **Note**: The `ee` prefix means fake-TLS mode — to a DPI system the connection
> looks like HTTPS to the domain encoded in the secret's tail.
>
> **Do not commit these values, and do not publish them.** An MTProto secret is
> complete authentication material: it has no per-user component and no revocation
> path, so anyone holding it has permanent, unattributable use of your proxy.

### Share proxy links

Generate shareable links from your own values:

```text
https://t.me/proxy?server=<SERVER_IP>&port=3443&secret=<MTPROTO_SECRET>
```

## Internet Shutdown Mode (Full Blackout)

During complete internet shutdowns (like June 2026 protests), most VPN protocols stop working because international routing is cut. Only protocols that can tunnel through domestic DNS resolvers survive.

### What works during a shutdown

| Protocol | Why it works | Speed |
|---|---|---|
| DNS Tunnel (Slipstream/DNSTT) | Encodes traffic in DNS queries to domestic resolvers | ~42–63 KB/s |
| Oblivion/WARP with DNS trick | Routes through allowed DNS paths | Variable |

### How to activate shutdown mode

Add `?mode=shutdown` to your subscription URL:

```text
https://sub.example.com/sub/<YOUR-UUID>?mode=shutdown
```

This returns only DNS-tunnel-friendly configs that work even when international routing is fully blocked.

### During a shutdown, try this order

1. **DNS Tunnel clients** (see DNS Tunnel section above) — most reliable
2. **Oblivion/WARP** with domestic DNS resolvers — sometimes works
3. **Psiphon** — has its own CDN-fronted transport that may survive
4. **Share configs offline** via Bluetooth/AirDrop — the sub URL won't be reachable if DNS is also blocked

### ISP-specific DNS resolvers (for DNS tunnel tools)

When configuring DNS tunnel clients during a shutdown, use your ISP's domestic resolver:

| ISP | DNS Resolver |
|---|---|
| MCI (همراه اول) | `10.202.10.10`, `10.202.10.11` |
| Irancell (ایرانسل) | `10.202.10.10`, `10.202.10.11` |
| Rightel (رایتل) | `10.202.10.10`, `10.202.10.11` |
| Fixed-line (مخابرات) | `10.202.10.10`, `10.202.10.11` |

> **Important**: During a full shutdown, even the subscription URL may not be reachable. **Pre-download your configs** and save DNS tunnel settings BEFORE a shutdown hits. Share via Bluetooth/AirDrop.

## Troubleshooting from Iran (If Nothing Connects)

Work through this list in order. Each step takes ~30 seconds. The list is ordered from most effective to last resort.

### Step 1: Try XHTTP-CDN Configs FIRST (IP-hidden + DPI-proof)

**XHTTP-CDN is the strongest protocol we have.** It routes through Cloudflare CDN (hiding our server IPs) using pure HTTP requests (no WebSocket upgrade headers for DPI to detect). This defeats both IP blocking AND protocol detection simultaneously.

In Hiddify, look for configs named `XHTTP-CDN-Finland`, `XHTTP-CDN-Madrid`, `XHTTP-CDN-London`. Try each — if any connects, you're done.

> **Why XHTTP-CDN works**: DPI blocks WebSocket upgrades (killed CDN-WS) and can block server IPs (kills XrayHTTP). XHTTP sends normal HTTP POST/GET through Cloudflare — DPI sees standard HTTPS to a major CDN. No fingerprint, no exposed IP.

### Step 2: Try XrayHTTP Configs (Direct DPI Bypass)

If XHTTP-CDN doesn't work (e.g., CF edge throttled), try direct XrayHTTP. It wraps VLESS in fake HTTP headers to whitelisted Iranian services. No TLS needed.

Look for: `XrayHTTP-Finland`, `XrayHTTP-Madrid`, `XrayHTTP-Middle East`, `XrayHTTP-London`. Each server uses a different whitelisted host (telewebion.com, myket.ir, aparat.com, divar.ir) — if one host is blocked, others may work.

> **Why XrayHTTP works**: Iranian DPI can't block HTTP traffic to domestic services like telewebion.com without breaking those services for all users.

### Step 3: Enable TLS Fragment, Then Try Encrypted Protocols

If HTTP-based protocols fail, enable TLS Fragment and try encrypted ones:

Hiddify: Settings → Config Options → TLS Fragment → Enabled → Length `10-100`, Interval `10-50`

| Priority | Protocol | Config Names | What It Does |
|---|---|---|---|
| 1 | **XHTTP-CDN** | XHTTP-CDN-* | HTTP through CF CDN (IP hidden + no WS) |
| 2 | **Finalmask XDNS** | XDNS-* | mKCP DNS-like UDP on port 10053 |
| 2b | **Finalmask XICMP** | XICMP-* | mKCP UTP-like UDP on port 10054 |
| 3 | **XrayHTTP** | XrayHTTP-* | Fake HTTP to whitelisted hosts (direct) |
| 4 | **Reality** | Reality-* | TLS to fake SNI (needs TLS Fragment) |
| 5 | **Hy2 Salamander** | Hy2-Sal-* | Obfuscated QUIC/UDP, port 20000-50000 |
| 6 | **Hysteria2** | Hysteria2-* | QUIC/UDP (fast when UDP isn't blocked) |
| 6b | **Hy2 Hop** | Hy2-Hop-* | Hy2 with port hopping 20000-50000 |
| 7 | **ShadowTLS v3** | ShadowTLS-* | Genuine TLS handshake wrapping SS2022 |
| 8 | **CDN-WS** | CDN-WS-* | WebSocket through CF (blocked by some DPI) |
| 9 | **SS2022** | SS2022-* | Random bytes, no protocol fingerprint |
| 10 | **NaiveProxy** | Naive-* | Chrome TLS stack, nearly undetectable |
| 11 | **Cloak** | Cloak-* | TLS camouflage to google.com |
| 12 | **DNS tunnel** | SlipNet/dnstc | Last resort, ~60 KB/s |
| 13 | **EDtunnel** | EDtunnel | CF Pages serverless VLESS |

### Step 4: Try IPv6 Configs (Bypass IPv4 Blocking)

Some Iranian ISPs block specific IPv4 addresses but leave IPv6 untouched. If server IPs are blocked but your ISP/device supports IPv6:

1. Look for configs named `Reality-IPv6-Finland`, `Hy2-IPv6-Finland` etc.
2. These connect to the server's IPv6 address instead of IPv4
3. **Requires**: Your ISP must support IPv6 (check: <https://test-ipv6.com> from Iran)
4. Currently available: Helsinki (Hetzner IPv6) — more servers being checked

### Step 5: Try Different Servers

If one server's IP is blocked, try another. Hiddify auto-selects the fastest working one.

- **Helsinki** (Hetzner, Finland) — primary, has DNS tunnel backup
- **Oracle** (Madrid, Spain) — different ASN, free tier
- **GCP** (Dammam, Middle East) — lowest latency from Iran
- **Scaleway** (London, UK) — different ASN/provider

### Step 6: ISP-Specific Fragment Tuning

Each ISP's DPI behaves differently. If TLS Fragment is enabled but connections still fail:

| ISP | Fragment Length | Fragment Interval |
|---|---|---|
| همراه اول (MCI) | `10-100` | `10-50` |
| ایرانسل (Irancell) | `1-3` | `1-5` |
| رایتل (Rightel) | `10-100` | `10-50` |
| مخابرات (Fixed/ADSL) | `50-100` | `10-30` |

### Step 7: Clean Cloudflare IP (for XHTTP-CDN and CDN-WS)

If CDN-based configs are slow or timeout, your ISP may be throttling certain Cloudflare edge IPs:

1. Download CFScanner: <https://github.com/m-rambod/CFScanner>
2. Run from inside Iran to find fast CF IPs
3. In Hiddify, edit XHTTP-CDN or CDN-WS config → change server address to the clean CF IP

### Step 8: Quick Diagnostics

If you have terminal access inside Iran:

```bash
# Can you reach the subscription endpoint?
curl -s --connect-timeout 5 https://sub.example.com/health

# Can you reach servers directly? (expect TLS handshake response)
curl -sk --connect-timeout 5 https://<HEL_IP>:443
curl -sk --connect-timeout 5 https://<ORC_IP>:443
curl -sk --connect-timeout 5 https://<SCW_IP>:443
curl -sk --connect-timeout 5 https://<GCP_IP>:443

# Test XHTTP through CDN
curl -s --connect-timeout 5 https://cdn.example.com/xhttp/

# UDP check for Hysteria2
nc -zuv <HEL_IP> 8443
```

### Step 9: Advanced Bypass Tools (Client-Side)

If standard protocols all fail, these client-side tools can find DPI weaknesses:

**Geneva** (AI-powered DPI bypass) — HIGHEST PRIORITY:

- Download: <https://github.com/geneva/geneva>
- Run from inside Iran (Linux required) — it automatically discovers DPI bugs
- Uses genetic algorithms to fuzz TCP/IP and find bypass strategies
- Has found dozens of working bypasses for Iran/China/Kazakhstan
- Can output "strategy strings" that work with iptables/nftables

```bash
# Install and evolve bypass strategies
pip install geneva
geneva-evolve --server <SERVER_IP> --port 443 --test-type echo
# Apply a discovered strategy
geneva-engine --server <SERVER_IP> --port 443 \
  --strategy "[TCP:flags:SA]-duplicate(tamper{TCP:flags:replace:R})-|"
```

**GoodbyeDPI** (Windows — TCP-level DPI bypass):

- Download: <https://github.com/ValdikSS/GoodbyeDPI/releases>
- Run as Administrator alongside your VPN client
- Manipulates TCP packets to confuse DPI without changing the VPN protocol
- Can make blocked protocols (Reality, CDN-WS) work again

**zapret** (Linux/OpenWrt — TCP-level DPI bypass):

```bash
# Install zapret
bash <(curl -Ls https://raw.githubusercontent.com/Snowy-Fluffy/zapret.installer/main/install.sh)
# Or for OpenWrt routers: https://github.com/remittor/zapret-openwrt
# All devices on the network benefit automatically
```

### Step 10: Chain Proxy — V2Ray + Psiphon Double Tunnel (MOST EFFECTIVE)

**This is the #1 technique currently working in Iran for heavy DPI situations (Irancell, MCI).** It chains our V2Ray configs through Psiphon's CDN-fronted infrastructure, giving double obfuscation.

**Why it works**: V2Ray encrypts your traffic. Psiphon then wraps that in its own tunnel using CDN fronting (AWS CloudFront, Azure, Google) — Iran can't block these CDNs without breaking Amazon/Microsoft/Google for the whole country. DPI would need to crack both layers simultaneously.

#### Setup: Android (Hiddify + Psiphon)

1. **Install Hiddify** and add our subscription link (normal setup)
2. **In Hiddify settings** → set mode to "Proxy only" (NOT VPN mode)
   - This makes Hiddify create a local SOCKS5 proxy on `127.0.0.1:10808`
3. **Install Psiphon** from <https://psiphon.ca>
4. **In Psiphon settings** → set "Upstream proxy" to `socks5://127.0.0.1:10808`
5. **Connect Hiddify first** (creates the local proxy), then **connect Psiphon**
6. Route all apps through Psiphon

#### Setup: Android (v2rayNG + Psiphon)

1. **Install v2rayNG** and import our configs
2. Tap the config to connect → it creates SOCKS5 proxy on `127.0.0.1:10808`
3. **In v2rayNG settings** → switch to "Proxy mode" (not VPN mode)
4. **Install Psiphon** → set upstream proxy to `socks5://127.0.0.1:10808`
5. Connect v2rayNG first, then Psiphon

#### Setup: Windows/macOS (v2rayN/Hiddify + Psiphon)

1. Run Hiddify or v2rayN with our configs in proxy-only mode
2. Note the local proxy address (default: `127.0.0.1:10808`)
3. Download Psiphon for Windows from <https://psiphon.ca>
4. In Psiphon → Settings → Upstream Proxy → `SOCKS5 127.0.0.1 10808`
5. Connect the V2Ray client first, then Psiphon

#### Alternative: V2Ray + Oblivion (WARP)

Same concept but using Cloudflare WARP instead of Psiphon:

1. Run Hiddify/v2rayNG in proxy-only mode (SOCKS5 `127.0.0.1:10808`)
2. Install Oblivion (<https://github.com/bepass-org/oblivion-desktop>) — it wraps WARP
3. Set Oblivion's upstream proxy to your local V2Ray proxy
4. Connect V2Ray → Oblivion → Internet

> **Tip**: If Psiphon alone works but is slow, chain a fast V2Ray config (like XrayHTTP or XHTTP-CDN) through it for better speeds. If Psiphon doesn't work alone either, try Lantern (<https://getlantern.org>) or Tor with Snowflake bridge as the outer tunnel.

### Step 11: Plan B Protocols (If Current Transports Get Detected)

If XHTTP-CDN, XrayHTTP, and other current protocols all get blocked, these are ready to deploy:

**naiveproxy** (Chrome network stack — nearly impossible to detect):

- Uses Chrome's actual TLS implementation, not a reimplementation
- DPI would have to block Chrome itself to stop this
- Client: NekoBox supports `naive://` URIs, or standalone naive client
- **Status**: DEPLOYED on Helsinki (web:2087), Oracle (web2:2087), Scaleway (web4:2087)
- Included in subscription — refresh to get `Naive-Finland`, `Naive-Madrid`, `Naive-London` configs

**Shadowsocks 2022** (zero known fingerprint):

- Completely redesigned protocol with modern AEAD-2022 crypto
- Looks like random bytes to DPI — no protocol signature
- Routes through HAProxy port 80 (non-HTTP traffic → SS2022)
- Hiddify supports ss2022 out of the box
- **Status**: DEPLOYED on all 4 servers — refresh subscription for `SS2022-*` configs

**Cloak** (TLS camouflage — wraps SS2022 in genuine TLS):

- Wraps SS2022 traffic as genuine TLS 1.3 to google.com
- DPI sees a real TLS handshake — indistinguishable from Chrome browsing
- Client: NekoBox or Shadowsocks Android + Cloak-android plugin APK
- **Status**: DEPLOYED on Scaleway (port 2053, TLS to google.com)
- Included in subscription — refresh to get `Cloak-London` config

**AmneziaWG** (obfuscated WireGuard — defeats WG fingerprinting):

- Modified WireGuard that adds junk packets, timing randomization, and header manipulation
- DPI that detects standard WireGuard (fixed packet sizes, handshake pattern) cannot identify AmneziaWG
- Client: **AmneziaVPN** — <https://amnezia.org> (Android, iOS, Windows, macOS, Linux)
- Port: 51820/udp
- **Status**: Deploy script ready (`tools/deploy/deploy-amneziawg.sh`). Once deployed on a server, refresh subscription to get `AWG-*` config
- Import: AmneziaVPN supports `awg://` URIs — paste from subscription or import manually

> See [strategy-roadmap.md](./strategy-roadmap.md) Track 7 for full Plan B/C/D details.

### Step 12: Nuclear Options

If **everything** above fails (full internet shutdown / total DPI):

| Method | How | Speed | Setup |
|---|---|---|---|
| **DNS tunnel** | Encodes traffic in DNS queries — almost unblockable | ~60 KB/s | Already deployed (Helsinki) |
| **Tor + Snowflake** | Uses WebRTC (video call protocol) | ~2-5 Mbps | Download Tor Browser, select Snowflake bridge |
| **Psiphon** | Multi-transport bypass tool backed by Open Tech Fund | Variable | Download from <https://psiphon.ca> |
| **Lantern** | P2P censorship bypass network | Variable | Download from <https://getlantern.org> |
| **Bluetooth mesh (Briar)** | Phone-to-phone messaging, no internet | N/A | Install Briar app |
| **Satellite (Starlink)** | Bypasses all terrestrial filtering | Full speed | Hardware required |

### Step 13: Upcoming Game-Changers (Watch For)

These technologies will fundamentally change the bypass landscape when mature:

- **ECH (Encrypted Client Hello)**: Encrypts SNI in TLS — DPI can't see which domain you connect to. Chrome 117+ and Firefox support it. Cloudflare enables it automatically for proxied domains.
  - **Check if active**: `dig +short TYPE65 cdn.example.com` — look for `ech=` parameter
  - **Enable in Chrome**: `chrome://flags/#encrypted-client-hello` → Enabled
  - **Enable in Firefox**: `about:config` → `network.dns.echconfig.enabled` = true
  - **Impact**: When fully deployed, all our CDN configs (XHTTP-CDN, CDN-WS, EDtunnel) become invisible to SNI-based DPI. Reality also benefits since DPI can't read the SNI field.
- **HTTP/3 everywhere**: As QUIC becomes the default web transport, Iran can't block it without breaking the internet. Our Hysteria2 becomes viable again.
- **Post-quantum TLS**: New crypto that's resistant to future quantum computing. Not relevant today, but will make all current DPI obsolete.

## Testing Your Connection

After connecting:

1. **Check IP**: Visit <https://whatismyipaddress.com>
   - Should show server IP, NOT your real Iranian IP
2. **DNS leak test**: Visit <https://www.dnsleaktest.com>
   - Should NOT show your ISP's DNS servers
3. **Speed test**: Visit <https://fast.com> or <https://speedtest.net>
   - Expected: 50-200 Mbps depending on protocol

## Distributing to Users

### For non-technical users

1. Send them the Hiddify App download link
2. Send them the subscription URL (one link imports everything)
3. They tap connect - done

### For slightly technical users

1. Send individual protocol links (VLESS, Hysteria2)
2. Include the CF Workers backup link
3. Explain: "Try in order, first one that works = use that"

### Security when sharing

- Share configs via Signal or Telegram (encrypted)
- Never share via email or SMS
- Each user should ideally have unique UUID/credentials
- Use reality-ezpz user management to create per-user configs
