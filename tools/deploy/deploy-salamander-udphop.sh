#!/usr/bin/env bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
#
# deploy-salamander-udphop.sh — Enable Salamander UDP mask + port hopping for Hysteria2
#
# Salamander: Wraps Hysteria2/QUIC packets to obscure the QUIC fingerprint.
#   DPI sees random-looking UDP packets instead of QUIC Initial handshake.
#
# UDP Hop (port hopping): Client changes dst port every 30s across a range.
#   Server listens on 20000-50000/udp. Makes port-based blocking impractical.
#
# Combined: Hysteria2 + Salamander + UDP hop = fast UDP tunnel that's very hard
# to fingerprint or block.
#
# Requires: Xray-core v26.1.23+ on server, Hiddify/sing-box client support
#
# Current Hy2 setup (sing-box engine.conf):
#   hy2-in on port 8444 (mapped to host 8443), self-signed cert, single port
#
# New setup:
#   - Keep existing hy2-in on 8443 for backward compatibility
#   - Add xray-core Hy2 listener with Salamander on port range 20000-50000
#   - Client URI includes obfs=salamander and hop range
#
# Usage:
#   bash deploy-salamander-udphop.sh             # Deploy all servers
#   bash deploy-salamander-udphop.sh helsinki     # Deploy one server
#   bash deploy-salamander-udphop.sh --dry-run   # Preview only
#
set -eo pipefail

# ── Source vars.env if present ──────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[[ -f "$SCRIPT_DIR/vars.env" ]] && source "$SCRIPT_DIR/vars.env"
source "$SCRIPT_DIR/../server-config.sh" 2>/dev/null \
  || { echo "❌ server-config.sh not found. Copy from server-config.sh.example"; exit 1; }

DRY_RUN=false
TARGET="${1:-all}"
[[ "$TARGET" == "--dry-run" ]] && { DRY_RUN=true; TARGET="all"; }
[[ "${2:-}" == "--dry-run" ]] && DRY_RUN=true

UUID="${UUID:?Set UUID in vars.env (see vars.env.example)}"

# ── Server definitions ────────────────────────────────────────
NAMES=(helsinki oracle gcp scaleway)
SSH_ADDRS=("$HEL_SSH" "$ORC_SSH" "$GCP_SSH" "$SCW_SSH")
SNIS=("www.google.com" "dl.google.com" "www.google.com" "www.microsoft.com")

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

# Salamander + UDP hop config
SALAMANDER_PASSWORD="${SALAMANDER_PASSWORD:?Set SALAMANDER_PASSWORD in vars.env}"  # Shared obfuscation password
HOP_PORT_MIN=20000
HOP_PORT_MAX=50000
HY2_SALAMANDER_PORT=20000  # Server binds to this, client hops across range

echo "═══════════════════════════════════════════════════"
echo "  Salamander + UDP Hop for Hysteria2"
echo "  Port range: ${HOP_PORT_MIN}-${HOP_PORT_MAX}/udp"
echo "  Obfs: salamander (password: ${SALAMANDER_PASSWORD})"
echo "═══════════════════════════════════════════════════"
echo ""

for i in "${!NAMES[@]}"; do
  server="${NAMES[$i]}"
  SSH="${SSH_ADDRS[$i]}"
  DCMD=$(docker_cmd "$server")
  SUDO=$(sudo_prefix "$server")
  SNI="${SNIS[$i]}"

  if [[ "$TARGET" != "all" && "$TARGET" != "$server" ]]; then
    continue
  fi

  echo "═══ $server ($SSH) ═══"

  if $DRY_RUN; then
    echo "  [dry-run] Would open UDP ports ${HOP_PORT_MIN}-${HOP_PORT_MAX}"
    echo "  [dry-run] Would add Hysteria2 + Salamander inbound to xray-config.json"
    echo "  [dry-run] Would update docker-compose.yml port ranges"
    echo ""
    continue
  fi

  echo "  → Opening UDP port range for hop..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    # Open the full hop range
    $SUDO ufw allow ${HOP_PORT_MIN}:${HOP_PORT_MAX}/udp comment 'Hy2 UDP hop' 2>/dev/null || true
    echo '[OK] UFW: opened ${HOP_PORT_MIN}-${HOP_PORT_MAX}/udp'

    # For Oracle Cloud: also open in iptables (security list may need manual update)
    if command -v iptables &>/dev/null; then
      $SUDO iptables -I INPUT -p udp --dport ${HOP_PORT_MIN}:${HOP_PORT_MAX} -j ACCEPT 2>/dev/null || true
    fi
  " 2>&1 | sed 's/^/  /'

  echo "  → Adding Hysteria2 + Salamander inbound to xray-config.json..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /opt/reality-ezpz

    # Backup
    $SUDO cp xray-config.json xray-config.json.bak.\$(date +%s) 2>/dev/null || true

    $SUDO python3 -c \"
