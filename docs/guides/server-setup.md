# Server Setup

## 1. Provision Hetzner Cloud VPS

1. Go to <https://console.hetzner.cloud>
2. Create a new project → Add Server:
   - **Location**: Helsinki (hel1)
   - **Image**: Ubuntu 24.04 LTS
   - **Type**: CX23 (2 vCPU, 4GB RAM, 40GB SSD) ~€4.35/mo
   - **Networking**: Enable IPv4 + IPv6
   - **SSH Key**: Add your public key during creation
3. Note your server's:
   - IPv4 address → `<SERVER_IP>`
   - IPv6 address → `<SERVER_IPV6>`
   - (No root password needed — Hetzner uses SSH key from creation)

## 2. Initial SSH Access

```bash
ssh root@<SERVER_IP>
# Or with explicit key:
ssh -i ~/.ssh/your_key root@<SERVER_IP>
```

## 3. Base System Setup

```bash
# Update system
apt update && apt upgrade -y

# Install essentials
apt install -y curl wget git ufw fail2ban unattended-upgrades

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Install Docker Compose (v2 plugin)
apt install -y docker-compose-plugin

# Verify
docker --version
docker compose version
```

## 4. SSH Hardening

```bash
# On the server: disable password auth
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd
```

## 5. Firewall Setup

```bash
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# Core
ufw allow 22/tcp              # SSH
ufw allow 80/tcp              # HTTP redirect (sing-box) + SS2022 fallback
ufw allow 443/tcp             # HAProxy → Reality, XHTTP, CDN-WS, XrayHTTP

# Hysteria2
ufw allow 8443/udp            # Hy2 standard (routed through HAProxy on 443 for TCP)

# Finalmask (xray-core sidecar)
ufw allow 10053/udp           # Finalmask XDNS (mKCP headerType=dns)
ufw allow 10054/udp           # Finalmask XICMP (mKCP headerType=utp)

# Hy2 Salamander + UDP Hop
ufw allow 20000:50000/udp     # Salamander obfuscated + port hopping range

# ShadowTLS v3 (Helsinki + Scaleway only)
ufw allow 10443/tcp           # ShadowTLS v3 wrapping SS2022

# NaiveProxy (Helsinki + Oracle + Scaleway)
ufw allow 2087/tcp            # Caddy forwardproxy (Chrome TLS stack)

# Cloak (Scaleway only)
ufw allow 2053/tcp            # Cloak TLS camouflage

# DNS tunnel
ufw allow 53/udp              # DNS (for dnstt/slipstream)
ufw allow 53/tcp              # DNS (for dnstt/slipstream)

ufw --force enable
ufw status numbered
```

> **Note**: Not all ports are needed on every server. ShadowTLS (10443) is HEL+SCW only, Cloak (2053) is SCW only, NaiveProxy (2087) is HEL+ORC+SCW. When deploying a new server, only open ports for protocols you actually deploy.

## 6. Fail2ban Setup

```bash
# Already installed above, just enable
systemctl enable fail2ban
systemctl start fail2ban

# Verify
fail2ban-client status
```

## 7. Auto Security Updates

```bash
# Configure unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
# Select YES when prompted
```

## 8. Deploy reality-ezpz (VLESS Reality + WARP)

```bash
cd /opt
git clone https://github.com/aleskxyz/reality-ezpz.git
cd reality-ezpz

# Run interactive setup — configures VLESS Reality + WARP outbound
bash reality-ezpz.sh
```

During setup, configure:

| Setting | Recommended Value | Notes |
|---|---|---|
| **SNI** | `www.google.com` | Site to impersonate. Pick a major site Iran won't block |
| **Transport** | `tcp` | Most reliable |
| **WARP** | `ON` | Routes outbound through Cloudflare — hides VPS IP from destinations |
| **UUID** | Auto-generated | Save as `<UUID>` — shared across VLESS + Hysteria2 |
| **Reality keypair** | Auto-generated | Save private key as `<REALITY_PRIVATE_KEY>`, public key as `<REALITY_PUBLIC_KEY>` |
| **Reality short-id** | Auto-generated | Save as `<REALITY_SHORT_ID>` |

After setup, save the generated values:

```bash
# View generated config
cat /opt/reality-ezpz/config

# Show user config + VLESS URI
bash reality-ezpz.sh --show-user=RealityEZPZ
```

> **Note**: WARP is integrated as a WireGuard endpoint inside sing-box (`"final": "warp"` routing). No separate warp-yg installation needed.

