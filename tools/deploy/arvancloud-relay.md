# ArvanCloud Domestic Relay Setup

## What This Does

Sets up an ArvanCloud eco-small1 VPS in Iran as a **domestic relay**.
Users connect to this server (domestic traffic = free/cheap on Iranian ISPs),
and it forwards to our international exit servers (Helsinki, France, etc.).

## Prerequisites

- An ArvanCloud eco-small1 (1 CPU, 1 GB RAM, 25 GB SSD), registered by whoever will
  carry the legal exposure for a machine inside Iran — see the warning in
  [provisioning-guide.md](./provisioning-guide.md)
- Ubuntu 22.04 or 24.04 on the VM
- SSH access to the VM
- Note the Iranian IP address

## Architecture

```text
User (Iran)              ArvanCloud VPS (Iran)         Exit Servers (abroad)
┌──────────┐  domestic  ┌──────────────────┐  intl    ┌──────────────┐
│ Hiddify  │──────────> │ sing-box relay   │────────> │ Helsinki 443 │
│ client   │ free/cheap │ <ARVAN_IP>       │          │ France 443   │
│          │            │ ports: 2080,8585 │          │              │
└──────────┘            └──────────────────┘          └──────────────┘
```

## Setup Script

SSH into the ArvanCloud VPS and run:

```bash
#!/bin/bash
# ArvanCloud relay setup — run as root

# ── Variables (update these) ──
HELSINKI_IP="<HEL_IP>"  # from server-config.sh
FRANCE_IP="<SERVER2_IP>"  # Update when available
UUID="<ADMIN_UUID>"

# ── Install sing-box ──
apt-get update && apt-get install -y curl
bash <(curl -fsSL https://sing-box.app/deb-install.sh)

# ── Create relay config ──
mkdir -p /etc/sing-box

cat > /etc/sing-box/config.json <<EOF
{
  "log": { "level": "warn" },
  "inbounds": [
    {
      "type": "vless",
      "tag": "relay-helsinki",
      "listen": "::",
      "listen_port": 2080,
      "users": [{ "uuid": "$UUID", "flow": "" }],
      "transport": { "type": "tcp" }
    },
    {
      "type": "vless",
      "tag": "relay-helsinki-http",
      "listen": "::",
      "listen_port": 8585,
      "users": [{ "uuid": "$UUID", "flow": "" }],
      "transport": {
        "type": "http",
        "host": ["myket.ir"],
        "path": "/"
      }
    }
  ],
  "outbounds": [
    {
      "type": "vless",
      "tag": "exit-helsinki",
      "server": "$HELSINKI_IP",
      "server_port": 443,
      "uuid": "$UUID",
      "flow": "xtls-rprx-vision",
      "tls": {
        "enabled": true,
        "server_name": "www.google.com",
        "reality": {
          "enabled": true,
          "public_key": "dGVzdGhlbHJlYWxpdHlwdWJrZXkwMDAwMDAwMDAwMA",
          "short_id": "aa00000000000001"
        },
        "utls": { "enabled": true, "fingerprint": "chrome" }
      }
    }
  ],
  "route": {
    "rules": [
      { "inbound": ["relay-helsinki", "relay-helsinki-http"], "outbound": "exit-helsinki" }
    ]
  }
}
EOF

# ── Enable and start ──
systemctl enable --now sing-box
systemctl status sing-box

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Relay is running!"
echo ""
echo "  Plain VLESS (port 2080):"
echo "  vless://$UUID@<ARVAN_IP>:2080?encryption=none&security=none&type=tcp#Relay-Helsinki"
echo ""
echo "  HTTP camouflage (port 8585, Host: myket.ir):"
echo "  vless://$UUID@<ARVAN_IP>:8585?encryption=none&security=none&type=http&host=myket.ir&path=/#Relay-Helsinki-Myket"
echo "═══════════════════════════════════════════════════"
```

## Client URIs

**Plain VLESS relay (fastest):**

```text
vless://<UUID>@<ARVAN_IP>:2080?encryption=none&security=none&type=tcp#Relay-Helsinki
```

**HTTP camouflage relay (DPI bypass with myket.ir Host header):**

```text
vless://<UUID>@<ARVAN_IP>:8585?encryption=none&security=none&type=http&host=myket.ir&path=/#Relay-Helsinki-Myket
```

## Important Notes

- `security=none` is intentional — domestic hop doesn't cross the firewall
- No TLS needed because traffic stays within Iran's network
- HTTP camouflage (`Host: myket.ir`) tricks DPI into thinking user is browsing the Iranian app store
- The relay forwards to Helsinki via VLESS Reality (encrypted international hop)

## Ports to Open (on ArvanCloud VPS)

```bash
ufw allow 2080/tcp comment 'Plain VLESS relay'
ufw allow 8585/tcp comment 'HTTP camouflage relay'
ufw allow 22/tcp comment 'SSH'
ufw --force enable
```

## Monitoring

```bash
# Check relay is running
systemctl status sing-box
ss -tlnp | grep -E '2080|8585'

# Check logs
journalctl -u sing-box -f
```

## Risk Mitigation

1. **Assume the host is seizable** — store nothing on it that matters
2. **No logs stored** — sing-box log level set to "warn" only
3. **Easy to rebuild** — if terminated, buy new VM, run script again (~5 min)
4. **Not essential** — users fall back to direct international connection if relay dies
5. **Multiple ports** — if one port is blocked, others may still work

## Adding France Exit (When Available)

Add another inbound/outbound pair in config.json:

```json
{
  "type": "vless",
  "tag": "relay-france",
  "listen": "::",
  "listen_port": 3030,
  "users": [{ "uuid": "<UUID>", "flow": "" }],
  "transport": { "type": "tcp" }
}
```

And corresponding outbound pointing to `<SERVER2_IP>:443` with France Reality keys.
