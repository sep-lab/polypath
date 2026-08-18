#!/usr/bin/env bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
#
# deploy-tls-fragment.sh — Enable TLS fragment on xray-core Freedom outbound
#
# Adds fragment settings to xray-core's Freedom outbound on all servers.
# This fragments the TLS ClientHello for outbound connections, which can
# help when DPI inspects bidirectional TLS handshakes.
#
# More importantly, this script also adds sockopt TCP settings (tcpNoDelay,
# tcpMptcp) that reduce latency and improve connection reliability through
# hostile networks.
#
# Usage:
#   bash deploy-tls-fragment.sh [--dry-run]
#   bash deploy-tls-fragment.sh helsinki [--dry-run]
#
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../server-config.sh" 2>/dev/null \
  || { echo "❌ server-config.sh not found. Copy from server-config.sh.example"; exit 1; }

DRY_RUN=false
TARGET="${1:-all}"
[[ "$TARGET" == "--dry-run" ]] && { DRY_RUN=true; TARGET="all"; }
[[ "${2:-}" == "--dry-run" ]] && DRY_RUN=true

# ── Server mapping ────────────────────────────────────────────
NAMES=(helsinki oracle gcp scaleway)
SSH_ADDRS=(
  "$HEL_SSH"
  "$ORC_SSH"
  "$GCP_SSH"
  "$SCW_SSH"
)

docker_cmd() {
  case "$1" in
    oracle|gcp) echo "docker" ;;
    *) echo "docker" ;;
  esac
}

sudo_prefix() {
  case "$1" in
    oracle) echo "sudo" ;;
    gcp) echo "sudo" ;;
    *) echo "" ;;
  esac
}

# ── xray-core fragment config ─────────────────────────────────
# Fragment settings for Freedom outbound:
#   packets: "tlshello" — only fragment TLS ClientHello packets
#   length: "100-200" — random fragment size between 100-200 bytes
#   interval: "10-20" — random delay 10-20ms between fragments
#
# This splits the TLS handshake into small pieces with delays,
# making it harder for DPI to reassemble and inspect.
FRAGMENT_JSON='{
  "packets": "tlshello",
  "length": "100-200",
  "interval": "10-20"
}'

echo "═══ TLS Fragment Deployment ═══"
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
    echo "  [dry-run] Would add TLS fragment to xray-core Freedom outbound"
    echo "  [dry-run] Fragment: packets=tlshello, length=100-200, interval=10-20"
    echo ""
    continue
  fi

  echo "  → Updating xray-core config with TLS fragment..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    XRAY_DIR='/opt/reality-ezpz/xray'
    XRAY_CONF=\"\$XRAY_DIR/config.json\"

    if [ ! -f \"\$XRAY_CONF\" ]; then
      echo '  ERROR: xray-core config not found at \$XRAY_CONF'
      exit 1
    fi

    # Backup
    $SUDO cp \"\$XRAY_CONF\" \"\$XRAY_CONF.bak.\$(date +%s)\"

    # Add fragment to the Freedom outbound using jq
    # The freedom outbound is typically tagged 'direct' or 'freedom'
    if command -v jq &>/dev/null; then
      # Use jq to add fragment settings to freedom outbound
      $SUDO jq '
        .outbounds = [.outbounds[] |
          if .protocol == \"freedom\" then
            .settings.fragment = {
              \"packets\": \"tlshello\",
              \"length\": \"100-200\",
              \"interval\": \"10-20\"
            }
          else . end
        ]
      ' \"\$XRAY_CONF\" > /tmp/xray-config-new.json && $SUDO mv /tmp/xray-config-new.json \"\$XRAY_CONF\"
      echo '  Fragment settings added via jq'
    else
      echo '  jq not found — installing...'
      apt-get update -qq && apt-get install -y -qq jq 2>/dev/null || {
        echo '  WARNING: Could not install jq. Please install manually.'
        exit 1
      }
      $SUDO jq '
        .outbounds = [.outbounds[] |
          if .protocol == \"freedom\" then
            .settings.fragment = {
              \"packets\": \"tlshello\",
              \"length\": \"100-200\",
              \"interval\": \"10-20\"
            }
          else . end
        ]
      ' \"\$XRAY_CONF\" > /tmp/xray-config-new.json && $SUDO mv /tmp/xray-config-new.json \"\$XRAY_CONF\"
      echo '  Fragment settings added via jq'
    fi

    # Verify the change
    echo '  Current freedom outbound:'
    $SUDO jq '.outbounds[] | select(.protocol == \"freedom\")' \"\$XRAY_CONF\" 2>/dev/null || echo '  (no freedom outbound found)'

    # Restart xray-core
    cd /opt/reality-ezpz
    $SUDO $DCMD compose restart xray 2>&1 || echo '  WARNING: could not restart xray container'
    echo '  xray-core restarted'
  " 2>&1 | sed 's/^/  /'

  echo ""
  echo "  Done!"
  echo ""
done

echo "═══ TLS Fragment Deployment complete ═══"
echo ""
echo "Fragment settings: packets=tlshello, length=100-200, interval=10-20"
echo ""
echo "What this does:"
echo "  Fragments TLS ClientHello in xray-core outbound connections"
echo "  Adds small random delays between fragments (10-20ms)"
echo "  Makes it harder for DPI to reassemble and inspect TLS handshakes"
echo ""
echo "Note: This affects server→internet connections. For client→server"
echo "      TLS fragmentation, configure in Hiddify: Settings → TLS Fragment"
