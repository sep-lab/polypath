#!/usr/bin/env bash
# shellcheck disable=SC1036,SC1056,SC1072,SC1073
# Server Status Dashboard
# Quick overview of all VPN servers: containers, ports, resources, connections, logs
#
# Usage:
#   bash tools/server-status.sh              # Full dashboard
#   bash tools/server-status.sh --quick      # Quick connectivity check only
#   bash tools/server-status.sh --logs       # Show recent logs from all servers
#   bash tools/server-status.sh helsinki      # Single server details

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Source server config
source "$SCRIPT_DIR/server-config.sh" 2>/dev/null \
  || { echo "❌ server-config.sh not found. Copy from server-config.sh.example"; exit 1; }

declare -a TAGS=("helsinki" "oracle-madrid" "gcp-middle-east" "scaleway-london")
declare -a IPS=("$HEL_IP" "$ORC_IP" "$GCP_IP" "$SCW_IP")
declare -a SSH_TARGETS=("$HEL_SSH" "$ORC_SSH" "$GCP_SSH" "$SCW_SSH")

MODE="full"
SINGLE=""

for arg in "$@"; do
  case "$arg" in
    --quick) MODE="quick" ;;
    --logs) MODE="logs" ;;
    *) SINGLE="$arg" ;;
  esac
done

check_server() {
  local idx=$1
  local TAG="${TAGS[$idx]}"
  local IP="${IPS[$idx]}"
  local SSH="${SSH_TARGETS[$idx]}"
  local SUDO="${SUDO_PREFIX[$idx]}"

  echo "━━━ $TAG ($IP) ━━━"

  if [ "$MODE" = "quick" ]; then
    if nc -z -w 3 "$IP" 443 2>/dev/null; then
      echo "  Reality (443/tcp): UP"
    else
      echo "  Reality (443/tcp): DOWN"
    fi
    echo ""
    return
  fi

  # Full SSH check
  ssh -o ConnectTimeout=8 -o BatchMode=yes "$SSH" "${SUDO} bash -c '
    echo \"── Docker ──\"
    docker compose -f /opt/reality-ezpz/docker-compose.yml ps 2>/dev/null || echo \"compose not found\"

    echo \"\"
    echo \"── Ports ──\"
    ss -tlnp 2>/dev/null | grep -E \"443|8443\" || echo \"no ports\"
    ss -ulnp 2>/dev/null | grep 8443 || echo \"no udp\"

    echo \"\"
    echo \"── Resources ──\"
    echo \"Disk: \$(df -h / | tail -1 | awk \"{print \\\$3 \\\"/\\\" \\\$2 \\\" (\\\" \\\$5 \\\")\"}\")\";
    echo \"RAM:  \$(free -h | grep Mem | awk \"{print \\\$3 \\\"/\\\" \\\$2}\")\"
    echo \"Load: \$(cat /proc/loadavg | awk \"{print \\\$1, \\\$2, \\\$3}\")\"

    echo \"\"
    echo \"── Active Connections ──\"
    echo \"Reality: \$(ss -tn state established \"( dport = :8443 or sport = :8443 )\" 2>/dev/null | tail -n +2 | wc -l) connections\"
    echo \"Hy2:     \$(ss -un state established 2>/dev/null | grep 18443 | wc -l) connections\"

    echo \"\"
    echo \"── WARP Status ──\"
    WARP_TAG=\$(cat /opt/reality-ezpz/engine.conf 2>/dev/null | python3 -c \"import json,sys; c=json.load(sys.stdin); eps=[e for e in c.get(\\\"endpoints\\\",[]) if e.get(\\\"tag\\\")==\\\"warp\\\"]; print(\\\"ENABLED\\\" if eps else \\\"DISABLED\\\")\" 2>/dev/null || echo \"UNKNOWN\")
    ROUTE_FINAL=\$(cat /opt/reality-ezpz/engine.conf 2>/dev/null | python3 -c \"import json,sys; c=json.load(sys.stdin); print(c.get(\\\"route\\\",{}).get(\\\"final\\\",\\\"?\\\"))\" 2>/dev/null || echo \"?\")
    echo \"Endpoint: \$WARP_TAG | Route final: \$ROUTE_FINAL\"

    if [ "'"$MODE"'" = "logs" ]; then
      echo \"\"
      echo \"── Recent Logs (last 10) ──\"
      docker logs reality-ezpz-engine-1 --tail 10 2>&1 | grep -v \"processed invalid connection\" || echo \"no logs\"
    fi
  ' 2>/dev/null || echo "  SSH FAILED"
  echo ""
}

echo "╔══════════════════════════════════════════╗"
echo "║       VPN Server Status Dashboard        ║"
echo "║       $(date '+%Y-%m-%d %H:%M:%S UTC')        ║"
echo "╚══════════════════════════════════════════╝"
echo ""

if [ -n "$SINGLE" ]; then
  for i in "${!TAGS[@]}"; do
    if [ "${TAGS[$i]}" = "$SINGLE" ]; then
      check_server "$i"
      exit 0
    fi
  done
  echo "Unknown server: $SINGLE"
  echo "Available: ${TAGS[*]}"
  exit 1
fi

for i in "${!TAGS[@]}"; do
  check_server "$i"
done

# Summary
echo "━━━ Smart-Sub Worker ━━━"
HEALTH=$(curl -s --max-time 5 "https://sub.example.com/health" 2>/dev/null || echo '{"error":"unreachable"}')
echo "$HEALTH" | python3 -c "
import json, sys
try:
  d = json.load(sys.stdin)
  for s in d.get('servers', []):
    status = '●' if s.get('health','unknown') == 'up' else '○'
    print(f\"  {status} {s['tag']}: {s.get('health','unknown')}\")
  print(f\"  Users: {d.get('total_users', '?')}\")
except:
  print('  Worker unreachable or error')
" 2>/dev/null || echo "  Parse error"
echo ""
