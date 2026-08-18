#!/usr/bin/env bash
# ── RIPE Atlas Iran Monitoring Setup ──────────────────────────────
#
# Creates RIPE Atlas measurements to continuously test VPN server
# reachability from probes inside Iran. Uses the RIPE Atlas API v2.
#
# Prerequisites:
#   - RIPE Atlas account with API key (measurement creation credits)
#   - Set RIPE_ATLAS_API_KEY environment variable
#   - jq installed
#
# Probe selection:
#   Probe IDs are supplied via RIPE_ATLAS_IRAN_PROBES (comma-separated) and are
#   deliberately NOT hardcoded here. A probe ID plus a network annotation
#   identifies a specific host — for residential probes in a censored country
#   that is a real risk to the person hosting it. Choose probes yourself at
#   https://atlas.ripe.net/probes/ and keep the list out of version control.
#
# Usage:
#   export RIPE_ATLAS_API_KEY="your-api-key"
#   bash tools/ripe-atlas-setup.sh create
#   bash tools/ripe-atlas-setup.sh status
#   bash tools/ripe-atlas-setup.sh results <measurement_id>
#
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────

API_BASE="https://atlas.ripe.net/api/v2"
API_KEY="${RIPE_ATLAS_API_KEY:-}"

# Server IPs (loaded from vars.env or set here)
HELSINKI_IP="${HELSINKI_IP:-${HEL_IP:-}}"
ORACLE_IP="${ORACLE_IP:-${ORC_IP:-}}"
GCP_IP="${GCP_IP:-${GCP_IP:-}}"
SCALEWAY_IP="${SCALEWAY_IP:-${SCW_IP:-}}"

# Probe IDs come from the environment — never commit them (see header note).
# Residential probes give the most realistic results; academic and datacenter
# probes may have different routing and filtering.
IRAN_PROBES="${RIPE_ATLAS_IRAN_PROBES:?Set RIPE_ATLAS_IRAN_PROBES to a comma-separated list of probe IDs}"
RESIDENTIAL_PROBE="${RIPE_ATLAS_RESIDENTIAL_PROBE:-${IRAN_PROBES%%,*}}"

# CDN domains to test DNS resolution
CDN_DOMAINS=("cdn.example.com" "cdn2.example.com" "cdn3.example.com" "cdn4.example.com" "sub.example.com")

# Reality SNI domains (used for TLS handshake tests)
SNI_DOMAINS=("www.google.com" "dl.google.com" "www.microsoft.com")

# ── Helpers ──────────────────────────────────────────────────────

die() { echo "ERROR: $1" >&2; exit 1; }
info() { echo "ℹ️  $1"; }
ok() { echo "✅ $1"; }
warn() { echo "⚠️  $1"; }

check_deps() {
  command -v curl >/dev/null || die "curl is required"
  command -v jq >/dev/null || die "jq is required (brew install jq)"
  [ -n "$API_KEY" ] || die "Set RIPE_ATLAS_API_KEY environment variable"
}

atlas_api() {
  local method="$1" endpoint="$2"
  shift 2
  curl -s -X "$method" "${API_BASE}${endpoint}" \
    -H "Authorization: Key ${API_KEY}" \
    -H "Content-Type: application/json" \
    "$@"
}

# ── Create Measurements ─────────────────────────────────────────

create_tcp_measurement() {
  local ip="$1" tag="$2" port="${3:-443}"
  info "Creating TCP/$port measurement for $tag ($ip)..."

  local payload
  payload=$(cat <<EOF
{
  "definitions": [{
    "type": "traceroute",
    "af": 4,
    "target": "$ip",
    "port": $port,
    "protocol": "TCP",
    "paris": 16,
    "first_hop": 1,
    "max_hops": 32,
    "description": "VPN $tag TCP/$port from Iran",
    "resolve_on_probe": false,
    "is_oneoff": false,
    "interval": 3600,
    "tags": ["vpn-monitor", "iran-probe", "$tag"]
  }],
  "probes": [{
    "type": "probes",
    "value": "$IRAN_PROBES",
    "requested": 6
  }],
  "is_oneoff": false,
  "bill_to": "$(echo "$API_KEY" | head -c 8)"
}
EOF
)

  local result
  result=$(echo "$payload" | atlas_api POST "/measurements/" -d @-)
  local msm_id
  msm_id=$(echo "$result" | jq -r '.measurements[0] // empty' 2>/dev/null)
  
  if [ -n "$msm_id" ]; then
    ok "Created measurement $msm_id for $tag TCP/$port"
    echo "$msm_id"
  else
    warn "Failed to create measurement for $tag: $(echo "$result" | jq -r '.error.detail // .detail // "unknown error"' 2>/dev/null)"
    echo ""
  fi
}

