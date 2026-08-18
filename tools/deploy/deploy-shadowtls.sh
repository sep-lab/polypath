#!/usr/bin/env bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
#
# deploy-shadowtls.sh — Deploy ShadowTLS v3 + SS2022 on servers
#
# ShadowTLS performs a REAL TLS handshake with a target website (e.g., google.com),
# then hijacks the connection for proxy traffic. Active probing sees a real site.
# v3 adds strict mode with replay attack + active probing resistance.
#
# Chain: Client → ShadowTLS v3 (TLS to google.com) → SS2022 (inner proxy)
# DPI sees: genuine TLS 1.3 handshake with google.com
# Active probe: google.com responds normally
#
# Architecture:
#   Port 10443/tcp → ShadowTLS v3 wrapper → SS2022 backend (port 10082)
#   Both run inside sing-box (engine.conf)
#
# Requirements:
#   - sing-box 1.2+ (ShadowTLS v3 support)
#   - SS2022 already deployed (deploy-ss2022.sh)
#
# Client support:
#   - Hiddify (sing-box): native ShadowTLS v3 support
#   - NekoBox: native support
#   - V2RayNG: does NOT support ShadowTLS
#
# Usage:
#   bash deploy-shadowtls.sh                     # Deploy to helsinki + scaleway
#   bash deploy-shadowtls.sh helsinki             # Deploy to one server
#   bash deploy-shadowtls.sh --dry-run            # Preview only
#
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../server-config.sh" 2>/dev/null \
  || { echo "❌ server-config.sh not found. Copy from server-config.sh.example"; exit 1; }

DRY_RUN=false
TARGET="${1:-recommended}"
[[ "$TARGET" == "--dry-run" ]] && { DRY_RUN=true; TARGET="recommended"; }
[[ "${2:-}" == "--dry-run" ]] && DRY_RUN=true

# Deploy to Helsinki + Scaleway by default (two different providers for resilience)
if [[ "$TARGET" == "recommended" ]]; then
  DEPLOY_SERVERS=(helsinki scaleway)
elif [[ "$TARGET" == "all" ]]; then
  DEPLOY_SERVERS=(helsinki oracle gcp scaleway)
else
  DEPLOY_SERVERS=("$TARGET")
fi

# ── Server mapping ────────────────────────────────────────────

docker_cmd() {
  case "$1" in
    oracle|gcp) echo "sudo docker" ;;
    *) echo "docker" ;;
  esac
}

sudo_prefix() {
  case "$1" in
    oracle|gcp) echo "sudo" ;;
    *) echo "" ;;
  esac
}

# ── ShadowTLS Configuration ──────────────────────────────────
STLS_PORT=10443  # External port — clients connect here
STLS_HANDSHAKE="www.google.com:443"  # Site to perform real TLS handshake with
STLS_VERSION=3   # ShadowTLS protocol version (v3 = strict mode)

# ShadowTLS v3 password (shared secret between client and server)
# Must be the same for all servers so subscription configs work everywhere
# Set in vars.env — see vars.env.example
SCRIPT_DIR_STLS="$(cd "$(dirname "$0")" && pwd)"
[[ -f "$SCRIPT_DIR_STLS/vars.env" ]] && source "$SCRIPT_DIR_STLS/vars.env"
STLS_PASSWORD="${STLS_PASSWORD:?Set STLS_PASSWORD in vars.env}"

# SS2022 backend port (must match deploy-ss2022.sh)
SS2022_BACKEND_PORT=10082

echo "═══════════════════════════════════════════════════"
echo "  ShadowTLS v3 + SS2022 Deployment"
echo "  Port: ${STLS_PORT}/tcp"
echo "  Handshake: ${STLS_HANDSHAKE}"
echo "  Servers: ${DEPLOY_SERVERS[*]}"
echo "═══════════════════════════════════════════════════"
echo ""

# SS2022 keys per server (must match the existing deployment)
# Set in vars.env — see vars.env.example
get_ss2022_key() {
  case "$1" in
    helsinki)  echo "${SS2022_KEY_HELSINKI:?Set SS2022_KEY_HELSINKI in vars.env}" ;;
    oracle)   echo "${SS2022_KEY_ORACLE:?Set SS2022_KEY_ORACLE in vars.env}" ;;
    gcp)      echo "${SS2022_KEY_GCP:?Set SS2022_KEY_GCP in vars.env}" ;;
    scaleway) echo "${SS2022_KEY_SCALEWAY:?Set SS2022_KEY_SCALEWAY in vars.env}" ;;
  esac
}
SS2022_USER_KEY="${SS2022_USER_KEY:?Set SS2022_USER_KEY in vars.env}"
SS2022_METHOD="2022-blake3-aes-128-gcm"

