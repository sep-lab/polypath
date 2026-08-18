#!/usr/bin/env bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
#
# deploy-cloak.sh — Deploy Cloak (TLS camouflage) on a server
#
# Cloak wraps proxy traffic as genuine TLS to a whitelisted domain.
# DPI sees a real TLS 1.3 handshake to google.com — can't distinguish
# from actual Chrome browsing without MitM.
#
# Architecture:
#   Client → ck-client (SIP003 plugin for Shadowsocks)
#          → server:2053 (Cloak TLS, looks like google.com)
#          → ck-server (decloaks traffic)
#          → SS2022 on engine:10082 (sing-box Shadowsocks inbound)
#          → WARP outbound → Internet
#
# Port 2053: Cloudflare-compatible HTTPS alt port. Avoids conflict with
# Reality on 443. CF recognizes 2053 as HTTPS, so CDN fronting possible later.
#
# Client support:
#   - NekoBox (sing-box): Shadowsocks + Cloak plugin
#   - Shadowsocks Android + Cloak-android APK plugin
#   - Hiddify: does NOT support SIP003 plugins (use NekoBox instead)
#
# Prerequisites:
#   - SS2022 must be deployed first (deploy-ss2022.sh)
#   - Port 2053/tcp must be open in cloud firewall + UFW
#
# Usage:
#   bash deploy-cloak.sh scaleway        # Deploy to Scaleway (recommended)
#   bash deploy-cloak.sh helsinki         # Deploy to Helsinki
#   bash deploy-cloak.sh --dry-run scaleway  # Preview only
#
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../server-config.sh" 2>/dev/null \
  || { echo "❌ server-config.sh not found. Copy from server-config.sh.example"; exit 1; }

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && { DRY_RUN=true; shift; }

TARGET="${1:-scaleway}"

# ── Server mapping (bash 3.2 compatible) ─────────────────────

get_arch() {
  case "$1" in
    oracle)  echo "arm64" ;;  # ARM instance
    *)       echo "amd64" ;;
  esac
}

SSH=$(get_ssh "$TARGET")
ARCH=$(get_arch "$TARGET")

if [[ -z "$SSH" ]]; then
  echo "Unknown server: $TARGET"
  echo "Usage: $0 [--dry-run] <helsinki|oracle|gcp|scaleway>"
  exit 1
fi

SUDO=""
DCMD="docker"
if [[ "$TARGET" == "oracle" || "$TARGET" == "gcp" ]]; then
  SUDO="sudo"
  DCMD="sudo docker"
fi

# ── Cloak Configuration ─────────────────────────────────────
CLOAK_PORT=2053
CLOAK_VERSION="2.12.0"
CLOAK_BINARY_URL="https://github.com/cbeuw/Cloak/releases/download/v${CLOAK_VERSION}/ck-server-linux-${ARCH}-v${CLOAK_VERSION}"
SS2022_BACKEND="engine:10082"  # sing-box SS2022 inbound (Docker network)
REDIRECTION_HOST="www.google.com"  # Whitelisted domain for TLS camouflage
BROWSER_SIG="chrome"

echo "═══ Cloak deployment: $TARGET ($SSH) ═══"
echo ""
echo "  Port:     $CLOAK_PORT/tcp (TLS, looks like $REDIRECTION_HOST)"
echo "  Backend:  SS2022 → $SS2022_BACKEND"
echo "  Binary:   ck-server v$CLOAK_VERSION ($ARCH)"
echo ""

# ── Generate Cloak keypair and UID ───────────────────────────
# We generate locally, then push to server
echo "  → Generating Cloak keypair and UID..."

# Generate curve25519 keypair using openssl
# Cloak uses raw 32-byte curve25519 keys, base64-encoded
# We'll generate on the server using ck-server binary
if $DRY_RUN; then
  CLOAK_PUBKEY="<will-be-generated>"
  CLOAK_PRIVKEY="<will-be-generated>"
  CLOAK_UID="<will-be-generated>"
  CLOAK_ADMIN_UID="<will-be-generated>"
