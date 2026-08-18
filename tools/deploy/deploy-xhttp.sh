#!/usr/bin/env bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
#
# deploy-xhttp.sh — Add XHTTP (splithttp) inbound to xray-core on all servers
#
# This adds a second xray-core inbound for XHTTP transport, routed through
# Cloudflare CDN. Combined with HAProxy path routing, this gives us:
#   /ws     → sing-box WS (CDN-WS)
#   /xhttp  → xray-core XHTTP (CDN-fronted, no WebSocket headers)
#   /       → xray-core TCP+HTTP (direct DPI bypass)
#
# Also updates XrayHTTP host headers per-server for rotation.
#
# Usage: bash deploy-xhttp.sh [--dry-run]
#

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../server-config.sh" 2>/dev/null \
  || { echo "❌ server-config.sh not found. Copy from server-config.sh.example"; exit 1; }

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

# ── Server definitions (parallel arrays) ────────────────────────
NAMES=(helsinki oracle gcp scaleway)
SSH_ADDRS=("$HEL_SSH" "$ORC_SSH" "$GCP_SSH" "$SCW_SSH")
XRAY_HOSTS=("telewebion.com" "myket.ir" "aparat.com" "divar.ir")

docker_cmd() {
  local server=$1
  if [[ "$server" == "oracle" || "$server" == "gcp" ]]; then
    echo "sudo docker"
  else
    echo "docker"
  fi
}

for i in "${!NAMES[@]}"; do
  server="${NAMES[$i]}"
  SSH="${SSH_ADDRS[$i]}"
  DCMD=$(docker_cmd "$server")
  HOST="${XRAY_HOSTS[$i]}"

  echo "═══ $server ($SSH) ═══"

  if $DRY_RUN; then
    echo "  [dry-run] Would add XHTTP inbound on port 10081"
    echo "  [dry-run] Would update XrayHTTP host to: $HOST"
    echo "  [dry-run] Would update HAProxy with /xhttp routing"
    echo ""
    continue
  fi

  # Determine if we need sudo for file operations
  SUDO=""
  if [[ "$server" == "oracle" || "$server" == "gcp" ]]; then
    SUDO="sudo"
  fi

  echo "  → Adding XHTTP inbound to xray-config.json..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /opt/reality-ezpz

    # Backup current config
    $SUDO cp xray-config.json xray-config.json.bak.\$(date +%s)

    # Use python3 to add XHTTP inbound + update host rotation
    $SUDO python3 -c \"
import json, sys

with open('xray-config.json') as f:
    cfg = json.load(f)

# Check if XHTTP inbound already exists
tags = [ib.get('tag','') for ib in cfg.get('inbounds',[])]
if 'vless-xhttp' in tags:
    print('  XHTTP inbound already exists, skipping add')
else:
    # Get clients from existing inbound
    clients = cfg['inbounds'][0]['settings']['clients']

    # Add XHTTP inbound
    xhttp_inbound = {
        'tag': 'vless-xhttp',
        'listen': '0.0.0.0',
        'port': 10081,
        'protocol': 'vless',
        'settings': {
            'clients': clients,
            'decryption': 'none'
        },
        'streamSettings': {
            'network': 'xhttp',
            'xhttpSettings': {
                'path': '/xhttp',
                'mode': 'auto'
            }
        }
    }
    cfg['inbounds'].append(xhttp_inbound)
    print('  Added XHTTP inbound on port 10081')

# Update XrayHTTP host header for rotation
host = '$HOST'
for ib in cfg['inbounds']:
    if ib.get('tag') == 'vless-tcp-http':
        tcp = ib.get('streamSettings',{}).get('tcpSettings',{})
        hdr = tcp.get('header',{})
        req = hdr.get('request',{})
        headers = req.get('headers',{})
        old_host = headers.get('Host',[''])[0]
        headers['Host'] = [host]
        print(f'  Updated XrayHTTP host: {old_host} → {host}')

