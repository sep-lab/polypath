#!/usr/bin/env bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
#
# deploy-dnstunnel-expand.sh — Deploy DNS tunnel (dnstm) on additional servers
#
# DNS tunnel currently runs only on Helsinki. This expands to Oracle Madrid
# and Scaleway London for redundancy.
#
# If Helsinki's port 53 is blocked or the server goes down,
# DNS tunnel users have no fallback. This eliminates that single point of failure.
#
# DNS tunneling encodes VPN traffic inside DNS queries. Since blocking DNS
# breaks the entire internet, this is a near-unblockable last resort.
#
# Requirements per server:
#   - Port 53/udp+tcp free (systemd-resolved disabled)
#   - DNS records in Cloudflare (NS delegation)
#   - dnstm v0.6.7+ binary
#
# DNS records needed (all DNS-only / grey cloud):
#   Oracle Madrid:
#     A    tns2  → <ORC_IP>
#     NS   t-m   → tns2.example.com     (Slipstream+SOCKS)
#     NS   t2-m  → tns2.example.com     (DNSTT+SOCKS fallback)
#
#   Scaleway London:
#     A    tns3  → <SCW_IP>
#     NS   t-l   → tns3.example.com     (Slipstream+SOCKS)
#     NS   t2-l  → tns3.example.com     (DNSTT+SOCKS fallback)
#
# Usage:
#   bash deploy-dnstunnel-expand.sh            # Deploy to oracle + scaleway
#   bash deploy-dnstunnel-expand.sh oracle     # Deploy to oracle only
#   bash deploy-dnstunnel-expand.sh --dry-run  # Preview only
#
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../server-config.sh" 2>/dev/null \
  || { echo "❌ server-config.sh not found. Copy from server-config.sh.example"; exit 1; }

DRY_RUN=false
TARGET="${1:-expand}"
[[ "$TARGET" == "--dry-run" ]] && { DRY_RUN=true; TARGET="expand"; }
[[ "${2:-}" == "--dry-run" ]] && DRY_RUN=true

DNSTM_VERSION="0.6.7"

if [[ "$TARGET" == "expand" ]]; then
  DEPLOY_SERVERS=(oracle scaleway)
else
  DEPLOY_SERVERS=("$TARGET")
fi

# ── Server mapping ────────────────────────────────────────────

get_arch_bin() {
  case "$1" in
    oracle)  echo "dnstm-linux-arm64" ;;
    *)       echo "dnstm-linux-amd64" ;;
  esac
}

# DNS subdomain mapping for each server
get_ns_name() {
  case "$1" in
    helsinki) echo "tns" ;;
    oracle)  echo "tns2" ;;
    gcp)     echo "tns3" ;;
    scaleway) echo "tns4" ;;
  esac
}

get_tunnel_prefix() {
  case "$1" in
    helsinki) echo "t" ;;   # existing: t.example.com
    oracle)  echo "t-m" ;; # madrid
    gcp)     echo "t-d" ;; # dammam
    scaleway) echo "t-l" ;; # london
  esac
}

sudo_prefix() {
  case "$1" in
    oracle|gcp) echo "sudo" ;;
    *) echo "" ;;
  esac
}

DOMAIN="example.com"

echo "═══════════════════════════════════════════════════"
echo "  DNS Tunnel Expansion"
echo "  Servers: ${DEPLOY_SERVERS[*]}"
echo "  Using dnstm v${DNSTM_VERSION}"
echo "═══════════════════════════════════════════════════"
echo ""