## 9. Enable Hysteria2 (Manual Injection)

reality-ezpz doesn't support Hysteria2 natively alongside Reality TLS. We manually inject it.

### 9a. Generate Self-Signed Certificate

```bash
mkdir -p /opt/reality-ezpz/certs
openssl ecparam -genkey -name prime256v1 | \
  openssl ec -out /opt/reality-ezpz/certs/hy2.key
openssl req -new -x509 -days 3650 \
  -key /opt/reality-ezpz/certs/hy2.key \
  -out /opt/reality-ezpz/certs/hy2.crt \
  -subj '/CN=www.google.com'

# Get cert hash for client config — save as <HY2_CERT_SHA256>
openssl x509 -in /opt/reality-ezpz/certs/hy2.crt -noout -fingerprint -sha256 \
  | sed 's/.*=//;s/://g' | tr 'A-F' 'a-f'
```

### 9b. Inject Hysteria2 Inbound into engine.conf

Add this inbound to the `"inbounds"` array in `/opt/reality-ezpz/engine.conf`:

```json
{
  "type": "hysteria2",
  "tag": "hy2-in",
  "listen": "::",
  "listen_port": 8444,
  "users": [
    {
      "name": "RealityEZPZ",
      "password": "<UUID>"
    }
  ],
  "tls": {
    "enabled": true,
    "certificate_path": "/etc/sing-box/hy2.crt",
    "key_path": "/etc/sing-box/hy2.key"
  }
}
```

Also add `"hy2-in"` to every `"inbound"` array in the `"route"` → `"rules"` section (copy the existing `"in"` rules).

### 9c. Update docker-compose.yml

Add to `ports`:

```yaml
- "8443:8444/udp"    # Hysteria2 (host 8443 → container 8444)
```

Add to `volumes`:

```yaml
- ./certs/hy2.crt:/etc/sing-box/hy2.crt:ro
- ./certs/hy2.key:/etc/sing-box/hy2.key:ro
```

### 9d. Apply Changes

```bash
cd /opt/reality-ezpz
docker compose down && docker compose up -d

# Verify Hysteria2 is listening
ss -ulnp | grep 8443
```

> **WARNING**: Running `bash reality-ezpz.sh` will OVERWRITE `engine.conf` and remove the Hysteria2 injection. Always back up first:
>
> ```bash
> cp engine.conf engine.conf.bak
> cp docker-compose.yml docker-compose.yml.bak
> ```

## 10. Deploy DNS Tunnel (dnstm)

See [dnstt-setup.md](./dnstt-setup.md) for full instructions.

```bash
# Disable systemd-resolved (needs port 53)
systemctl stop systemd-resolved && systemctl disable systemd-resolved
cat > /etc/resolv.conf << 'EOF'
nameserver 8.8.8.8
nameserver 8.8.4.4
EOF

# Download and install dnstm
curl -Lo /usr/local/bin/dnstm \
  https://github.com/net2share/dnstm/releases/download/v0.6.7/dnstm-linux-amd64
chmod +x /usr/local/bin/dnstm
dnstm install --mode multi

# Add tunnels
dnstm tunnel add --name slip-socks --type slipstream --domain t.<DOMAIN> --port 5310 --backend socks
dnstm tunnel add --name dnstt-socks --type dnstt --domain t2.<DOMAIN> --port 5311 --backend socks
dnstm tunnel add --name slip-ssh --type slipstream --domain s2.<DOMAIN> --port 5312 --backend ssh

# Start DNS router
dnstm router start

# Save crypto material for clients
dnstm tunnel list          # → save <DNSTT_PUBKEY>, <SLIP_SOCKS_FP>, <SLIP_SSH_FP>
```

## 11. Create SSH Tunnel User

```bash
# Create restricted tunnel user (installed by dnstm)
sshtun-user create <SSH_TUNNEL_USER> --insecure-password "<SSH_TUNNEL_PASS>"

# Apply SSH hardening
sshtun-user configure

# Verify
id <SSH_TUNNEL_USER>             # → should show sshtunnel-password group
getent passwd <SSH_TUNNEL_USER>  # → should show /usr/sbin/nologin shell
```

## 12. Build dns-tun-lb from Source (Standby)

Pre-install dns-tun-lb for instant scaling to multiple servers later.

