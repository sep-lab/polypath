#!/usr/bin/env bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
#
# deploy.sh — One-command VPN server deployment
#
# Usage:
#   ./deploy.sh <SERVER_IP> [--uuid UUID] [--sni SNI] [--skip-dns-tunnel]
#
# This script SSHes into a fresh Ubuntu 24.04 VPS and deploys:
#   1. System hardening (SSH, UFW, fail2ban, unattended-upgrades)
#   2. Docker + Docker Compose
#   3. reality-ezpz (VLESS Reality + WARP)
#   4. Hysteria2 injection (self-signed cert)
#   5. Automated backups
#
# Prerequisites:
#   - SSH key access to root@SERVER_IP
#   - Ubuntu 24.04 LTS on the target server
#
set -euo pipefail

# ── Source vars.env if present ──────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[[ -f "$SCRIPT_DIR/vars.env" ]] && source "$SCRIPT_DIR/vars.env"

# ── Defaults ────────────────────────────────────────────────────────
DEFAULT_UUID="${UUID:?Set UUID in vars.env (see vars.env.example)}"
DEFAULT_SNI="www.google.com"
SKIP_DNS_TUNNEL=true  # DNS tunnels only on primary server

# ── Parse Args ──────────────────────────────────────────────────────
SERVER_IP=""
UUID="$DEFAULT_UUID"
SNI="$DEFAULT_SNI"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --uuid)     UUID="$2"; shift 2 ;;
    --sni)      SNI="$2"; shift 2 ;;
    --skip-dns-tunnel) SKIP_DNS_TUNNEL=true; shift ;;
    --with-dns-tunnel) SKIP_DNS_TUNNEL=false; shift ;;
    -*)         echo "Unknown option: $1"; exit 1 ;;
    *)          SERVER_IP="$1"; shift ;;
  esac
done

if [[ -z "$SERVER_IP" ]]; then
  echo "Usage: ./deploy.sh <SERVER_IP> [--uuid UUID] [--sni SNI]"
  exit 1
fi

echo "═══════════════════════════════════════════════════"
echo "  VPN V2 Deployment"
echo "  Target: $SERVER_IP"
echo "  UUID:   ${UUID:0:8}...${UUID: -4}"
echo "  SNI:    $SNI"
echo "  DNS:    $([ "$SKIP_DNS_TUNNEL" = true ] && echo 'skip' || echo 'install')"
echo "═══════════════════════════════════════════════════"
echo ""

SSH="ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 root@$SERVER_IP"

run_remote() {
  $SSH "$@"
}

# ── Step 1: System Update + Docker ──────────────────────────────────
echo "[1/7] System update + Docker install..."
run_remote 'bash -s' <<'REMOTE_SCRIPT'
export DEBIAN_FRONTEND=noninteractive

# Update system
apt-get update -qq && apt-get upgrade -y -qq

# Install Docker if not present
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

# Ensure docker compose plugin
if ! docker compose version &>/dev/null; then
  apt-get install -y -qq docker-compose-plugin
fi

echo "[OK] Docker $(docker --version | cut -d' ' -f3)"
REMOTE_SCRIPT

# ── Step 2: SSH Hardening ───────────────────────────────────────────
echo "[2/7] SSH hardening..."
run_remote 'bash -s' <<'REMOTE_SCRIPT'
# Disable password auth (idempotent)
if grep -q "^PasswordAuthentication yes" /etc/ssh/sshd_config 2>/dev/null; then
  sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
  sed -i 's/^#PasswordAuthentication/PasswordAuthentication/' /etc/ssh/sshd_config
  systemctl reload sshd
  echo "[OK] Password auth disabled"
else
  echo "[OK] Password auth already disabled"
fi
REMOTE_SCRIPT

# ── Step 3: UFW Firewall ────────────────────────────────────────────
echo "[3/7] Configuring UFW..."
run_remote 'bash -s' <<'REMOTE_SCRIPT'
apt-get install -y -qq ufw

# Reset and configure (idempotent)
ufw --force reset >/dev/null 2>&1
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp comment 'SSH' >/dev/null
ufw allow 80/tcp comment 'HTTP redirect' >/dev/null
ufw allow 443/tcp comment 'VLESS Reality' >/dev/null
ufw allow 8443/udp comment 'Hysteria2' >/dev/null

# Only open DNS ports if DNS tunnels are planned
# (will be opened by dnstm if needed)

