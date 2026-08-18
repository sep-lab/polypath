# Maintenance & Operations

## Daily Checks (Optional)

```bash
# Quick health check
docker compose ps
dnstm tunnel list
dnstm router status
```

## Common Operations

### Add a New User

```bash
# Via reality-ezpz
cd /opt/reality-ezpz
bash reality-ezpz.sh
# Choose: Add user

# Or via Telegram bot (if configured during setup)
```

### Remove/Revoke a User

```bash
cd /opt/reality-ezpz
bash reality-ezpz.sh
# Choose: Remove user
```

### View Active Connections

```bash
# Check sing-box connections (VLESS Reality + Hysteria2)
docker compose logs sing-box --tail=50

# Check dnstm tunnel logs
dnstm tunnel logs slip-socks
dnstm tunnel logs dnstt-socks
dnstm tunnel logs slip-ssh
```

### Restart Services

```bash
# Restart all VPN protocols (VLESS Reality + Hysteria2)
cd /opt/reality-ezpz
docker compose restart

# Restart DNS tunnels
dnstm router stop && dnstm router start

# Restart individual tunnel
dnstm tunnel stop slip-socks && dnstm tunnel start slip-socks
```

### Update reality-ezpz

```bash
cd /opt/reality-ezpz
git pull
docker compose pull
docker compose up -d

# WARNING: running 'bash reality-ezpz.sh' will overwrite engine.conf
# and remove manually-injected Hysteria2. Back up first!
cp engine.conf engine.conf.bak
cp docker-compose.yml docker-compose.yml.bak
```

### Update dnstm

```bash
# Download latest binary
curl -Lo /usr/local/bin/dnstm \
  https://github.com/net2share/dnstm/releases/latest/download/dnstm-linux-amd64
chmod +x /usr/local/bin/dnstm

# Restart router after update
dnstm router stop && dnstm router start
```

### Manage SSH Tunnel User

```bash
# Reset tunnel user password
sshtun-user reset-password <SSH_TUNNEL_USER>

# Remove tunnel user
sshtun-user remove <SSH_TUNNEL_USER>

# Create a new tunnel user
sshtun-user create <SSH_TUNNEL_USER>
sshtun-user configure
```

### Manage dns-tun-lb

```bash
# Check status
systemctl status dns-tun-lb

# Activate load balancer on port 53 (replaces dnstm router)
/opt/dns-tun-lb/activate-lb.sh activate

# Deactivate (return to dnstm router on port 53)
/opt/dns-tun-lb/activate-lb.sh deactivate

# Check current mode
/opt/dns-tun-lb/activate-lb.sh status
```

## Backup & Restore

### Create Backup

Automated daily backup is already configured at `/opt/vpn-backups/backup-vpn-v2.sh` (cron: daily at 2 AM UTC, keeps last 7 backups).

```bash
#!/bin/bash
# /opt/vpn-backups/backup-vpn-v2.sh
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
```

### Automated Daily Backup

```bash
# Add to cron
echo "0 2 * * * /opt/vpn-backups/backup-vpn-v2.sh" | crontab -
```

### Download Backup Off-Server

```bash
# From your local machine
scp root@<SERVER_IP>:/opt/vpn-backups/vpn-backup-*.tar.gz ~/vpn-backups/
```

### Restore

```bash
# On a fresh server, after base setup:
scp ~/vpn-backups/vpn-backup-LATEST.tar.gz root@<SERVER_IP>:/tmp/

# SSH into new server
ssh root@<SERVER_IP>
tar -xzf /tmp/vpn-backup-*.tar.gz -C /

# Restart VPN services
cd /opt/reality-ezpz
docker compose up -d

# Disable systemd-resolved and restart DNS tunnels
systemctl stop systemd-resolved && systemctl disable systemd-resolved
dnstm router start

# Restart dns-tun-lb
systemctl start dns-tun-lb

# Recreate SSH tunnel user
sshtun-user create <SSH_TUNNEL_USER>
```

## Multi-Protocol Stack Operations

### Check XHTTP-CDN Status

```bash
# Verify xray-core XHTTP inbound is listening (all servers)
for HOST in root@<HEL_IP> ubuntu@<ORC_IP> ubuntu@<GCP_IP> root@<SCW_IP>; do
  echo "=== $HOST ==="
  ssh $HOST 'sudo docker logs reality-ezpz-xray-1 --tail 3 2>&1 | grep -i xhttp || echo "xray running"'
done

# Test XHTTP through CDN (from outside Iran)
for CDN in cdn cdn2 cdn3 cdn4; do
  echo "$CDN: $(curl -s -o /dev/null -w '%{http_code}' https://${CDN}.example.com/xhttp/)"
done
```