import json, sys

try:
    with open('xray-config.json') as f:
        cfg = json.load(f)
except FileNotFoundError:
    print('ERROR: xray-config.json not found')
    sys.exit(1)

existing_tags = [ib.get('tag','') for ib in cfg.get('inbounds',[])]

if 'hy2-salamander' not in existing_tags:
    # Hysteria2 inbound with Salamander obfuscation
    # Uses the existing self-signed cert from sing-box hy2
    hy2_inbound = {
        'tag': 'hy2-salamander',
        'listen': '0.0.0.0',
        'port': ${HY2_SALAMANDER_PORT},
        'protocol': 'hysteria2',
        'settings': {
            'users': [
                {'password': '${UUID}'}
            ]
        },
        'streamSettings': {
            'network': 'hysteria2',
            'hysteria2Settings': {
                'password': '${SALAMANDER_PASSWORD}',
                'congestion': {
                    'type': 'bbr'
                }
            },
            'security': 'tls',
            'tlsSettings': {
                'certificates': [{
                    'certificateFile': '/etc/sing-box/hy2.crt',
                    'keyFile': '/etc/sing-box/hy2.key'
                }],
                'alpn': ['h3']
            }
        }
    }
    cfg['inbounds'].append(hy2_inbound)
    print('  Added Hysteria2 + Salamander inbound on port ${HY2_SALAMANDER_PORT}')
else:
    print('  Hysteria2 + Salamander inbound already exists, skipping')

# Add routing for new inbound
for rule in cfg.get('routing', {}).get('rules', []):
    inbound_tag = rule.get('inboundTag')
    if isinstance(inbound_tag, list) and 'hy2-salamander' not in inbound_tag:
        inbound_tag.append('hy2-salamander')

with open('xray-config.json', 'w') as f:
    json.dump(cfg, f, indent=2)
print('  Config saved')
\"
  " 2>&1 | sed 's/^/  /'

  echo "  → Updating docker-compose.yml with UDP port range..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /opt/reality-ezpz

    # Add UDP port range mapping for Hy2 hop
    if ! grep -q '${HOP_PORT_MIN}-${HOP_PORT_MAX}' docker-compose.yml; then
      $SUDO sed -i '/8443:8444\/udp/a\      - \"${HOP_PORT_MIN}-${HOP_PORT_MAX}:${HOP_PORT_MIN}-${HOP_PORT_MAX}/udp\"' docker-compose.yml 2>/dev/null || \
      $SUDO sed -i '/443:443\/tcp/a\      - \"${HOP_PORT_MIN}-${HOP_PORT_MAX}:${HOP_PORT_MIN}-${HOP_PORT_MAX}/udp\"' docker-compose.yml 2>/dev/null || true
      echo '  Added UDP port range mapping'
    else
      echo '  UDP port range already mapped'
    fi

    # Mount hy2 certs for xray container (if not already mounted)
    if ! grep -q 'hy2.crt' docker-compose.yml 2>/dev/null; then
      echo '  WARNING: hy2 certs may not be mounted for xray container'
      echo '  Ensure xray service has volume: ./certs/hy2.crt:/etc/sing-box/hy2.crt:ro'
    fi
  " 2>&1 | sed 's/^/  /'

  echo "  → Restarting containers..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /opt/reality-ezpz
    $DCMD compose down 2>/dev/null || true
    $DCMD compose up -d 2>/dev/null
    sleep 3
    echo '[OK] Containers restarted'
  " 2>&1 | sed 's/^/  /'

  echo "  Done!"
  echo ""
done

echo "═══ Salamander + UDP Hop Deployment Complete ═══"
echo ""
echo "Client URI format (Hysteria2 + Salamander + hop):"
echo "  hy2://UUID@SERVER_IP:${HOP_PORT_MIN}?insecure=1&sni=SNI&obfs=salamander&obfs-password=${SALAMANDER_PASSWORD}&hop=${HOP_PORT_MIN}-${HOP_PORT_MAX}&hop-interval=30#Hy2-Hop-Location"
echo ""
echo "Notes:"
echo "  - Original Hy2 on port 8443 still works (backward compatible)"
echo "  - Salamander configs need Xray-core / Hiddify v2.5+ on client"
echo "  - UDP hop changes port every 30 seconds"
echo "  - If ISP blocks UDP entirely, these won't work (use XHTTP-CDN instead)"
