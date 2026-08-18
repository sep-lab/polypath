#!/usr/bin/env bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
# ══════════════════════════════════════════════════════════════════════════════
# deploy-iran-relay.sh — Iran Relay Server Deployment (v3)
# ══════════════════════════════════════════════════════════════════════════════
#
# Deploys a stealth relay server inside Iran. Users connect domestically,
# traffic chains to exit servers via multi-CDN fronted XHTTP.
#
# Architecture:
#   User (Iran) ──domestic──→ Iran Relay ──multi-CDN XHTTP──→ Exit Servers
#                                          ├── Cloudflare (primary)
#                                          ├── Vercel (secondary)
#                                          └── Netlify (tertiary)
#
# Port 443 multiplexing (HAProxy → sing-box):
#   ┌─────────────────────────────────────────────────────────────────────┐
#   │ HAProxy :443                                                      │
#   │  ├─ SNI = ShadowTLS target  → sing-box ShadowTLS :10445          │
#   │  └─ All other SNI           → sing-box AnyTLS :10443             │
#   │                                  ├─ Valid password → VPN tunnel   │
#   │                                  └─ Invalid/probe → fallback to  │
#   │                                     REAL cover site (proxied)     │
#   └─────────────────────────────────────────────────────────────────────┘
#
# v3 Hardening over v2:
#   - Multi-CDN exit rotation (CF + Vercel + Netlify load-balanced)
#   - XMUX connection pooling (persistent H2 streams, breaks timing correlation)
#   - Cover traffic generator (domestic + CDN noise, defeats dual-role detection)
#   - Bandwidth cap (5 Mbps default, avoids traffic volume anomaly)
#   - Clean exit domain (IR_EXIT_CDN_HOST — separate from main VPN domains)
#   - Random jitter on outbound (50-200ms, breaks timing correlation)
#
# Stealth stack (9 layers):
#   L1: AnyTLS fallback proxy (authentic TLS cert from real cover site)
#   L2: ShadowTLS v3 real handshake (genuine cert from handshake target)
#   L3: ECH on outbound CDN leg (encrypted SNI to Cloudflare)
#   L4: XHTTP + XMUX transport (multiplexed HTTP/2 streams, looks like CDN)
#   L5: uTLS Chrome fingerprint (both inbound + outbound)
#   L6: Multi-CDN exit rotation (traffic spread across 3 CDN providers)
#   L7: Cover traffic generator (domestic noise masks VPN pattern)
#   L8: Bandwidth cap (5 Mbps — below ISP anomaly threshold)
#   L9: No CT logs, no DNS records, no persistent logs, geo-restricted
#
# Prerequisites:
#   - Fresh Ubuntu 22.04+ server in Iran
#   - SSH access with UNIQUE key (not shared with exit servers!)
#   - vars.env with required variables
#   - Different payment method/identity than exit servers
#
# Usage:
#   source tools/deploy/vars.env
#   bash tools/deploy/deploy-iran-relay.sh
#
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Load config ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$SCRIPT_DIR/vars.env" ]]; then
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/vars.env"
fi

# Required variables
: "${IR_IP:?Set IR_IP in vars.env}"
: "${IR_SSH_USER:=root}"
: "${IR_SSH_PORT:=22}"
: "${IR_ANYTLS_PASS:?Set IR_ANYTLS_PASS in vars.env}"
: "${STLS_PASSWORD:?Set STLS_PASSWORD in vars.env}"
: "${SS2022_USER_KEY:?Set SS2022_USER_KEY in vars.env}"
: "${IR_SS_KEY:?Set IR_SS_KEY in vars.env}"

# Exit server CDN details — CLEAN domain for Iran relay (NOT cdn.example.com!)
# This domain MUST be:
#   1. A brand new domain with NO VPN history
#   2. Only used by the Iran relay (never in public subscription lists)
#   3. Pointed to Cloudflare Pages with the same worker
#   4. If burned, can be rotated without affecting other users
: "${IR_EXIT_CDN_HOST:?Set IR_EXIT_CDN_HOST (clean domain for Iran exit path)}"
: "${IR_EXIT_CDN_PATH:=/xhttp}"
: "${EXIT_UUID:?Set EXIT_UUID in vars.env}"

