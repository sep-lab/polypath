#!/usr/bin/env bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
# ═══════════════════════════════════════════════════════════════════════════
# ip-rotate.sh — IP Auto-Rotation for VPN Infrastructure
# ═══════════════════════════════════════════════════════════════════════════
#
# When Iran blocks a server IP, this script automates the full rotation:
#   1. Detect blocked IPs (probe data, TCP tests, RIPE Atlas)
#   2. Provision a new IP from the cloud provider
#   3. Update Cloudflare DNS (CDN A records)
#   4. Update smart-sub worker (instant config refresh for all users)
#   5. Send Telegram notification
#
# Supported providers:
#   - Hetzner (Helsinki): Full API rotation — new primary IP
#   - GCP (Dammam): Release static IP + reserve new one via gcloud
#   - Scaleway (London): Flexible IP rotation via Scaleway API
#   - Oracle (Madrid): Free tier — IP rotation not supported (manual only)
#
# Usage:
#   bash ip-rotate.sh --check                  # Check which IPs are blocked
#   bash ip-rotate.sh --rotate helsinki         # Rotate Helsinki IP
#   bash ip-rotate.sh --rotate gcp             # Rotate GCP IP
#   bash ip-rotate.sh --rotate scaleway        # Rotate Scaleway IP
#   bash ip-rotate.sh --rotate-all             # Rotate all blocked IPs
#   bash ip-rotate.sh --dry-run helsinki        # Preview without changes
#   bash ip-rotate.sh --dry-run --rotate-all   # Preview all rotations
#   bash ip-rotate.sh --update-dns oracle 1.2.3.4  # Manual DNS+worker update
#
# Required environment variables (from .env or exported):
#   HETZNER_API_TOKEN     — Hetzner Cloud API token
#   CF_API_TOKEN          — Cloudflare API token (DNS edit permission)
#   CF_ZONE_ID            — Cloudflare zone ID for example.com
#   ADMIN_UUID            — Smart-sub worker admin auth token
#   TELEGRAM_BOT_TOKEN    — Telegram bot token for notifications
#   TELEGRAM_CHAT_ID      — Telegram chat ID for notifications
#
# Optional:
#   WORKER_URL            — Worker URL (default: https://sub.example.com)
#   HETZNER_SERVER_ID     — Hetzner server ID (auto-detected if not set)
#   SCW_SECRET_KEY        — Scaleway secret key
#   SCW_SERVER_ID         — Scaleway instance ID
#   SCW_ZONE              — Scaleway zone (default: fr-par-1)
#   GCP_PROJECT           — GCP project ID
#   GCP_ZONE              — GCP zone (default: me-central1-b)
#   GCP_INSTANCE          — GCP instance name
#   BLOCK_THRESHOLD       — Failed checks to consider IP blocked (default: 2)
# ═══════════════════════════════════════════════════════════════════════════

set -eo pipefail

# ── Constants ────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_URL="${WORKER_URL:-https://sub.example.com}"
BLOCK_THRESHOLD="${BLOCK_THRESHOLD:-2}"
HETZNER_API="https://api.hetzner.cloud/v1"
CF_API="https://api.cloudflare.com/client/v4"
SCW_API="https://api.scaleway.com/instance/v1/zones"
SCW_ZONE="${SCW_ZONE:-fr-par-1}"
GCP_PROJECT="${GCP_PROJECT:-}"
GCP_ZONE="${GCP_ZONE:-me-central1-b}"
GCP_INSTANCE="${GCP_INSTANCE:-}"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LOG_PREFIX="[ip-rotate]"

# ── Color output ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Server definitions (parallel indexed arrays) ─────────────────────────
# Indexes: 0=helsinki 1=oracle 2=gcp 3=scaleway
SERVERS=(helsinki oracle gcp scaleway)
SERVER_TAGS=(helsinki oracle-madrid gcp-middle-east scaleway-london)
SERVER_CDNS=(cdn.example.com cdn2.example.com cdn4.example.com cdn3.example.com)
SERVER_PROVIDERS=(hetzner oracle gcp scaleway)
SERVER_IPS=("" "" "" "")
SERVER_BLOCKED=(0 0 0 0)

# ── State ────────────────────────────────────────────────────────────────
DRY_RUN=false
ACTION=""
TARGET=""
UPDATE_DNS_IP=""

# ── Lookup helpers (name -> index) ───────────────────────────────────────

server_index() {
  local name="$1"
  local i
  for i in "${!SERVERS[@]}"; do
    if [[ "${SERVERS[$i]}" == "$name" ]]; then
      echo "$i"
      return 0
    fi
  done
  echo "-1"
  return 1
}

