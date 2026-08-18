#!/usr/bin/env bash
#
# check-connections.sh — Monitor active/recent VPN connections across all servers
#
# Usage:
#   ./check-connections.sh                  # Show last 20 connections per server
#   ./check-connections.sh -u <UUID>        # Filter by specific UUID
#   ./check-connections.sh -f               # Follow mode (live tail)
#   ./check-connections.sh -n 50            # Show last 50 lines
#   ./check-connections.sh --summary        # Just show connection counts
#

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Source server config
source "$SCRIPT_DIR/server-config.sh" 2>/dev/null \
  || { echo "❌ server-config.sh not found. Copy from server-config.sh.example"; exit 1; }

# ── Server definitions ───────────────────────────────────────────
SERVER_NAMES=("helsinki" "oracle" "gcp" "scaleway")
SERVER_SSH=("$HEL_SSH" "$ORC_SSH" "$GCP_SSH" "$SCW_SSH")

# Docker command varies by server (oracle/gcp need sudo)
docker_cmd() {
  local server=$1
  if [ "$server" = "oracle" ] || [ "$server" = "gcp" ]; then
    echo "sudo docker"
  else
    echo "docker"
  fi
}

# ── Parse arguments ──────────────────────────────────────────────
UUID_FILTER=""
FOLLOW=false
LINES=20
SUMMARY=false

while [[ $# -gt 0 ]]; do
  case $1 in
    -u|--uuid) UUID_FILTER="$2"; shift 2 ;;
    -f|--follow) FOLLOW=true; shift ;;
    -n|--lines) LINES="$2"; shift 2 ;;
    --summary) SUMMARY=true; shift ;;
    -h|--help)
      echo "Usage: $0 [-u UUID] [-f] [-n LINES] [--summary]"
      echo "  -u UUID     Filter connections by UUID (partial match OK)"
      echo "  -f          Follow mode (live tail, Ctrl+C to stop)"
      echo "  -n LINES    Number of recent log lines to check (default: 20)"
      echo "  --summary   Just show connection counts per protocol"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Colors ───────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Summary mode ─────────────────────────────────────────────────
if $SUMMARY; then
  echo -e "${CYAN}═══ Connection Summary ═══${NC}"
  echo ""
  for i in "${!SERVER_NAMES[@]}"; do
    server="${SERVER_NAMES[$i]}"
    SSH="${SERVER_SSH[$i]}"
    DCMD=$(docker_cmd "$server")

    echo -e "${YELLOW}▶ $server${NC} ($SSH)"

    # Count connections by inbound tag in last 200 lines
    COUNTS=$(ssh -o ConnectTimeout=5 -o BatchMode=yes "$SSH" \
      "$DCMD logs --tail 200 reality-ezpz-engine-1 2>&1" 2>/dev/null | \
      grep -o '"inbound":"[^"]*"' | sort | uniq -c | sort -rn) || true

    if [ -n "$COUNTS" ]; then
      echo "$COUNTS" | while read count inbound; do
        tag=$(echo "$inbound" | sed 's/"inbound":"//;s/"//')
        case "$tag" in
          in) proto="Reality" ;;
          hy2-in) proto="Hysteria2" ;;
          vless-ws-in) proto="CDN-WS" ;;
          *) proto="$tag" ;;
        esac
        echo -e "  ${GREEN}$count${NC} × $proto"
      done
    else
      echo -e "  ${RED}(no recent connections)${NC}"
    fi
    echo ""
  done

  # Also show worker stats
  echo -e "${CYAN}═══ Subscription Fetches (today) ═══${NC}"
  curl -s "https://sub.example.com/stats?key=${ADMIN_UUID:?Set ADMIN_UUID environment variable}" 2>/dev/null | \
    python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    hits = data.get('sub_requests', {}).get('today', {})
    if hits:
        for uuid, count in hits.items():
            if uuid == '_total':
                print(f'  Total: {count}')
            else:
                print(f'  {uuid[:8]}...: {count}')
    else:
        print('  (no fetches today)')
except:
    print('  (could not fetch stats)')
" 2>/dev/null || echo "  (worker unreachable)"
  exit 0
fi

# ── Follow mode ──────────────────────────────────────────────────
if $FOLLOW; then
  echo -e "${CYAN}═══ Live Connection Monitor (Ctrl+C to stop) ═══${NC}"
  echo ""

  for i in "${!SERVER_NAMES[@]}"; do
    server="${SERVER_NAMES[$i]}"
    SSH="${SERVER_SSH[$i]}"
    DCMD=$(docker_cmd "$server")

    echo -e "${YELLOW}Following $server...${NC}"
    if [ -n "$UUID_FILTER" ]; then
      ssh -o ConnectTimeout=5 "$SSH" "$DCMD logs -f --tail 0 reality-ezpz-engine-1 2>&1" 2>/dev/null | \
        grep --line-buffered "$UUID_FILTER" | while read line; do
          echo -e "${GREEN}[$server]${NC} $line"
        done &
    else
      ssh -o ConnectTimeout=5 "$SSH" "$DCMD logs -f --tail 0 reality-ezpz-engine-1 2>&1" 2>/dev/null | \
        grep --line-buffered -E '"inbound"' | while read line; do
          echo -e "${GREEN}[$server]${NC} $line"
        done &
    fi
  done

  # Wait for Ctrl+C
  trap "kill 0; exit 0" INT
  wait
  exit 0
fi

# ── Default: show recent connections ─────────────────────────────
echo -e "${CYAN}═══ Recent Connections (last $LINES log entries) ═══${NC}"
echo ""

for i in "${!SERVER_NAMES[@]}"; do
  server="${SERVER_NAMES[$i]}"
  SSH="${SERVER_SSH[$i]}"
  DCMD=$(docker_cmd "$server")

  echo -e "${YELLOW}▶ $server${NC} ($SSH)"

  if [ -n "$UUID_FILTER" ]; then
    LOGS=$(ssh -o ConnectTimeout=5 -o BatchMode=yes "$SSH" \
      "$DCMD logs --tail $LINES reality-ezpz-engine-1 2>&1" 2>/dev/null | \
      grep "$UUID_FILTER" 2>/dev/null) || true
  else
    LOGS=$(ssh -o ConnectTimeout=5 -o BatchMode=yes "$SSH" \
      "$DCMD logs --tail $LINES reality-ezpz-engine-1 2>&1" 2>/dev/null | \
      grep -E '"inbound"' 2>/dev/null) || true
  fi

  if [ -n "$LOGS" ]; then
    echo "$LOGS" | while read line; do
      # Colorize by protocol
      if echo "$line" | grep -q '"inbound":"in"'; then
        echo -e "  ${GREEN}[Reality]${NC} $line"
      elif echo "$line" | grep -q '"inbound":"hy2-in"'; then
        echo -e "  ${CYAN}[Hy2]${NC} $line"
      elif echo "$line" | grep -q '"inbound":"vless-ws-in"'; then
        echo -e "  ${YELLOW}[CDN-WS]${NC} $line"
      else
        echo "  $line"
      fi
    done
  else
    echo -e "  ${RED}(no matching connections)${NC}"
  fi
  echo ""
done
