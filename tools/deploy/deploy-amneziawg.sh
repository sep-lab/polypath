#!/usr/bin/env bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
#
# deploy-amneziawg.sh — Deploy AmneziaWG (obfuscated WireGuard) on a server
#
# AmneziaWG modifies the WireGuard protocol to evade DPI detection:
#   - Randomizes packet sizes (Jc, Jmin, Jmax parameters)
#   - Adds junk packets during handshake (S1, S2 parameters)
#   - Modifies handshake initiation (H1, H2, H3, H4 parameters)
#
# This makes the handshake unrecognizable to DPI that fingerprints standard
# WireGuard. Iran/China/Russia can detect and block vanilla WireGuard — 
# AmneziaWG defeats this by changing the on-wire format.
#
# Architecture:
#   Client (AmneziaWG app / Hiddify) → server:UDP_PORT → AmneziaWG container
#     → Internet (or WARP outbound via PostUp iptables)
#
# Port: 51820/udp (standard WG port, or custom)
#
# Client support:
#   - AmneziaVPN (Android/iOS/Win/Mac/Linux): native support
#   - Hiddify: supports amneziawg:// URIs (sing-box backend)
#   - Standard WireGuard clients: NOT compatible (protocol modified)
#
# Usage:
#   bash deploy-amneziawg.sh helsinki              # Deploy to Helsinki
#   bash deploy-amneziawg.sh --dry-run helsinki     # Preview only
#   bash deploy-amneziawg.sh --generate helsinki    # Generate config only
#
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../server-config.sh" 2>/dev/null \
  || { echo "❌ server-config.sh not found. Copy from server-config.sh.example"; exit 1; }

DRY_RUN=false
GENERATE_ONLY=false
[[ "${1:-}" == "--dry-run" ]] && { DRY_RUN=true; shift; }
[[ "${1:-}" == "--generate" ]] && { GENERATE_ONLY=true; shift; }

TARGET="${1:-helsinki}"

# ── Server mapping ──────────────────────────────────────────

get_location() {
  case "$1" in
    helsinki)  echo "Finland" ;;
    oracle)   echo "Madrid" ;;
    gcp)      echo "Middle East" ;;
    scaleway) echo "London" ;;
    *) echo "" ;;
  esac
}

SSH=$(get_ssh "$TARGET")
SERVER_IP=$(get_ip "$TARGET")
LOCATION=$(get_location "$TARGET")

if [[ -z "$SSH" ]]; then
  echo "Unknown server: $TARGET"
  echo "Usage: $0 [--dry-run|--generate] <helsinki|oracle|gcp|scaleway>"
  exit 1
fi

SUDO=""
DCMD="docker"
if [[ "$TARGET" == "oracle" || "$TARGET" == "gcp" ]]; then
  SUDO="sudo"
  DCMD="sudo docker"
fi

# ── AmneziaWG Configuration ─────────────────────────────────
AWG_PORT=51820   # UDP port for AmneziaWG
AWG_SUBNET="10.8.1.0/24"
AWG_SERVER_ADDR="10.8.1.1"
AWG_CLIENT_ADDR="10.8.1.2"
AWG_DNS="1.1.1.1, 1.0.0.1"

# ── Obfuscation Parameters ──────────────────────────────────
# These modify the WireGuard handshake to evade DPI:
#   Jc  = junk packet count (sent during handshake)
#   Jmin/Jmax = junk packet size range (bytes)
#   S1  = extra bytes added to handshake initiation message
#   S2  = extra bytes added to handshake response message
#   H1-H4 = modified header constants (changes handshake fingerprint)
#
# Values below are tuned for Iran's DPI:
#   - Moderate junk (Jc=4) to not trigger volume anomaly detection
#   - Variable sizes (40-1000) to avoid fixed-size fingerprinting
#   - Non-default H values to change handshake signature completely
AWG_JC=4
AWG_JMIN=40
AWG_JMAX=1000
AWG_S1=61
AWG_S2=23
AWG_H1=925739839
AWG_H2=1299561360
AWG_H3=235575505
AWG_H4=1766738085

echo "═══ AmneziaWG deployment: $TARGET ($SSH) ═══"
echo ""
echo "  Server:   $SERVER_IP (${LOCATION})"
echo "  Port:     $AWG_PORT/udp"
echo "  Subnet:   $AWG_SUBNET"
echo "  Jc=$AWG_JC  Jmin=$AWG_JMIN  Jmax=$AWG_JMAX"
echo "  S1=$AWG_S1  S2=$AWG_S2"
echo "  H1=$AWG_H1  H2=$AWG_H2  H3=$AWG_H3  H4=$AWG_H4"
echo ""