ufw --force enable >/dev/null
echo "[OK] UFW: $(ufw status | grep -c ALLOW) rules active"
REMOTE_SCRIPT

# ── Step 4: fail2ban + unattended-upgrades ──────────────────────────
echo "[4/7] Security: fail2ban + unattended-upgrades..."
run_remote 'bash -s' <<'REMOTE_SCRIPT'
apt-get install -y -qq fail2ban unattended-upgrades

# Enable fail2ban
systemctl enable --now fail2ban >/dev/null 2>&1

# Enable unattended-upgrades
echo 'Unattended-Upgrade::Automatic-Reboot "false";' > /etc/apt/apt.conf.d/50unattended-upgrades-local
systemctl enable --now unattended-upgrades >/dev/null 2>&1

echo "[OK] fail2ban + unattended-upgrades active"
REMOTE_SCRIPT

# ── Step 5: reality-ezpz (VLESS Reality + WARP) ────────────────────
echo "[5/7] Deploying reality-ezpz..."
run_remote "bash -s" <<REMOTE_SCRIPT
cd /opt
if [ ! -d reality-ezpz ]; then
  git clone https://github.com/aleskxyz/reality-ezpz.git
fi
cd reality-ezpz

# Create non-interactive config
cat > config <<CONF
USERNAME=RealityEZPZ
UUID=$UUID
TRANSPORT=tcp
DOMAIN=$SNI
WARP=ON
SAFENET=OFF
CONF

# Run in non-interactive mode
bash reality-ezpz.sh --no-interactive 2>/dev/null || bash reality-ezpz.sh

echo "[OK] reality-ezpz deployed"
REMOTE_SCRIPT

# ── Step 6: Hysteria2 Injection ─────────────────────────────────────
echo "[6/7] Injecting Hysteria2..."
run_remote "bash -s" <<REMOTE_SCRIPT
cd /opt/reality-ezpz

# Generate self-signed EC cert for Hy2
mkdir -p certs
if [ ! -f certs/hy2.crt ]; then
  openssl ecparam -genkey -name prime256v1 -out certs/hy2.key 2>/dev/null
  openssl req -new -x509 -key certs/hy2.key -out certs/hy2.crt \
    -days 3650 -subj "/CN=$SNI" 2>/dev/null
  echo "[OK] Hy2 cert generated"
else
  echo "[OK] Hy2 cert already exists"
fi

# Save cert hash
HY2_HASH=\$(openssl x509 -in certs/hy2.crt -noout -fingerprint -sha256 | \
  sed 's/.*=//;s/://g' | tr '[:upper:]' '[:lower:]')
echo "HY2_CERT_SHA256=\$HY2_HASH" > certs/hy2.env
echo "[INFO] Hy2 cert SHA256: \$HY2_HASH"

# Inject Hy2 inbound into engine.conf using python3
python3 -c "
import json

with open('engine.conf', 'r') as f:
    config = json.load(f)

# Check if hy2-in already exists
existing_tags = [ib.get('tag') for ib in config.get('inbounds', [])]
if 'hy2-in' in existing_tags:
    print('[OK] Hy2 inbound already injected')
else:
    hy2_inbound = {
        'type': 'hysteria2',
        'tag': 'hy2-in',
        'listen': '::',
        'listen_port': 8444,
        'users': [{'name': 'RealityEZPZ', 'password': '$UUID'}],
        'tls': {
            'enabled': True,
            'certificate_path': '/etc/sing-box/hy2.crt',
            'key_path': '/etc/sing-box/hy2.key'
        }
    }
    config['inbounds'].append(hy2_inbound)

    # Fix route rules: ensure hy2-in is included alongside 'in'
    for rule in config.get('route', {}).get('rules', []):
        if rule.get('inbound') == 'in':
            rule['inbound'] = ['in', 'hy2-in']
        elif isinstance(rule.get('inbound'), list) and 'in' in rule['inbound'] and 'hy2-in' not in rule['inbound']:
            rule['inbound'].append('hy2-in')

    with open('engine.conf', 'w') as f:
        json.dump(config, f, indent=2)
    print('[OK] Hy2 inbound injected into engine.conf')
"

# Patch docker-compose.yml for Hy2 port + cert volumes
if ! grep -q '8443:8444/udp' docker-compose.yml; then
  sed -i '/443:443\/tcp/a\      - "8443:8444/udp"' docker-compose.yml
  echo "[OK] Added UDP port mapping"