```bash
# Install Go
curl -Lo /tmp/go.tar.gz https://go.dev/dl/go1.24.1.linux-amd64.tar.gz
rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tar.gz
export PATH=$PATH:/usr/local/go/bin

# Build
mkdir -p /opt/dns-tun-lb/src
cd /opt/dns-tun-lb/src
git clone https://github.com/aleskxyz/dns-tun-lb.git .
go build -o /usr/local/bin/dns-tun-lb .

# Create standby config
cat > /opt/dns-tun-lb/lb.yaml << 'EOF'
global:
  listen_address: "127.0.0.1:5354"
  default_dns_behavior:
    mode: "forward"
    forward_resolver: "9.9.9.9:53"
protocols:
  dnstt:
    pools:
      - name: "dnstt-socks"
        domain_suffix: "t2.<DOMAIN>"
        backends:
          - id: "local-dnstt"
            address: "127.0.0.1:5311"
logging:
  level: "info"
EOF

# Create systemd service
cat > /etc/systemd/system/dns-tun-lb.service << 'EOF'
[Unit]
Description=DNS Tunnel Load Balancer
After=network.target

[Service]
ExecStart=/usr/local/bin/dns-tun-lb -config /opt/dns-tun-lb/lb.yaml
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable dns-tun-lb
systemctl start dns-tun-lb

# Create activation script
cat > /opt/dns-tun-lb/activate-lb.sh << 'SCRIPT'
#!/bin/bash
case "$1" in
  activate)
    sed -i 's/127.0.0.1:5354/0.0.0.0:53/' /opt/dns-tun-lb/lb.yaml
    systemctl stop dnstm-dnsrouter
    systemctl restart dns-tun-lb
    echo "dns-tun-lb activated on port 53"
    ;;
  deactivate)
    sed -i 's/0.0.0.0:53/127.0.0.1:5354/' /opt/dns-tun-lb/lb.yaml
    systemctl restart dns-tun-lb
    systemctl start dnstm-dnsrouter
    echo "dns-tun-lb deactivated to standby"
    ;;
  status)
    echo "=== dns-tun-lb ==="
    systemctl is-active dns-tun-lb
    grep listen_address /opt/dns-tun-lb/lb.yaml
    echo "=== dnstm-dnsrouter ==="
    systemctl is-active dnstm-dnsrouter
    ;;
  *)
    echo "Usage: $0 {activate|deactivate|status}"
    ;;
esac
SCRIPT
chmod +x /opt/dns-tun-lb/activate-lb.sh
```

## 13. Automated Backups

```bash
mkdir -p /opt/vpn-backups

cat > /opt/vpn-backups/backup-vpn-v2.sh << 'SCRIPT'
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
  /etc/dnstm/ \
  /opt/dns-tun-lb/lb.yaml \
  /root/.ssh/authorized_keys \
  2>/dev/null

echo "[$(date)] Backup complete: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Keep last 7 backups
ls -t "$BACKUP_DIR"/vpn-backup-*.tar.gz 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null
echo "[$(date)] Total backups: $(ls "$BACKUP_DIR"/vpn-backup-*.tar.gz 2>/dev/null | wc -l)"
SCRIPT
chmod +x /opt/vpn-backups/backup-vpn-v2.sh

# Schedule daily at 2 AM UTC
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/vpn-backups/backup-vpn-v2.sh >> /var/log/vpn-backup.log 2>&1") | crontab -

# Run first backup now
bash /opt/vpn-backups/backup-vpn-v2.sh
```

## 14. Verify Everything

```bash
# All services running
systemctl is-active reality-ezpz-engine-1 || docker compose -f /opt/reality-ezpz/docker-compose.yml ps
systemctl is-active dnstm-dnsrouter dnstm-tunnel-slip-socks dnstm-tunnel-dnstt-socks \
  dnstm-tunnel-slip-ssh dnstm-microsocks dns-tun-lb

# All ports listening (core + v4.0 protocols)
ss -tulnp | grep -E '(443|8443|53|10053|10054|10443|2087|2053|5310|5311|5312|39190|5354)'

# DNS tunnels
dnstm tunnel list
dnstm router status

# Firewall
ufw status numbered

# Test from LOCAL machine
curl -I https://<SERVER_IP>:443       # Should get HTTP 301/302
curl -x socks5://127.0.0.1:39190 ifconfig.me  # (from server) Should show server IP

# Security checks
grep PasswordAuthentication /etc/ssh/sshd_config     # Should be 'no'
systemctl is-active fail2ban                          # Should be 'active'
systemctl is-active unattended-upgrades               # Should be 'active'
```
