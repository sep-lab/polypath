#!/usr/bin/env bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
#
# deploy-finalmask-expand.sh — Deploy 3 new Finalmask header types on all servers
#
# Adds mKCP inbounds with additional header masking:
#   - wechat-video (port 10055/udp): Looks like WeChat video call traffic
#   - dtls (port 10056/udp): Looks like DTLS (WebRTC/VoIP)
#   - srtp (port 10057/udp): Looks like Secure RTP (video/audio streaming)
#
# These complement existing XDNS (10053) and XICMP (10054) to provide
# more transport diversity, especially during partial internet shutdowns
# in Iran where UDP may partially work.
#
# Requires: Xray-core v26.2.6+ and existing deploy-finalmask.sh already run
#
# Usage:
#   bash deploy-finalmask-expand.sh             # Deploy to all servers
#   bash deploy-finalmask-expand.sh helsinki     # Deploy to one server
#   bash deploy-finalmask-expand.sh --dry-run   # Preview only
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

# New Finalmask ports
WECHAT_PORT=10055   # UDP - WeChat video call masking (mKCP)
DTLS_PORT=10056     # UDP - DTLS masking (mKCP)
SRTP_PORT=10057     # UDP - SRTP masking (mKCP)

echo "═══════════════════════════════════════════════════"
echo "  Finalmask Expansion (wechat-video + dtls + srtp)"
echo "  Ports: ${WECHAT_PORT}, ${DTLS_PORT}, ${SRTP_PORT} (UDP)"
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
    echo "  [dry-run] Would add Finalmask wechat-video inbound on port ${WECHAT_PORT}/udp"
    echo "  [dry-run] Would add Finalmask dtls inbound on port ${DTLS_PORT}/udp"
    echo "  [dry-run] Would add Finalmask srtp inbound on port ${SRTP_PORT}/udp"
    echo "  [dry-run] Would open UFW ports"
    echo "  [dry-run] Would update docker-compose.yml port mappings"
    echo ""
    continue
  fi

  echo "  → Opening firewall ports..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    $SUDO ufw allow ${WECHAT_PORT}/udp comment 'Finalmask WeChat' 2>/dev/null || true
    $SUDO ufw allow ${DTLS_PORT}/udp comment 'Finalmask DTLS' 2>/dev/null || true
    $SUDO ufw allow ${SRTP_PORT}/udp comment 'Finalmask SRTP' 2>/dev/null || true
    echo '[OK] Firewall rules added'
  " 2>&1 | sed 's/^/  /'

  echo "  → Adding new Finalmask inbounds to xray-config.json..."
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

new_inbounds = [
    {
        'tag': 'vless-finalmask-wechat',
        'port': ${WECHAT_PORT},
        'header': 'header-wechat',
        'label': 'WeChat video'
    },
    {
        'tag': 'vless-finalmask-dtls',
        'port': ${DTLS_PORT},
        'header': 'header-dtls',
        'label': 'DTLS'
    },
    {
        'tag': 'vless-finalmask-srtp',
        'port': ${SRTP_PORT},
        'header': 'header-srtp',
        'label': 'SRTP'
    }
]

new_tags = []
for spec in new_inbounds:
    if spec['tag'] not in existing_tags:
        inbound = {
            'tag': spec['tag'],
            'listen': '0.0.0.0',
            'port': spec['port'],
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
                    'writeBufferSize': 2
                },
                'finalmask': {
                    'udp': [
                        {'type': 'mkcp-original', 'settings': {'password': '${UUID}'}},
                        {'type': spec['header'], 'settings': {}}
                    ]
                }
            }
        }
        cfg['inbounds'].append(inbound)
        new_tags.append(spec['tag'])
        print('  Added Finalmask ' + spec['label'] + ' inbound on port ' + str(spec['port']))
    else:
        print('  ' + spec['label'] + ' inbound already exists, skipping')

# Add new tags to routing rules
if new_tags:
    for rule in cfg.get('routing', {}).get('rules', []):
        inbound_tag = rule.get('inboundTag')
        if isinstance(inbound_tag, list):
            for nt in new_tags:
                if nt not in inbound_tag and len(inbound_tag) > 0:
                    inbound_tag.append(nt)

with open('xray-config.json', 'w') as f:
    json.dump(cfg, f, indent=2)
print('  Config saved')
\"
  " 2>&1 | sed 's/^/  /'

  echo "  → Updating docker-compose.yml with new ports..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /opt/reality-ezpz

    $SUDO python3 -c \"
import yaml
with open('docker-compose.yml') as f:
    c = yaml.safe_load(f)
xray_ports = c['services']['xray'].get('ports', [])
for p in ['${WECHAT_PORT}:${WECHAT_PORT}/udp', '${DTLS_PORT}:${DTLS_PORT}/udp', '${SRTP_PORT}:${SRTP_PORT}/udp']:
    if p not in xray_ports:
        xray_ports.append(p)
        print('  Added port mapping (' + p + ')')
    else:
        print('  Port mapping already exists: ' + p)
c['services']['xray']['ports'] = xray_ports
with open('docker-compose.yml', 'w') as f:
    yaml.dump(c, f, default_flow_style=False, sort_keys=False)
\"
  " 2>&1 | sed 's/^/  /'

  echo "  → Recreating xray container with new port mappings..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /opt/reality-ezpz
    $DCMD compose up -d --force-recreate xray 2>/dev/null || \
    $DCMD compose up -d 2>/dev/null
    sleep 2
    echo '[OK] xray restarted'
    $DCMD compose logs xray --tail 3 2>&1 | tail -3
  " 2>&1 | sed 's/^/  /'

  echo "  Done!"
  echo ""
done

echo "═══ Finalmask Expansion Complete ═══"
echo ""
echo "New client config URIs:"
echo ""
echo "  WeChat-Video (looks like WeChat video call):"
echo "  vless://UUID@SERVER_IP:${WECHAT_PORT}?encryption=none&type=kcp&headerType=wechat-video&seed=UUID#Finalmask-WeChat-Location"
echo ""
echo "  DTLS (looks like WebRTC/VoIP DTLS):"
echo "  vless://UUID@SERVER_IP:${DTLS_PORT}?encryption=none&type=kcp&headerType=dtls&seed=UUID#Finalmask-DTLS-Location"
echo ""
echo "  SRTP (looks like video/audio streaming):"
echo "  vless://UUID@SERVER_IP:${SRTP_PORT}?encryption=none&type=kcp&headerType=srtp&seed=UUID#Finalmask-SRTP-Location"
echo ""
echo "Next steps:"
echo "  1. Worker.js already has generators for these (v5.9)"
echo "  2. Deploy worker: cd tools/smart-sub && wrangler deploy"
echo "  3. Test from Iran: refresh subscription in Hiddify"