create_tls_measurement() {
  local ip="$1" tag="$2" sni="$3"
  info "Creating TLS/SSL measurement for $tag ($ip) SNI=$sni..."

  local payload
  payload=$(cat <<EOF
{
  "definitions": [{
    "type": "sslcert",
    "af": 4,
    "target": "$ip",
    "port": 443,
    "description": "VPN $tag TLS check SNI=$sni from Iran",
    "resolve_on_probe": false,
    "is_oneoff": false,
    "interval": 3600,
    "tags": ["vpn-monitor", "iran-tls", "$tag"]
  }],
  "probes": [{
    "type": "probes",
    "value": "$RESIDENTIAL_PROBE",
    "requested": 1
  }],
  "is_oneoff": false
}
EOF
)

  local result
  result=$(echo "$payload" | atlas_api POST "/measurements/" -d @-)
  local msm_id
  msm_id=$(echo "$result" | jq -r '.measurements[0] // empty' 2>/dev/null)
  
  if [ -n "$msm_id" ]; then
    ok "Created TLS measurement $msm_id for $tag"
    echo "$msm_id"
  else
    warn "Failed: $(echo "$result" | jq -r '.error.detail // .detail // "unknown"' 2>/dev/null)"
    echo ""
  fi
}

create_dns_measurement() {
  local domain="$1"
  info "Creating DNS measurement for $domain..."

  local payload
  payload=$(cat <<EOF
{
  "definitions": [{
    "type": "dns",
    "af": 4,
    "target": "8.8.8.8",
    "query_class": "IN",
    "query_type": "A",
    "query_argument": "$domain",
    "use_probe_resolver": true,
    "set_rd_bit": true,
    "protocol": "UDP",
    "udp_payload_size": 512,
    "description": "DNS resolve $domain from Iran (probe resolver)",
    "is_oneoff": false,
    "interval": 3600,
    "tags": ["vpn-monitor", "iran-dns"]
  }],
  "probes": [{
    "type": "probes",
    "value": "$IRAN_PROBES",
    "requested": 6
  }],
  "is_oneoff": false
}
EOF
)

  local result
  result=$(echo "$payload" | atlas_api POST "/measurements/" -d @-)
  local msm_id
  msm_id=$(echo "$result" | jq -r '.measurements[0] // empty' 2>/dev/null)
  
  if [ -n "$msm_id" ]; then
    ok "Created DNS measurement $msm_id for $domain"
    echo "$msm_id"
  else
    warn "Failed: $(echo "$result" | jq -r '.error.detail // .detail // "unknown"' 2>/dev/null)"
    echo ""
  fi
}

# ── Actions ──────────────────────────────────────────────────────