### Restart xray-core + HAProxy (Per Server)

```bash
# SSH into server, then:
cd /opt/reality-ezpz
docker compose restart xray haproxy

# Verify all 3 backends alive:
docker compose logs haproxy --tail 10
# Should show: bk_xray_xhttp, bk_singbox_ws, bk_xray all UP
```

### Deploy XHTTP to All Servers

```bash
# From local machine (runs deploy-xhttp.sh):
cd tools/deploy
bash deploy-xhttp.sh          # live deployment
bash deploy-xhttp.sh --dry-run  # preview only
```

### Deploy Smart-Sub Worker

```bash
# Deploy to CF Pages (Workers blocked by abuse detection)
cd tools/smart-sub
cp worker.js _worker.js
npx wrangler pages deploy . --project-name your-pages-project
# Verify: curl -s https://sub.example.com/health | python3 -m json.tool
```

> **Note**: `sub.example.com` is served by CF Pages project `your-pages-project`,
> not Workers. Workers.dev returns error 1101 (account-level abuse block).
> See checklist.md Phase 30 for details.

### HAProxy Path Routing (Port 80)

Current routing on all 4 servers:

| Match | Backend | Container | Port | Transport |
|---|---|---|---|---|
| `/xhttp/*` | bk_xray_xhttp | xray | 10081 | XHTTP/splithttp (CDN-fronted) |
| `/ws` | bk_singbox_ws | engine | 8080 | VLESS WebSocket (CDN-WS) |
| HTTP verbs (GET/POST/HEAD/PUT) | bk_xray | xray | 10080 | TCP+HTTP obfuscation (XrayHTTP) |
| Non-HTTP (default) | bk_ss2022 | engine | 10082 | Shadowsocks 2022 (random bytes) |

## Per-ISP Verification Matrix

Track which protocols work on which ISP. Update after each testing session from Iran.

**How to test**: Connect to each server using each protocol. Record: works / slow / blocked / timeout.

### Protocol × ISP Status (Last updated: ______)

| Protocol | Helsinki | Oracle | GCP | Scaleway | Irancell | MCI | Rightel | Fixed |
|---|---|---|---|---|---|---|---|---|
| **XHTTP-CDN** | - | - | - | - | ? | ? | ? | ? |
| **XrayHTTP** | telewebion | myket | aparat | divar | ? | ? | ? | ? |
| **Reality** | - | - | - | - | ? | ? | ? | ? |
| **Hysteria2** | - | - | - | - | ? | ? | ? | ? |
| **CDN-WS** | - | - | - | - | ? | ? | ? | ? |
| **SS2022** | - | - | - | - | ? | ? | ? | ? |
| **naiveproxy** | N/A | N/A | N/A | Scaleway | ? | ? | ? | ? |
| **Cloak** | N/A | N/A | N/A | ? | ? | ? | ? | ? |

Legend: `OK` = works, `SLOW` = connects but degraded, `BLOCK` = blocked/timeout, `?` = untested, `N/A` = not deployed

### XrayHTTP Host × ISP Status

| Host Header | Irancell | MCI | Rightel | Fixed-line | Notes |
|---|---|---|---|---|---|
| `telewebion.com` (Helsinki) | ? | ? | ? | ? | State TV — safest |
| `myket.ir` (Oracle) | ? | ? | ? | ? | App store — high value |
| `aparat.com` (GCP) | ? | ? | ? | ? | Video platform |
| `divar.ir` (Scaleway) | ? | ? | ? | ? | Classifieds |
| `shad.ir` (fallback) | ? | ? | ? | ? | Ministry of Education |
| `bale.ai` (fallback) | ? | ? | ? | ? | Gov messenger |
| `igap.net` (fallback) | ? | ? | ? | ? | Gov messenger |
| `zula.ir` (fallback) | ? | ? | ? | ? | Gaming — most used in wild |

### Testing Procedure

