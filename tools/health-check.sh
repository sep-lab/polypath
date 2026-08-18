#!/usr/bin/env bash
# Health Check Script
# Probes all VPN servers and reports status to smart-sub worker
#
# Usage:
#   bash tools/health-check.sh           # Check all servers
#   bash tools/health-check.sh --report  # Check + report to worker
#   bash tools/health-check.sh --json    # Output JSON only
#
# Can be run from GitHub Actions or local cron

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Source server config
source "$SCRIPT_DIR/server-config.sh" 2>/dev/null \
  || { echo "❌ server-config.sh not found. Copy from server-config.sh.example"; exit 1; }

ADMIN_UUID="${ADMIN_UUID:?Set ADMIN_UUID environment variable}"
WORKER_URL="https://sub.example.com"
REPORT=false
JSON_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --report) REPORT=true ;;
    --json) JSON_ONLY=true ;;
  esac
done

# Server definitions (from server-config.sh)
declare -a SERVER_TAGS=("helsinki" "oracle-madrid" "gcp-middle-east" "scaleway-london")
declare -a SERVER_IPS=("$HEL_IP" "$ORC_IP" "$GCP_IP" "$SCW_IP")
declare -a SERVER_SSH=("$HEL_SSH" "$ORC_SSH" "$GCP_SSH" "$SCW_SSH")
declare -a SERVER_SUDO=("${SUDO_PREFIX[@]}")

RESULTS="["
FIRST=true

for i in "${!SERVER_TAGS[@]}"; do
  TAG="${SERVER_TAGS[$i]}"
  IP="${SERVER_IPS[$i]}"
  SSH="${SERVER_SSH[$i]}"
  SUDO="${SERVER_SUDO[$i]}"

  STATUS="down"
  LATENCY=0
  REALITY="down"
  HY2="down"
  DOCKER="down"
  DISK=""
  RAM=""
  UPTIME=""

  # TCP probe on port 443 (Reality)
  START=$(date +%s%N)
  if nc -z -w 5 "$IP" 443 2>/dev/null; then
    END=$(date +%s%N)
    LATENCY=$(( (END - START) / 1000000 ))
    REALITY="up"
  fi

  # UDP probe on port 8443 (Hysteria2) - just check if port responds
  if nc -z -u -w 3 "$IP" 8443 2>/dev/null; then
    HY2="up"
  fi

  # SSH health check (container, disk, ram)
  if SSH_OUT=$(ssh -o ConnectTimeout=5 -o BatchMode=yes "$SSH" "${SUDO} bash -c '
    # Docker status
    docker compose -f /opt/reality-ezpz/docker-compose.yml ps --format \"{{.Status}}\" 2>/dev/null | head -1
    echo \"---\"
    # Disk usage
    df -h / | tail -1 | awk \"{print \\\$5}\"
    echo \"---\"
    # RAM usage
    free -h | grep Mem | awk \"{print \\\$3 \\\"/\\\" \\\$2}\"
    echo \"---\"
    # Uptime
    uptime -p 2>/dev/null || uptime
    echo \"---\"
    # Docker logs last error
    docker logs reality-ezpz-engine-1 --tail 3 2>&1 | grep -i fatal | head -1 || echo \"none\"
  '" 2>/dev/null); then
    DOCKER_STATUS=$(echo "$SSH_OUT" | sed -n '1p')
    DISK=$(echo "$SSH_OUT" | sed -n '3p')
    RAM=$(echo "$SSH_OUT" | sed -n '5p')
    UPTIME=$(echo "$SSH_OUT" | sed -n '7p')
    LAST_ERROR=$(echo "$SSH_OUT" | sed -n '9p')

    if echo "$DOCKER_STATUS" | grep -qi "up"; then
      DOCKER="up"
    fi
  fi

  # Overall status
  if [ "$REALITY" = "up" ] && [ "$DOCKER" = "up" ]; then
    STATUS="up"
  elif [ "$REALITY" = "up" ]; then
    STATUS="degraded"
  fi

  if [ "$JSON_ONLY" = false ]; then
    # Pretty print
    if [ "$STATUS" = "up" ]; then
      ICON="●"
    elif [ "$STATUS" = "degraded" ]; then
      ICON="◐"
    else
      ICON="○"
    fi
    echo "$ICON $TAG ($IP)"
    echo "    Reality: $REALITY | Hy2: $HY2 | Docker: $DOCKER | Latency: ${LATENCY}ms"
    [ -n "$DISK" ] && echo "    Disk: $DISK | RAM: $RAM"
    [ -n "$UPTIME" ] && echo "    $UPTIME"
    [ "$LAST_ERROR" != "none" ] && [ -n "$LAST_ERROR" ] && echo "    Last error: $LAST_ERROR"
    echo ""
  fi

  # Build JSON
  [ "$FIRST" = true ] && FIRST=false || RESULTS+=","
  RESULTS+=$(cat <<EJSON
{
    "tag": "$TAG",
    "ip": "$IP",
    "status": "$STATUS",
    "reality": "$REALITY",
    "hy2": "$HY2",
    "docker": "$DOCKER",
    "latency_ms": $LATENCY,
    "disk": "$DISK",
    "ram": "$RAM"
  }
EJSON
  )
done

RESULTS+="]"

if [ "$JSON_ONLY" = true ]; then
  echo "$RESULTS" | python3 -m json.tool 2>/dev/null || echo "$RESULTS"
fi

# Report to worker
if [ "$REPORT" = true ]; then
  echo "Reporting to $WORKER_URL/health/report..."
  RESP=$(curl -s -X POST "$WORKER_URL/health/report" \
    -H "Authorization: Bearer $ADMIN_UUID" \
    -H "Content-Type: application/json" \
    -d "{\"results\": $RESULTS}")
  echo "Response: $RESP"
fi