cmd_create() {
  check_deps
  info "Creating RIPE Atlas measurements for VPN monitoring from Iran..."
  echo ""

  local measurements=()
  
  # TCP connectivity to each server on port 443
  declare -A SERVERS
  [ -n "$HELSINKI_IP" ] && SERVERS[helsinki]="$HELSINKI_IP"
  [ -n "$ORACLE_IP" ] && SERVERS[oracle-madrid]="$ORACLE_IP"
  [ -n "$GCP_IP" ] && SERVERS[gcp-middle-east]="$GCP_IP"
  [ -n "$SCALEWAY_IP" ] && SERVERS[scaleway-london]="$SCALEWAY_IP"

  if [ ${#SERVERS[@]} -eq 0 ]; then
    die "No server IPs configured. Set HELSINKI_IP, ORACLE_IP, GCP_IP, SCALEWAY_IP or source vars.env"
  fi

  echo "── TCP/443 Measurements ──"
  for tag in "${!SERVERS[@]}"; do
    msm=$(create_tcp_measurement "${SERVERS[$tag]}" "$tag" 443)
    [ -n "$msm" ] && measurements+=("tcp_443:$tag:$msm")
  done

  echo ""
  echo "── TCP/80 Measurements ──"
  for tag in "${!SERVERS[@]}"; do
    msm=$(create_tcp_measurement "${SERVERS[$tag]}" "$tag" 80)
    [ -n "$msm" ] && measurements+=("tcp_80:$tag:$msm")
  done

  echo ""
  echo "── TLS/SSL Measurements ──"
  for tag in "${!SERVERS[@]}"; do
    msm=$(create_tls_measurement "${SERVERS[$tag]}" "$tag" "www.google.com")
    [ -n "$msm" ] && measurements+=("tls:$tag:$msm")
  done

  echo ""
  echo "── DNS Resolution Measurements ──"
  for domain in "${CDN_DOMAINS[@]}"; do
    msm=$(create_dns_measurement "$domain")
    [ -n "$msm" ] && measurements+=("dns:$domain:$msm")
  done

  echo ""
  echo "═══════════════════════════════════════════════════"
  echo "  Created ${#measurements[@]} measurements:"
  for m in "${measurements[@]}"; do
    echo "    $m"
  done
  echo ""
  echo "  View results at: https://atlas.ripe.net/measurements/"
  echo "  Store these IDs in GitHub secrets for the monitoring workflow."
  echo ""
  echo "  Recommended GitHub secret format:"
  echo "    RIPE_ATLAS_MEASUREMENT_IDS=$(IFS=,; echo "${measurements[*]}" | sed 's/[^:]*://g; s/:[^,]*/,/g' | sed 's/,$//')"
  echo "═══════════════════════════════════════════════════"
}

cmd_status() {
  check_deps
  info "Checking RIPE Atlas Iranian probe status..."
  echo ""

  local result
  result=$(atlas_api GET "/probes/?country_code=IR&status=1&format=json")
  
  local count
  count=$(echo "$result" | jq '.count' 2>/dev/null)
  echo "Active probes in Iran: $count"
  echo ""
  
  echo "$result" | jq -r '.results[] | "  Probe \(.id): ASN \(.asn_v4) | \(.address_v4 // "no-ipv4") | \(.description // "no desc") | status=\(.status_name)"' 2>/dev/null
}

cmd_results() {
  check_deps
  local msm_id="${1:-}"
  [ -n "$msm_id" ] || die "Usage: $0 results <measurement_id>"

  info "Fetching results for measurement $msm_id..."
  echo ""

  local result
  result=$(atlas_api GET "/measurements/${msm_id}/latest/?format=json")
  
  echo "$result" | jq '[.[] | {
    probe_id: .prb_id,
    from: .from,
    timestamp: (.timestamp | todate),
    dst_addr: .dst_addr,
    result: (if .result then "success" else "failed" end),
    avg_rtt: (if .avg then .avg else null end)
  }]' 2>/dev/null
}

cmd_oneoff() {
  check_deps
  info "Running one-off TCP/443 probe from Iran (residential probe $RESIDENTIAL_PROBE)..."
  echo ""

  declare -A SERVERS
  [ -n "$HELSINKI_IP" ] && SERVERS[helsinki]="$HELSINKI_IP"
  [ -n "$ORACLE_IP" ] && SERVERS[oracle-madrid]="$ORACLE_IP"
  [ -n "$GCP_IP" ] && SERVERS[gcp-middle-east]="$GCP_IP"
  [ -n "$SCALEWAY_IP" ] && SERVERS[scaleway-london]="$SCALEWAY_IP"

  for tag in "${!SERVERS[@]}"; do
    local ip="${SERVERS[$tag]}"
    info "Probing $tag ($ip) from residential probe $RESIDENTIAL_PROBE..."
    
    local payload
    payload=$(cat <<EOF
{
  "definitions": [{
    "type": "traceroute",
    "af": 4,
    "target": "$ip",
    "port": 443,
    "protocol": "TCP",
    "description": "VPN oneoff $tag from Iran",
    "is_oneoff": true
  }],
  "probes": [{
    "type": "probes",
    "value": "$RESIDENTIAL_PROBE",
    "requested": 1
  }],
  "is_oneoff": true
}
EOF
)
    local result
    result=$(echo "$payload" | atlas_api POST "/measurements/" -d @-)
    echo "  → $(echo "$result" | jq -r '.measurements[0] // "failed"' 2>/dev/null)"
  done
}

# ── Main ─────────────────────────────────────────────────────────

case "${1:-help}" in
  create)  cmd_create ;;
  status)  cmd_status ;;
  results) cmd_results "${2:-}" ;;
  oneoff)  cmd_oneoff ;;
  help|*)
    echo "RIPE Atlas Iran VPN Monitor"
    echo ""
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  create   Create ongoing measurements (TCP, TLS, DNS) from Iranian probes"
    echo "  status   Check status of Iranian RIPE Atlas probes"
    echo "  results  Fetch latest results for a measurement ID"
    echo "  oneoff   Run one-off TCP/443 test from residential probe"
    echo "  help     Show this help"
    echo ""
    echo "Environment:"
    echo "  RIPE_ATLAS_API_KEY   Required. Your RIPE Atlas API key"
    echo "  HELSINKI_IP           Server IP (or source vars.env)"
    echo "  ORACLE_IP            Server IP"
    echo "  GCP_IP               Server IP"
    echo "  SCALEWAY_IP          Server IP"
    ;;
esac