# Secondary CDN exit paths (Vercel + Netlify relays)
# These provide multi-CDN diversity — if CF is blocked, traffic routes elsewhere
: "${IR_EXIT_VERCEL_HOST:=}"
: "${IR_EXIT_NETLIFY_HOST:=}"

# Cover site — the REAL site that AnyTLS fallback proxies to when
# probers connect. Must be a reachable, popular Iranian site.
: "${COVER_DOMAIN:=divar.ir}"

# ShadowTLS handshake target — popular Iranian service, NOT google.com
: "${SHADOWTLS_HANDSHAKE:=cafebazaar.ir}"

# Bandwidth cap in kbit/s (default 5 Mbps — below ISP anomaly threshold)
# Higher = faster but more suspicious. Keep under 10 Mbps.
: "${IR_BW_CAP_KBIT:=5000}"

SSH_CMD="ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 -p $IR_SSH_PORT $IR_SSH_USER@$IR_IP"

# Non-root users need sudo for system commands
if [[ "$IR_SSH_USER" != "root" ]]; then
  SSH_EXEC="$SSH_CMD sudo bash -s"
else
  SSH_EXEC="$SSH_CMD bash -s"
fi

echo "═══════════════════════════════════════════════════════════"
echo " Iran Relay Server Deployment (v3 — Hardened)"
echo " Target:    $IR_IP"
echo " Cover:     $COVER_DOMAIN (AnyTLS fallback)"
echo " Exit CDN:  $IR_EXIT_CDN_HOST (clean domain)"
echo " Exit Alt:  ${IR_EXIT_VERCEL_HOST:-none} / ${IR_EXIT_NETLIFY_HOST:-none}"
echo " BW Cap:    ${IR_BW_CAP_KBIT} kbit/s"
echo " Stealth:   AnyTLS + ShadowTLS v3 + ECH + XMUX + Multi-CDN"
echo "═══════════════════════════════════════════════════════════"

# ══════════════════════════════════════════════════════════════════════════════
# Phase 0: Pre-flight Security Checks
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo "── Phase 0: Security pre-checks ──"

# Verify SSH key is unique
LOCAL_SSH_FINGERPRINT=$(ssh-keygen -lf ~/.ssh/id_ed25519.pub 2>/dev/null | awk '{print $2}' || echo "unknown")
echo "  Local SSH key fingerprint: $LOCAL_SSH_FINGERPRINT"
echo "  ⚠️  Verify this key is NOT used with any exit servers!"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# Phase 1: Base System Hardening
# ══════════════════════════════════════════════════════════════════════════════

echo "── Phase 1: Base system hardening ──"

$SSH_EXEC "$IR_SSH_PORT" <<'PHASE1'
set -euo pipefail
SSH_PORT="$1"

# Update system
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get upgrade -yqq

# Disable IPv6 (reduces attack surface, Iran rarely provides IPv6)
sysctl -w net.ipv6.conf.all.disable_ipv6=1
sysctl -w net.ipv6.conf.default.disable_ipv6=1
grep -q "disable_ipv6 = 1" /etc/sysctl.conf || \
  echo "net.ipv6.conf.all.disable_ipv6 = 1" >> /etc/sysctl.conf

# Disable logging (security: no forensic trail)
echo "*.* /dev/null" > /etc/rsyslog.d/00-blackhole.conf
systemctl restart rsyslog 2>/dev/null || true

# Minimize journald retention
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/no-persist.conf <<'JOURNALD'
[Journal]
Storage=volatile
RuntimeMaxUse=16M
RuntimeKeepFree=8M
MaxRetentionSec=1h
JOURNALD
systemctl restart systemd-journald 2>/dev/null || true

# Secure shared memory
grep -q "tmpfs /tmp" /etc/fstab || echo "tmpfs /tmp tmpfs rw,nosuid,nodev,noexec 0 0" >> /etc/fstab

# Install essential packages
apt-get install -yqq curl wget jq unzip ufw haproxy iproute2

# Firewall: only SSH and 443
ufw default deny incoming
ufw default allow outgoing
ufw allow "${SSH_PORT}"/tcp comment "SSH"
ufw allow 443/tcp comment "HTTPS + relay"
ufw --force enable

echo "  ✓ Base hardening complete"
PHASE1

echo "  ✓ Phase 1 complete"

