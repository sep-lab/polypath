#!/usr/bin/env bash
# Add User Script
# Adds a new user UUID to all VPN servers and the smart-sub worker
#
# Usage:
#   bash tools/add-user.sh <name> [tier]     # Generate UUID, add to all servers
#   bash tools/add-user.sh <name> [tier] <uuid>  # Use specific UUID
#
# Example:
#   bash tools/add-user.sh ali premium
#   bash tools/add-user.sh sara free
#   bash tools/add-user.sh bob premium 12345678-1234-1234-1234-123456789012

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_JS="$SCRIPT_DIR/smart-sub/worker.js"

# Source server config
source "$SCRIPT_DIR/server-config.sh" 2>/dev/null \
  || { echo "❌ server-config.sh not found. Copy from server-config.sh.example"; exit 1; }

if [ $# -lt 1 ]; then
  echo "Usage: $0 <name> [tier] [uuid]"
  echo "  tier: premium (default) or free"
  exit 1
fi

NAME="$1"
TIER="${2:-premium}"
NEW_UUID="${3:-$(uuidgen | tr '[:upper:]' '[:lower:]')}"

# Validate
if [ "$TIER" != "premium" ] && [ "$TIER" != "free" ]; then
  echo "ERROR: tier must be 'premium' or 'free'"
  exit 1
fi

echo "=== Adding User ==="
echo "Name: $NAME"
echo "Tier: $TIER"
echo "UUID: $NEW_UUID"
echo ""

# Server definitions (from server-config.sh)
declare -a SSH_TARGETS=("$HEL_SSH" "$ORC_SSH" "$GCP_SSH" "$SCW_SSH")
declare -a TAGS=("helsinki" "oracle-madrid" "gcp-dammam" "scaleway-london")

# 1. Add to all servers' engine.conf
echo "Adding to servers..."
for i in "${!TAGS[@]}"; do
  TAG="${TAGS[$i]}"
  SSH="${SSH_TARGETS[$i]}"
  SUDO="${SUDO_PREFIX[$i]}"
  echo -n "  [$TAG] "

  if ssh -o ConnectTimeout=10 "$SSH" "${SUDO} bash -c '
    cd /opt/reality-ezpz
    cp engine.conf engine.conf.bak

    python3 -c \"
import json
with open(\\\"engine.conf\\\") as f:
    conf = json.load(f)

added = False
for ib in conf.get(\\\"inbounds\\\", []):
    if ib.get(\\\"type\\\") == \\\"vless\\\":
        existing = [u[\\\"uuid\\\"] for u in ib.get(\\\"users\\\", [])]
        if \\\"'\"$NEW_UUID\"'\\\" not in existing:
            ib[\\\"users\\\"].append({\\\"uuid\\\": \\\"'\"$NEW_UUID\"'\\\", \\\"flow\\\": \\\"xtls-rprx-vision\\\", \\\"name\\\": \\\"'\"$NAME\"'\\\"})
            added = True
    if ib.get(\\\"type\\\") == \\\"hysteria2\\\":
        existing = [u[\\\"password\\\"] for u in ib.get(\\\"users\\\", [])]
        if \\\"'\"$NEW_UUID\"'\\\" not in existing:
            ib[\\\"users\\\"].append({\\\"password\\\": \\\"'\"$NEW_UUID\"'\\\"})
            added = True

with open(\\\"engine.conf\\\", \\\"w\\\") as f:
    json.dump(conf, f, indent=2)
print(\\\"added\\\" if added else \\\"already-exists\\\")
\"

    # Add to users file
    echo \"'\"$NAME\"'='\"$NEW_UUID\"'\" >> users

    # Restart
    docker compose restart engine 2>/dev/null
  '" 2>/dev/null; then
    echo ""
  else
    echo "FAILED"
  fi
done

# 2. Add to worker.js USERS map
echo ""
echo "Adding to smart-sub worker..."

# Insert new user line after the admin line
ESCAPED_UUID=$(printf '%s\n' "$NEW_UUID" | sed 's/[&/\]/\\&/g')
ADMIN_UUID="${ADMIN_UUID:?Set ADMIN_UUID environment variable}"
sed -i '' "/\"$ADMIN_UUID\"/a\\
\\  \"$ESCAPED_UUID\": { name: \"$NAME\", tier: \"$TIER\", enabled: true },
" "$WORKER_JS"

# Deploy
echo "Deploying worker..."
cd "$SCRIPT_DIR/smart-sub"
wrangler deploy 2>&1 | tail -3

echo ""
echo "=== Done ==="
echo "User $NAME added to all servers"
echo "Subscription URL: https://sub.example.com/sub/$NEW_UUID"
echo ""
echo "Share this with the user (or import in Hiddify):"
echo "  https://sub.example.com/sub/$NEW_UUID"
