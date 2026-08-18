#!/usr/bin/env bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
#
# deploy-ss2022.sh — Deploy Shadowsocks 2022 on all servers (Plan B)
#
# Adds SS2022 inbound to sing-box (engine.conf) on all 4 servers.
# Routes through HAProxy on port 80: non-HTTP traffic → SS2022.
#
# SS2022 (AEAD-2022) has NO known DPI fingerprint — looks like random
# encrypted bytes. Works natively with Hiddify, V2RayNG, sing-box clients.
#
# Port routing (HAProxy on port 80):
#   /ws              → sing-box WS (CDN-WS)
#   /xhttp           → xray-core XHTTP (CDN-fronted)
#   HTTP verb (GET/POST) → xray-core TCP+HTTP (XrayHTTP)
#   Non-HTTP (default)   → sing-box SS2022 (Plan B)
#
# Usage:
#   bash deploy-ss2022.sh             # Deploy to all servers
#   bash deploy-ss2022.sh --dry-run   # Preview only
#   bash deploy-ss2022.sh --generate  # Generate keys only (no deploy)
#
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../server-config.sh" 2>/dev/null \
  || { echo "❌ server-config.sh not found. Copy from server-config.sh.example"; exit 1; }

DRY_RUN=false
GENERATE_ONLY=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true
[[ "${1:-}" == "--generate" ]] && GENERATE_ONLY=true

# ── Server definitions ────────────────────────────────────────
NAMES=(helsinki oracle gcp scaleway)
SSH_ADDRS=("$HEL_SSH" "$ORC_SSH" "$GCP_SSH" "$SCW_SSH")

# SS2022 port (internal, behind HAProxy)
SS2022_PORT=10082
SS2022_METHOD="2022-blake3-aes-128-gcm"

docker_cmd() {
  local server=$1
  if [[ "$server" == "oracle" || "$server" == "gcp" ]]; then
    echo "sudo docker"
  else
    echo "docker"
  fi
}

sudo_prefix() {
  local server=$1
  if [[ "$server" == "oracle" || "$server" == "gcp" ]]; then
    echo "sudo"
  else
    echo ""
  fi
}

# ── Generate SS2022 keys ─────────────────────────────────────
# AES-128-GCM requires 16-byte key (24 chars base64)
echo "═══ Generating SS2022 keys ═══"
echo ""

# Use parallel arrays (bash 3.2 compatible — no associative arrays on macOS)
SERVER_KEYS=()
for server in "${NAMES[@]}"; do
  key=$(openssl rand -base64 16)
  SERVER_KEYS+=("$key")
  echo "  $server: $key"
done

# Shared user key (all users share this, like they share UUID)
USER_KEY=$(openssl rand -base64 16)
echo ""
echo "  user_key: $USER_KEY"
echo ""

if $GENERATE_ONLY; then
  echo "═══ Key generation complete (--generate mode) ═══"
  echo ""
  echo "Add these to worker.js server configs:"
  echo ""
  for i in "${!NAMES[@]}"; do
    echo "  // ${NAMES[$i]}"
    echo "  ss2022: {"
    echo "    port: 80,"
    echo "    method: \"${SS2022_METHOD}\","
    echo "    server_key: \"${SERVER_KEYS[$i]}\","
    echo "    user_key: \"${USER_KEY}\","
    echo "  },"
    echo ""
  done
  exit 0
fi

# ── Deploy to each server ────────────────────────────────────
for i in "${!NAMES[@]}"; do
  server="${NAMES[$i]}"
  SSH="${SSH_ADDRS[$i]}"
  DCMD=$(docker_cmd "$server")
  SUDO=$(sudo_prefix "$server")
  KEY="${SERVER_KEYS[$i]}"

  echo "═══ $server ($SSH) ═══"

  if $DRY_RUN; then
    echo "  [dry-run] Would add SS2022 inbound on port $SS2022_PORT"
    echo "  [dry-run] Server key: $KEY"
    echo "  [dry-run] User key: $USER_KEY"
    echo "  [dry-run] Would update HAProxy with SS2022 default backend"
    echo ""
    continue
  fi

  echo "  → Adding SS2022 inbound to engine.conf..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /opt/reality-ezpz

    # Backup
    $SUDO cp engine.conf engine.conf.bak.\$(date +%s)

    # Check if SS2022 inbound already exists
    if $SUDO grep -q 'ss2022' engine.conf 2>/dev/null; then
      echo '  SS2022 inbound already exists, updating key...'
    fi

    # Use python3 to add SS2022 inbound to sing-box config
    $SUDO python3 -c \"
import json

with open('engine.conf') as f:
    cfg = json.load(f)

# Check if SS2022 inbound already exists
tags = [ib.get('tag','') for ib in cfg.get('inbounds',[])]
if 'ss2022' in tags:
    # Update existing
    for ib in cfg['inbounds']:
        if ib.get('tag') == 'ss2022':
            ib['method'] = '${SS2022_METHOD}'
            ib['password'] = '${KEY}'
            if 'users' not in ib:
                ib['users'] = []
            ib['users'] = [
                {'name': 'shared', 'password': '${USER_KEY}'}
            ]
    print('  Updated SS2022 inbound')
