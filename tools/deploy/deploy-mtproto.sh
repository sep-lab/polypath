#!/usr/bin/env bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
#
# deploy-mtproto.sh — Deploy MTProto Telegram proxy (mtg v2) on servers
#
# MTProto proxy allows Telegram users to access Telegram through your server.
# Uses mtg v2 with fake-TLS mode — looks like TLS to google.com from DPI.
#
# Architecture:
#   Telegram App → server:3443 (mtg, fake-TLS google.com)
#                → Telegram servers (directly, no VPN needed)
#
# Port 3443/tcp: Avoids conflict with Reality (443), HAProxy (80/443),
# and Hysteria2 (8443/udp). mtg fake-TLS makes it look like HTTPS
# regardless of port.
#
# Client support:
#   - Telegram (all platforms): Settings → Data and Storage → Proxy
#   - Paste tg://proxy link or https://t.me/proxy link
#
# Prerequisites:
#   - Docker installed
#   - Port 3443/tcp open in cloud firewall + UFW
#
# Usage:
#   bash deploy-mtproto.sh all              # Deploy to all servers
#   bash deploy-mtproto.sh helsinki          # Deploy to one server
#   bash deploy-mtproto.sh --status         # Check status on all servers
#
set -eo pipefail

MTG_IMAGE="nineseconds/mtg:2"
MTG_PORT=3443
MTG_CONTAINER_PORT=3128
CONTAINER_NAME="mtproto"
FAKE_TLS_DOMAIN="google.com"

# Server SSH targets — loaded from server-config.sh (shared across all deploy scripts)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../server-config.sh
source "$SCRIPT_DIR/../server-config.sh" 2>/dev/null \
  || source "$SCRIPT_DIR/server-config.sh" 2>/dev/null \
  || { echo "❌ server-config.sh not found. Copy from server-config.sh.example and fill in real values."; exit 1; }

declare -A SERVERS
SERVERS[helsinki]="$HEL_SSH"
SERVERS[oracle]="$ORC_SSH"
SERVERS[gcp]="$GCP_SSH"
SERVERS[scaleway]="$SCW_SSH"

# Prefix for sudo on non-root servers
declare -A SUDO
SUDO[helsinki]=""
SUDO[oracle]="sudo"
SUDO[gcp]="sudo"
SUDO[scaleway]=""

info()  { echo "ℹ️  $1"; }
ok()    { echo "✅ $1"; }
warn()  { echo "⚠️  $1"; }
die()   { echo "❌ $1" >&2; exit 1; }

ssh_cmd() {
  local target="$1"; shift
  ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$target" "$@" 2>&1
}

deploy_server() {
  local tag="$1"
  local target="${SERVERS[$tag]}"
  local sudo="${SUDO[$tag]}"
  [ -z "$target" ] && die "Unknown server: $tag"

  info "Deploying mtg to $tag ($target)..."

  # Check if already running
  local running
  running=$(ssh_cmd "$target" "${sudo} docker ps --filter name=$CONTAINER_NAME --format '{{.Names}}'" 2>/dev/null || true)
  if [ "$running" = "$CONTAINER_NAME" ]; then
    ok "$tag: mtg already running"
    # Show existing secret
    local secret
    secret=$(ssh_cmd "$target" "${sudo} docker inspect $CONTAINER_NAME --format '{{.Args}}'" 2>/dev/null | grep -oP 'ee[0-9a-f]+' || echo "unknown")
    info "  Secret: $secret"
    info "  Link: tg://proxy?server=$(echo "$target" | cut -d@ -f2)&port=$MTG_PORT&secret=$secret"
    return 0
  fi

  # Generate secret
  info "  Generating fake-TLS secret for $FAKE_TLS_DOMAIN..."
  local secret
  secret=$(ssh_cmd "$target" "${sudo} docker run --rm $MTG_IMAGE generate-secret --hex $FAKE_TLS_DOMAIN" 2>/dev/null | tail -1)
  [ -z "$secret" ] && die "Failed to generate secret on $tag"
  ok "  Secret: $secret"

  # Start container
  info "  Starting mtg container..."
  ssh_cmd "$target" "${sudo} docker run -d --name $CONTAINER_NAME --restart always -p ${MTG_PORT}:${MTG_CONTAINER_PORT} $MTG_IMAGE simple-run 0.0.0.0:${MTG_CONTAINER_PORT} $secret" >/dev/null

  # Open firewall
  info "  Opening port $MTG_PORT/tcp in UFW..."
  ssh_cmd "$target" "${sudo} ufw allow ${MTG_PORT}/tcp comment 'MTProto proxy'" >/dev/null 2>&1 || true

  # Verify
  local verify
  verify=$(ssh_cmd "$target" "${sudo} docker ps --filter name=$CONTAINER_NAME --format '{{.Status}}'" 2>/dev/null)
  if echo "$verify" | grep -q "Up"; then
    ok "$tag: mtg deployed successfully"
  else
    warn "$tag: container may not be running — check manually"
  fi

  local ip
  ip=$(echo "$target" | cut -d@ -f2)
  echo ""
  echo "  Telegram proxy link:"
  echo "  tg://proxy?server=${ip}&port=${MTG_PORT}&secret=${secret}"
  echo "  https://t.me/proxy?server=${ip}&port=${MTG_PORT}&secret=${secret}"
  echo ""
}

check_status() {
  echo "MTProto Proxy Status"
  echo "===================="
  for tag in helsinki oracle gcp scaleway; do
    local target="${SERVERS[$tag]}"
    local sudo="${SUDO[$tag]}"
    local status
    status=$(ssh_cmd "$target" "${sudo} docker ps --filter name=$CONTAINER_NAME --format '{{.Status}}'" 2>/dev/null || echo "not running")
    if [ -n "$status" ]; then
      echo "  $tag: $status"
    else
      echo "  $tag: not deployed"
    fi
  done
}

# ── Main ──────────────────────────────────────────────────────────

case "${1:-help}" in
  all)
    for tag in helsinki oracle gcp scaleway; do
      deploy_server "$tag"
      echo "────────────────────"
    done
    ;;
  --status)
    check_status
    ;;
  helsinki|oracle|gcp|scaleway)
    deploy_server "$1"
    ;;
  help|*)
    echo "MTProto Telegram Proxy Deployment (mtg v2)"
    echo ""
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  all         Deploy to all 4 servers"
    echo "  helsinki    Deploy to Helsinki only"
    echo "  oracle     Deploy to Oracle Madrid only"
    echo "  gcp        Deploy to GCP Dammam only"
    echo "  scaleway   Deploy to Scaleway London only"
    echo "  --status   Check status on all servers"
    echo "  help       Show this help"
    echo ""
    echo "Port: $MTG_PORT/tcp (fake-TLS to $FAKE_TLS_DOMAIN)"
    echo "Container: $CONTAINER_NAME ($MTG_IMAGE)"
    ;;
esac
