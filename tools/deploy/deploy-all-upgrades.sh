#!/bin/bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
# ─────────────────────────────────────────────────────────────────
#  deploy-all-upgrades.sh — Master orchestrator for R&D bypass upgrades
#
#  Runs all upgrade scripts in the correct dependency order:
#    1. upgrade-xray.sh      → Xray v26.2.6 (required before Finalmask)
#    2. deploy-finalmask.sh  → XDNS + XICMP (needs Xray v26.2.6)
#    3. deploy-salamander-udphop.sh → Hy2 Salamander + port hopping
#    4. deploy-shadowtls.sh  → ShadowTLS v3 + SS2022 chain
#    5. deploy-naiveproxy-expand.sh → NaiveProxy to Helsinki + Oracle
#    6. deploy-dnstunnel-expand.sh  → DNS tunnel to Oracle + Scaleway
#    7. wrangler deploy       → Worker v4.0 with new protocols
#
#  Usage:
#    ./deploy-all-upgrades.sh              # Deploy everything
#    ./deploy-all-upgrades.sh --dry-run    # Print what would be done
#    ./deploy-all-upgrades.sh --step N     # Run only step N
#    ./deploy-all-upgrades.sh --from N     # Run from step N onwards
#
#  Prerequisites:
#    - SSH access to all 4 servers
#    - wrangler CLI authenticated (npx wrangler whoami)
#    - DNS records created for new domains (see pre-flight check)
#
#  IMPORTANT: Review each script before running. This is a one-way
#  operation that modifies server configs on 4 production VPN servers.
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/vars.env" 2>/dev/null || true
source "$SCRIPT_DIR/../server-config.sh" 2>/dev/null \
  || { echo "❌ server-config.sh not found. Copy from server-config.sh.example"; exit 1; }

# ── Colors and formatting ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

DRY_RUN=false
START_STEP=1
ONLY_STEP=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --step) ONLY_STEP="$2"; shift 2 ;;
    --from) START_STEP="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

TOTAL_STEPS=7
PASSED=0
FAILED=0
SKIPPED=0

log() { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*"; }
header() {
  echo ""
  echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}${CYAN}  $*${NC}"
  echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════${NC}"
}

should_run_step() {
  local step=$1
  if [[ $ONLY_STEP -ne 0 ]]; then
    [[ $step -eq $ONLY_STEP ]]
  else
    [[ $step -ge $START_STEP ]]
  fi
}

run_step() {
  local step=$1 name=$2 script=$3
  if ! should_run_step "$step"; then
    echo -e "  ${YELLOW}[SKIP]${NC} Step $step: $name (before --from $START_STEP)"
    ((SKIPPED++))
    return
  fi
  echo ""
  echo -e "  ${BOLD}Step $step/$TOTAL_STEPS: $name${NC}"
  if $DRY_RUN; then
    echo -e "  ${YELLOW}[DRY-RUN]${NC} Would execute: $script"
    ((SKIPPED++))
    return
  fi
  if [[ ! -f "$script" ]]; then
    fail "Script not found: $script"
    ((FAILED++))
    return
  fi
  log "Running: $(basename "$script")..."
  if bash "$script" 2>&1 | sed 's/^/    /'; then
    success "Step $step complete: $name"
    ((PASSED++))
  else
    fail "Step $step failed: $name"
    ((FAILED++))
    echo -e "  ${YELLOW}Continue? (y/n)${NC}"
    read -r ans
    if [[ "$ans" != "y" ]]; then
      echo "Aborting at step $step."
      exit 1
    fi
  fi
}

# ═══════════════════════════════════════════════════════════════
header "VPN R&D Bypass Upgrade — Master Deploy"
echo ""
echo -e "  Servers: Helsinki, Oracle-Madrid, GCP-ME, Scaleway-London"
echo -e "  Protocols: Finalmask, Salamander+Hop, ShadowTLS v3, NaiveProxy, DNS Tunnel"
echo -e "  Worker: v3.1 → v4.0"
echo ""

if $DRY_RUN; then
  warn "DRY-RUN MODE — no changes will be made"
fi

# ── Pre-flight checks ──
header "Pre-flight Checks"

# Check SSH connectivity (quick timeout)
SERVERS_SSH=(
  "$HEL_SSH:Helsinki"
  "$ORC_SSH:Oracle-Madrid"
  "$GCP_SSH:GCP-ME"
  "$SCW_SSH:Scaleway-London"
)

for entry in "${SERVERS_SSH[@]}"; do
  IFS=: read -r ssh_target name <<< "$entry"
  if $DRY_RUN; then
    echo -e "  ${YELLOW}[DRY-RUN]${NC} Would check SSH: $ssh_target ($name)"
  else
    if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$ssh_target" "echo ok" &>/dev/null; then
      success "SSH to $name ($ssh_target)"
    else
      warn "SSH to $name ($ssh_target) — FAILED (script will handle per-server)"
    fi
  fi
