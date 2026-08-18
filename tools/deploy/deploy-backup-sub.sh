#!/bin/bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
# ═══════════════════════════════════════════════════════════════════
# deploy-backup-sub.sh — Deploy Smart Sub Worker as CF Pages Backup
# ═══════════════════════════════════════════════════════════════════
#
# Deploys the smart-sub worker.js as a Cloudflare Pages Function,
# providing a backup subscription URL if the primary Workers
# custom domain (sub.example.com) gets blocked or fails.
#
# Primary:  sub.example.com  (CF Workers custom domain route)
# Backup:   <project>.pages.dev (CF Pages — different hostname)
#
# Why backup?
# - If Iran blocks sub.example.com specifically, the .pages.dev
#   URL still works (different hostname, same Cloudflare edge)
# - If Workers has an outage, Pages continues serving
# - Pages URLs are hard to block (*.pages.dev hosts millions of sites)
#
# Prerequisites:
#   - wrangler CLI installed and authenticated
#   - worker.js in ../smart-sub/worker.js
#
# Usage:
#   bash deploy-backup-sub.sh              # Deploy
#   bash deploy-backup-sub.sh --dry-run    # Show what would happen
#   bash deploy-backup-sub.sh --verify     # Test existing deployment
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_SRC="$SCRIPT_DIR/../smart-sub/worker.js"
WRANGLER_SRC="$SCRIPT_DIR/../smart-sub/wrangler.toml"

# Project name — use an innocent, non-VPN name
# Change this if Cloudflare flags the project
PAGES_PROJECT="your-backup-project"

# Temp directory for Pages deployment structure
DEPLOY_DIR=$(mktemp -d)
trap "rm -rf $DEPLOY_DIR" EXIT

# ── Parse arguments ───────────────────────────────────────────────
DRY_RUN=false
VERIFY_ONLY=false

for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    --verify) VERIFY_ONLY=true ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

# ── Verify mode ───────────────────────────────────────────────────
if $VERIFY_ONLY; then
  echo "=== Verifying backup sub deployment ==="
  
  # Get the project URL (will be PROJECT.pages.dev or similar)
  echo "[1/3] Checking project exists..."
  if ! wrangler pages project list 2>/dev/null | grep -q "$PAGES_PROJECT"; then
    echo "❌ Project '$PAGES_PROJECT' not found"
    echo "   Run: bash deploy-backup-sub.sh  (to deploy first)"
    exit 1
  fi
  echo "✅ Project '$PAGES_PROJECT' exists"
  
  echo "[2/3] Testing health endpoint..."
  # Try common pages.dev URL patterns
  for url in "https://${PAGES_PROJECT}.pages.dev/health" \
             "https://${PAGES_PROJECT}-xxx.pages.dev/health"; do
    if response=$(curl -s --connect-timeout 10 "$url" 2>/dev/null); then
      if echo "$response" | grep -q "ok\|healthy"; then
        echo "✅ Health endpoint responding at: $url"
        break
      fi
    fi
  done
  
  echo "[3/3] Testing subscription endpoint..."
  ADMIN_UUID="${ADMIN_UUID:?Set ADMIN_UUID in environment or vars.env}"
  url="https://${PAGES_PROJECT}.pages.dev/sub/${ADMIN_UUID}"
  if response=$(curl -s --connect-timeout 10 "$url" 2>/dev/null); then
    if [ -n "$response" ]; then
      decoded=$(echo "$response" | base64 -d 2>/dev/null | head -3)
      if [ -n "$decoded" ]; then
        echo "✅ Subscription working at: $url"
        echo "   First 3 configs:"
        echo "$decoded" | sed 's/^/     /'
      fi
    fi
  fi
  
  echo ""
  echo "=== Share backup URL with users ==="
  echo "   https://${PAGES_PROJECT}.pages.dev/sub/<UUID>"
  exit 0
fi

# ── Check prerequisites ──────────────────────────────────────────
echo "=== Deploy Smart Sub as CF Pages Backup ==="