for server in "${DEPLOY_SERVERS[@]}"; do
  SSH=$(get_ssh "$server")
  SUDO=$(sudo_prefix "$server")
  BIN=$(get_arch_bin "$server")
  NS_NAME=$(get_ns_name "$server")
  T_PREFIX=$(get_tunnel_prefix "$server")
  IP=$(echo "$SSH" | cut -d@ -f2)

  echo "═══ $server ($SSH) ═══"
  echo "  NS record: ${NS_NAME}.${DOMAIN} → ${IP}"
  echo "  Tunnel domain: ${T_PREFIX}.${DOMAIN}"
  echo ""

  if $DRY_RUN; then
    echo "  [dry-run] Would install dnstm v${DNSTM_VERSION}"
    echo "  [dry-run] Would disable systemd-resolved"
    echo "  [dry-run] Would configure DNS tunnel"
    echo "  [dry-run] DNS records needed (all DNS-only):"
    echo "    A    ${NS_NAME}    → ${IP}         (authoritative NS IP)"
    echo "    NS   ${T_PREFIX}   → ${NS_NAME}.${DOMAIN}  (Slipstream+SOCKS)"
    echo "    NS   ${T_PREFIX}2  → ${NS_NAME}.${DOMAIN}  (DNSTT+SOCKS fallback)"
    echo ""
    continue
  fi

  echo "  → Freeing port 53 (disabling systemd-resolved)..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    # Check if port 53 is already free
    if ss -tulnp | grep -q ':53 ' 2>/dev/null; then
      $SUDO systemctl stop systemd-resolved 2>/dev/null || true
      $SUDO systemctl disable systemd-resolved 2>/dev/null || true
      # Set manual DNS
      echo 'nameserver 8.8.8.8' | $SUDO tee /etc/resolv.conf
      echo 'nameserver 8.8.4.4' | $SUDO tee -a /etc/resolv.conf
      echo '[OK] systemd-resolved disabled, port 53 freed'
    else
      echo '[OK] Port 53 already free'
    fi
  " 2>&1 | sed 's/^/  /'

  echo "  → Installing dnstm v${DNSTM_VERSION}..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    if command -v dnstm &>/dev/null; then
      echo '[OK] dnstm already installed'
      dnstm --version 2>&1 || true
    else
      $SUDO curl -fsSL -o /usr/local/bin/dnstm \
        'https://github.com/net2share/dnstm/releases/download/v${DNSTM_VERSION}/${BIN}'
      $SUDO chmod +x /usr/local/bin/dnstm
      echo '[OK] dnstm installed'
    fi

    # Install tunnel components
    $SUDO /usr/local/bin/dnstm install --mode multi 2>&1 | tail -5 || true
  " 2>&1 | sed 's/^/  /'

  echo "  → Opening port 53 in firewall..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    $SUDO ufw allow 53/udp comment 'DNS tunnel' 2>/dev/null || true
    $SUDO ufw allow 53/tcp comment 'DNS tunnel' 2>/dev/null || true
    echo '[OK] Port 53 opened'
  " 2>&1 | sed 's/^/  /'

  echo "  → Configuring DNS tunnel..."
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH" "
    # Create dnstm config directory
    $SUDO mkdir -p /opt/dnstm

    # Generate DNSTT keys if not exist
    if [ ! -f /opt/dnstm/server.key ]; then
      $SUDO /usr/local/bin/dnstm keygen --output /opt/dnstm/ 2>&1 || \
      $SUDO openssl ecparam -genkey -name prime256v1 -out /opt/dnstm/server.key 2>/dev/null
      echo '[OK] Keys generated'
    else
      echo '[OK] Keys already exist'
    fi

    # Create systemd service for dnstm
    $SUDO tee /etc/systemd/system/dnstm.service > /dev/null << SVCEOF
[Unit]
Description=DNS Tunnel Manager
After=network.target
Wants=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/dnstm run --mode multi --domain ${T_PREFIX}.${DOMAIN} --ns ${NS_NAME}.${DOMAIN}
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
SVCEOF

    $SUDO systemctl daemon-reload
    $SUDO systemctl enable dnstm 2>/dev/null || true
    $SUDO systemctl restart dnstm 2>/dev/null || true
    echo '[OK] dnstm service started'

    sleep 2
    $SUDO systemctl status dnstm --no-pager 2>&1 | head -5 || true
  " 2>&1 | sed 's/^/  /'

  echo ""
  echo "  DNS records needed (create in Cloudflare — all DNS-only/grey cloud):"
  echo "    A    ${NS_NAME}    → ${IP}"
  echo "    NS   ${T_PREFIX}   → ${NS_NAME}.${DOMAIN}"
  echo "    NS   ${T_PREFIX}2  → ${NS_NAME}.${DOMAIN}"
  echo ""
  echo "  Done!"
  echo ""
done

echo "═══ DNS Tunnel Expansion Complete ═══"
echo ""
echo "IMPORTANT: Create the DNS records above in Cloudflare before testing."
echo "All records must be DNS-only (grey cloud), NOT proxied."
echo ""
echo "Test (from outside Iran):"
echo "  dig +short ${T_PREFIX}.${DOMAIN} @8.8.8.8"
echo ""
echo "Update worker.js: set has_dns_tunnel = true for expanded servers."
