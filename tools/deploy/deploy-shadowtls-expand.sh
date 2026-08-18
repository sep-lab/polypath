#!/usr/bin/env bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
#
# deploy-shadowtls-expand.sh — Extend ShadowTLS v3 + SS2022 to Oracle & GCP servers
#
# This script extends the existing ShadowTLS v3 deployment (deploy-shadowtls.sh)
# to the Oracle (Madrid) and GCP (Dammam) servers. The original script deploys
# to Helsinki + Scaleway only.
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
#   - SS2022 already deployed on Oracle & GCP (deploy-ss2022.sh)
#   - vars.env with STLS_PASSWORD, SS2022_KEY_ORACLE, SS2022_KEY_GCP, SS2022_USER_KEY
#
# Usage:
#   bash deploy-shadowtls-expand.sh               # Deploy to oracle + gcp
#   bash deploy-shadowtls-expand.sh oracle         # Deploy to oracle only
#   bash deploy-shadowtls-expand.sh gcp            # Deploy to gcp only
#   bash deploy-shadowtls-expand.sh --dry-run      # Preview only
#
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../server-config.sh" 2>/dev/null \
  || { echo "❌ server-config.sh not found. Copy from server-config.sh.example"; exit 1; }

DRY_RUN=false
TARGET="${1:-all}"
[[ "$TARGET" == "--dry-run" ]] && { DRY_RUN=true; TARGET="all"; }
[[ "${2:-}" == "--dry-run" ]] && DRY_RUN=true

# Only Oracle and GCP — Helsinki + Scaleway are handled by deploy-shadowtls.sh
if [[ "$TARGET" == "all" ]]; then
  DEPLOY_SERVERS=(oracle gcp)
else
  case "$TARGET" in
    oracle|gcp) DEPLOY_SERVERS=("$TARGET") ;;
    *) echo "❌ Invalid target '$TARGET'. Use: oracle, gcp, all, or --dry-run"; exit 1 ;;
  esac
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
[[ -f "$SCRIPT_DIR/vars.env" ]] && source "$SCRIPT_DIR/vars.env"
STLS_PASSWORD="${STLS_PASSWORD:?Set STLS_PASSWORD in vars.env}"

# SS2022 backend port (must match deploy-ss2022.sh)
SS2022_BACKEND_PORT=10082

echo "═══════════════════════════════════════════════════"
echo "  ShadowTLS v3 Expansion — Oracle & GCP"
echo "  Port: ${STLS_PORT}/tcp"
echo "  Handshake: ${STLS_HANDSHAKE}"
echo "  Servers: ${DEPLOY_SERVERS[*]}"
echo "═══════════════════════════════════════════════════"
echo ""

# SS2022 keys per server (must match the existing deployment)
get_ss2022_key() {
  case "$1" in
    oracle)   echo "${SS2022_KEY_ORACLE:?Set SS2022_KEY_ORACLE in vars.env}" ;;
    gcp)      echo "${SS2022_KEY_GCP:?Set SS2022_KEY_GCP in vars.env}" ;;
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

    $SUDO python3 -c \"
import yaml
with open('docker-compose.yml') as f:
    c = yaml.safe_load(f)
ports = c['services']['engine'].get('ports', [])
mapping = '${STLS_PORT}:${STLS_PORT}'
if mapping not in ports and mapping + '/tcp' not in ports:
    ports.append(mapping)
    c['services']['engine']['ports'] = ports
    with open('docker-compose.yml', 'w') as f:
        yaml.dump(c, f, default_flow_style=False, sort_keys=False)
    print('  Added port mapping ${STLS_PORT}')
else:
    print('  Port mapping already exists')
\"
  " 2>&1 | sed 's/^/  /'

  echo "  → Recreating sing-box engine with new port..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /opt/reality-ezpz
    $DCMD compose up -d --force-recreate engine 2>/dev/null || \
    $DCMD compose up -d 2>/dev/null
    sleep 2
    echo '[OK] Engine restarted'
  " 2>&1 | sed 's/^/  /'

  echo "  Done!"
  echo ""
done

echo "═══ ShadowTLS v3 Expansion Complete ═══"
echo ""
echo "Client config (sing-box / Hiddify format):"
echo "  Server: SERVER_IP:${STLS_PORT}"
echo "  Type: ShadowTLS v3"
echo "  Password: ${STLS_PASSWORD}"
echo "  Handshake server: www.google.com:443"
echo "  Inner: SS2022 (${SS2022_METHOD})"
echo ""
echo "Note: Update worker.js server definitions to set"
echo "  has_shadowtls: true for Oracle and GCP servers."
echo ""
echo "Next steps:"
echo "  1. Verify: ssh to each server and check 'ss -tlnp | grep ${STLS_PORT}'"
echo "  2. Update worker.js: set has_shadowtls: true for ORC + GCP"
echo "  3. Test from Iran: add ShadowTLS configs to Hiddify"