else
  # Download ck-server locally (temp) to generate keys
  TMPDIR=$(mktemp -d)
  echo "  → Downloading ck-server v$CLOAK_VERSION for key generation..."

  # Detect local arch for key generation
  LOCAL_ARCH="amd64"
  if [[ "$(uname -m)" == "arm64" || "$(uname -m)" == "aarch64" ]]; then
    LOCAL_ARCH="arm64"
  fi
  LOCAL_BINARY_URL="https://github.com/cbeuw/Cloak/releases/download/v${CLOAK_VERSION}/ck-server-linux-${LOCAL_ARCH}-v${CLOAK_VERSION}"

  # On macOS, we can't run Linux binary. Generate keys on the server instead.
  if [[ "$(uname)" == "Darwin" ]]; then
    echo "  → macOS detected — generating keys on server..."
    ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
      $SUDO mkdir -p /opt/cloak
      cd /opt/cloak
      # Download ck-server binary
      $SUDO curl -sLo ck-server '${CLOAK_BINARY_URL}'
      $SUDO chmod +x ck-server
    "
    # ck-server -key outputs colored text, not JSON:
    #   "Your PUBLIC key is:                      <base64>"
    #   "Your PRIVATE key is (keep it secret):    <base64>"
    # Strip ANSI colors and extract the base64 values
    KEYS_RAW=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
      cd /opt/cloak
      $SUDO ./ck-server -key 2>&1 | sed 's/\x1b\[[0-9;]*m//g'
    ")
    CLOAK_PUBKEY=$(echo "$KEYS_RAW" | grep -i 'public' | awk '{print $NF}')
    CLOAK_PRIVKEY=$(echo "$KEYS_RAW" | grep -i 'private' | awk '{print $NF}')

    # Generate admin UID (strip ANSI colors, extract last word = base64 UID)
    CLOAK_ADMIN_UID=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
      cd /opt/cloak
      $SUDO ./ck-server -uid 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | awk '{print \$NF}'
    ")
    # Generate user UID
    CLOAK_UID=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
      cd /opt/cloak
      $SUDO ./ck-server -uid 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | awk '{print \$NF}'
    ")
  else
    # Linux — can generate locally
    curl -sLo "$TMPDIR/ck-server" "$LOCAL_BINARY_URL"
    chmod +x "$TMPDIR/ck-server"
    KEYS_RAW=$("$TMPDIR/ck-server" -key 2>&1 | sed 's/\x1b\[[0-9;]*m//g')
    CLOAK_PUBKEY=$(echo "$KEYS_RAW" | grep -i 'public' | awk '{print $NF}')
    CLOAK_PRIVKEY=$(echo "$KEYS_RAW" | grep -i 'private' | awk '{print $NF}')
    CLOAK_ADMIN_UID=$("$TMPDIR/ck-server" -uid 2>&1 | tr -d '[:space:]')
    CLOAK_UID=$("$TMPDIR/ck-server" -uid 2>&1 | tr -d '[:space:]')
    rm -rf "$TMPDIR"
  fi

  if [[ -z "$CLOAK_PUBKEY" || -z "$CLOAK_PRIVKEY" ]]; then
    echo "  ERROR: Failed to generate Cloak keys"
    echo "  Raw output was: $KEYS_RAW"
    exit 1
  fi
fi

echo ""
echo "  PublicKey:  $CLOAK_PUBKEY"
echo "  PrivateKey: $CLOAK_PRIVKEY"
echo "  AdminUID:   $CLOAK_ADMIN_UID"
echo "  UserUID:    $CLOAK_UID"
echo ""

if $DRY_RUN; then
  echo "[dry-run] Would deploy Cloak to $TARGET"
  echo ""
  echo "Pre-requisites:"
  echo "  1. SS2022 must be deployed (deploy-ss2022.sh)"
  echo "  2. Open port $CLOAK_PORT/tcp in cloud firewall"
  echo "  3. Open port $CLOAK_PORT/tcp in UFW: ufw allow $CLOAK_PORT/tcp"
  echo ""
  echo "What this script does:"
  echo "  1. Downloads ck-server v$CLOAK_VERSION binary"
  echo "  2. Creates ckserver.json config (ProxyBook → SS2022)"
  echo "  3. Creates Docker container in reality-ezpz network"
  echo "  4. Opens port $CLOAK_PORT/tcp"
  exit 0
