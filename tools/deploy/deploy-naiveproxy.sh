#!/usr/bin/env bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
#
# deploy-naiveproxy.sh — Deploy naiveproxy (Caddy + forwardproxy) on one server
#
# naiveproxy uses Chrome's actual TLS/HTTP network stack. DPI literally cannot
# distinguish it from normal Chrome HTTPS browsing. #1 bypass in Chinese community.
#
# IMPORTANT: naiveproxy requires direct TLS (NOT through Cloudflare CDN).
# The domain must be DNS-only (grey cloud) pointing to the server IP.
# Caddy handles TLS via Let's Encrypt + serves a real website as camouflage.
#
# Client support:
#   - NekoBox (sing-box): native naive:// support
#   - Standalone naive client: https://github.com/nickoala/nickoala
#   - Hiddify: does NOT support naive natively (use NekoBox instead)
#
# Architecture:
#   Client → web.example.com:443 (TLS, Chrome fingerprint)
#            → Caddy (forwardproxy plugin, Let's Encrypt cert)
#            → Internet (via WARP or direct)
#
# Usage:
#   bash deploy-naiveproxy.sh scaleway       # Deploy to Scaleway (recommended)
#   bash deploy-naiveproxy.sh helsinki        # Deploy to Helsinki
#   bash deploy-naiveproxy.sh --dry-run scaleway  # Preview only
#
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../server-config.sh" 2>/dev/null \
  || { echo "❌ server-config.sh not found. Copy from server-config.sh.example"; exit 1; }

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && { DRY_RUN=true; shift; }

TARGET="${1:-scaleway}"

# ── Server mapping (bash 3.2 compatible) ─────────────────────

get_domain() {
  case "$1" in
    helsinki) echo "web.example.com" ;;
    oracle)  echo "web2.example.com" ;;
    gcp)     echo "web3.example.com" ;;
    scaleway) echo "web4.example.com" ;;
    *) echo "" ;;
  esac
}

SSH=$(get_ssh "$TARGET")
DOMAIN=$(get_domain "$TARGET")

if [[ -z "$SSH" ]]; then
  echo "Unknown server: $TARGET"
  echo "Usage: $0 [--dry-run] <helsinki|oracle|gcp|scaleway>"
  exit 1
fi

# ── Credentials ───────────────────────────────────────────────
# naiveproxy uses basic auth (user:pass) for client authentication
NAIVE_USER="vpnuser"
NAIVE_PASS=$(openssl rand -hex 16)
ADMIN_EMAIL="admin@example.com"
NAIVE_PORT=2087  # Cloudflare-compatible HTTPS alt port (avoids conflict with Reality on 443)

SUDO=""
DCMD="docker"
if [[ "$TARGET" == "oracle" || "$TARGET" == "gcp" ]]; then
  SUDO="sudo"
  DCMD="sudo docker"
fi

echo "═══ naiveproxy deployment: $TARGET ($SSH) ═══"
echo ""
echo "  Domain:   $DOMAIN (must be DNS-only/grey cloud in Cloudflare)"
echo "  Port:     $NAIVE_PORT/tcp (HTTPS with Let's Encrypt)"
echo "  Auth:     $NAIVE_USER:$NAIVE_PASS"
echo "  Email:    $ADMIN_EMAIL (for Let's Encrypt)"
echo ""

if $DRY_RUN; then
  echo "[dry-run] Would deploy naiveproxy to $TARGET"
  echo ""
  echo "Pre-requisites:"
  echo "  1. Create DNS record: $DOMAIN → server IP (DNS-only, grey cloud)"
  echo "  2. Open port $NAIVE_PORT/tcp in cloud firewall"
  echo "  3. Open port $NAIVE_PORT/tcp in UFW: ufw allow $NAIVE_PORT/tcp"
  echo ""
  echo "Client URI:"
  echo "  naive+https://$NAIVE_USER:$NAIVE_PASS@$DOMAIN:$NAIVE_PORT#Naive-$(echo "$TARGET" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')"
  exit 0
fi

echo "  → Creating naiveproxy directory and configs..."
ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
  $SUDO mkdir -p /opt/naiveproxy/www
  $SUDO mkdir -p /opt/naiveproxy/data
  $SUDO mkdir -p /opt/naiveproxy/config

  # Create a simple camouflage website
  $SUDO tee /opt/naiveproxy/www/index.html > /dev/null << 'HTMLEOF'