done

# Check wrangler
if command -v wrangler &>/dev/null || command -v npx &>/dev/null; then
  success "Wrangler CLI available"
else
  warn "Wrangler CLI not found — step 7 (worker deploy) will fail"
fi

# Check DNS records needed for new deployments
echo ""
log "DNS records required (create these in Cloudflare if not done):"
echo "  web.example.com   → $HEL_IP  (DNS only, grey cloud)"
echo "  web2.example.com  → $ORC_IP  (DNS only, grey cloud)"
echo "  tns2.example.com  → NS → t-m.example.com (NS delegation)"
echo "  t-m.example.com   → $ORC_IP  (A record)"
echo "  tns4.example.com  → NS → t-l.example.com (NS delegation)"
echo "  t-l.example.com   → $SCW_IP   (A record)"
echo ""

if ! $DRY_RUN; then
  echo -e "${YELLOW}Press Enter to continue with deployment, or Ctrl+C to abort...${NC}"
  read -r
fi

# ── Deploy Steps ──
header "Deploying Upgrades"

# Step 1: Upgrade Xray-core to v26.2.6 (prerequisite for Finalmask)
run_step 1 "Upgrade Xray-core to v26.2.6" "$SCRIPT_DIR/upgrade-xray.sh"

# Step 2: Deploy Finalmask XDNS + XICMP (requires Xray v26.2.6)
run_step 2 "Deploy Finalmask (XDNS + XICMP)" "$SCRIPT_DIR/deploy-finalmask.sh"

# Step 3: Deploy Hysteria2 Salamander + UDP port hopping
run_step 3 "Deploy Salamander + UDP hop" "$SCRIPT_DIR/deploy-salamander-udphop.sh"

# Step 4: Deploy ShadowTLS v3 + SS2022 chain
run_step 4 "Deploy ShadowTLS v3" "$SCRIPT_DIR/deploy-shadowtls.sh"

# Step 5: Expand NaiveProxy to Helsinki + Oracle
run_step 5 "Expand NaiveProxy" "$SCRIPT_DIR/deploy-naiveproxy-expand.sh"

# Step 6: Expand DNS tunnel to Oracle + Scaleway
run_step 6 "Expand DNS tunnel" "$SCRIPT_DIR/deploy-dnstunnel-expand.sh"

# Step 7: Deploy updated worker.js (v4.0)
if should_run_step 7; then
  echo ""
  echo -e "  ${BOLD}Step 7/$TOTAL_STEPS: Deploy Worker v4.0${NC}"
  if $DRY_RUN; then
    echo -e "  ${YELLOW}[DRY-RUN]${NC} Would deploy worker from $SCRIPT_DIR/../smart-sub/"
    ((SKIPPED++))
  else
    WORKER_DIR="$SCRIPT_DIR/../smart-sub"
    if [[ -f "$WORKER_DIR/wrangler.toml" ]]; then
      log "Deploying worker v4.0..."
      cd "$WORKER_DIR"
      if npx wrangler deploy 2>&1 | sed 's/^/    /'; then
        success "Step 7 complete: Worker v4.0 deployed"
        ((PASSED++))
      else
        warn "Worker deploy via wrangler failed. Try CF Pages deploy instead:"
        echo "  1. Go to https://dash.cloudflare.com → Pages"
        echo "  2. Upload worker.js to your Pages project"
        echo "  3. Or: npx wrangler pages deploy --project-name=<name> ."
        ((FAILED++))
      fi
      cd "$SCRIPT_DIR"
    else
      fail "wrangler.toml not found at $WORKER_DIR"
      ((FAILED++))
    fi
  fi
fi

# ── Summary ──
header "Deployment Summary"
echo ""
echo -e "  ${GREEN}Passed:${NC}  $PASSED / $TOTAL_STEPS"
echo -e "  ${RED}Failed:${NC}  $FAILED / $TOTAL_STEPS"
echo -e "  ${YELLOW}Skipped:${NC} $SKIPPED / $TOTAL_STEPS"
echo ""

if [[ $FAILED -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}All upgrades deployed successfully!${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Test subscription: curl -s https://sub.example.com/sub/<UUID> | base64 -d"
  echo "  2. Check health: curl -s https://sub.example.com/health?key=<UUID>"
  echo "  3. Verify new protocols appear in Hiddify client"
  echo "  4. Test from Iran: Finalmask XDNS, Hy2-Hop, ShadowTLS"
else
  echo -e "${RED}${BOLD}Some steps failed. Review output above and re-run failed steps:${NC}"
  echo "  ./deploy-all-upgrades.sh --step <N>"
fi
echo ""