```bash
# From inside Iran, for each server:

# 1. XHTTP-CDN (via Cloudflare)
# In Hiddify: try XHTTP-CDN-Finland, XHTTP-CDN-Madrid, etc.

# 2. XrayHTTP (direct, fake HTTP headers)
# In Hiddify: try XrayHTTP-Finland, XrayHTTP-Madrid, etc.

# 3. Reality (TLS with fragment)
# In Hiddify: enable TLS Fragment, try Reality-Finland, etc.

# 4. SS2022 (random bytes)
# In Hiddify: try SS2022-Finland, SS2022-Madrid, etc.

# 5. naiveproxy (Chrome TLS)
# In NekoBox: try Naive-London

# 6. Cloak (TLS camouflage)
# In NekoBox/SS+Cloak: try Cloak-London

# Record results per ISP:
# - Check which ISP you're on: https://whatismyipaddress.com
# - Test each config, note: OK / SLOW / BLOCKED
# - If blocked, note error type: timeout, reset, TLS error
```

### Host Rotation Procedure

When a host gets flagged:

1. SSH into affected server
2. Edit `/opt/reality-ezpz/xray-config.json`
3. Change `headers.Host` to a fallback host from `config/cdn.yaml` → `whitelisted_hosts`
4. `docker compose restart xray`
5. Update worker.js `http_obfs.host` for that server
6. `cd tools/smart-sub && wrangler deploy`
7. Users refresh subscription in Hiddify (auto within 4h)

## Troubleshooting

### XHTTP-CDN Not Connecting

1. Check CDN DNS: `dig cdn.example.com` — must return Cloudflare IPs (104.x.x.x), NOT server IP
2. Check CF SSL rule: must have `starts_with(http.host, "cdn")` → Flexible SSL
3. Check HAProxy: `docker compose logs haproxy --tail 20` — look for xhttp backend errors
4. Check xray-core: `docker compose logs xray --tail 20` — look for XHTTP inbound errors
5. Test from outside: `curl -v https://cdn.example.com/xhttp/` — should get response (even error is OK)
6. If timeout: CF may be throttling — try CFScanner to find clean CF edge IPs
7. If 521/522 error: origin server is down or HAProxy routing misconfigured

### XrayHTTP Not Connecting

1. Check xray-core running: `docker compose ps` — xray container must be Up
2. Check port 80: `curl -s -o /dev/null -w '%{http_code}' http://<SERVER_IP>/` — should return something
3. Check host header: wrong Host value (blocked by DPI?) — try different whitelisted host
4. If works from outside Iran but not inside: the whitelisted host may have been flagged
5. Rotate host: update xray-config.json `headers.Host` to a different whitelisted domain

### VLESS Reality Not Connecting

1. Check service: `docker compose ps`
2. Check logs: `docker compose logs sing-box --tail=100`
3. Verify port open: `ss -tlnp | grep 443`
4. Test from outside: `curl -I https://<SERVER_IP>:443`
5. Try different SNI target in client config

### Hysteria2 Not Connecting

1. Check logs: `docker compose logs sing-box --tail=100` (Hysteria2 runs inside sing-box)
2. Verify UDP port: `ss -ulnp | grep 8443`
3. Some networks block UDP entirely - switch to TCP-based protocol

### dnstt/DNS Tunnel Not Working

1. Check tunnels: `dnstm tunnel list`
2. Check DNS router: `dnstm router status`
3. Check DNS: `dig NS t.<DOMAIN>` (must resolve correctly)
4. Check logs: `dnstm tunnel logs slip-socks`
5. Verify port 53: `ss -tulnp | grep 53` (must be dnstm, not systemd-resolved)
6. If systemd-resolved is running: `systemctl stop systemd-resolved && systemctl disable systemd-resolved`

### CF Pages (EDtunnel) Not Connecting

1. Visit `<CF_PAGES_URL>` in browser — should load
2. Check UUID matches between Pages secret and client config
3. Verify Pages is not rate-limited (check Cloudflare dashboard)
4. Try redeploying: `wrangler pages deploy pages-dist`

### Server IP Blocked from Iran

If a VPS IP gets blocked:

1. **Immediate**: Hiddify auto-falls back to the other server (Helsinki ↔ France)
2. **Immediate**: Users switch to CF Pages (EDtunnel) - no VPS IP needed
3. **Immediate**: Users switch to Oblivion (WARP) - no server at all
4. dnstt should still work (uses DNS, not direct IP)
5. Request a new IP from provider (delete server, create new one)
6. Or provision a new server and restore from backup
7. Users enable TLS Fragment in client settings for better connectivity

### High Latency

1. Try different protocol (Hysteria2 often has lower latency than VLESS)
2. Check server load: `htop`, `docker stats`
3. Check if too many users connected
4. Consider upgrading VPS plan

## Security Rotation Schedule

