# DNS Tunnel (dnstm) Setup

## Overview

DNS tunneling encodes VPN traffic inside DNS queries. Since blocking DNS breaks the entire internet, this is a near-unblockable last resort. We use **dnstm** (DNS Tunnel Manager) which supports multiple tunnel types and a smart DNS router for failover.

### Tunnel Types

| Tunnel | Transport | Speed | Use Case |
|---|---|---|---|
| **Slipstream + SOCKS** | DNS (Slipstream) | ~63 KB/s | Default — fastest DNS tunnel |
| **DNSTT + SOCKS** | DNS (dnstt) | ~42 KB/s | Fallback if Slipstream blocked |
| **Slipstream + SSH** | DNS (Slipstream) | ~50 KB/s | SSH tunnel for mobile apps |

- **Block risk**: Near zero — would require breaking DNS itself
- **Use case**: Emergency fallback when all other methods are blocked
- **Server repo**: <https://github.com/net2share/dnstm>
- **Client (desktop)**: <https://github.com/nickoala/dnstc>
- **Client (Android)**: <https://github.com/nickoala/SlipNet>

## Prerequisites

- Server with root access (same Hetzner server: `<SERVER_IP>`)
- Domain name: `<DOMAIN>`
- Cloudflare DNS management access
- Port 53 free (systemd-resolved must be disabled)

## Step 1: Configure DNS Records

In Cloudflare DNS settings for `<DOMAIN>`:

| Type | Name | Value | Proxy Status |
|---|---|---|---|
| A | `tns` | `<SERVER_IP>` | DNS only (grey cloud) |
| AAAA | `tns` | `<SERVER_IPV6>` | DNS only (grey cloud) |
| A | `tns2` | `<ORC_IP>` | DNS only (grey cloud) |
| A | `tns4` | `<SCW_IP>` | DNS only (grey cloud) |
| NS | `t` | `tns.<DOMAIN>` | DNS only (grey cloud) |
| NS | `t2` | `tns2.<DOMAIN>` | DNS only (grey cloud) |
| NS | `s2` | `tns4.<DOMAIN>` | DNS only (grey cloud) |

**IMPORTANT**: All records MUST be "DNS only" (grey cloud), NOT proxied (orange cloud). NS delegation will not work through Cloudflare's proxy.

### DNS Record Purposes

- `t.<DOMAIN>` — Slipstream+SOCKS tunnel (Helsinki, default, port 5310)
- `t2.<DOMAIN>` — DNSTT+SOCKS tunnel (Oracle Madrid, via tns2 nameserver)
- `s2.<DOMAIN>` — DNSTT+SOCKS tunnel (Scaleway London, via tns4 nameserver)
- `tns.<DOMAIN>` — Authoritative nameserver IP for Helsinki (`<HEL_IP>`)
- `tns2.<DOMAIN>` — Authoritative nameserver IP for Oracle Madrid (`<ORC_IP>`)
- `tns4.<DOMAIN>` — Authoritative nameserver IP for Scaleway London (`<SCW_IP>`)

## Step 2: Free Port 53

dnstm's DNS router needs port 53. If `systemd-resolved` is running, disable it:

```bash
# Check if port 53 is in use
ss -tulnp | grep :53

# If systemd-resolved is using it:
systemctl stop systemd-resolved
systemctl disable systemd-resolved

# Set manual DNS resolution
cat > /etc/resolv.conf << 'EOF'
nameserver 8.8.8.8
nameserver 8.8.4.4
EOF
```

## Step 3: Install dnstm on Server

```bash
# SSH into your server
ssh root@<SERVER_IP>

# Download dnstm binary (v0.6.7+)
curl -Lo /usr/local/bin/dnstm \
  https://github.com/net2share/dnstm/releases/download/v0.6.7/dnstm-linux-amd64
chmod +x /usr/local/bin/dnstm

# Install all components (dnstt-server, slipstream-server, ssserver, sshtun-user, microsocks)
dnstm install --mode multi
```