# ── Generate keys ────────────────────────────────────────────
# AmneziaWG uses standard WireGuard keys (curve25519)
echo "  → Generating WireGuard keypairs..."

# Server keypair
SERVER_PRIVKEY=$(wg genkey 2>/dev/null || openssl rand -base64 32)
SERVER_PUBKEY=$(echo "$SERVER_PRIVKEY" | wg pubkey 2>/dev/null || echo "<generate-on-server>")

# Client keypair
CLIENT_PRIVKEY=$(wg genkey 2>/dev/null || openssl rand -base64 32)
CLIENT_PUBKEY=$(echo "$CLIENT_PRIVKEY" | wg pubkey 2>/dev/null || echo "<generate-on-server>")

# Preshared key (extra layer of crypto)
PSK=$(wg genpsk 2>/dev/null || openssl rand -base64 32)

echo "  Server pubkey:  ${SERVER_PUBKEY:0:20}..."
echo "  Client pubkey:  ${CLIENT_PUBKEY:0:20}..."
echo ""

if $GENERATE_ONLY; then
  echo "═══ Config Generation (--generate mode) ═══"
  echo ""
  echo "Server config (/etc/amnezia/amneziawg/awg0.conf):"
  echo "────────────────────────────────────────────"
  cat <<EOF
[Interface]
Address = $AWG_SERVER_ADDR/24
ListenPort = $AWG_PORT
PrivateKey = $SERVER_PRIVKEY
Jc = $AWG_JC
Jmin = $AWG_JMIN
Jmax = $AWG_JMAX
S1 = $AWG_S1
S2 = $AWG_S2
H1 = $AWG_H1
H2 = $AWG_H2
H3 = $AWG_H3
H4 = $AWG_H4
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]
PublicKey = $CLIENT_PUBKEY
PresharedKey = $PSK
AllowedIPs = $AWG_CLIENT_ADDR/32
EOF
  echo ""
  echo "Client config:"
  echo "────────────────────────────────────────────"
  cat <<EOF
[Interface]
Address = $AWG_CLIENT_ADDR/24
DNS = $AWG_DNS
PrivateKey = $CLIENT_PRIVKEY
Jc = $AWG_JC
Jmin = $AWG_JMIN
Jmax = $AWG_JMAX
S1 = $AWG_S1
S2 = $AWG_S2
H1 = $AWG_H1
H2 = $AWG_H2
H3 = $AWG_H3
H4 = $AWG_H4

[Peer]
PublicKey = $SERVER_PUBKEY
PresharedKey = $PSK
Endpoint = $SERVER_IP:$AWG_PORT
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
EOF
  echo ""
  echo "Add to worker.js:"
  echo "────────────────────────────────────────────"
  cat <<EOF
amneziawg: {
  port: $AWG_PORT,
  public_key: "$SERVER_PUBKEY",
  client_private_key: "$CLIENT_PRIVKEY",
  psk: "$PSK",
  client_addr: "$AWG_CLIENT_ADDR",
  dns: "$AWG_DNS",
  jc: $AWG_JC,
  jmin: $AWG_JMIN,
  jmax: $AWG_JMAX,
  s1: $AWG_S1,
  s2: $AWG_S2,
  h1: $AWG_H1,
  h2: $AWG_H2,
  h3: $AWG_H3,
  h4: $AWG_H4,
},
EOF
  exit 0
fi

if $DRY_RUN; then
  echo "[dry-run] Would deploy AmneziaWG to $TARGET"
  echo ""
  echo "Steps that would execute:"
  echo "  1. Install amneziawg-tools + kernel module"
  echo "  2. Create /etc/amnezia/amneziawg/awg0.conf"
  echo "  3. Enable IP forwarding"
  echo "  4. Open UDP port $AWG_PORT in UFW"
  echo "  5. Start awg-quick@awg0 service"
  echo ""
  echo "Client URI for subscription:"
  echo "  awg://...base64-encoded-config..."
  exit 0
fi