| What | Frequency | How |
|---|---|---|
| System updates | Auto (unattended-upgrades) | Automatic |
| User audit | Monthly | Review active users, remove inactive |
| Backup test | Monthly | Download backup, test restore on throwaway server |
| UUID rotation | As needed | If credentials leaked, regenerate |
| SSH key rotation | Annually | Generate new key pair, update server |

## Emergency: Full Server Compromised

1. **Immediately**: Delete the server via Hetzner Cloud dashboard
2. Provision new server
3. Restore from last clean backup
4. Rotate ALL credentials:
   - Reality keypair
   - User UUIDs
   - DNSTT keypair + Slipstream keys
   - CF Pages UUID
5. Distribute new configs to users
6. Investigate how compromise happened

## Multi-Server Operations

> See [multi-server.md](./multi-server.md) for full architecture details.

### Health Check (All Servers)

```bash
# Helsinki
ssh root@<HEL_IP> 'docker compose -f /opt/reality-ezpz/docker-compose.yml ps && ss -tulnp | grep -E "443|8443|53"'

# Oracle Madrid
ssh ubuntu@<ORC_IP> 'sudo docker compose -f /opt/reality-ezpz/docker-compose.yml ps && sudo ss -tulnp | grep -E "443|8443"'

# GCP Dammam
ssh ubuntu@<GCP_IP> 'sudo docker compose -f /opt/reality-ezpz/docker-compose.yml ps && sudo ss -tulnp | grep -E "443|8443"'

# Scaleway London
ssh root@<SCW_IP> 'docker compose -f /opt/reality-ezpz/docker-compose.yml ps && ss -tulnp | grep -E "443|8443|53"'
```

### Download Backups (All Servers)

```bash
scp root@<HEL_IP>:/opt/vpn-backups/*.tar.gz ~/vpn-backups/helsinki/
scp ubuntu@<ORC_IP>:/opt/vpn-backups/*.tar.gz ~/vpn-backups/oracle-madrid/
scp ubuntu@<GCP_IP>:/opt/vpn-backups/*.tar.gz ~/vpn-backups/gcp-dammam/
scp root@<SCW_IP>:/opt/vpn-backups/*.tar.gz ~/vpn-backups/scaleway-london/
```

### UUID Rotation (Affects All Servers)

UUID is the only shared credential. When rotating:

1. Generate new UUID: `uuidgen`
2. Update on **every** server (reality-ezpz config + Hy2 password)
3. Update CF Pages secret
4. Redistribute client configs

## Cost Summary

| Item | Monthly Cost |
|---|---|
| Helsinki — Hetzner CX23 | ~€4.35 (~$4.75) |
| Scaleway London — PLAY2-PICO | ~€3.36 (~$3.65) |
| GCP Dammam — e2-medium | ~$25/mo (covered by $300 credit, ~90 days) |
| Oracle Madrid — ARM Free Tier | $0 |
| Cloudflare (Workers + Pages + DNS) | Free |
| Domain (example.com, Porkbun) | ~$0.83/mo ($10/year) |
| **Total** | **~$9.23/mo** (excluding GCP credit) |

**Note**: GCP e2-medium is NOT free tier. Delete or downgrade to e2-micro before credits expire (~June 2026).

---

## Git History Scrubbing (Pre-Public Checklist)

Before making the repository public, you **must** scrub all secrets from git history. Even though `worker.js` no longer contains hardcoded secrets (as of v4.1.0), previous commits still have them embedded.

> **Critical**: After scrubbing, you MUST rotate every credential on all servers. Anyone who cloned/forked the repo before the scrub retains the old history with real values.

### Option A: BFG Repo Cleaner (Recommended)