for server in "${DEPLOY_SERVERS[@]}"; do
  SSH=$(get_ssh "$server")
  DCMD=$(docker_cmd "$server")
  SUDO=$(sudo_prefix "$server")
  SS_KEY=$(get_ss2022_key "$server")

  echo "═══ $server ($SSH) ═══"

  if $DRY_RUN; then
    echo "  [dry-run] Would add ShadowTLS v3 inbound on port ${STLS_PORT}/tcp"
    echo "  [dry-run] Would chain with SS2022 backend on port ${SS2022_BACKEND_PORT}"
    echo "  [dry-run] Would open UFW port ${STLS_PORT}/tcp"
    echo ""
    continue
  fi

  echo "  → Opening firewall port..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    $SUDO ufw allow ${STLS_PORT}/tcp comment 'ShadowTLS v3' 2>/dev/null || true
    echo '[OK] Port ${STLS_PORT}/tcp opened'
  " 2>&1 | sed 's/^/  /'

  echo "  → Adding ShadowTLS v3 inbound to engine.conf (sing-box)..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /opt/reality-ezpz

    $SUDO cp engine.conf engine.conf.bak.\$(date +%s) 2>/dev/null || true

    $SUDO python3 -c \"
import json, sys

with open('engine.conf') as f:
    cfg = json.load(f)

existing_tags = [ib.get('tag','') for ib in cfg.get('inbounds',[])]

# === ShadowTLS v3 Inbound (wrapper) ===
if 'shadowtls-in' not in existing_tags:
    stls_inbound = {
        'type': 'shadowtls',
        'tag': 'shadowtls-in',
        'listen': '::',
        'listen_port': ${STLS_PORT},
        'version': ${STLS_VERSION},
        'users': [
            {
                'name': 'vpnuser',
                'password': '${STLS_PASSWORD}'
            }
        ],
        'handshake': {
            'server': 'www.google.com',
            'server_port': 443
        },
        'strict_mode': True,
        'detour': 'shadowtls-ss2022-in'
    }
    cfg['inbounds'].append(stls_inbound)
    print('  Added ShadowTLS v3 inbound on port ${STLS_PORT}')
else:
    print('  ShadowTLS v3 inbound already exists')

# === SS2022 detour for ShadowTLS (dedicated inner listener) ===
if 'shadowtls-ss2022-in' not in existing_tags:
    ss_inner = {
        'type': 'shadowsocks',
        'tag': 'shadowtls-ss2022-in',
        'listen': '127.0.0.1',
        'listen_port': ${SS2022_BACKEND_PORT} + 1,
        'method': '${SS2022_METHOD}',
        'password': '${SS_KEY}',
        'users': [
            {'name': 'user', 'password': '${SS2022_USER_KEY}'}
        ],
        'multiplex': {
            'enabled': True,
            'padding': True
        }
    }
    cfg['inbounds'].append(ss_inner)
    print('  Added ShadowTLS SS2022 inner listener on port ${SS2022_BACKEND_PORT} + 1')
else:
    print('  ShadowTLS SS2022 inner already exists')

# Ensure route rules handle new inbounds
for rule in cfg.get('route', {}).get('rules', []):
    ib = rule.get('inbound')
    if isinstance(ib, list) and 'in' in ib:
        for tag in ['shadowtls-in', 'shadowtls-ss2022-in']:
            if tag not in ib:
                ib.append(tag)
    elif ib == 'in':
        rule['inbound'] = ['in', 'shadowtls-in', 'shadowtls-ss2022-in']

with open('engine.conf', 'w') as f:
    json.dump(cfg, f, indent=2)
print('  Config saved')
\"
  " 2>&1 | sed 's/^/  /'

  echo "  → Updating docker-compose.yml with ShadowTLS port..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /opt/reality-ezpz

    if ! grep -q '${STLS_PORT}:${STLS_PORT}/tcp' docker-compose.yml; then
      $SUDO sed -i '/443:443\/tcp/a\      - \"${STLS_PORT}:${STLS_PORT}/tcp\"' docker-compose.yml
      echo '  Added port mapping ${STLS_PORT}/tcp'
    else
      echo '  Port mapping already exists'
    fi
  " 2>&1 | sed 's/^/  /'

  echo "  → Restarting sing-box engine..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /opt/reality-ezpz
    $DCMD compose restart engine 2>/dev/null || \
    $DCMD compose up -d 2>/dev/null
    sleep 2
    echo '[OK] Engine restarted'
  " 2>&1 | sed 's/^/  /'

  echo "  Done!"
  echo ""
done

echo "═══ ShadowTLS v3 Deployment Complete ═══"
echo ""
echo "Client config (sing-box / Hiddify format):"
echo "  Server: SERVER_IP:${STLS_PORT}"
echo "  Type: ShadowTLS v3"
echo "  Password: ${STLS_PASSWORD}"
echo "  Handshake server: www.google.com:443"
echo "  Inner: SS2022 (${SS2022_METHOD})"
echo ""
echo "Note: ShadowTLS uses a composite config format."
echo "  Hiddify supports it natively via sing-box config."
echo "  V2RayNG does NOT support ShadowTLS."