get_server_ip()       { local idx; idx=$(server_index "$1") && echo "${SERVER_IPS[$idx]}"; }
get_server_tag()      { local idx; idx=$(server_index "$1") && echo "${SERVER_TAGS[$idx]}"; }
get_server_cdn()      { local idx; idx=$(server_index "$1") && echo "${SERVER_CDNS[$idx]}"; }
get_server_provider() { local idx; idx=$(server_index "$1") && echo "${SERVER_PROVIDERS[$idx]}"; }
get_server_blocked()  { local idx; idx=$(server_index "$1") && echo "${SERVER_BLOCKED[$idx]}"; }

set_server_ip() {
  local idx; idx=$(server_index "$1")
  SERVER_IPS[$idx]="$2"
}

set_server_blocked() {
  local idx; idx=$(server_index "$1")
  SERVER_BLOCKED[$idx]="$2"
}

# ── Logging ──────────────────────────────────────────────────────────────

log()   { echo -e "${BLUE}${LOG_PREFIX}${NC} $*"; }
info()  { echo -e "${GREEN}${LOG_PREFIX} [OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}${LOG_PREFIX} [WARN]${NC} $*" >&2; }
err()   { echo -e "${RED}${LOG_PREFIX} [ERROR]${NC} $*" >&2; }
fatal() { err "$@"; exit 1; }
dry()   { echo -e "${CYAN}  [dry-run]${NC} $*"; }

require_env() {
  local var_name="$1"
  local var_val="${!var_name:-}"
  if [[ -z "$var_val" ]]; then
    fatal "Required environment variable $var_name is not set"
  fi
}

require_tool() {
  if ! command -v "$1" &>/dev/null; then
    fatal "Required tool '$1' not found. Install it first."
  fi
}

# HTTP helper — returns body on stdout, checks HTTP status
api_call() {
  local method="$1" url="$2"
  shift 2
  local response http_code
  response=$(curl -s -w "\n%{http_code}" "$@" -X "$method" "$url") || {
    err "curl failed for $method $url"
    return 1
  }
  http_code=$(echo "$response" | tail -1)
  echo "$response" | sed '$d'

  if [[ "$http_code" -ge 400 ]]; then
    err "API returned HTTP $http_code for $method $url"
    echo "$response" | sed '$d' >&2
    return 1
  fi
}

# ── Load server IPs from server-config.sh ────────────────────────────────