```bash
# 1. Install BFG
brew install bfg

# 2. Create a replacements file listing every secret value (one per line)
#    Format: literal_value==>***REMOVED***
cat > /tmp/secrets-to-scrub.txt << 'EOF'
<ADMIN_UUID_VALUE>==>***REMOVED***
<FAMILY_UUID_VALUE>==>***REMOVED***
<TEST_UUID_VALUE>==>***REMOVED***
<SHADOWTLS_PASSWORD>==>***REMOVED***
<SALAMANDER_PASSWORD>==>***REMOVED***
<SS_USER_KEY>==>***REMOVED***
<FINALMASK_SEED>==>***REMOVED***
<EDTUNNEL_PAGES_URL>==>***REMOVED***
<HEL_IP>==>***REMOVED***
<HEL_IPV6>==>***REMOVED***
<HEL_SS_KEY>==>***REMOVED***
<HEL_NAIVE_PASS>==>***REMOVED***
<ORC_IP>==>***REMOVED***
<ORC_SS_KEY>==>***REMOVED***
<ORC_NAIVE_PASS>==>***REMOVED***
<GCP_IP>==>***REMOVED***
<GCP_SS_KEY>==>***REMOVED***
<SCW_IP>==>***REMOVED***
<SCW_IPV6>==>***REMOVED***
<SCW_SS_KEY>==>***REMOVED***
<SCW_NAIVE_PASS>==>***REMOVED***
<SCW_CLOAK_UID>==>***REMOVED***
<SCW_CLOAK_PUBKEY>==>***REMOVED***
EOF
# ⚠ Replace <PLACEHOLDER> with actual secret values from .dev.vars

# 3. Clone a fresh mirror
git clone --mirror git@github.com:<YOUR-ORG>/polypath.git polypath-mirror

# 4. Run BFG
bfg --replace-text /tmp/secrets-to-scrub.txt polypath-mirror

# 5. Clean up and force push
cd polypath-mirror
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force

# 6. Delete the replacements file
rm /tmp/secrets-to-scrub.txt
```

### Option B: git filter-repo

```bash
# 1. Install
brew install git-filter-repo

# 2. Create expressions file (same format as BFG but using regex)
cat > /tmp/expressions.txt << 'EOF'
regex:<ADMIN_UUID_VALUE>==>***REMOVED***
regex:<HEL_IP_VALUE>==>***REMOVED***
# ... one line per secret
EOF

# 3. Run from a fresh clone
git clone git@github.com:<YOUR-ORG>/polypath.git polypath-clean
cd polypath-clean
git filter-repo --replace-text /tmp/expressions.txt --force

# 4. Re-add remote and force push
git remote add origin git@github.com:<YOUR-ORG>/polypath.git
git push --force --all
git push --force --tags
```

### Post-Scrub Credential Rotation Checklist

After scrubbing history and force-pushing, rotate **all** of these on every server:

| # | Secret | Where to Rotate |
|---|--------|----------------|
| 1 | ADMIN_UUID | All 4 servers (Xray config) + Wrangler secret |
| 2 | FAMILY_UUID | All 4 servers (Xray config) + Wrangler secret |
| 3 | TEST_UUID | Wrangler secret only |
| 4 | SHADOWTLS_PASSWORD | HEL, SCW (shadow-tls service) + Wrangler secret |
| 5 | SALAMANDER_PASSWORD | HEL, ORC, SCW (Hysteria2 config) + Wrangler secret |
| 6 | SS_USER_KEY | All 4 servers (ss-rust config) + Wrangler secret |
| 7 | FINALMASK_SEED | All 4 servers (finalmask config) + Wrangler secret |
| 8 | HEL_SS_KEY | HEL (ss-rust server key) + Wrangler secret |
| 9 | HEL_NAIVE_PASS | HEL (naiveproxy config) + Wrangler secret |
| 10 | ORC_SS_KEY | ORC (ss-rust server key) + Wrangler secret |
| 11 | ORC_NAIVE_PASS | ORC (naiveproxy config) + Wrangler secret |
| 12 | GCP_SS_KEY | GCP (ss-rust server key) + Wrangler secret |
| 13 | SCW_SS_KEY | SCW (ss-rust server key) + Wrangler secret |
| 14 | SCW_NAIVE_PASS | SCW (naiveproxy config) + Wrangler secret |
| 15 | SCW_CLOAK_UID | SCW (cloak config) + Wrangler secret |
| 16 | SCW_CLOAK_PUBKEY | SCW (cloak config) + Wrangler secret |
| 17 | EDTUNNEL_PAGES | Wrangler secret (CF Pages URL) |
| 18 | Server IPs | Cannot rotate — accept the exposure risk |

### Post-Scrub Cleanup

```bash
# All collaborators must re-clone after force push
# Old clones will have divergent history

# Recreate GitHub releases (tags get rewritten by BFG/filter-repo)
gh release delete v1.0.0 -y && gh release create v1.0.0 --title "v1.0.0" --notes "Initial spec"
gh release delete v2.0.0 -y && gh release create v2.0.0 --title "v2.0.0" --notes "Multi-server"
gh release delete v3.0.0 -y && gh release create v3.0.0 --title "v3.0.0" --notes "Smart-sub worker"
gh release delete v4.0.0 -y && gh release create v4.0.0 --title "v4.0.0" --notes "Protocol expansion"
gh release create v4.1.0 --title "v4.1.0" --notes "Security: externalize all secrets to env vars"
```