<!DOCTYPE html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\">
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
  <title>Welcome</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 20px; color: #333; }
    h1 { color: #2c3e50; }
    p { line-height: 1.6; color: #666; }
    .status { background: #e8f5e9; padding: 12px; border-radius: 4px; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>Server Status</h1>
  <div class=\"status\">All systems operational.</div>
  <p>This page serves as a status endpoint for our monitoring infrastructure.</p>
  <p>For API documentation, please contact the system administrator.</p>
  <footer><small>&copy; 2026 Infrastructure Team</small></footer>
</body>
</html>
HTMLEOF

  # Create Caddyfile with naiveproxy forwardproxy
  $SUDO tee /opt/naiveproxy/config/Caddyfile > /dev/null << CADDYEOF
{
  order forward_proxy before file_server
  admin off
  log {
    output stdout
    level INFO
  }
}

:${NAIVE_PORT}, ${DOMAIN}:${NAIVE_PORT} {
  tls ${ADMIN_EMAIL}

  forward_proxy {
    basic_auth ${NAIVE_USER} ${NAIVE_PASS}
    hide_ip
    hide_via
    probe_resistance
  }

  file_server {
    root /srv/www
  }
}
CADDYEOF

  # Create Dockerfile for Caddy with naive forwardproxy
  $SUDO tee /opt/naiveproxy/Dockerfile > /dev/null << 'DKEOF'
FROM caddy:builder AS builder
RUN xcaddy build \
  --with github.com/caddyserver/forwardproxy=github.com/klzgrad/forwardproxy@naive

FROM caddy:latest
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
DKEOF

  # Create docker-compose for naiveproxy
  $SUDO tee /opt/naiveproxy/docker-compose.yml > /dev/null << 'DCEOF'
services:
  naive:
    build: .
    container_name: naiveproxy
    restart: unless-stopped
    ports:
      - \"${NAIVE_PORT}:${NAIVE_PORT}\"
    volumes:
      - ./config/Caddyfile:/etc/caddy/Caddyfile:ro
      - ./www:/srv/www:ro
      - ./data:/data
    command: caddy run --config /etc/caddy/Caddyfile
DCEOF
" 2>&1 | sed 's/^/  /'

echo "  → Building Caddy with naive forwardproxy plugin (this takes ~2 min)..."
ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
  cd /opt/naiveproxy
  $DCMD compose build --no-cache 2>&1 | tail -5
" 2>&1 | sed 's/^/  /'

echo "  → Opening port $NAIVE_PORT in UFW..."
ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
  $SUDO ufw allow ${NAIVE_PORT}/tcp comment 'naiveproxy' 2>&1 || true
" 2>&1 | sed 's/^/  /'

echo "  → Starting naiveproxy..."
ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
  cd /opt/naiveproxy
  $DCMD compose up -d
" 2>&1 | sed 's/^/  /'

echo "  → Verifying naiveproxy is running..."
sleep 3
ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
  $DCMD logs naiveproxy --tail 5 2>&1
" 2>&1 | sed 's/^/  /'

echo ""
echo "═══ naiveproxy deployment complete ═══"
echo ""
echo "Pre-requisites (if not done):"
echo "  1. Create DNS record (DNS-only, grey cloud):"
echo "     $DOMAIN → $(echo $SSH | cut -d@ -f2)"
echo "  2. Open port $NAIVE_PORT/tcp in cloud provider firewall"
echo "     (Hetzner/Oracle/GCP/Scaleway console)"
echo ""
echo "Client URI (for NekoBox / standalone naive client):"
echo "  naive+https://$NAIVE_USER:$NAIVE_PASS@$DOMAIN:$NAIVE_PORT#Naive-$(echo "$TARGET" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')"
echo ""
echo "Worker.js config:"
echo "  naive: {"
echo "    host: \"$DOMAIN\","
echo "    port: $NAIVE_PORT,"
echo "    user: \"$NAIVE_USER\","
echo "    pass: \"$NAIVE_PASS\","
echo "  },"
echo ""
echo "NOTE: Hiddify does NOT support naive:// natively."
echo "      Users need NekoBox or standalone naive client."
echo "      See docs/guides/client-setup.md for alternatives."
