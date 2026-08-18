#!/usr/bin/env bash
# UUID Rotation Script
# Generates a new UUID and updates all VPN servers + smart-sub worker
#
# Usage:
#   bash tools/uuid-rotate.sh              # Generate random UUID
#   bash tools/uuid-rotate.sh <new-uuid>   # Use specific UUID
#   bash tools/uuid-rotate.sh --dry-run    # Show what would change

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_JS="$SCRIPT_DIR/smart-sub/worker.js"

# Source server config
source "$SCRIPT_DIR/server-config.sh" 2>/dev/null \
  || { echo "❌ server-config.sh not found. Copy from server-config.sh.example"; exit 1; }

# Server SSH targets (from server-config.sh)
declare -A SERVERS=(
  ["helsinki"]="$HEL_SSH"
  ["oracle-madrid"]="$ORC_SSH"
  ["gcp-dammam"]="$GCP_SSH"
  ["scaleway-london"]="$SCW_SSH"
)

# Sudo prefix per server (oracle/gcp need sudo)
unset SUDO_PREFIX  # unset indexed array from server-config.sh
declare -A SUDO_PREFIX=(
  ["helsinki"]=""
  ["oracle-madrid"]="sudo"
  ["gcp-dammam"]="sudo"
  ["scaleway-london"]=""
)

DRY_RUN=false
NEW_UUID=""

# Parse args
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    *) NEW_UUID="$arg" ;;
  esac
done

# Generate UUID if not provided
if [ -z "$NEW_UUID" ]; then
  NEW_UUID=$(uuidgen | tr '[:upper:]' '[:lower:]')
fi

# Validate UUID format
if ! echo "$NEW_UUID" | grep -qE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then
  echo "ERROR: Invalid UUID format: $NEW_UUID"
  exit 1
fi

# Get current admin UUID from worker.js
CURRENT_UUID=$(grep 'const ADMIN_UUID' "$WORKER_JS" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')

if [ -z "$CURRENT_UUID" ]; then
  echo "ERROR: Could not find ADMIN_UUID in $WORKER_JS"
  echo "Expected: const ADMIN_UUID = \"<uuid>\";"
  exit 1
fi

echo "=== UUID Rotation ==="
echo "Current: $CURRENT_UUID"
echo "New:     $NEW_UUID"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] Would update:"
  echo "  - $WORKER_JS (ADMIN_UUID + USERS keys)"
  for tag in "${!SERVERS[@]}"; do
    echo "  - ${SERVERS[$tag]}:/opt/reality-ezpz/engine.conf"
  done
  echo "  - Redeploy smart-sub worker"
  exit 0
fi

echo "Updating servers..."
FAILED=()

for tag in "${!SERVERS[@]}"; do
  SSH_TARGET="${SERVERS[$tag]}"
  SUDO="${SUDO_PREFIX[$tag]}"
  echo -n "  [$tag] $SSH_TARGET ... "

  if ssh -o ConnectTimeout=10 "$SSH_TARGET" "${SUDO} bash -c '
    cd /opt/reality-ezpz
    cp engine.conf engine.conf.pre-rotate

    python3 -c \"
import json
with open(\\\"engine.conf\\\") as f:
    conf = json.load(f)

changed = False
for ib in conf.get(\\\"inbounds\\\", []):
    if ib.get(\\\"type\\\") == \\\"vless\\\":
        for user in ib.get(\\\"users\\\", []):
            if user.get(\\\"uuid\\\") == \\\"'\"$CURRENT_UUID\"'\\\":
                user[\\\"uuid\\\"] = \\\"'\"$NEW_UUID\"'\\\"
                changed = True
    if ib.get(\\\"type\\\") == \\\"hysteria2\\\":
        for user in ib.get(\\\"users\\\", []):
            if user.get(\\\"password\\\") == \\\"'\"$CURRENT_UUID\"'\\\":
                user[\\\"password\\\"] = \\\"'\"$NEW_UUID\"'\\\"
                changed = True

with open(\\\"engine.conf\\\", \\\"w\\\") as f:
    json.dump(conf, f, indent=2)

print(\\\"changed\\\" if changed else \\\"no-change\\\")
\"

    # Update users file
    sed -i \"s/'\"$CURRENT_UUID\"'/'\"$NEW_UUID\"'/g\" users 2>/dev/null || true

    # Restart sing-box
    docker compose restart engine 2>/dev/null
  '" 2>/dev/null; then
    echo "OK"
  else
    echo "FAILED"
    FAILED+=("$tag")
  fi
done

echo ""
echo "Updating smart-sub worker..."
sed -i '' "s/$CURRENT_UUID/$NEW_UUID/g" "$WORKER_JS"

echo "Deploying worker..."
cd "$SCRIPT_DIR/smart-sub"
wrangler deploy 2>&1 | tail -3

echo ""
echo "=== Summary ==="
echo "New UUID: $NEW_UUID"
echo "Servers updated: $((${#SERVERS[@]} - ${#FAILED[@]}))/${#SERVERS[@]}"
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "FAILED: ${FAILED[*]}"
  echo "Run manually: ssh <server> and update engine.conf"
fi
echo ""
echo "Update your Hiddify subscription to refresh configs."
echo "Subscription URL: https://sub.example.com/sub/$NEW_UUID"