fi

if ! grep -q 'hy2.crt' docker-compose.yml; then
  sed -i '/engine.conf/a\      - ./certs/hy2.crt:/etc/sing-box/hy2.crt:ro\n      - ./certs/hy2.key:/etc/sing-box/hy2.key:ro' docker-compose.yml
  echo "[OK] Added cert volume mounts"
fi

# Restart
docker compose down 2>/dev/null
docker compose up -d

echo "[OK] Hysteria2 deployed"
REMOTE_SCRIPT

# ── Step 7: Automated Backups ───────────────────────────────────────
echo "[7/7] Setting up backups..."
run_remote 'bash -s' <<'REMOTE_SCRIPT'
mkdir -p /opt/vpn-backups

cat > /opt/vpn-backups/backup-vpn-v2.sh <<'BACKUP'
#!/bin/bash
BACKUP_DIR="/opt/vpn-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/vpn-backup-$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_DIR"
echo "[$(date)] Starting VPN backup..."

tar -czf "$BACKUP_FILE" \
  /opt/reality-ezpz/config \
  /opt/reality-ezpz/engine.conf \
  /opt/reality-ezpz/docker-compose.yml \
  /opt/reality-ezpz/certs/ \
  /root/.ssh/authorized_keys \
  2>/dev/null

echo "[$(date)] Backup complete: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Keep last 7 backups
ls -t "$BACKUP_DIR"/vpn-backup-*.tar.gz 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null
echo "[$(date)] Total backups: $(ls "$BACKUP_DIR"/vpn-backup-*.tar.gz 2>/dev/null | wc -l)"
BACKUP
chmod +x /opt/vpn-backups/backup-vpn-v2.sh

# Add cron if not already there
if ! crontab -l 2>/dev/null | grep -q backup-vpn-v2; then
  (crontab -l 2>/dev/null; echo "0 2 * * * /opt/vpn-backups/backup-vpn-v2.sh >> /var/log/vpn-backup.log 2>&1") | crontab -
  echo "[OK] Backup cron added (daily 2 AM UTC)"
else
  echo "[OK] Backup cron already configured"
fi

# Run first backup now
/opt/vpn-backups/backup-vpn-v2.sh
REMOTE_SCRIPT

# ── Final: Collect Output ───────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo "  Deployment Complete!"
echo "═══════════════════════════════════════════════════"
echo ""

run_remote 'bash -s' <<'REMOTE_SCRIPT'
echo "── Services ──"
docker compose -f /opt/reality-ezpz/docker-compose.yml ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null
echo ""

echo "── Ports ──"
ss -tulnp | grep -E "443|8443" | awk '{print $1, $5}'
echo ""

echo "── Reality Keys ──"
if [ -f /opt/reality-ezpz/config ]; then
  grep -E "^(PUBLIC_KEY|SHORT_ID)" /opt/reality-ezpz/config 2>/dev/null
fi
echo ""

echo "── Hy2 Cert ──"
if [ -f /opt/reality-ezpz/certs/hy2.env ]; then
  cat /opt/reality-ezpz/certs/hy2.env
fi
echo ""

echo "── Client URIs ──"
IP=$(curl -4 -s ifconfig.me)
UUID=$(grep "^UUID=" /opt/reality-ezpz/config 2>/dev/null | cut -d= -f2)
PUBKEY=$(grep "^PUBLIC_KEY=" /opt/reality-ezpz/config 2>/dev/null | cut -d= -f2)
SHORTID=$(grep "^SHORT_ID=" /opt/reality-ezpz/config 2>/dev/null | cut -d= -f2)
SNI=$(grep "^DOMAIN=" /opt/reality-ezpz/config 2>/dev/null | cut -d= -f2)

echo "VLESS Reality:"
echo "  vless://${UUID}@${IP}:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${SNI}&fp=chrome&pbk=${PUBKEY}&sid=${SHORTID}&type=tcp#Reality-$(hostname)"
echo ""
echo "Hysteria2:"
echo "  hy2://${UUID}@${IP}:8443?insecure=1&sni=${SNI}#Hysteria2-$(hostname)"
echo ""
echo "Subscription:"
echo "  https://${IP}:443/sub/${UUID}"
REMOTE_SCRIPT

echo ""
echo "Done! Save the keys and URIs above."
echo "Add this server to tools/smart-sub/worker.js SERVERS array."
