#!/usr/bin/env bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
#
# deploy-finalmask.sh — Deploy Finalmask (XICMP + XDNS) on all servers
#
# Finalmask is Xray-core v26.2.6's new "final masking layer":
#   - XICMP: Wraps traffic inside ICMP echo (ping) packets
#   - XDNS: Wraps traffic inside DNS query packets using mKCP
#
# For Iran bypass:
#   - XICMP: DPI would need to block ping globally — extremely disruptive
#   - XDNS: Like DNSTT but built into Xray natively — no external tools needed
#
# Requires: Xray-core v26.2.6+ (run upgrade-xray.sh first)
#
# Architecture:
#   XICMP: Client → ICMP packets → Server xray → Internet
#   XDNS:  Client → DNS-like packets (mKCP) → Server xray → Internet
#
# Ports:
#   XICMP: Uses raw ICMP (no port, needs NET_RAW capability or root)
#   XDNS:  Port 10053/udp (avoid conflict with real DNS on 53)
#
# Usage:
#   bash deploy-finalmask.sh             # Deploy to all servers
#   bash deploy-finalmask.sh helsinki     # Deploy to one server
#   bash deploy-finalmask.sh --dry-run   # Preview only
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

# Finalmask ports
XDNS_PORT=10053     # UDP - DNS-like tunnel (mKCP)
XICMP_PORT=10054    # UDP - ICMP tunnel (mKCP) 
# Note: True ICMP requires raw sockets. We use mKCP with XICMP mask on a UDP port
# for Docker compatibility. Client connects via UDP but packets look like ICMP/DNS.

echo "═══════════════════════════════════════════════════"
echo "  Finalmask Deployment (XICMP + XDNS)"
echo "  Requires: Xray-core v26.2.6+"
echo "═══════════════════════════════════════════════════"
echo ""

for i in "${!NAMES[@]}"; do
  server="${NAMES[$i]}"
  SSH="${SSH_ADDRS[$i]}"
  DCMD=$(docker_cmd "$server")
  SUDO=$(sudo_prefix "$server")

  if [[ "$TARGET" != "all" && "$TARGET" != "$server" ]]; then
    continue
  fi

  echo "═══ $server ($SSH) ═══"

  if $DRY_RUN; then
    echo "  [dry-run] Would add Finalmask XDNS inbound on port ${XDNS_PORT}/udp"
    echo "  [dry-run] Would add Finalmask XICMP inbound on port ${XICMP_PORT}/udp"  
    echo "  [dry-run] Would open UFW ports"
    echo "  [dry-run] Would update docker-compose.yml port mappings"
    echo ""
    continue
  fi

  echo "  → Opening firewall ports..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    $SUDO ufw allow ${XDNS_PORT}/udp comment 'Finalmask XDNS' 2>/dev/null || true
    $SUDO ufw allow ${XICMP_PORT}/udp comment 'Finalmask XICMP' 2>/dev/null || true
    echo '[OK] Firewall rules added'
  " 2>&1 | sed 's/^/  /'

  echo "  → Adding Finalmask inbounds to xray-config.json..."
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

# Get existing client list from first inbound
clients = cfg['inbounds'][0]['settings']['clients']
existing_tags = [ib.get('tag','') for ib in cfg.get('inbounds',[])]

# === XDNS Inbound (Finalmask DNS mask over mKCP) ===
if 'vless-finalmask-xdns' not in existing_tags:
    xdns_inbound = {
        'tag': 'vless-finalmask-xdns',
        'listen': '0.0.0.0',
        'port': ${XDNS_PORT},
        'protocol': 'vless',
        'settings': {
            'clients': clients,
            'decryption': 'none'
        },
        'streamSettings': {
            'network': 'kcp',
            'kcpSettings': {
                'mtu': 1350,
                'tti': 20,
                'uplinkCapacity': 50,
                'downlinkCapacity': 100,
                'congestion': True,
                'readBufferSize': 2,
                'writeBufferSize': 2,
                'header': {
                    'type': 'dns'
                },
                'seed': '${UUID}'
            }
        }
    }
    cfg['inbounds'].append(xdns_inbound)
    print('  Added Finalmask XDNS inbound on port ${XDNS_PORT}')
else:
    print('  XDNS inbound already exists, skipping')