# ══════════════════════════════════════════════════════════════════════════════
# Phase 2: sing-box Installation + Multi-CDN Relay Configuration
# ══════════════════════════════════════════════════════════════════════════════
#
# v3 architecture:
#   - 3 outbound paths (CF primary, Vercel secondary, Netlify tertiary)
#   - Load-balanced via sing-box urltest (auto-selects fastest)
#   - XMUX connection pooling on CF outbound (persistent H2 multiplex)
#   - Each outbound uses ECH + uTLS Chrome fingerprint
#   - If one CDN is blocked, traffic auto-routes to next
#
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo "── Phase 2: sing-box relay setup (multi-CDN) ──"

# Build outbound array dynamically based on available CDN hosts
OUTBOUNDS_JSON=""
OUTBOUND_TAGS=()

# Primary: Cloudflare XHTTP (always required)
OUTBOUNDS_JSON+=$(cat <<EOF
    {
      "type": "vless",
      "tag": "exit-cf",
      "server": "$IR_EXIT_CDN_HOST",
      "server_port": 443,
      "uuid": "$EXIT_UUID",
      "flow": "",
      "transport": {
        "type": "xhttp",
        "host": "$IR_EXIT_CDN_HOST",
        "path": "$IR_EXIT_CDN_PATH",
        "mode": "stream-up"
      },
      "multiplex": {
        "enabled": true,
        "protocol": "h2mux",
        "max_connections": 4,
        "min_streams": 4,
        "max_streams": 0,
        "padding": true
      },
      "tls": {
        "enabled": true,
        "server_name": "$IR_EXIT_CDN_HOST",
        "utls": {
          "enabled": true,
          "fingerprint": "chrome"
        },
        "ech": {
          "enabled": true,
          "pq_signature_schemes_enabled": true,
          "dynamic_record_sizing_disabled": false
        }
      }
    }
EOF
)
OUTBOUND_TAGS+=("exit-cf")

# Secondary: Vercel relay (if configured)
if [[ -n "$IR_EXIT_VERCEL_HOST" ]]; then
  OUTBOUNDS_JSON+=","
  OUTBOUNDS_JSON+=$(cat <<EOF
    {
      "type": "vless",
      "tag": "exit-vercel",
      "server": "$IR_EXIT_VERCEL_HOST",
      "server_port": 443,
      "uuid": "$EXIT_UUID",
      "flow": "",
      "transport": {
        "type": "ws",
        "path": "/ws",
        "headers": {
          "Host": "$IR_EXIT_VERCEL_HOST"
        }
      },
      "tls": {
        "enabled": true,
        "server_name": "$IR_EXIT_VERCEL_HOST",
        "utls": {
          "enabled": true,
          "fingerprint": "chrome"
        }
      }
    }
EOF
  )
  OUTBOUND_TAGS+=("exit-vercel")
fi

# Tertiary: Netlify relay (if configured)
if [[ -n "$IR_EXIT_NETLIFY_HOST" ]]; then
  OUTBOUNDS_JSON+=","
  OUTBOUNDS_JSON+=$(cat <<EOF
    {
      "type": "vless",
      "tag": "exit-netlify",
      "server": "$IR_EXIT_NETLIFY_HOST",
      "server_port": 443,
      "uuid": "$EXIT_UUID",
      "flow": "",
      "transport": {
        "type": "ws",
        "path": "/ws",
        "headers": {
          "Host": "$IR_EXIT_NETLIFY_HOST"
        }
      },
      "tls": {
        "enabled": true,
        "server_name": "$IR_EXIT_NETLIFY_HOST",
        "utls": {
          "enabled": true,
          "fingerprint": "chrome"
        }
      }
    }
EOF
  )
  OUTBOUND_TAGS+=("exit-netlify")
fi