with open('xray-config.json', 'w') as f:
    json.dump(cfg, f, indent=2)
\"
  " 2>&1 | sed 's/^/  /'

  echo "  → Updating HAProxy config with XHTTP routing..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /opt/reality-ezpz

    # Backup
    $SUDO cp haproxy.cfg haproxy.cfg.bak.\$(date +%s)

    $SUDO tee haproxy.cfg > /dev/null << 'HAEOF'
# HAProxy TCP multiplexer: splits port 80 traffic
# - /ws     → sing-box VLESS-WS (CDN-WS via Cloudflare)
# - /xhttp  → xray-core XHTTP/splithttp (CDN-fronted, no WS headers)
# - /       → xray-core TCP+HTTP obfuscation (direct DPI bypass)

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

    # Wait for enough bytes to match longest path prefix
    tcp-request inspect-delay 5s
    tcp-request content accept if { req_len ge 12 }

    # CDN-WS: path /ws → sing-box WebSocket
    acl is_cdn_ws payload(0,7) -m str \"GET /ws\"

    # XHTTP: path /xhttp → xray-core XHTTP (GET for download, POST for upload)
    acl is_xhttp_get  payload(0,11) -m str \"GET /xhttp/\"
    acl is_xhttp_post payload(0,12) -m str \"POST /xhttp\"

    use_backend bk_singbox_ws if is_cdn_ws
    use_backend bk_xray_xhttp if is_xhttp_get or is_xhttp_post

    # Default: xray-core TCP+HTTP obfuscation (path /)
    default_backend bk_xray

backend bk_singbox_ws
    mode tcp
    server singbox engine:8080 check inter 30s

backend bk_xray_xhttp
    mode tcp
    server xray-xhttp xray:10081 check inter 30s

backend bk_xray
    mode tcp
    server xray xray:10080 check inter 30s
HAEOF
  " 2>&1 | sed 's/^/  /'

  echo "  → Restarting xray + haproxy containers..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /opt/reality-ezpz
    $DCMD compose restart xray haproxy
  " 2>&1 | sed 's/^/  /'

  echo "  → Verifying XHTTP inbound is listening..."
  sleep 2
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    $DCMD logs --tail 5 reality-ezpz-xray-1 2>&1 | tail -3
  " 2>&1 | sed 's/^/  /'

  echo "  Done!"
  echo ""
done

echo "═══ Deployment complete ═══"
echo ""
echo "Pre-requisites (Cloudflare DNS — do once before testing):"
echo "  Create these A records (Proxied/orange cloud) in Cloudflare dashboard:"
echo "    cdn.example.com  → $HEL_IP  (Helsinki)    — already exists"
echo "    cdn2.example.com → $ORC_IP  (Oracle)      — already exists"
echo "    cdn3.example.com → $SCW_IP   (Scaleway)    — already exists"
echo "    cdn4.example.com → $GCP_IP      (GCP)         — NEW: create this"
echo ""
echo "  The existing CF SSL rule 'starts_with(http.host, \"cdn\")' → Flexible SSL"
echo "  already covers cdn4 — no new rules needed."
echo ""
echo "Next steps:"
echo "  1. Create cdn4.example.com DNS record (see above)"
echo "  2. Deploy worker v2.7: cd tools/smart-sub && wrangler deploy"
echo "  3. Verify XHTTP from outside:"
echo "     curl -s -o /dev/null -w '%{http_code}' https://cdn.example.com/xhttp/"
echo "     curl -s -o /dev/null -w '%{http_code}' https://cdn4.example.com/xhttp/"
echo "  4. Test from Iran: refresh subscription in Hiddify, try XHTTP-CDN-* configs"
echo "  5. Premium users now get 20 configs (4 XHTTP-CDN + 4 XrayHTTP + 4 Reality + 4 Hy2 + 4 CDN-WS)"