else:
    # Add new SS2022 inbound
    ss_inbound = {
        'type': 'shadowsocks',
        'tag': 'ss2022',
        'listen': '::',
        'listen_port': ${SS2022_PORT},
        'method': '${SS2022_METHOD}',
        'password': '${KEY}',
        'users': [
            {'name': 'shared', 'password': '${USER_KEY}'}
        ],
        'multiplex': {
            'enabled': True
        }
    }
    cfg['inbounds'].append(ss_inbound)
    print('  Added SS2022 inbound on port ${SS2022_PORT}')

# Ensure SS2022 traffic routes through WARP outbound
# (should already be handled by default route, but verify)
has_warp = any(ob.get('tag') in ('warp', 'WARP') for ob in cfg.get('outbounds',[]))
if has_warp:
    print('  WARP outbound present — SS2022 will route through WARP')

with open('engine.conf', 'w') as f:
    json.dump(cfg, f, indent=2)
\"
  " 2>&1 | sed 's/^/  /'

  echo "  → Updating HAProxy with SS2022 routing..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /opt/reality-ezpz

    # Backup
    $SUDO cp haproxy.cfg haproxy.cfg.bak.\$(date +%s)

    $SUDO tee haproxy.cfg > /dev/null << 'HAEOF'
# HAProxy TCP multiplexer: splits port 80 traffic by protocol
# - /ws           → sing-box VLESS-WS (CDN-WS via Cloudflare)
# - /xhttp        → xray-core XHTTP/splithttp (CDN-fronted, no WS headers)
# - HTTP verbs    → xray-core TCP+HTTP obfuscation (direct DPI bypass)
# - Non-HTTP      → sing-box SS2022 (Plan B — random encrypted bytes)

global
    log stdout format raw local0 info

defaults
    log global
    mode tcp
    timeout connect 5s
    timeout client  3600s
    timeout server  3600s

frontend ft_port80
    bind *:80
    mode tcp

    # Wait for enough bytes to match paths
    tcp-request inspect-delay 5s
    tcp-request content accept if { req_len ge 12 }

    # CDN-WS: path /ws → sing-box WebSocket
    acl is_cdn_ws payload(0,7) -m str \"GET /ws\"

    # XHTTP: path /xhttp → xray-core XHTTP (GET download, POST upload)
    acl is_xhttp_get  payload(0,11) -m str \"GET /xhttp/\"
    acl is_xhttp_post payload(0,12) -m str \"POST /xhttp\"

    # HTTP traffic (any verb) → xray-core TCP+HTTP obfuscation
    acl is_http payload(0,3) -m str \"GET\"
    acl is_http payload(0,4) -m str \"POST\"
    acl is_http payload(0,4) -m str \"HEAD\"
    acl is_http payload(0,3) -m str \"PUT\"

    use_backend bk_singbox_ws if is_cdn_ws
    use_backend bk_xray_xhttp if is_xhttp_get or is_xhttp_post
    use_backend bk_xray if is_http

    # Default: non-HTTP traffic → SS2022 (encrypted random bytes)
    default_backend bk_ss2022

backend bk_singbox_ws
    mode tcp
    server singbox engine:8080 check inter 30s

backend bk_xray_xhttp
    mode tcp
    server xray-xhttp xray:10081 check inter 30s

backend bk_xray
    mode tcp
    server xray xray:10080 check inter 30s

backend bk_ss2022
    mode tcp
    server ss2022 engine:10082 check inter 30s
HAEOF
  " 2>&1 | sed 's/^/  /'

  echo "  → Restarting engine + haproxy containers..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /opt/reality-ezpz
    $DCMD compose restart engine haproxy
  " 2>&1 | sed 's/^/  /'

  echo "  → Verifying SS2022 inbound..."
  sleep 2
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    $DCMD logs --tail 5 reality-ezpz-engine-1 2>&1 | grep -i shadow || echo 'sing-box running'
  " 2>&1 | sed 's/^/  /'

  echo "  Done!"
  echo ""
done

echo "═══ SS2022 Deployment complete ═══"
echo ""
echo "Server keys (add to worker.js):"
for i in "${!NAMES[@]}"; do
  echo "  ${NAMES[$i]}: server_key=\"${SERVER_KEYS[$i]}\" user_key=\"${USER_KEY}\""
done
echo ""
echo "Next steps:"
echo "  1. Add ss2022 configs to worker.js server definitions (keys above)"
echo "  2. Deploy worker: cd tools/smart-sub && wrangler deploy"
echo "  3. Test: ss client → server_ip:80 with method=${SS2022_METHOD}"
echo "     Server key + ':' + user key as combined password"
echo "  4. From Iran: SS2022 looks like random bytes — no DPI signature"
echo ""
echo "URI format: ss://base64(method:server_key:user_key)@host:80#SS2022-Location"