## Step 4: Add Tunnels

```bash
# 1. Slipstream + SOCKS (default, fastest)
dnstm tunnel add \
  --name slip-socks \
  --type slipstream \
  --domain t.<DOMAIN> \
  --port 5310 \
  --backend socks

# 2. DNSTT + SOCKS (fallback)
dnstm tunnel add \
  --name dnstt-socks \
  --type dnstt \
  --domain t2.<DOMAIN> \
  --port 5311 \
  --backend socks

# 3. Slipstream + SSH
dnstm tunnel add \
  --name slip-ssh \
  --type slipstream \
  --domain s2.<DOMAIN> \
  --port 5312 \
  --backend ssh
```

## Step 5: Start DNS Router

```bash
# Start DNS router (listens on 0.0.0.0:53, routes queries to correct tunnel)
dnstm router start

# Verify
dnstm router status
dnstm tunnel list
```

## Step 6: Verify Server

```bash
# Check all tunnels are running
dnstm tunnel list

# Check DNS router
dnstm router status

# Check listening ports
ss -tulnp | grep -E '(53|5310|5311|5312|39190)'

# Check logs for a specific tunnel
dnstm tunnel logs slip-socks
```

## Crypto Material (Needed for Clients)

### DNSTT Public Key

```text
<DNSTT_PUBKEY>
```

From `dnstm tunnel list` output or `/etc/dnstm/config.json`.

### Slipstream Fingerprints

**slip-socks** (t.<DOMAIN>):

```text
<SLIP_SOCKS_FP>
```

**slip-ssh** (s2.<DOMAIN>):

```text
<SLIP_SSH_FP>
```

### SOCKS Proxy

All SOCKS-backend tunnels connect to microsocks on `127.0.0.1:39190` internally.

## MTU Tuning

Default DNSTT MTU is **1232 bytes**. If you experience packet drops or connection instability (common on mobile ISPs), lower the MTU:

```bash
# During install — pass --mtu flag
bash <(curl -fsSL https://raw.githubusercontent.com/SamNet-dev/dnstm-setup/master/dnstm-setup.sh) --mtu 800

# Or set in dnstm config after install
# Edit /etc/dnstm/config.json and set "mtu": 800
```

| MTU Value | When to Use |
|---|---|
| 1232 (default) | Stable networks, fixed-line ISPs |
| 800–1000 | Mobile ISPs with occasional drops |
| 512–600 | Very restrictive networks, frequent packet loss |

**Rule of thumb**: If the tunnel connects but then drops after a few seconds, try halving the MTU.

## Recommended DNS Resolvers (Per ISP)

DNSTT tunneling performance depends heavily on which DNS resolver the client uses. These are the most stable resolvers based on field testing from Iran (March 2026):

| Resolver | Best For | DNSTT Polling Frequency |
|---|---|---|
| `77.88.8.8` (Yandex) | MCI — most stable, hours-long sessions | 2, 6, 9 |
| `217.218.26.78` | MCI, sometimes Irancell | 2, 3, 4, 5 |
| `208.67.222.222` (OpenDNS) | Irancell + MCI | 1, 2, 3, 4, 6 |
| `8.26.56.26` (Comodo) | MCI + Rightel | 2, 3, 5, 8 |
| `102.22.195.106` | Rightel (DNSTT confirmed) | 1–10 |
| `223.5.5.5` (Alibaba) | Mokhaberat (fixed-line) | 2 |