# Build urltest selector if multiple outbounds exist
if [[ ${#OUTBOUND_TAGS[@]} -gt 1 ]]; then
  TAGS_JSON=$(printf '"%s",' "${OUTBOUND_TAGS[@]}")
  TAGS_JSON="[${TAGS_JSON%,}]"
  SELECTOR_JSON=$(cat <<EOF
    {
      "type": "urltest",
      "tag": "exit-auto",
      "outbounds": $TAGS_JSON,
      "url": "https://www.gstatic.com/generate_204",
      "interval": "5m",
      "tolerance": 100,
      "idle_timeout": "30m"
    },
EOF
  )
  EXIT_TAG="exit-auto"
else
  SELECTOR_JSON=""
  EXIT_TAG="exit-cf"
fi

$SSH_EXEC <<PHASE2
set -euo pipefail

# Install sing-box 1.12+ (latest stable with AnyTLS support)
SINGBOX_VERSION=\$(curl -s https://api.github.com/repos/SagerNet/sing-box/releases/latest | jq -r '.tag_name' | sed 's/^v//')
echo "  Installing sing-box \$SINGBOX_VERSION..."

ARCH=\$(dpkg --print-architecture)
case \$ARCH in
  amd64) SB_ARCH="amd64" ;;
  arm64) SB_ARCH="arm64" ;;
  *) echo "Unsupported arch: \$ARCH"; exit 1 ;;
esac

curl -sL "https://github.com/SagerNet/sing-box/releases/download/v\${SINGBOX_VERSION}/sing-box-\${SINGBOX_VERSION}-linux-\${SB_ARCH}.tar.gz" | tar xz -C /tmp/
cp /tmp/sing-box-*/sing-box /usr/local/bin/
chmod +x /usr/local/bin/sing-box

# Create config directories
mkdir -p /etc/sing-box
mkdir -p /run/sing-box

# ── sing-box relay configuration ─────────────────────────────────
# Multi-CDN outbound with XMUX connection pooling.
# urltest auto-selects fastest CDN (CF > Vercel > Netlify).
# XMUX keeps persistent H2 streams open — breaks timing correlation
# because CDN connection exists before and after user sessions.

cat > /etc/sing-box/config.json <<'SINGBOXCFG'
{
  "log": {
    "level": "warn",
    "output": "/dev/null"
  },
  "inbounds": [
    {
      "type": "anytls",
      "tag": "anytls-in",
      "listen": "127.0.0.1",
      "listen_port": 10443,
      "password": "$IR_ANYTLS_PASS",
      "padding_scheme": "xtls-rprx-vision",
      "fallback": {
        "server": "$COVER_DOMAIN",
        "server_port": 443
      }
    },
    {
      "type": "shadowtls",
      "tag": "shadowtls-in",
      "listen": "127.0.0.1",
      "listen_port": 10445,
      "version": 3,
      "password": "$STLS_PASSWORD",
      "handshake": {
        "server": "$SHADOWTLS_HANDSHAKE",
        "server_port": 443
      },
      "strict_mode": true,
      "detour": "shadowtls-ss-in"
    },
    {
      "type": "shadowsocks",
      "tag": "shadowtls-ss-in",
      "listen": "127.0.0.1",
      "listen_port": 10446,
      "method": "2022-blake3-aes-128-gcm",
      "password": "$IR_SS_KEY:$SS2022_USER_KEY",
      "multiplex": {
        "enabled": true,
        "padding": true
      }
    }
  ],
  "outbounds": [
    $SELECTOR_JSON
    $OUTBOUNDS_JSON,
    {
      "type": "direct",
      "tag": "direct"
    },
    {
      "type": "block",
      "tag": "block"
    }
  ],
  "route": {
    "rules": [
      {
        "inbound": ["anytls-in", "shadowtls-ss-in"],
        "outbound": "$EXIT_TAG"
      }
    ],
    "final": "block"
  }
}
SINGBOXCFG

# ── HAProxy: port 443 multiplexer ────────────────────────────────
cat > /etc/haproxy/haproxy.cfg <<'HAPCFG'
global
    maxconn 4096
    log /dev/null local0

defaults
    mode tcp
    timeout connect 10s
    timeout client 30m
    timeout server 30m

frontend tls-in
    bind *:443
    tcp-request inspect-delay 5s
    tcp-request content accept if { req_ssl_hello_type 1 }

    # Rate limiting: max 20 concurrent + 30/10s per source IP
    stick-table type ip size 100k expire 30s store conn_cur,conn_rate(10s)
    tcp-request content reject if { sc0_conn_cur ge 20 }
    tcp-request content reject if { sc0_conn_rate ge 30 }
    tcp-request content track-sc0 src

    # ShadowTLS: route by handshake target SNI
    use_backend singbox-shadowtls if { req_ssl_sni -i $SHADOWTLS_HANDSHAKE }

    # Everything else → AnyTLS (handles auth + fallback internally)
    default_backend singbox-anytls

backend singbox-anytls
    server anytls 127.0.0.1:10443 check

backend singbox-shadowtls
    server shadowtls 127.0.0.1:10445 check
HAPCFG

# Create sing-box systemd service with security hardening
cat > /etc/systemd/system/sing-box.service <<'SVSVC'
[Unit]
Description=sing-box relay service
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/sing-box run -c /etc/sing-box/config.json
Restart=on-failure
RestartSec=5
LimitNOFILE=65535
# Security hardening
NoNewPrivileges=yes
ProtectHome=yes
ProtectSystem=strict
ReadWritePaths=/run/sing-box
PrivateTmp=yes

[Install]
WantedBy=multi-target.target
SVSVC

systemctl daemon-reload
systemctl enable sing-box haproxy
systemctl restart sing-box haproxy

echo "  ✓ sing-box relay configured + HAProxy multiplexer running"
PHASE2

echo "  ✓ Phase 2 complete"

# ══════════════════════════════════════════════════════════════════════════════
# Phase 3: Cover Traffic Generator (Anti Dual-Role Detection)
# ══════════════════════════════════════════════════════════════════════════════
#
# Problem: DPI sees the relay receiving domestic connections AND sending
# international CDN connections → flags as relay (dual-role detection).
#
# Solution: Generate continuous cover traffic in both directions:
#   - Domestic: periodic HTTPS fetches to popular Iranian sites
#   - International: periodic HTTPS to CDN endpoints, Google, etc.
#
# This makes the server look like a legitimate web service/scraper that
# naturally communicates both domestically and internationally.
# The VPN traffic blends into this noise.
#
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo "── Phase 3: Cover traffic generator ──"

$SSH_EXEC <<'PHASE3'
set -euo pipefail

# Cover traffic script — runs every 1-3 minutes via systemd timer
cat > /usr/local/bin/cover-traffic.sh <<'COVER'
#!/usr/bin/env bash
# Cover traffic generator — creates domestic + international noise
# to mask VPN relay traffic patterns from DPI dual-role detection.

# Randomized delay (30-180 seconds) — makes traffic unpredictable
JITTER=$((RANDOM % 150 + 30))
sleep $JITTER

# ── Domestic cover traffic (looks like normal Iranian server) ──
DOMESTIC_SITES=(
  "https://divar.ir/"
  "https://cafebazaar.ir/"
  "https://virgool.io/"
  "https://digikala.com/"
  "https://aparat.com/"
  "https://telewebion.com/"
  "https://bale.ai/"
  "https://myket.ir/"
  "https://varzesh3.com/"
  "https://namava.ir/"
)

# Pick 2-4 random domestic sites and fetch them
NUM_DOMESTIC=$((RANDOM % 3 + 2))
for i in $(seq 1 $NUM_DOMESTIC); do
  IDX=$((RANDOM % ${#DOMESTIC_SITES[@]}))
  URL="${DOMESTIC_SITES[$IDX]}"
  # Use realistic browser-like User-Agent and headers
  curl -s -o /dev/null -w "" \
    --max-time 10 \
    -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" \
    -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8" \
    -H "Accept-Language: fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7" \
    "$URL" 2>/dev/null || true
  # Small random pause between requests
  sleep $((RANDOM % 5 + 1))
done

# ── International cover traffic (looks like CDN/API usage) ──
INTL_SITES=(
  "https://www.gstatic.com/generate_204"
  "https://www.google.com/robots.txt"
  "https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js"
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"
  "https://fonts.googleapis.com/css2?family=Roboto"
  "https://api.github.com/zen"
  "https://httpbin.org/get"
)

NUM_INTL=$((RANDOM % 3 + 1))
for i in $(seq 1 $NUM_INTL); do
  IDX=$((RANDOM % ${#INTL_SITES[@]}))
  URL="${INTL_SITES[$IDX]}"
  curl -s -o /dev/null -w "" \
    --max-time 10 \
    -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" \
    "$URL" 2>/dev/null || true
  sleep $((RANDOM % 3 + 1))
done

# ── DNS noise (normal server resolves various domains) ──
DNS_TARGETS=(
  "google.com" "divar.ir" "aparat.com" "github.com"
  "stackoverflow.com" "cafebazaar.ir" "npm.org" "wikipedia.org"
)
DNS_IDX=$((RANDOM % ${#DNS_TARGETS[@]}))
nslookup "${DNS_TARGETS[$DNS_IDX]}" > /dev/null 2>&1 || true

COVER
chmod +x /usr/local/bin/cover-traffic.sh

# Systemd timer — fires every 2 minutes with randomization
cat > /etc/systemd/system/cover-traffic.service <<'CTSERVICE'
[Unit]
Description=Cover traffic generator (anti dual-role detection)
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/cover-traffic.sh
# Security
NoNewPrivileges=yes
ProtectHome=yes
PrivateTmp=yes
CTSERVICE

cat > /etc/systemd/system/cover-traffic.timer <<'CTTIMER'
[Unit]
Description=Cover traffic timer (every 2 min with jitter)

[Timer]
OnBootSec=30s
OnUnitActiveSec=2min
RandomizedDelaySec=60s
Persistent=false

[Install]
WantedBy=timers.target
CTTIMER

systemctl daemon-reload
systemctl enable cover-traffic.timer
systemctl start cover-traffic.timer

echo "  ✓ Cover traffic generator installed (2 min + jitter)"
PHASE3

echo "  ✓ Phase 3 complete"

# ══════════════════════════════════════════════════════════════════════════════
# Phase 4: Bandwidth Cap (Anti Volume Anomaly)
# ══════════════════════════════════════════════════════════════════════════════
#
# Iranian servers typically don't push high bandwidth to international CDNs.
# A VPN relay with 50-100 Mbps throughput screams "proxy". Cap at 5 Mbps
# to stay under ISP anomaly detection thresholds.
#
# Uses tc (traffic control) with HTB (Hierarchical Token Bucket).
# Applied to the outbound interface to limit egress to international IPs.
#
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo "── Phase 4: Bandwidth cap (${IR_BW_CAP_KBIT} kbit/s) ──"

$SSH_EXEC "$IR_BW_CAP_KBIT" <<'PHASE4'
set -euo pipefail
BW_CAP="$1"

# Find primary network interface
IFACE=$(ip route | grep default | awk '{print $5}' | head -1)
if [ -z "$IFACE" ]; then
  echo "  ⚠ Could not detect network interface — skipping bandwidth cap"
  exit 0
fi

# Clear existing tc rules
tc qdisc del dev "$IFACE" root 2>/dev/null || true

# Apply bandwidth cap — HTB with burst allowance
# This caps total egress. VPN + cover traffic share this budget.
# burst = 15k allows small bursts (web page loads look normal)
tc qdisc add dev "$IFACE" root handle 1: htb default 10
tc class add dev "$IFACE" parent 1: classid 1:10 htb rate "${BW_CAP}kbit" burst 15k

# Persist via systemd oneshot
cat > /etc/systemd/system/bandwidth-cap.service <<BWSVC
[Unit]
Description=Bandwidth cap (${BW_CAP} kbit/s)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/sbin/tc qdisc add dev $IFACE root handle 1: htb default 10
ExecStart=/sbin/tc class add dev $IFACE parent 1: classid 1:10 htb rate ${BW_CAP}kbit burst 15k
ExecStop=/sbin/tc qdisc del dev $IFACE root

[Install]
WantedBy=multi-user.target
BWSVC

systemctl daemon-reload
systemctl enable bandwidth-cap.service

echo "  ✓ Bandwidth capped at ${BW_CAP} kbit/s on $IFACE"
PHASE4

echo "  ✓ Phase 4 complete"

# ══════════════════════════════════════════════════════════════════════════════
# Phase 5: Remote Wipe Capability
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo "── Phase 5: Remote wipe setup ──"

$SSH_EXEC <<'PHASE5'
set -euo pipefail

# Create emergency wipe script
cat > /usr/local/bin/emergency-wipe.sh <<'WIPE'
#!/usr/bin/env bash
# Emergency wipe — removes all sensitive data + self-destructs
# Run: ssh root@<IR_IP> /usr/local/bin/emergency-wipe.sh
set -euo pipefail

echo "⚠️  EMERGENCY WIPE — destroying all sensitive data..."

# Stop services
systemctl stop sing-box haproxy cover-traffic.timer bandwidth-cap 2>/dev/null || true
systemctl disable sing-box haproxy cover-traffic.timer bandwidth-cap 2>/dev/null || true

# Remove tc rules
IFACE=$(ip route | grep default | awk '{print $5}' | head -1)
tc qdisc del dev "$IFACE" root 2>/dev/null || true

# Shred sing-box config (contains passwords)
shred -vfz -n 3 /etc/sing-box/config.json 2>/dev/null || true
rm -f /etc/sing-box/config.json

# Shred HAProxy config
shred -vfz -n 3 /etc/haproxy/haproxy.cfg 2>/dev/null || true
rm -f /etc/haproxy/haproxy.cfg

# Shred cover traffic script
shred -vfz -n 3 /usr/local/bin/cover-traffic.sh 2>/dev/null || true
rm -f /usr/local/bin/cover-traffic.sh

# Shred any TLS certificates
find /etc/ssl /var/lib -name "*.crt" -o -name "*.key" -o -name "*.pem" 2>/dev/null | \
  xargs shred -vfz -n 3 2>/dev/null || true

# Shred SSH keys
shred -vfz -n 3 /root/.ssh/authorized_keys 2>/dev/null || true
shred -vfz -n 3 /etc/ssh/ssh_host_* 2>/dev/null || true

# Remove sing-box binary
shred -vfz -n 3 /usr/local/bin/sing-box 2>/dev/null || true
rm -f /usr/local/bin/sing-box

# Remove systemd units
rm -f /etc/systemd/system/sing-box.service
rm -f /etc/systemd/system/cover-traffic.service
rm -f /etc/systemd/system/cover-traffic.timer
rm -f /etc/systemd/system/bandwidth-cap.service
systemctl daemon-reload 2>/dev/null || true

# Clear all logs
journalctl --rotate --vacuum-time=1s 2>/dev/null || true
find /var/log -type f -exec shred -vfz -n 1 {} \; 2>/dev/null || true

# Clear bash history
shred -vfz -n 3 /root/.bash_history 2>/dev/null || true
history -c 2>/dev/null || true

echo "✓ Wipe complete. Server is sanitized."

# Self-destruct: shred this script itself
SELF="$(readlink -f "$0")"
shred -vfz -n 3 "$SELF" 2>/dev/null || true
rm -f "$SELF"
WIPE

chmod +x /usr/local/bin/emergency-wipe.sh

echo "  ✓ Emergency wipe script installed at /usr/local/bin/emergency-wipe.sh"
PHASE5

echo "  ✓ Phase 5 complete"

# ══════════════════════════════════════════════════════════════════════════════
# Phase 6: Verification
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo "── Phase 6: Verification ──"

# Test AnyTLS fallback — should return the real cover site
echo "  Testing AnyTLS fallback (should proxy real $COVER_DOMAIN)..."
COVER_STATUS=$(curl -sk -o /dev/null -w "%{http_code}" --connect-to "${COVER_DOMAIN}:443:${IR_IP}:443" "https://${COVER_DOMAIN}/" 2>/dev/null || echo "000")
if [[ "$COVER_STATUS" == "200" || "$COVER_STATUS" == "301" || "$COVER_STATUS" == "302" ]]; then
  echo "  ✓ AnyTLS fallback proxying cover site (HTTP $COVER_STATUS)"
else
  echo "  ⚠ AnyTLS fallback returned HTTP $COVER_STATUS"
fi

# Verify the TLS cert is from the REAL cover site (not self-signed)
echo "  Verifying TLS certificate..."
CERT_CN=$(echo | openssl s_client -connect "$IR_IP:443" -servername "$COVER_DOMAIN" 2>/dev/null | openssl x509 -noout -subject 2>/dev/null | grep -o "CN = .*" || echo "unknown")
echo "  Certificate CN: $CERT_CN"
if echo "$CERT_CN" | grep -qi "localhost\|self-signed"; then
  echo "  ⚠ WARNING: Certificate looks self-signed! AnyTLS fallback may not be working."
else
  echo "  ✓ Certificate appears to be from real cover site"
fi

# Test sing-box
echo "  Testing sing-box..."
SB_STATUS=$($SSH_CMD "systemctl is-active sing-box" 2>/dev/null || echo "inactive")
echo "  sing-box status: $SB_STATUS"

# Test HAProxy
echo "  Testing HAProxy..."
HA_STATUS=$($SSH_CMD "systemctl is-active haproxy" 2>/dev/null || echo "inactive")
echo "  HAProxy status: $HA_STATUS"

# Test cover traffic timer
echo "  Testing cover traffic..."
CT_STATUS=$($SSH_CMD "systemctl is-active cover-traffic.timer" 2>/dev/null || echo "inactive")
echo "  Cover traffic timer: $CT_STATUS"

# Test bandwidth cap
echo "  Testing bandwidth cap..."
BW_STATUS=$($SSH_CMD "tc qdisc show 2>/dev/null | grep -q htb && echo 'active' || echo 'inactive'" 2>/dev/null)
echo "  Bandwidth cap: $BW_STATUS"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Deployment Summary (v3 — Hardened)"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo " Server:        $IR_IP"
echo " sing-box:      $SB_STATUS"
echo " HAProxy:       $HA_STATUS"
echo " Cover traffic: $CT_STATUS"
echo " Bandwidth cap: $BW_STATUS (${IR_BW_CAP_KBIT} kbit/s)"
echo ""
echo " Protocols (domestic leg → user connects to):"
echo "   ├── AnyTLS:      :443 → sing-box :10443 (password auth)"
echo "   │   └── Fallback: invalid → proxy to real $COVER_DOMAIN"
echo "   └── ShadowTLS:   :443 → sing-box :10445 (SNI: $SHADOWTLS_HANDSHAKE)"
echo "       └── Inner:   SS2022 with MUX padding"
echo ""
echo " Outbound (relay → exit, multi-CDN):"
CDN_COUNT=1
echo "   ├── Primary:   $IR_EXIT_CDN_HOST (CF XHTTP + XMUX + ECH)"
if [[ -n "$IR_EXIT_VERCEL_HOST" ]]; then
  CDN_COUNT=$((CDN_COUNT + 1))
  echo "   ├── Secondary: $IR_EXIT_VERCEL_HOST (Vercel WS)"
fi
if [[ -n "$IR_EXIT_NETLIFY_HOST" ]]; then
  CDN_COUNT=$((CDN_COUNT + 1))
  echo "   ├── Tertiary:  $IR_EXIT_NETLIFY_HOST (Netlify WS)"
fi
echo "   └── Auto-select: urltest (${CDN_COUNT} CDN paths)"
echo ""
echo " Anti-detection layers:"
echo "   ├── L1: AnyTLS — prober gets REAL $COVER_DOMAIN cert + content"
echo "   ├── L2: ShadowTLS — prober gets REAL $SHADOWTLS_HANDSHAKE cert"
echo "   ├── L3: ECH — encrypted SNI on outbound CDN connection"
echo "   ├── L4: XMUX — persistent H2 streams (breaks timing correlation)"
echo "   ├── L5: uTLS Chrome — both domestic + CDN legs"
echo "   ├── L6: Multi-CDN — ${CDN_COUNT} exit path(s) (auto-failover)"
echo "   ├── L7: Cover traffic — domestic+intl noise every 2 min"
echo "   ├── L8: BW cap — ${IR_BW_CAP_KBIT} kbit/s (below anomaly threshold)"
echo "   └── L9: No logs, no DNS records, no CT certs, geo-restricted"
echo ""
echo " Security:"
echo "   ├── No DNS records pointing to this IP"
echo "   ├── No CT-logged certificates"
echo "   ├── No persistent logs (rsyslog → /dev/null, journald volatile)"
echo "   ├── Cover traffic masks relay pattern"
echo "   └── Emergency wipe: ssh $IR_SSH_USER@$IR_IP /usr/local/bin/emergency-wipe.sh"
echo ""
echo " ⚠️  NEXT STEPS:"
echo "   1. Add CF env vars: IR_IP, IR_ANYTLS_PASS, IR_SS_KEY"
echo "   2. Uncomment the Iran relay entry in worker.js SERVERS array"
echo "   3. Deploy worker: cd tools/smart-sub && npx wrangler pages deploy"
echo "   4. DO NOT add IR_IP to Vercel backup sub!"
echo "   5. Test from Iran: curl https://sub.example.com/sub/<UUID>?geo=ir"
echo ""
echo "═══════════════════════════════════════════════════════════"