load_server_config() {
  # Try server-config.sh in tools/ (parent of deploy/)
  local config_file="$SCRIPT_DIR/../server-config.sh"
  if [[ -f "$config_file" ]]; then
    # shellcheck disable=SC1090
    source "$config_file"
    SERVER_IPS[0]="${HEL_IP:-}"
    SERVER_IPS[1]="${ORC_IP:-}"
    SERVER_IPS[2]="${GCP_IP:-}"
    SERVER_IPS[3]="${SCW_IP:-}"
    log "Loaded server IPs from server-config.sh"
  else
    warn "server-config.sh not found — fetching IPs from worker API"
    fetch_ips_from_worker || true
  fi

  # Validate
  local missing=0
  for i in "${!SERVERS[@]}"; do
    if [[ -z "${SERVER_IPS[$i]}" ]]; then
      warn "No IP for ${SERVERS[$i]}"
      missing=$((missing + 1))
    fi
  done
  if [[ $missing -eq ${#SERVERS[@]} ]]; then
    fatal "No server IPs available. Check server-config.sh or set ADMIN_UUID."
  fi
}

fetch_ips_from_worker() {
  require_env ADMIN_UUID
  local response
  response=$(curl -s --max-time 10 -H "Authorization: Bearer ${ADMIN_UUID}" \
    "${WORKER_URL}/admin/servers" 2>/dev/null) || {
    warn "Failed to fetch server IPs from worker"
    return 1
  }

  for i in "${!SERVERS[@]}"; do
    local tag="${SERVER_TAGS[$i]}"
    local ip
    ip=$(echo "$response" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for srv in data.get('servers', []):
    if srv.get('tag') == '$tag':
        print(srv.get('effective_ip', srv.get('ip', '')))
        break
" 2>/dev/null) || continue
    if [[ -n "$ip" ]]; then
      SERVER_IPS[$i]="$ip"
    fi
  done
}

# ═══════════════════════════════════════════════════════════════════════════
# PHASE 1: DETECT BLOCKED IPS
# ═══════════════════════════════════════════════════════════════════════════

check_ip_blocked() {
  local server="$1"
  local ip; ip=$(get_server_ip "$server")
  local tag; tag=$(get_server_tag "$server")
  local fail_count=0
  local total_checks=0

  if [[ -z "$ip" ]]; then
    warn "No IP for $server — skipping"
    return 2
  fi

  echo ""
  log "${BOLD}Checking $server ($ip)${NC}"

  # ── Check 1: Smart-sub worker probe data (Iran testers) ──
  if [[ -n "${ADMIN_UUID:-}" ]]; then
    log "  Probe data from worker..."
    local probe_data
    probe_data=$(curl -s -H "Authorization: Bearer ${ADMIN_UUID}" \
      "${WORKER_URL}/admin/probes?limit=10" 2>/dev/null) || true

    if [[ -n "$probe_data" ]]; then
      local probe_result
      probe_result=$(echo "$probe_data" | python3 -c "
import sys, json
data = json.load(sys.stdin)
summary = data.get('summary', {})
server_data = summary.get('$tag', summary.get('$server', {}))
if server_data:
    total = server_data.get('total', 0)
    reachable = server_data.get('reachable', 0)
    if total > 0:
        pct = (reachable / total) * 100
        print(f'RESULT:{reachable}/{total} ({pct:.0f}%)')
        if pct < 30:
            sys.exit(1)
        sys.exit(0)
print('NO_DATA')
" 2>/dev/null)
      local probe_exit=$?

      if [[ "$probe_result" == "NO_DATA" ]]; then
        log "  Probe: no data available"
      elif [[ $probe_exit -ne 0 ]]; then
        warn "  Probe: ${probe_result#RESULT:} reachable (below 30% threshold)"
        fail_count=$((fail_count + 1))
      else
        info "  Probe: ${probe_result#RESULT:} reachable"
      fi
      total_checks=$((total_checks + 1))
    fi
  fi

  # ── Check 2: Direct TCP connection (port 443) ──
  log "  TCP probe port 443..."
  if nc -z -w 5 "$ip" 443 2>/dev/null; then
    info "  TCP/443: reachable"
  else
    warn "  TCP/443: unreachable"
    fail_count=$((fail_count + 1))
  fi
  total_checks=$((total_checks + 1))

  # ── Check 3: Direct TCP connection (port 80) ──
  log "  TCP probe port 80..."
  if nc -z -w 5 "$ip" 80 2>/dev/null; then
    info "  TCP/80: reachable"
  else
    warn "  TCP/80: unreachable"
    fail_count=$((fail_count + 1))
  fi
  total_checks=$((total_checks + 1))

  # ── Check 4: ICMP ping ──
  log "  ICMP ping..."
  if ping -c 2 -W 3 "$ip" &>/dev/null; then
    info "  ICMP: reachable"
  else
    warn "  ICMP: unreachable"
    fail_count=$((fail_count + 1))
  fi
  total_checks=$((total_checks + 1))

  # ── Check 5: CDN domain resolution ──
  local cdn; cdn=$(get_server_cdn "$server")
  log "  CDN DNS check ($cdn)..."
  local resolved_ip
  resolved_ip=$(dig +short "$cdn" 2>/dev/null | head -1)
  if [[ -n "$resolved_ip" ]]; then
    if [[ "$resolved_ip" == "$ip" ]]; then
      info "  CDN DNS: resolves to $resolved_ip (direct — matches server IP)"
    else
      info "  CDN DNS: resolves to $resolved_ip (via Cloudflare proxy)"
    fi
  else
    warn "  CDN DNS: failed to resolve $cdn"
    fail_count=$((fail_count + 1))
  fi
  total_checks=$((total_checks + 1))

  # ── Check 6: RIPE Atlas (informational) ──
  log "  RIPE Atlas check..."
  local atlas_result
  atlas_result=$(curl -s --max-time 10 \
    "https://atlas.ripe.net/api/v2/probes/?country_code=IR&status=1&limit=5" \
    2>/dev/null) || true
  if [[ -n "$atlas_result" ]]; then
    local probe_count
    probe_count=$(echo "$atlas_result" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('count', 0))
" 2>/dev/null) || probe_count=0
    if [[ "$probe_count" -gt 0 ]]; then
      info "  RIPE Atlas: $probe_count active probes in Iran (manual measurement recommended)"
    else
      log "  RIPE Atlas: no active probes in Iran"
    fi
  else
    log "  RIPE Atlas: API unreachable (skipped)"
  fi

  # ── Verdict ──
  echo ""
  if [[ $fail_count -ge $BLOCK_THRESHOLD ]]; then
    echo -e "  ${RED}${BOLD}VERDICT: $server ($ip) appears BLOCKED${NC} ($fail_count/$total_checks checks failed)"
    set_server_blocked "$server" 1
    return 1
  else
    echo -e "  ${GREEN}${BOLD}VERDICT: $server ($ip) appears OK${NC} ($fail_count/$total_checks checks failed)"
    set_server_blocked "$server" 0
    return 0
  fi
}

check_all() {
  echo ""
  echo -e "${BOLD}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}  IP Reachability Check — $(date -u '+%Y-%m-%d %H:%M UTC')${NC}"
  echo -e "${BOLD}═══════════════════════════════════════════════════════════${NC}"

  local blocked_count=0
  for s in "${SERVERS[@]}"; do
    check_ip_blocked "$s" || true
    if [[ "$(get_server_blocked "$s")" == "1" ]]; then
      blocked_count=$((blocked_count + 1))
    fi
  done

  echo ""
  echo -e "${BOLD}═══ Summary ═══${NC}"
  for s in "${SERVERS[@]}"; do
    local ip; ip=$(get_server_ip "$s")
    local provider; provider=$(get_server_provider "$s")
    ip="${ip:-unknown}"
    if [[ "$(get_server_blocked "$s")" == "1" ]]; then
      echo -e "  ${RED}BLOCKED${NC}  $s ($ip) — $provider"
    else
      echo -e "  ${GREEN}OK${NC}       $s ($ip) — $provider"
    fi
  done
  echo ""

  if [[ $blocked_count -gt 0 ]]; then
    echo -e "${YELLOW}$blocked_count server(s) appear blocked. Run with --rotate <server> or --rotate-all to fix.${NC}"
  else
    echo -e "${GREEN}All servers appear reachable.${NC}"
  fi
  return $blocked_count
}

# ═══════════════════════════════════════════════════════════════════════════
# PHASE 2: IP ROTATION — PROVIDER-SPECIFIC
# ═══════════════════════════════════════════════════════════════════════════

# ── Hetzner IP Rotation (Helsinki) ───────────────────────────────────────

rotate_hetzner() {
  local old_ip; old_ip=$(get_server_ip "helsinki")
  require_env HETZNER_API_TOKEN
  log "Rotating Hetzner (Helsinki) IP: $old_ip"

  # Step 1: Find the server ID
  local server_id="${HETZNER_SERVER_ID:-}"
  if [[ -z "$server_id" ]]; then
    log "  Looking up Hetzner server ID..."
    local servers_resp
    servers_resp=$(api_call GET "${HETZNER_API}/servers" \
      -H "Authorization: Bearer ${HETZNER_API_TOKEN}" \
      -H "Content-Type: application/json") || fatal "Failed to list Hetzner servers"

    server_id=$(echo "$servers_resp" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for s in data.get('servers', []):
    pub = s.get('public_net', {}).get('ipv4', {}).get('ip', '')
    if pub == '$old_ip':
        print(s['id'])
        break
" 2>/dev/null)

    if [[ -z "$server_id" ]]; then
      fatal "Could not find Hetzner server with IP $old_ip"
    fi
    info "  Found server ID: $server_id"
  fi

  local cdn; cdn=$(get_server_cdn "helsinki")

  if $DRY_RUN; then
    dry "Would create new primary IP via Hetzner API"
    dry "Would assign new IP to server $server_id"
    dry "Would delete old primary IP"
    dry "Would update CF DNS for $cdn"
    dry "Would update worker server config via admin API"
    dry "Would send Telegram notification"
    return 0
  fi

  # Step 2: Create a new primary IP
  log "  Creating new primary IPv4..."
  local create_resp
  create_resp=$(api_call POST "${HETZNER_API}/primary_ips" \
    -H "Authorization: Bearer ${HETZNER_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{
      "assignee_type": "server",
      "auto_delete": false,
      "datacenter": "hel1-dc2",
      "name": "vpn-hel-'"$(date +%Y%m%d%H%M)"'",
      "type": "ipv4"
    }') || fatal "Failed to create new primary IP"

  local new_ip new_ip_id
  new_ip=$(echo "$create_resp" | python3 -c "
import sys, json; print(json.load(sys.stdin)['primary_ip']['ip'])")
  new_ip_id=$(echo "$create_resp" | python3 -c "
import sys, json; print(json.load(sys.stdin)['primary_ip']['id'])")
  info "  New IP created: $new_ip (ID: $new_ip_id)"

  # Step 3: Get old primary IP ID from server details
  log "  Looking up old primary IP..."
  local old_ip_id=""
  local server_detail
  server_detail=$(api_call GET "${HETZNER_API}/servers/${server_id}" \
    -H "Authorization: Bearer ${HETZNER_API_TOKEN}") || true
  old_ip_id=$(echo "$server_detail" | python3 -c "
import sys, json
data = json.load(sys.stdin)
ipv4 = data.get('server', {}).get('public_net', {}).get('ipv4', {})
print(ipv4.get('id', ''))
" 2>/dev/null) || true

  # Step 4: Unassign old IP from server
  if [[ -n "$old_ip_id" ]]; then
    log "  Unassigning old IP (ID: $old_ip_id)..."
    api_call POST "${HETZNER_API}/primary_ips/${old_ip_id}/actions/unassign" \
      -H "Authorization: Bearer ${HETZNER_API_TOKEN}" \
      -H "Content-Type: application/json" \
      -d '{}' >/dev/null 2>&1 || warn "  Could not unassign old IP"
  fi

  # Step 5: Assign new IP to server
  log "  Assigning new IP to server..."
  api_call POST "${HETZNER_API}/primary_ips/${new_ip_id}/actions/assign" \
    -H "Authorization: Bearer ${HETZNER_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"assignee_id\": ${server_id}, \"assignee_type\": \"server\"}" >/dev/null \
    || fatal "Failed to assign new IP to server"
  info "  New IP assigned to server $server_id"

  # Step 6: Delete old primary IP (cleanup)
  if [[ -n "$old_ip_id" ]]; then
    log "  Deleting old primary IP..."
    api_call DELETE "${HETZNER_API}/primary_ips/${old_ip_id}" \
      -H "Authorization: Bearer ${HETZNER_API_TOKEN}" >/dev/null 2>&1 \
      || warn "  Could not delete old IP $old_ip_id (manual cleanup may be needed)"
  fi

  # Update in-memory state
  set_server_ip "helsinki" "$new_ip"
  info "Hetzner IP rotated: $old_ip -> $new_ip"

  # Phase 3-5: DNS + worker + notification
  update_cf_dns "helsinki" "$new_ip"
  update_worker_ip "helsinki" "$new_ip"
  send_notification "helsinki" "$old_ip" "$new_ip"
}

# ── GCP IP Rotation (Dammam) ─────────────────────────────────────────────

rotate_gcp() {
  local old_ip; old_ip=$(get_server_ip "gcp")
  require_tool gcloud
  log "Rotating GCP (Dammam) IP: $old_ip"

  local project="${GCP_PROJECT}"
  local zone="${GCP_ZONE}"
  local instance="${GCP_INSTANCE}"

  # Auto-detect project/instance if not set
  if [[ -z "$project" ]]; then
    project=$(gcloud config get-value project 2>/dev/null) \
      || fatal "GCP_PROJECT not set and gcloud has no default"
  fi
  if [[ -z "$instance" ]]; then
    log "  Auto-detecting GCP instance..."
    instance=$(gcloud compute instances list --project="$project" \
      --filter="networkInterfaces[].accessConfigs[].natIP=$old_ip" \
      --format="value(name)" 2>/dev/null) \
      || fatal "Could not find GCP instance with IP $old_ip"
    info "  Found instance: $instance"
  fi

  local cdn; cdn=$(get_server_cdn "gcp")
  local region="${zone%-*}"

  if $DRY_RUN; then
    dry "Would release static IP address on GCP"
    dry "Would reserve new static IP in $region"
    dry "Would assign new IP to instance $instance"
    dry "Would update CF DNS for $cdn"
    dry "Would update worker server config via admin API"
    dry "Would send Telegram notification"
    return 0
  fi

  # Step 1: Find the static IP name
  log "  Finding static IP address name..."
  local ip_name
  ip_name=$(gcloud compute addresses list --project="$project" \
    --filter="address=$old_ip AND region:$region" \
    --format="value(name)" 2>/dev/null) || true

  # Step 2: Delete the access config (detach IP)
  log "  Detaching old IP from instance..."
  gcloud compute instances delete-access-config "$instance" \
    --project="$project" --zone="$zone" \
    --access-config-name="External NAT" --quiet 2>/dev/null \
    || warn "  Could not detach access config"

  # Step 3: Release old static IP
  if [[ -n "$ip_name" ]]; then
    log "  Releasing old static IP ($ip_name)..."
    gcloud compute addresses delete "$ip_name" \
      --project="$project" --region="$region" --quiet 2>/dev/null \
      || warn "  Could not release old IP (may be ephemeral)"
  fi

  # Step 4: Reserve a new static IP
  local new_ip_name="vpn-gcp-$(date +%Y%m%d%H%M)"
  log "  Reserving new static IP ($new_ip_name)..."
  gcloud compute addresses create "$new_ip_name" \
    --project="$project" --region="$region" --quiet \
    || fatal "Failed to reserve new GCP static IP"

  local new_ip
  new_ip=$(gcloud compute addresses describe "$new_ip_name" \
    --project="$project" --region="$region" \
    --format="value(address)" 2>/dev/null) \
    || fatal "Failed to get new IP address"
  info "  New static IP reserved: $new_ip"

  # Step 5: Assign new IP to instance
  log "  Assigning new IP to instance..."
  gcloud compute instances add-access-config "$instance" \
    --project="$project" --zone="$zone" \
    --access-config-name="External NAT" \
    --address="$new_ip" --quiet \
    || fatal "Failed to assign new IP to instance"
  info "  New IP assigned to $instance"

  set_server_ip "gcp" "$new_ip"
  info "GCP IP rotated: $old_ip -> $new_ip"

  update_cf_dns "gcp" "$new_ip"
  update_worker_ip "gcp" "$new_ip"
  send_notification "gcp" "$old_ip" "$new_ip"
}

# ── Scaleway IP Rotation (London) ────────────────────────────────────────

rotate_scaleway() {
  local old_ip; old_ip=$(get_server_ip "scaleway")
  log "Rotating Scaleway (London) IP: $old_ip"

  require_env SCW_SECRET_KEY

  local server_id="${SCW_SERVER_ID:-}"
  local scw_zone="${SCW_ZONE}"

  # Auto-detect server ID if not set
  if [[ -z "$server_id" ]]; then
    log "  Looking up Scaleway instance ID..."
    local instances_resp
    instances_resp=$(api_call GET "${SCW_API}/${scw_zone}/servers" \
      -H "X-Auth-Token: ${SCW_SECRET_KEY}" \
      -H "Content-Type: application/json") || fatal "Failed to list Scaleway servers"

    server_id=$(echo "$instances_resp" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for s in data.get('servers', []):
    pub_ip = s.get('public_ip', {})
    if pub_ip and pub_ip.get('address') == '$old_ip':
        print(s['id'])
        break
" 2>/dev/null)

    if [[ -z "$server_id" ]]; then
      fatal "Could not find Scaleway instance with IP $old_ip"
    fi
    info "  Found instance ID: $server_id"
  fi

  local cdn; cdn=$(get_server_cdn "scaleway")

  if $DRY_RUN; then
    dry "Would create new flexible IP via Scaleway API"
    dry "Would detach old IP from instance $server_id"
    dry "Would attach new IP to instance $server_id"
    dry "Would delete old flexible IP"
    dry "Would update CF DNS for $cdn"
    dry "Would update worker server config via admin API"
    dry "Would send Telegram notification"
    return 0
  fi

  # Step 1: Get current IP ID + project
  log "  Looking up current IP ID..."
  local server_resp
  server_resp=$(api_call GET "${SCW_API}/${scw_zone}/servers/${server_id}" \
    -H "X-Auth-Token: ${SCW_SECRET_KEY}") || fatal "Failed to get server details"

  local old_ip_id scw_project
  old_ip_id=$(echo "$server_resp" | python3 -c "
import sys, json
pub = json.load(sys.stdin).get('server', {}).get('public_ip', {})
print(pub.get('id', ''))
" 2>/dev/null) || true
  scw_project=$(echo "$server_resp" | python3 -c "
import sys, json; print(json.load(sys.stdin)['server']['project'])
" 2>/dev/null) || fatal "Could not determine Scaleway project ID"

  # Step 2: Create a new flexible IP
  log "  Creating new flexible IP..."
  local new_ip_resp
  new_ip_resp=$(api_call POST "${SCW_API}/${scw_zone}/ips" \
    -H "X-Auth-Token: ${SCW_SECRET_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"project\": \"${scw_project}\", \"type\": \"routed_ipv4\"}") \
    || fatal "Failed to create new Scaleway IP"

  local new_ip new_ip_id
  new_ip=$(echo "$new_ip_resp" | python3 -c "
import sys, json; print(json.load(sys.stdin)['ip']['address'])")
  new_ip_id=$(echo "$new_ip_resp" | python3 -c "
import sys, json; print(json.load(sys.stdin)['ip']['id'])")
  info "  New IP created: $new_ip (ID: $new_ip_id)"

  # Step 3: Switch IP on instance
  log "  Switching IP on instance..."
  api_call PATCH "${SCW_API}/${scw_zone}/servers/${server_id}" \
    -H "X-Auth-Token: ${SCW_SECRET_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"public_ip\": \"${new_ip_id}\"}" >/dev/null \
    || fatal "Failed to assign new IP to Scaleway instance"
  info "  New IP assigned to instance $server_id"

  # Step 4: Delete old IP
  if [[ -n "$old_ip_id" ]]; then
    log "  Deleting old flexible IP..."
    api_call DELETE "${SCW_API}/${scw_zone}/ips/${old_ip_id}" \
      -H "X-Auth-Token: ${SCW_SECRET_KEY}" >/dev/null 2>&1 \
      || warn "  Could not delete old IP (manual cleanup may be needed)"
  fi

  set_server_ip "scaleway" "$new_ip"
  info "Scaleway IP rotated: $old_ip -> $new_ip"

  update_cf_dns "scaleway" "$new_ip"
  update_worker_ip "scaleway" "$new_ip"
  send_notification "scaleway" "$old_ip" "$new_ip"
}

# ── Oracle — Manual Only ─────────────────────────────────────────────────

rotate_oracle() {
  err "Oracle Cloud free-tier IP rotation is not fully automatable."
  echo ""
  echo "  Oracle free-tier VMs have limited IP rotation support."
  echo "  Manual steps:"
  echo "    1. Go to OCI Console > Networking > Reserved Public IPs"
  echo "    2. Release the current reserved IP"
  echo "    3. Create a new reserved IP"
  echo "    4. Assign it to the VNIC of the instance"
  echo "    5. Then run: bash ip-rotate.sh --update-dns oracle <NEW_IP>"
  echo ""
  echo "  Or use the OCI CLI:"
  echo "    oci network public-ip list --scope REGION --compartment-id <COMPARTMENT>"
  echo "    oci network public-ip delete --public-ip-id <OLD_IP_OCID>"
  echo "    oci network public-ip create --compartment-id <COMPARTMENT> --lifetime RESERVED"
  echo ""
  return 1
}

# ═══════════════════════════════════════════════════════════════════════════
# PHASE 3: CLOUDFLARE DNS UPDATE
# ═══════════════════════════════════════════════════════════════════════════

update_cf_dns() {
  local server="$1"
  local new_ip="$2"
  local cdn_domain; cdn_domain=$(get_server_cdn "$server")

  require_env CF_API_TOKEN
  require_env CF_ZONE_ID

  log "Updating Cloudflare DNS: $cdn_domain -> $new_ip"

  if $DRY_RUN; then
    dry "Would update DNS A record for $cdn_domain to $new_ip"
    return 0
  fi

  # Find the existing DNS record ID
  local records_resp
  records_resp=$(api_call GET \
    "${CF_API}/zones/${CF_ZONE_ID}/dns_records?name=${cdn_domain}&type=A" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json") || fatal "Failed to list DNS records"

  local record_id
  record_id=$(echo "$records_resp" | python3 -c "
import sys, json
data = json.load(sys.stdin)
records = data.get('result', [])
if records:
    print(records[0]['id'])
" 2>/dev/null) || true

  if [[ -z "$record_id" ]]; then
    warn "  No existing A record for $cdn_domain — creating new one"
    api_call POST "${CF_API}/zones/${CF_ZONE_ID}/dns_records" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{
        \"type\": \"A\",
        \"name\": \"${cdn_domain}\",
        \"content\": \"${new_ip}\",
        \"ttl\": 300,
        \"proxied\": true
      }" >/dev/null || fatal "Failed to create DNS record"
  else
    api_call PATCH "${CF_API}/zones/${CF_ZONE_ID}/dns_records/${record_id}" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{
        \"content\": \"${new_ip}\",
        \"ttl\": 300
      }" >/dev/null || fatal "Failed to update DNS record"
  fi

  info "DNS updated: $cdn_domain -> $new_ip"
}

# ═══════════════════════════════════════════════════════════════════════════
# PHASE 4: WORKER KV UPDATE
# ═══════════════════════════════════════════════════════════════════════════

update_worker_ip() {
  local server="$1"
  local new_ip="$2"
  local tag; tag=$(get_server_tag "$server")

  require_env ADMIN_UUID

  log "Updating worker server config: $tag -> $new_ip"

  if $DRY_RUN; then
    dry "Would PATCH ${WORKER_URL}/admin/servers/${tag} with ip=$new_ip"
    return 0
  fi

  local response
  response=$(api_call PATCH "${WORKER_URL}/admin/servers/${tag}" \
    -H "Authorization: Bearer ${ADMIN_UUID}" \
    -H "Content-Type: application/json" \
    -d "{\"ip\": \"${new_ip}\"}") || fatal "Failed to update worker server config"

  info "Worker updated: $tag -> $new_ip"
  log "  Response: $response"
}

# ═══════════════════════════════════════════════════════════════════════════
# PHASE 5: NOTIFICATION
# ═══════════════════════════════════════════════════════════════════════════

send_notification() {
  local server="$1"
  local old_ip="$2"
  local new_ip="$3"

  if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
    warn "Telegram credentials not set — skipping notification"
    return 0
  fi

  local provider; provider=$(get_server_provider "$server")
  local cdn; cdn=$(get_server_cdn "$server")

  # Build message (plain text — Telegram Markdown can be finicky with IPs)
  local message="IP Rotation Complete

Server: ${server} (${provider})
Old IP: ${old_ip}
New IP: ${new_ip}
CDN: ${cdn}
Time: ${TIMESTAMP}

Actions taken:
- New IP provisioned from ${provider}
- CF DNS updated (${cdn} -> ${new_ip})
- Worker config updated (subscriptions refreshed)

Users should reconnect or refresh their subscription."

  if $DRY_RUN; then
    dry "Would send Telegram notification:"
    echo "$message" | sed 's/^/    /'
    return 0
  fi

  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    -d "text=${message}" >/dev/null 2>&1 \
    && info "Telegram notification sent" \
    || warn "Failed to send Telegram notification"
}

# ═══════════════════════════════════════════════════════════════════════════
# MANUAL DNS UPDATE (for Oracle or manual IP changes)
# ═══════════════════════════════════════════════════════════════════════════

manual_update() {
  local server="$1"
  local new_ip="$2"
  local old_ip; old_ip=$(get_server_ip "$server")
  old_ip="${old_ip:-unknown}"

  log "Manual IP update for $server: $old_ip -> $new_ip"

  if $DRY_RUN; then
    local cdn; cdn=$(get_server_cdn "$server")
    dry "Would update CF DNS for $cdn"
    dry "Would update worker server config"
    dry "Would send notification"
    return 0
  fi

  update_cf_dns "$server" "$new_ip"
  update_worker_ip "$server" "$new_ip"
  send_notification "$server" "$old_ip" "$new_ip"
  set_server_ip "$server" "$new_ip"
}

# ═══════════════════════════════════════════════════════════════════════════
# ROTATION DISPATCHER
# ═══════════════════════════════════════════════════════════════════════════

rotate_server() {
  local server="$1"
  local provider; provider=$(get_server_provider "$server")

  echo ""
  echo -e "${BOLD}=== Rotating $server ($provider) ===${NC}"

  case "$provider" in
    hetzner)   rotate_hetzner ;;
    gcp)       rotate_gcp ;;
    scaleway)  rotate_scaleway ;;
    oracle)    rotate_oracle ;;
    *)         fatal "Unknown provider: $provider" ;;
  esac
}

rotate_all_blocked() {
  log "Checking all servers before rotation..."
  check_all || true

  local rotated=0
  for s in "${SERVERS[@]}"; do
    if [[ "$(get_server_blocked "$s")" == "1" ]]; then
      local provider; provider=$(get_server_provider "$s")
      if [[ "$provider" == "oracle" ]]; then
        warn "Skipping $s — Oracle free tier requires manual rotation"
        continue
      fi
      rotate_server "$s"
      rotated=$((rotated + 1))
    fi
  done

  if [[ $rotated -eq 0 ]]; then
    info "No rotatable blocked servers found."
  else
    info "$rotated server(s) rotated successfully."
  fi
}

# ═══════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════

usage() {
  cat <<'USAGE'
Usage: ip-rotate.sh [OPTIONS] [COMMAND]

Commands:
  --check                        Check which server IPs are blocked
  --rotate <server>              Rotate IP for a specific server
  --rotate-all                   Check + rotate all blocked IPs
  --update-dns <server> <ip>     Manual DNS + worker update (no IP provisioning)

Options:
  --dry-run                      Preview actions without making changes
  --help, -h                     Show this help

Servers: helsinki, oracle, gcp, scaleway

Environment variables:
  HETZNER_API_TOKEN              Hetzner Cloud API token
  CF_API_TOKEN                   Cloudflare API token (DNS edit)
  CF_ZONE_ID                     Cloudflare zone ID
  ADMIN_UUID                     Smart-sub worker admin token
  TELEGRAM_BOT_TOKEN             Telegram notification bot token
  TELEGRAM_CHAT_ID               Telegram notification chat ID
  WORKER_URL                     Worker URL (default: https://sub.example.com)
  BLOCK_THRESHOLD                Failed checks threshold (default: 2)

Examples:
  ip-rotate.sh --check
  ip-rotate.sh --rotate helsinki
  ip-rotate.sh --dry-run --rotate gcp
  ip-rotate.sh --rotate-all
  ip-rotate.sh --update-dns oracle 1.2.3.4
USAGE
}

validate_server() {
  local server="$1"
  local idx
  idx=$(server_index "$server") || fatal "Unknown server: $server (valid: ${SERVERS[*]})"
}

# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

main() {
  # Source .env if present
  if [[ -f "$SCRIPT_DIR/.env" ]]; then
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/.env"
    log "Loaded environment from $SCRIPT_DIR/.env"
  elif [[ -f "$SCRIPT_DIR/../../.env" ]]; then
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/../../.env"
    log "Loaded environment from project root .env"
  fi

  # Parse arguments
  if [[ $# -eq 0 ]]; then
    usage
    exit 0
  fi

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --help|-h)
        usage
        exit 0
        ;;
      --dry-run)
        DRY_RUN=true
        log "Dry-run mode enabled"
        shift
        ;;
      --check)
        ACTION="check"
        shift
        ;;
      --rotate)
        ACTION="rotate"
        [[ $# -lt 2 ]] && fatal "--rotate requires a server name: ${SERVERS[*]}"
        TARGET="$2"
        shift 2
        ;;
      --rotate-all)
        ACTION="rotate-all"
        shift
        ;;
      --update-dns)
        ACTION="update-dns"
        [[ $# -lt 3 ]] && fatal "--update-dns requires: <server> <new_ip>"
        TARGET="$2"
        UPDATE_DNS_IP="$3"
        shift 3
        ;;
      *)
        fatal "Unknown argument: $1 (try --help)"
        ;;
    esac
  done

  if [[ -z "$ACTION" ]]; then
    usage
    exit 0
  fi

  # Load server IPs
  load_server_config

  # Execute
  case "$ACTION" in
    check)
      check_all
      ;;
    rotate)
      validate_server "$TARGET"
      rotate_server "$TARGET"
      ;;
    rotate-all)
      rotate_all_blocked
      ;;
    update-dns)
      validate_server "$TARGET"
      [[ -z "$UPDATE_DNS_IP" ]] && fatal "--update-dns requires: <server> <new_ip>"
      manual_update "$TARGET" "$UPDATE_DNS_IP"
      ;;
  esac
}

main "$@"