To find more resolvers, use [findns](https://github.com/SamNet-dev/findns) v0.1.7.

## Client Connection

### Desktop: dnstc (Linux/Mac/Windows)

**Repo**: <https://github.com/nickoala/dnstc>

```bash
# Download dnstc from releases
# https://github.com/nickoala/dnstc/releases

# For Slipstream+SOCKS (fastest):
./dnstc --type slipstream \
  --domain t.<DOMAIN> \
  --fingerprint "<SLIP_SOCKS_FP>" \
  --listen 127.0.0.1:1080

# For DNSTT+SOCKS:
./dnstc --type dnstt \
  --domain t2.<DOMAIN> \
  --pubkey <DNSTT_PUBKEY> \
  --listen 127.0.0.1:1080

# For Slipstream+SSH:
./dnstc --type slipstream \
  --domain s2.<DOMAIN> \
  --fingerprint "<SLIP_SSH_FP>" \
  --listen 127.0.0.1:1080

# This creates a local SOCKS proxy on 127.0.0.1:1080
# Configure your browser/apps to use SOCKS5 proxy: 127.0.0.1:1080
```

### Mobile (Android): SlipNet

**Repo**: <https://github.com/nickoala/SlipNet>

1. Download APK from <https://github.com/nickoala/SlipNet/releases>
2. Install and open
3. Add tunnel:
   - **Domain**: `t.<DOMAIN>`
   - **Type**: Slipstream
   - **Fingerprint**: `<SLIP_SOCKS_FP>`
4. Connect — creates a local SOCKS proxy on the device
5. Use with any SOCKS-aware app or system-wide proxy settings

### Mobile (iOS)

Use **HTTP Injector** from App Store:

1. Configure DNS tunnel server
2. Enter DNSTT public key or Slipstream fingerprint
3. Set tunnel subdomain

### Legacy dnstt-client (still works for DNSTT tunnels)

```bash
# If you already have dnstt-client binary:
./dnstt-client -udp LOCAL_DNS_IP:53 \
  -pubkey <DNSTT_PUBKEY> \
  t2.<DOMAIN> 127.0.0.1:7000
```

## Management

```bash
# List all tunnels
dnstm tunnel list

# Check DNS router status
dnstm router status

# View tunnel logs
dnstm tunnel logs slip-socks
dnstm tunnel logs dnstt-socks
dnstm tunnel logs slip-ssh

# Stop/start individual tunnels
dnstm tunnel stop dnstt-socks
dnstm tunnel start dnstt-socks

# Stop/start DNS router
dnstm router stop
dnstm router start

# Full config is at /etc/dnstm/config.json
cat /etc/dnstm/config.json
```

## Troubleshooting

### Port 53 already in use

```bash
# Find what's using port 53
ss -tulnp | grep :53

# If systemd-resolved:
systemctl stop systemd-resolved && systemctl disable systemd-resolved
```

### DNS queries not reaching server

1. Verify NS records: `dig NS t.<DOMAIN>` → should return `tns.<DOMAIN>`
2. Verify A record: `dig A tns.<DOMAIN>` → should return `<SERVER_IP>`
3. Check firewall: `ufw status` → port 53/udp and 53/tcp must be allowed
4. Check router: `dnstm router status`

### Tunnel not connecting from client

1. Check tunnel is running: `dnstm tunnel list`
2. Check tunnel logs: `dnstm tunnel logs <name>`
3. Verify crypto material matches (pubkey/fingerprint)
4. Try a different tunnel type (slipstream vs dnstt)

### Slow speeds

DNS tunnels are inherently slow. Expected speeds:

- Slipstream: ~63 KB/s (~500 kbps)
- DNSTT: ~42 KB/s (~340 kbps)

This is normal. DNS tunnels are for emergency access only, not streaming.

## Scaling: DNS Tunnel Load Balancer (dns-tun-lb)

For multi-server deployments, **dns-tun-lb** by aleskxyz distributes dnstt clients across multiple backend `dnstt-server` instances using a stateless consistent-hash ring.

### Deployment Status: ✅ Installed (Standby)

dns-tun-lb is deployed on the server in **standby mode** — running but not on port 53.

| Item | Detail |
|---|---|
| **Binary** | `/usr/local/bin/dns-tun-lb` (built from source, Go 1.24.1) |
| **Source** | `/opt/dns-tun-lb/src/` |
| **Config** | `/opt/dns-tun-lb/lb.yaml` |
| **Service** | `systemctl status dns-tun-lb` (enabled, auto-start) |
| **Listen** | `127.0.0.1:5354` (standby — not intercepting traffic) |
| **Activation** | `/opt/dns-tun-lb/activate-lb.sh` |

**Why standby?** dnstm's built-in DNS router handles all tunnel types (dnstt + slipstream) on port 53. dns-tun-lb only supports dnstt, so activating it would break slipstream tunnels. It's pre-installed for instant scaling when adding more servers.

### Operational Commands

```bash
# Check status of both dns-tun-lb and dnstm router
/opt/dns-tun-lb/activate-lb.sh status

# Activate dns-tun-lb on port 53 (stops dnstm router)
/opt/dns-tun-lb/activate-lb.sh activate

# Deactivate dns-tun-lb back to standby (restarts dnstm router)
/opt/dns-tun-lb/activate-lb.sh deactivate

# View logs
journalctl -u dns-tun-lb -f

# Restart service
systemctl restart dns-tun-lb
```

### Current Config (`/opt/dns-tun-lb/lb.yaml`)

```yaml
global:
  listen_address: "127.0.0.1:5354"
  default_dns_behavior:
    mode: "forward"
    forward_resolver: "9.9.9.9:53"
protocols:
  dnstt:
    pools:
      - name: "dnstt-socks"
        domain_suffix: "t2.<DOMAIN>"
        backends:
          - id: "local-dnstt"
            address: "127.0.0.1:5311"
logging:
  level: "info"
```

### Overview

- **Repo**: [aleskxyz/dns-tun-lb](https://github.com/aleskxyz/dns-tun-lb) (Go, v0.1.0)
- **How**: LB sits in front of dnstt-servers on port 53/udp. Extracts 8-byte `ClientID` from dnstt DNS queries and consistently hashes it to a backend.
- **Stateless**: All LB nodes with the same config make the same routing decision — no coordination needed.
- **DNS trick**: Multiple NS records for the same tunnel subdomain → resolvers pick a random LB node.
- **Supports**: Up to 32+ backends per pool. Slipstream support planned.

### Scaling to Multiple Servers

1. Deploy dnstt-server on additional VPS nodes (each listening on e.g. `:5300`)
2. Add backends to `/opt/dns-tun-lb/lb.yaml`:

```yaml
protocols:
  dnstt:
    pools:
      - name: "dnstt-socks"
        domain_suffix: "t2.<DOMAIN>"
        backends:
          - id: "local-dnstt"
            address: "127.0.0.1:5311"
          - id: "server-2"
            address: "10.0.0.12:5300"
          - id: "server-3"
            address: "10.0.0.13:5300"
```

1. Activate dns-tun-lb on port 53:

```bash
/opt/dns-tun-lb/activate-lb.sh activate
```

1. (Optional) For HA, add more LB nodes with NS records:

```dns
tns1.<DOMAIN>.  IN  A   <LB-1-IP>
tns2.<DOMAIN>.  IN  A   <LB-2-IP>
t2.<DOMAIN>.    IN  NS  tns1.<DOMAIN>.
t2.<DOMAIN>.    IN  NS  tns2.<DOMAIN>.
```

### Important Limitations

- **dnstt only**: dns-tun-lb does not support slipstream protocol. When activated, slipstream tunnels (t.<DOMAIN>, s2.<DOMAIN>) need separate handling.
- **dnstm port constraint**: dnstm router only works on port 53 — cannot be moved to a non-standard port as a backend.
- **Docker image**: ghcr.io image requires auth; build from source instead (`go build -o /usr/local/bin/dns-tun-lb .`).

See [architecture.md](./architecture.md#scaling-dns-tunnel-load-balancer-dns-tun-lb) for the full architecture diagram.