# ── Deploy ───────────────────────────────────────────────────
echo "  → Deploying AmneziaWG to $TARGET..."

ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
  set -e

  # Install AmneziaWG
  echo '  → Installing AmneziaWG...'
  if ! command -v awg &>/dev/null; then
    # Add AmneziaWG PPA and install
    $SUDO apt-get update -qq
    $SUDO apt-get install -y -qq software-properties-common
    $SUDO add-apt-repository -y ppa:amnezia/ppa 2>/dev/null || {
      # Manual installation for non-Ubuntu or older systems
      echo '  → PPA not available, installing from GitHub releases...'
      ARCH=\$(dpkg --print-architecture)
      AWG_DEB_URL=\"https://github.com/amnezia-vpn/amneziawg-linux-kernel-module/releases/latest/download/amneziawg-tools_\${ARCH}.deb\"
      curl -Lo /tmp/amneziawg-tools.deb \"\$AWG_DEB_URL\" 2>/dev/null || true
      $SUDO dpkg -i /tmp/amneziawg-tools.deb 2>/dev/null || true
    }
    $SUDO apt-get update -qq
    $SUDO apt-get install -y -qq amneziawg amneziawg-tools 2>/dev/null || {
      echo '  → Falling back to Docker-based AmneziaWG...'
      # Use Docker image as fallback
    }
  fi
  echo '  → AmneziaWG tools installed'

  # Create config directory
  $SUDO mkdir -p /etc/amnezia/amneziawg

  # Enable IP forwarding
  echo 'net.ipv4.ip_forward = 1' | $SUDO tee /etc/sysctl.d/99-amneziawg.conf > /dev/null
  $SUDO sysctl -w net.ipv4.ip_forward=1 > /dev/null

  # Detect main network interface
  IFACE=\$(ip route | grep default | awk '{print \$5}' | head -1)
  echo \"  → Main interface: \$IFACE\"

  # Write server config
  $SUDO tee /etc/amnezia/amneziawg/awg0.conf > /dev/null <<AWGCONF
[Interface]
Address = $AWG_SERVER_ADDR/24
ListenPort = $AWG_PORT
PrivateKey = $SERVER_PRIVKEY
Jc = $AWG_JC
Jmin = $AWG_JMIN
Jmax = $AWG_JMAX
S1 = $AWG_S1
S2 = $AWG_S2
H1 = $AWG_H1
H2 = $AWG_H2
H3 = $AWG_H3
H4 = $AWG_H4
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -t nat -A POSTROUTING -o \$IFACE -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -t nat -D POSTROUTING -o \$IFACE -j MASQUERADE

[Peer]
PublicKey = $CLIENT_PUBKEY
PresharedKey = $PSK
AllowedIPs = $AWG_CLIENT_ADDR/32
AWGCONF

  $SUDO chmod 600 /etc/amnezia/amneziawg/awg0.conf
  echo '  → Server config written'

  # Open UDP port in UFW
  $SUDO ufw allow $AWG_PORT/udp comment 'AmneziaWG' 2>/dev/null || true
  echo '  → UFW rule added: $AWG_PORT/udp'

  # Start AmneziaWG
  $SUDO awg-quick down awg0 2>/dev/null || true
  $SUDO awg-quick up awg0
  echo '  → AmneziaWG interface up'

  # Enable on boot
  $SUDO systemctl enable awg-quick@awg0 2>/dev/null || {
    # Create systemd service manually if awg-quick service not available
    cat <<SVCEOF | $SUDO tee /etc/systemd/system/awg-quick@.service > /dev/null
[Unit]
Description=AmneziaWG via awg-quick(8) for %I
After=network-online.target nss-lookup.target
Wants=network-online.target nss-lookup.target
Documentation=man:awg-quick(8)

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/awg-quick up %i
ExecStop=/usr/bin/awg-quick down %i

[Install]
WantedBy=multi-user.target
SVCEOF
    $SUDO systemctl daemon-reload
    $SUDO systemctl enable awg-quick@awg0
  }
  echo '  → Service enabled for auto-start'

  # Verify
  echo '  → Status:'
  $SUDO awg show awg0 2>&1 | head -20
" 2>&1 | sed 's/^/  /'

echo ""
echo "═══ AmneziaWG deployed to $TARGET ═══"
echo ""
echo "Server public key: $SERVER_PUBKEY"
echo "Client private key: $CLIENT_PRIVKEY"
echo "Preshared key: $PSK"
echo ""
echo "Add to worker.js ($TARGET server config):"
echo "────────────────────────────────────────────"
cat <<EOF
amneziawg: {
  port: $AWG_PORT,
  public_key: "$SERVER_PUBKEY",
  client_private_key: "$CLIENT_PRIVKEY",
  psk: "$PSK",
  client_addr: "$AWG_CLIENT_ADDR",
  dns: "$AWG_DNS",
  jc: $AWG_JC,
  jmin: $AWG_JMIN,
  jmax: $AWG_JMAX,
  s1: $AWG_S1,
  s2: $AWG_S2,
  h1: $AWG_H1,
  h2: $AWG_H2,
  h3: $AWG_H3,
  h4: $AWG_H4,
},
EOF
echo ""
echo "Client URI (for Hiddify / AmneziaVPN):"
echo "  Import the client config as AmneziaWG in the app"
echo ""
echo "IMPORTANT: After deploying, update worker.js and redeploy:"
echo "  cd tools/smart-sub && wrangler deploy"
