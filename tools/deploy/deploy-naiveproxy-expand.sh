#!/usr/bin/env bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
#
# deploy-naiveproxy-expand.sh — Deploy naiveproxy to additional servers
#
# naiveproxy is currently only on Scaleway (web4.example.com:2087).
# This expands it to Helsinki and Oracle for redundancy.
#
# naiveproxy uses Chrome's actual TLS/HTTP stack — DPI cannot distinguish
# it from real Chrome browsing. Combined with ECH (future), it becomes
# the most undetectable transport possible.
#
# WARNING from sing-box 1.13: "uTLS is NOT recommended for censorship
# circumvention." NaiveProxy (real Chrome TLS) is the recommended alternative.
#
# Pre-requisites for each server:
#   1. DNS-only (grey cloud) A record pointing to server IP:
#      - Helsinki: web.example.com → <HEL_IP>
#      - Oracle:   web2.example.com → <ORC_IP>
#   2. Cloud firewall allows port 2087/tcp
#
# Usage:
#   bash deploy-naiveproxy-expand.sh              # Deploy to helsinki + oracle
#   bash deploy-naiveproxy-expand.sh helsinki      # Deploy to one server
#   bash deploy-naiveproxy-expand.sh --dry-run    # Preview only
#
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../server-config.sh" 2>/dev/null \
  || { echo "❌ server-config.sh not found. Copy from server-config.sh.example"; exit 1; }

DRY_RUN=false
TARGET="${1:-expand}"
[[ "$TARGET" == "--dry-run" ]] && { DRY_RUN=true; TARGET="expand"; }
[[ "${2:-}" == "--dry-run" ]] && DRY_RUN=true

# Expand targets (Scaleway already has naive deployed)
if [[ "$TARGET" == "expand" ]]; then
  DEPLOY_SERVERS=(helsinki oracle)
else
  DEPLOY_SERVERS=("$TARGET")
fi

NAIVE_PORT=2087
NAIVE_USER="vpnuser"
ADMIN_EMAIL="admin@example.com"

# ── Server mapping ────────────────────────────────────────────

get_domain() {
  case "$1" in
    helsinki)  echo "web.example.com" ;;
    oracle)   echo "web2.example.com" ;;
    gcp)      echo "web3.example.com" ;;
    scaleway) echo "web4.example.com" ;;
  esac
}

sudo_prefix() {
  case "$1" in
    oracle|gcp) echo "sudo" ;;
    *) echo "" ;;
  esac
}

docker_cmd() {
  case "$1" in
    oracle|gcp) echo "sudo docker" ;;
    *) echo "docker" ;;
  esac
}

echo "═══════════════════════════════════════════════════"
echo "  NaiveProxy Expansion"
echo "  Servers: ${DEPLOY_SERVERS[*]}"
echo "  Port: ${NAIVE_PORT}/tcp"
echo "═══════════════════════════════════════════════════"
echo ""

for server in "${DEPLOY_SERVERS[@]}"; do
  SSH=$(get_ssh "$server")
  DOMAIN=$(get_domain "$server")
  SUDO=$(sudo_prefix "$server")
  DCMD=$(docker_cmd "$server")

  # Generate a unique random password per server.
  # NEVER derive this from predictable inputs — a deterministic scheme means
  # anyone who can read this script can compute every server's password.
  NAIVE_PASS=$(openssl rand -hex 16)

  echo "═══ $server ($SSH) ═══"
  echo "  Domain: $DOMAIN"
  echo "  Auth:   $NAIVE_USER:$NAIVE_PASS"
  echo ""

  if $DRY_RUN; then
    echo "  [dry-run] Would deploy naiveproxy"
    echo "  [dry-run] DNS: $DOMAIN → $(echo $SSH | cut -d@ -f2) (DNS-only, grey cloud)"
    echo "  [dry-run] URI: naive+https://$NAIVE_USER:$NAIVE_PASS@$DOMAIN:$NAIVE_PORT#Naive-$(echo "$server" | sed 's/./\U&/')"
    echo ""
    continue
  fi

  echo "  → Creating naiveproxy directory structure..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    $SUDO mkdir -p /opt/naiveproxy/www
    $SUDO mkdir -p /opt/naiveproxy/data
    $SUDO mkdir -p /opt/naiveproxy/config

    # Camouflage website
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
  <footer><small>&copy; 2026 Infrastructure Team</small></footer>
</body>
</html>
HTMLEOF

    # Caddyfile with forwardproxy
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

    # Dockerfile for Caddy + naive forwardproxy
    $SUDO tee /opt/naiveproxy/Dockerfile > /dev/null << 'DKEOF'
FROM caddy:builder AS builder
RUN xcaddy build \\
  --with github.com/caddyserver/forwardproxy=github.com/klzgrad/forwardproxy@naive

FROM caddy:latest
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
DKEOF

    # docker-compose.yml
    $SUDO tee /opt/naiveproxy/docker-compose.yml > /dev/null << DCEOF
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
    echo '[OK] Files created'
  " 2>&1 | sed 's/^/  /'

  echo "  → Building Caddy with naive forwardproxy (~2 min)..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /opt/naiveproxy
    $DCMD compose build --no-cache 2>&1 | tail -5
  " 2>&1 | sed 's/^/  /'

  echo "  → Opening port ${NAIVE_PORT}/tcp..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    $SUDO ufw allow ${NAIVE_PORT}/tcp comment 'naiveproxy' 2>/dev/null || true
    echo '[OK] Port opened'
  " 2>&1 | sed 's/^/  /'

  echo "  → Starting naiveproxy..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /opt/naiveproxy
    $DCMD compose up -d 2>&1 | tail -3
  " 2>&1 | sed 's/^/  /'

  echo "  → Verifying..."
  sleep 3
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    $DCMD logs naiveproxy --tail 5 2>&1
  " 2>&1 | sed 's/^/  /'

  echo ""
  echo "  URI: naive+https://$NAIVE_USER:$NAIVE_PASS@$DOMAIN:$NAIVE_PORT#Naive-$(echo "$server" | sed 's/./\U&/')"
  echo "  Done!"
  echo ""
done

echo "═══ NaiveProxy Expansion Complete ═══"
echo ""
echo "DNS records needed (DNS-only, grey cloud in Cloudflare):"
for server in "${DEPLOY_SERVERS[@]}"; do
  DOMAIN=$(get_domain "$server")
  SSH=$(get_ssh "$server")
  IP=$(echo "$SSH" | cut -d@ -f2)
  echo "  $DOMAIN → $IP (A record, DNS-only)"
done
echo ""
echo "Update worker.js with new naive configs per server."
echo "Passwords are randomly generated per server — record the values printed above."
