#!/usr/bin/env bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
#
# upgrade-xray.sh — Upgrade xray-core to v26.2.6 on all servers
#
# Unlocks: Finalmask (XICMP/XDNS), XHTTP CDN anti-detection,
# Salamander UDP mask, Hysteria2 udphop, dynamic Chrome User-Agent.
#
# The xray container in reality-ezpz uses a sidecar xray-core alongside
# sing-box (engine). This script upgrades the xray-core binary inside
# the container or pulls the latest image.
#
# Usage:
#   bash upgrade-xray.sh             # Upgrade all servers
#   bash upgrade-xray.sh helsinki     # Upgrade one server
#   bash upgrade-xray.sh --dry-run   # Preview only
#
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../server-config.sh" 2>/dev/null \
  || { echo "❌ server-config.sh not found. Copy from server-config.sh.example"; exit 1; }

XRAY_VERSION="26.2.6"
DRY_RUN=false
TARGET="${1:-all}"
[[ "$TARGET" == "--dry-run" ]] && { DRY_RUN=true; TARGET="all"; }
[[ "${2:-}" == "--dry-run" ]] && DRY_RUN=true

# ── Server definitions ────────────────────────────────────────
NAMES=(helsinki oracle gcp scaleway)
SSH_ADDRS=("$HEL_SSH" "$ORC_SSH" "$GCP_SSH" "$SCW_SSH")
ARCHES=("amd64" "arm64" "amd64" "amd64")  # Oracle is ARM

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

echo "═══════════════════════════════════════════════════"
echo "  Xray-core Upgrade to v${XRAY_VERSION}"
echo "  New features: Finalmask, XHTTP anti-detect,"
echo "  Salamander, udphop, Chrome UA"
echo "═══════════════════════════════════════════════════"
echo ""

for i in "${!NAMES[@]}"; do
  server="${NAMES[$i]}"
  SSH="${SSH_ADDRS[$i]}"
  DCMD=$(docker_cmd "$server")
  SUDO=$(sudo_prefix "$server")
  ARCH="${ARCHES[$i]}"

  if [[ "$TARGET" != "all" && "$TARGET" != "$server" ]]; then
    continue
  fi

  echo "═══ $server ($SSH) — arch: $ARCH ═══"

  if $DRY_RUN; then
    echo "  [dry-run] Would upgrade xray-core to v${XRAY_VERSION}"
    echo "  [dry-run] Would download: Xray-linux-${ARCH}.zip"
    echo "  [dry-run] Would restart xray container"
    echo ""
    continue
  fi

  # Map arch names (GitHub uses 64 not amd64)
  case "$ARCH" in
    amd64) GH_ARCH="64" ;;
    arm64) GH_ARCH="arm64-v8a" ;;
  esac

  echo "  → Checking current xray-core version..."
  CURRENT_VER=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /opt/reality-ezpz
    # Try running xray version inside the container first
    $DCMD exec reality-ezpz-xray-1 /usr/bin/xray version 2>/dev/null | head -1 || \
    $DCMD exec xray /usr/bin/xray version 2>/dev/null | head -1 || \
    # Try the binary directly
    /opt/reality-ezpz/xray-core/xray version 2>/dev/null | head -1 || \
    echo 'unknown'
  " 2>/dev/null || echo "unknown")
  echo "  Current: $CURRENT_VER"

  echo "  → Downloading Xray-core v${XRAY_VERSION}..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /tmp
    $SUDO rm -rf xray-upgrade && mkdir -p xray-upgrade && cd xray-upgrade

    # Download the release
    curl -fsSL -o xray.zip \
      'https://github.com/XTLS/Xray-core/releases/download/v${XRAY_VERSION}/Xray-linux-${GH_ARCH}.zip'

    # Extract
    $SUDO apt-get install -y -qq unzip 2>/dev/null || true
    unzip -o xray.zip -d xray-extracted

    echo '[OK] Downloaded and extracted Xray-core v${XRAY_VERSION}'
  " 2>&1 | sed 's/^/  /'

  echo "  → Upgrading xray-core binary..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    cd /opt/reality-ezpz

    # Backup current xray binary
    if [ -d xray-core ]; then
      $SUDO cp xray-core/xray xray-core/xray.bak.\$(date +%s) 2>/dev/null || true
    fi

    # Method 1: If xray runs as standalone binary in /opt/reality-ezpz/xray-core/
    if [ -d xray-core ]; then
      $SUDO cp /tmp/xray-upgrade/xray-extracted/xray xray-core/xray
      $SUDO chmod +x xray-core/xray
      echo '[OK] Updated standalone xray binary'
    fi

    # Method 2: If xray runs inside Docker, rebuild/update the image
    # Check if docker-compose uses a custom xray image
    if grep -q 'ghcr.io/xtls/xray-core' docker-compose.yml 2>/dev/null; then
      $SUDO sed -i 's|ghcr.io/xtls/xray-core:.*|ghcr.io/xtls/xray-core:v${XRAY_VERSION}|' docker-compose.yml
      $DCMD compose pull xray 2>/dev/null || true
      echo '[OK] Updated Docker image reference'
    fi

    # Method 3: Copy binary into running container + volume mount
    # If xray runs in container with bind-mounted config
    if $DCMD ps | grep -q xray 2>/dev/null; then
      XRAY_CONTAINER=\$($DCMD ps --format '{{.Names}}' | grep xray | head -1)
      if [ -n \"\$XRAY_CONTAINER\" ]; then
        $DCMD cp /tmp/xray-upgrade/xray-extracted/xray \"\$XRAY_CONTAINER\":/usr/bin/xray 2>/dev/null || true
        echo '[OK] Copied binary into container'
      fi
    fi

    # Restart xray
    $DCMD compose restart xray 2>/dev/null || \
    $DCMD restart \$($DCMD ps --format '{{.Names}}' | grep xray | head -1) 2>/dev/null || true

    # Verify
    sleep 2
    NEW_VER=\$($DCMD exec reality-ezpz-xray-1 /usr/bin/xray version 2>/dev/null | head -1 || \
              $DCMD exec xray /usr/bin/xray version 2>/dev/null | head -1 || \
              echo 'check manually')
    echo \"[OK] Xray version after upgrade: \$NEW_VER\"

    # Cleanup
    rm -rf /tmp/xray-upgrade
  " 2>&1 | sed 's/^/  /'

  echo "  Done!"
  echo ""
done

echo "═══ Upgrade complete ═══"
echo ""
echo "Verify from each server:"
echo "  ssh root@SERVER 'docker exec reality-ezpz-xray-1 /usr/bin/xray version'"
echo ""
echo "New features now available:"
echo "  - Finalmask (XICMP, XDNS) — deploy with deploy-finalmask.sh"
echo "  - XHTTP CDN anti-detection — auto-enabled"
echo "  - Salamander UDP mask — deploy with deploy-salamander-udphop.sh"
echo "  - Hysteria2 udphop — deploy with deploy-salamander-udphop.sh"
echo "  - Dynamic Chrome User-Agent — auto-enabled for all HTTP requests"