fi

echo "  → Creating Cloak config and Docker setup..."
ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
  $SUDO mkdir -p /opt/cloak

  # Write ck-server config
  $SUDO tee /opt/cloak/ckserver.json > /dev/null << 'CKEOF'
{
  \"ProxyBook\": {
    \"shadowsocks\": [\"tcp\", \"${SS2022_BACKEND}\"]
  },
  \"BindAddr\": [\":${CLOAK_PORT}\"],
  \"BypassUID\": [\"${CLOAK_ADMIN_UID}\"],
  \"RedirAddr\": \"${REDIRECTION_HOST}\",
  \"PrivateKey\": \"${CLOAK_PRIVKEY}\",
  \"AdminUID\": \"${CLOAK_ADMIN_UID}\",
  \"DatabasePath\": \"/opt/cloak/userinfo.db\",
  \"StreamTimeout\": 300
}
CKEOF

  # Create docker-compose for Cloak
  # Connects to reality-ezpz network so it can reach engine:10082 (SS2022)
  $SUDO tee /opt/cloak/docker-compose.yml > /dev/null << 'DCEOF'
services:
  cloak:
    image: alpine:latest
    container_name: cloak
    restart: unless-stopped
    ports:
      - \"${CLOAK_PORT}:${CLOAK_PORT}\"
    volumes:
      - ./ck-server:/opt/cloak/ck-server:ro
      - ./ckserver.json:/opt/cloak/ckserver.json:ro
      - cloak-data:/opt/cloak/data
    command: /opt/cloak/ck-server -c /opt/cloak/ckserver.json
    networks:
      - reality-ezpz_reality

volumes:
  cloak-data:

networks:
  reality-ezpz_reality:
    external: true
DCEOF
" 2>&1 | sed 's/^/  /'

echo "  → Opening port $CLOAK_PORT in UFW..."
ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
  $SUDO ufw allow ${CLOAK_PORT}/tcp comment 'cloak' 2>&1 || true
" 2>&1 | sed 's/^/  /'

echo "  → Starting Cloak container..."
ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
  cd /opt/cloak
  # Ensure the binary is present and executable
  $SUDO chmod +x /opt/cloak/ck-server
  # Start with docker compose
  $DCMD compose up -d
" 2>&1 | sed 's/^/  /'

echo "  → Verifying Cloak is running..."
sleep 3
ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
  $DCMD logs cloak --tail 5 2>&1
  echo '---'
  $DCMD ps --format 'table {{.Names}}\t{{.Status}}' | grep cloak || echo 'cloak container not found'
" 2>&1 | sed 's/^/  /'

echo ""
echo "═══ Cloak deployment complete ═══"
echo ""
echo "Pre-requisites (if not done):"
echo "  1. Open port $CLOAK_PORT/tcp in cloud provider firewall"
echo "     (Hetzner/Oracle/GCP/Scaleway console)"
echo "  2. SS2022 must be deployed and working on this server"
echo ""
echo "Cloak credentials:"
echo "  PublicKey:  $CLOAK_PUBKEY"
echo "  UserUID:    $CLOAK_UID"
echo "  AdminUID:   $CLOAK_ADMIN_UID"
echo "  ServerName: $REDIRECTION_HOST"
echo "  Port:       $CLOAK_PORT"
echo ""
echo "Worker.js config:"
echo "  cloak: {"
echo "    port: $CLOAK_PORT,"
echo "    uid: \"$CLOAK_UID\","
echo "    public_key: \"$CLOAK_PUBKEY\","
echo "    server_name: \"$REDIRECTION_HOST\","
echo "    encryption: \"plain\","
echo "    browser_sig: \"$BROWSER_SIG\","
echo "  },"
echo ""
echo "Client URI (SIP002+SIP003 for NekoBox / SS+Cloak-android):"
echo "  Uses SS2022 credentials + Cloak plugin parameters"
echo "  See worker.js generateCloakSs2022URI() for auto-generated URIs"
echo ""
echo "NOTE: Hiddify does NOT support Cloak (SIP003 plugins)."
echo "      Users need NekoBox or Shadowsocks Android + Cloak-android plugin APK."
echo "      Cloak-android: https://github.com/nickoala/nickoala"
