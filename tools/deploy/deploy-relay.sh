#!/usr/bin/env bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
#
# deploy-relay.sh — Deploy a disposable TCP relay (IP-block bypass)
#
# A relay is a cheap/free VPS that forwards TCP traffic to our real server.
# When Iran blocks our server IPs, users connect to the relay IP instead.
# The relay is disposable — when it gets blocked, destroy and spin up a new one.
#
# Architecture:
#   Client → relay_ip:PORT → (iptables DNAT) → real_server_ip:PORT → Internet
#
# The relay does NO processing — just forwards TCP packets. All encryption
# (Reality TLS, Hy2 QUIC, SS2022) happens end-to-end between client and server.
#
# Requirements on relay VPS:
#   - Any cheap Linux VPS ($2-4/mo): DigitalOcean, Vultr, Linode, BuyVM
#   - Root access (needs iptables)
#   - Fresh IP not yet blocked in Iran
#   - No Docker needed, no sing-box needed — just iptables
#
# Usage:
#   bash deploy-relay.sh <relay_ssh> <target_server> [--dry-run]
#
# Examples:
#   bash deploy-relay.sh root@185.x.x.x helsinki        # Relay for Helsinki
#   bash deploy-relay.sh root@185.x.x.x oracle          # Relay for Oracle
#   bash deploy-relay.sh root@185.x.x.x scaleway --dry-run  # Preview
#
# To remove a relay:
#   ssh root@RELAY_IP 'iptables -t nat -F && echo 0 > /proc/sys/net/ipv4/ip_forward'
#
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../server-config.sh" 2>/dev/null \
  || { echo "❌ server-config.sh not found. Copy from server-config.sh.example"; exit 1; }

DRY_RUN=false
[[ "${3:-}" == "--dry-run" ]] && DRY_RUN=true

RELAY_SSH="${1:-}"
TARGET="${2:-}"

if [[ -z "$RELAY_SSH" || -z "$TARGET" ]]; then
  echo "Usage: $0 <relay_ssh> <target_server> [--dry-run]"
  echo ""
  echo "  relay_ssh:     SSH address of the relay VPS (e.g., root@185.x.x.x)"
  echo "  target_server: helsinki | oracle | gcp | scaleway"
  echo ""
  echo "Examples:"
  echo "  $0 root@185.1.2.3 helsinki"
  echo "  $0 root@185.1.2.3 scaleway --dry-run"
  exit 1
fi

# ── Target server mapping ──────────────────────────────────────────

TARGET_IP=$(get_ip "$TARGET")
if [[ -z "$TARGET_IP" ]]; then
  echo "Unknown target server: $TARGET"
  echo "Valid targets: helsinki, oracle, gcp, scaleway"
  exit 1
fi

# Ports to forward (all protocols that use direct IP connection)
# 443  = Reality (TLS)
# 80   = HAProxy (XrayHTTP, XHTTP, CDN-WS, SS2022)
# 8443 = Hysteria2 (UDP)
# 2053 = Cloak (TLS camouflage, Scaleway only)
# 2087 = naiveproxy (HTTPS, Scaleway only)
TCP_PORTS="443 80"
UDP_PORTS="8443"

# Add Scaleway-specific ports
if [[ "$TARGET" == "scaleway" ]]; then
  TCP_PORTS="443 80 2053 2087"
fi

RELAY_IP=$(echo "$RELAY_SSH" | cut -d@ -f2)

echo "═══ TCP Relay Deployment ═══"
echo ""
echo "  Relay:   $RELAY_SSH ($RELAY_IP)"
echo "  Target:  $TARGET ($TARGET_IP)"
echo "  TCP:     $TCP_PORTS"
echo "  UDP:     $UDP_PORTS"
echo ""

if $DRY_RUN; then
  echo "[dry-run] Would configure iptables DNAT on $RELAY_SSH"
  echo ""
  echo "Commands that would run:"
  echo "  sysctl -w net.ipv4.ip_forward=1"
  for PORT in $TCP_PORTS; do
    echo "  iptables -t nat -A PREROUTING -p tcp --dport $PORT -j DNAT --to-destination $TARGET_IP:$PORT"
  done
  for PORT in $UDP_PORTS; do
    echo "  iptables -t nat -A PREROUTING -p udp --dport $PORT -j DNAT --to-destination $TARGET_IP:$PORT"
  done
  echo "  iptables -t nat -A POSTROUTING -j MASQUERADE"
  echo ""
  echo "Worker.js config to add:"
  echo "  relay: { ip: \"$RELAY_IP\", ports: [${TCP_PORTS// /, }, ${UDP_PORTS// /, }] },"
  exit 0
fi

echo "  → Enabling IP forwarding and configuring iptables..."
ssh -o ConnectTimeout=10 -o BatchMode=yes "$RELAY_SSH" "
  # Enable IP forwarding (persistent)
  sysctl -w net.ipv4.ip_forward=1
  echo 'net.ipv4.ip_forward = 1' >> /etc/sysctl.conf 2>/dev/null || true

  # Flush existing NAT rules (clean slate)
  iptables -t nat -F

  # TCP port forwarding
  $(for PORT in $TCP_PORTS; do
    echo "iptables -t nat -A PREROUTING -p tcp --dport $PORT -j DNAT --to-destination $TARGET_IP:$PORT"
  done)

  # UDP port forwarding (Hysteria2)
  $(for PORT in $UDP_PORTS; do
    echo "iptables -t nat -A PREROUTING -p udp --dport $PORT -j DNAT --to-destination $TARGET_IP:$PORT"
  done)

  # Masquerade outgoing (so target server sees relay IP, not client IP)
  iptables -t nat -A POSTROUTING -j MASQUERADE

  # Show result
  echo '--- NAT rules ---'
  iptables -t nat -L -n --line-numbers
" 2>&1 | sed 's/^/  /'

echo ""
echo "  → Verifying relay connectivity..."
# Quick TCP check: can the relay reach the target?
ssh -o ConnectTimeout=10 -o BatchMode=yes "$RELAY_SSH" "
  nc -zvw3 $TARGET_IP 443 2>&1 || echo 'WARNING: cannot reach target port 443'
  nc -zvw3 $TARGET_IP 80 2>&1 || echo 'WARNING: cannot reach target port 80'
" 2>&1 | sed 's/^/  /'

echo ""
echo "═══ Relay deployment complete ═══"
echo ""
echo "Relay IP: $RELAY_IP"
echo "Target:   $TARGET ($TARGET_IP)"
echo ""
echo "Add to worker.js server config for $TARGET:"
echo "  relay: { ip: \"$RELAY_IP\", ports: [${TCP_PORTS// /, }, ${UDP_PORTS// /, }] },"
echo ""
echo "Test from outside Iran:"
echo "  curl -s -o /dev/null -w '%{http_code}' http://$RELAY_IP/"
echo "  # Should return same as http://$TARGET_IP/"
echo ""
echo "To remove relay:"
echo "  ssh $RELAY_SSH 'iptables -t nat -F && sysctl -w net.ipv4.ip_forward=0'"
echo ""
echo "When relay IP gets blocked:"
echo "  1. Destroy the relay VPS"
echo "  2. Spin up a new one (fresh IP)"
echo "  3. Run: bash deploy-relay.sh root@NEW_IP $TARGET"
echo "  4. Update worker.js relay.ip → wrangler deploy"
echo "  5. Users auto-get new relay IP on next subscription refresh (4h)"