if ! command -v wrangler &>/dev/null; then
  echo "❌ wrangler not found. Install: npm install -g wrangler"
  exit 1
fi

if [ ! -f "$WORKER_SRC" ]; then
  echo "❌ worker.js not found at $WORKER_SRC"
  exit 1
fi

echo "📋 Source:  $WORKER_SRC"
echo "📋 Project: $PAGES_PROJECT"
echo ""

# ── Build Pages deployment structure ───────────────────────────────
# CF Pages "Advanced Mode" uses a _worker.js file in the output directory.
# This file intercepts ALL requests — perfect for our API-only worker.
# Our worker.js already has the right format: export default { fetch() }
#
# Simpler than Pages Functions (no wrapper needed).

echo "[1/4] Building Pages deployment structure..."

# Copy worker.js as _worker.js (Pages Advanced Mode convention)
cp "$WORKER_SRC" "$DEPLOY_DIR/_worker.js"

# Create a minimal static asset (Pages needs content to deploy)
echo '{"status":"ok","service":"data-sync"}' > "$DEPLOY_DIR/_health.json"

echo "  ✅ Pages structure created (_worker.js Advanced Mode)"

# ── Dry run ───────────────────────────────────────────────────────
if $DRY_RUN; then
  echo ""
  echo "[DRY RUN] Would deploy the following structure:"
  find "$DEPLOY_DIR" -type f | sed "s|$DEPLOY_DIR/|  |"
  echo ""
  echo "[DRY RUN] Command that would run:"
  echo "  wrangler pages project create $PAGES_PROJECT --production-branch main"
  echo "  wrangler pages deploy $DEPLOY_DIR --project-name $PAGES_PROJECT"
  echo ""
  echo "After deployment, bind KV namespace in CF dashboard:"
  echo "  Pages → $PAGES_PROJECT → Settings → Functions → KV namespace bindings"
  echo "  Variable name: HEALTH"
  echo "  KV namespace: 0000000000000000000000000000cafe"
  exit 0
fi

# ── Create project (if needed) ────────────────────────────────────
echo "[2/4] Creating Pages project (if needed)..."

if wrangler pages project list 2>/dev/null | grep -q "$PAGES_PROJECT"; then
  echo "  ℹ️  Project '$PAGES_PROJECT' already exists"
else
  echo "  Creating project '$PAGES_PROJECT'..."
  wrangler pages project create "$PAGES_PROJECT" --production-branch main
  echo "  ✅ Project created"
fi

# ── Deploy ────────────────────────────────────────────────────────
echo "[3/4] Deploying to Cloudflare Pages..."

wrangler pages deploy "$DEPLOY_DIR" \
  --project-name "$PAGES_PROJECT" \
  --commit-dirty=true

echo "  ✅ Deployed"

# ── Post-deploy instructions ──────────────────────────────────────
echo ""
echo "[4/4] Post-deployment setup (manual steps):"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  1. Bind KV namespace in CF dashboard:"
echo "     Pages → $PAGES_PROJECT → Settings → Functions"
echo "     → KV namespace bindings → Add binding"
echo "     Variable name: HEALTH"
echo "     KV namespace:  0000000000000000000000000000cafe"
echo ""
echo "  2. Your backup subscription URL:"
echo "     https://${PAGES_PROJECT}.pages.dev/sub/<UUID>"
echo ""
echo "  3. Test it:"
echo "     curl -s https://${PAGES_PROJECT}.pages.dev/health"
echo "     curl -s https://${PAGES_PROJECT}.pages.dev/sub/<YOUR_UUID> | base64 -d | head -5"
echo ""
echo "  4. Share with users as fallback:"
echo "     'If sub.example.com doesn't work, use this URL instead:'"
echo "     https://${PAGES_PROJECT}.pages.dev/sub/<YOUR_UUID>"
echo "═══════════════════════════════════════════════════════════"