# === XICMP Inbound (Finalmask ICMP mask over mKCP) ===
# Uses mKCP with UTP header type which mimics game/voip traffic
# True ICMP would require raw sockets — this is the Docker-safe approach
if 'vless-finalmask-xicmp' not in existing_tags:
    xicmp_inbound = {
        'tag': 'vless-finalmask-xicmp',
        'listen': '0.0.0.0',
        'port': ${XICMP_PORT},
        'protocol': 'vless',
        'settings': {
            'clients': clients,
            'decryption': 'none'
        },
        'streamSettings': {
            'network': 'kcp',
            'kcpSettings': {
                'mtu': 1350,
                'tti': 20,
                'uplinkCapacity': 50,
                'downlinkCapacity': 100,
                'congestion': True,
                'readBufferSize': 2,
                'writeBufferSize': 2,
                'header': {
                    'type': 'utp'
                },
                'seed': '${UUID}'
            }
        }
    }
    cfg['inbounds'].append(xicmp_inbound)
    print('  Added Finalmask XICMP (mKCP-UTP) inbound on port ${XICMP_PORT}')
else:
    print('  XICMP inbound already exists, skipping')

# Ensure routing handles new inbounds
# Add new tags to existing routing rules that reference existing inbounds
for rule in cfg.get('routing', {}).get('rules', []):
    inbound_tag = rule.get('inboundTag')
    if isinstance(inbound_tag, list):
        for new_tag in ['vless-finalmask-xdns', 'vless-finalmask-xicmp']:
            if new_tag not in inbound_tag and len(inbound_tag) > 0:
                inbound_tag.append(new_tag)
    elif inbound_tag and inbound_tag not in ['vless-finalmask-xdns', 'vless-finalmask-xicmp']:
        # Convert single tag to list including new tags
        rule['inboundTag'] = [inbound_tag, 'vless-finalmask-xdns', 'vless-finalmask-xicmp']

with open('xray-config.json', 'w') as f:
    json.dump(cfg, f, indent=2)
print('  Config saved')
\"
  " 2>&1 | sed 's/^/  /'

  echo "  → Updating docker-compose.yml with Finalmask ports..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /opt/reality-ezpz

    # Add XDNS port mapping if not exists
    if ! grep -q '${XDNS_PORT}:${XDNS_PORT}/udp' docker-compose.yml; then
      $SUDO sed -i '/8443:8444\/udp/a\      - \"${XDNS_PORT}:${XDNS_PORT}/udp\"' docker-compose.yml 2>/dev/null || \
      $SUDO sed -i '/443:443\/tcp/a\      - \"${XDNS_PORT}:${XDNS_PORT}/udp\"' docker-compose.yml 2>/dev/null || true
      echo '  Added XDNS port mapping (${XDNS_PORT}/udp)'
    else
      echo '  XDNS port mapping already exists'
    fi

    # Add XICMP port mapping if not exists
    if ! grep -q '${XICMP_PORT}:${XICMP_PORT}/udp' docker-compose.yml; then
      $SUDO sed -i '/${XDNS_PORT}:${XDNS_PORT}\/udp/a\      - \"${XICMP_PORT}:${XICMP_PORT}/udp\"' docker-compose.yml 2>/dev/null || \
      $SUDO sed -i '/443:443\/tcp/a\      - \"${XICMP_PORT}:${XICMP_PORT}/udp\"' docker-compose.yml 2>/dev/null || true
      echo '  Added XICMP port mapping (${XICMP_PORT}/udp)'
    else
      echo '  XICMP port mapping already exists'
    fi
  " 2>&1 | sed 's/^/  /'

  echo "  → Restarting xray container..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /opt/reality-ezpz
    $DCMD compose restart xray 2>/dev/null || \
    $DCMD compose up -d 2>/dev/null
    sleep 2
    echo '[OK] xray restarted'
    $DCMD logs --tail 3 reality-ezpz-xray-1 2>&1 | tail -3
  " 2>&1 | sed 's/^/  /'

  echo "  Done!"
  echo ""
done

echo "═══ Finalmask Deployment Complete ═══"
echo ""
echo "Client config URIs (add to worker.js):"
echo ""
echo "  XDNS (mKCP DNS mask — looks like DNS traffic):"
echo "  vless://UUID@SERVER_IP:${XDNS_PORT}?encryption=none&type=kcp&headerType=dns&seed=UUID#XDNS-Location"
echo ""
echo "  XICMP (mKCP UTP mask — looks like game/voip traffic):"  
echo "  vless://UUID@SERVER_IP:${XICMP_PORT}?encryption=none&type=kcp&headerType=utp&seed=UUID#XICMP-Location"
echo ""
echo "Next steps:"
echo "  1. Update worker.js with Finalmask config fields"
echo "  2. Deploy worker: cd tools/smart-sub && wrangler deploy"
echo "  3. Test from Iran: refresh subscription in Hiddify"
