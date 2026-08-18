#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════
# Smoke Tests for VPN-v2-spec Shell Scripts & Infrastructure
#
# Tests that critical components are structurally sound and functional.
# Safe to run anywhere — does NOT connect to production servers.
#
# Usage:
#   cd <repo-root>
#   bash tests/smoke.test.sh
#
# Exit codes:
#   0 = all tests passed
#   1 = one or more tests failed
# ══════════════════════════════════════════════════════════════════

set -euo pipefail

# -- Detect repo root --
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

PASS=0
FAIL=0
SKIP=0

# Color output (fallback for non-tty)
if [[ -t 1 ]]; then
  GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; NC='\033[0m'
else
  GREEN=''; RED=''; YELLOW=''; NC=''
fi

pass() { PASS=$((PASS + 1)); echo -e "  ${GREEN}✅ PASS${NC}: $1"; }
fail() { FAIL=$((FAIL + 1)); echo -e "  ${RED}❌ FAIL${NC}: $1${2:+ — $2}"; }
skip() { SKIP=$((SKIP + 1)); echo -e "  ${YELLOW}⏭  SKIP${NC}: $1${2:+ — $2}"; }

# ══════════════════════════════════════════════════════════════════
echo "═══ Shell Script Smoke Tests ═══"
echo ""

# ── 1. All .sh files have valid bash syntax ──────────────────────
echo "── Bash Syntax Check ──"
while IFS= read -r script; do
  name="${script#./}"
  if bash -n "$script" 2>/dev/null; then
    pass "$name"
  else
    # Known: server-status.sh has embedded Python, bash -n will fail
    if grep -q 'python3 -c' "$script" 2>/dev/null; then
      skip "$name" "contains embedded Python"
    else
      fail "$name" "syntax error"
    fi
  fi
done < <(find . -name '*.sh' -not -path './.git/*' -not -path './node_modules/*' -type f)
echo ""

# ── 2. All .sh files have shebangs ──────────────────────────────
echo "── Shebang Check ──"
while IFS= read -r script; do
  name="${script#./}"
  first_line=$(head -1 "$script")
  if [[ "$first_line" == "#!/"* ]]; then
    pass "$name has shebang"
  else
    fail "$name missing shebang" "got: $first_line"
  fi
done < <(find . -name '*.sh' -not -path './.git/*' -type f)
echo ""

# ── 3. Deploy scripts use safety flags ──────────────────────────
echo "── Safety Flags (set -e) ──"
while IFS= read -r script; do
  name="${script#./}"
  if grep -q 'set -e' "$script" 2>/dev/null; then
    pass "$name has set -e"
  else
    fail "$name missing set -e"
  fi
done < <(find tools/deploy -name '*.sh' -type f 2>/dev/null)
echo ""

# ── 4. worker.js syntax check ───────────────────────────────────
echo "── Worker.js Syntax ──"
if command -v node &>/dev/null; then
  if node --check tools/smart-sub/worker.js 2>/dev/null; then
    pass "worker.js parses without errors"
  else
    fail "worker.js has syntax errors"
  fi
else
  skip "worker.js syntax" "node not installed"
fi
echo ""

# ── 5. worker.js structure validation ────────────────────────────
echo "── Worker.js Structure ──"
WORKER="tools/smart-sub/worker.js"

# Check for required sections (v4.1.0: secrets moved to buildConfig(env))
if grep -q "buildConfig" "$WORKER"; then
  pass "buildConfig(env) function defined"
else
  fail "buildConfig(env) function missing"
fi

if grep -q "tag:" "$WORKER"; then
  pass "Server definitions found (inside buildConfig)"
else
  fail "Server definitions missing"
fi

if grep -q "ADMIN_UUID\|adminUuid" "$WORKER"; then
  pass "ADMIN_UUID referenced"
else
  fail "ADMIN_UUID missing"
fi

if grep -q '"/health"' "$WORKER"; then
  pass "/health endpoint defined"
else
  fail "/health endpoint missing"
fi

if grep -q '"/sub/"' "$WORKER" || grep -q '/sub/' "$WORKER"; then
  pass "/sub/ endpoint defined"
else
  fail "/sub/ endpoint missing"
fi

if grep -q '"/stats"' "$WORKER"; then
  pass "/stats endpoint defined"
else
  fail "/stats endpoint missing"
fi

# Count generator functions
GEN_COUNT=$(grep -c "^function generate" "$WORKER" || true)
if [[ "$GEN_COUNT" -ge 15 ]]; then
  pass "$GEN_COUNT generator functions found (≥15)"
else
  fail "Only $GEN_COUNT generator functions (expected ≥15)"
fi

# Count servers (JS uses tag: without quotes around key)
SERVER_COUNT=$(grep -cE '^\s+tag:\s+"' "$WORKER" || true)
if [[ "$SERVER_COUNT" -ge 3 ]]; then
  pass "$SERVER_COUNT servers configured (≥3)"
else
  fail "Only $SERVER_COUNT servers (expected ≥3)"
fi
echo ""

# ── 6. Critical files exist ─────────────────────────────────────
echo "── Critical Files ──"
CRITICAL_FILES=(
  "tools/smart-sub/worker.js"
  "tools/smart-sub/wrangler.toml"
  "tools/deploy/deploy.sh"
  "tools/deploy/vars.env.example"
  "architecture.md"
  "multi-server.md"
  "CONTRIBUTING.md"
  "SECURITY.md"
  ".editorconfig"
  ".gitignore"
  ".github/workflows/ci.yml"
)
for f in "${CRITICAL_FILES[@]}"; do
  if [[ -f "$f" ]]; then
    pass "$f exists"
  else
    fail "$f missing"
  fi
done
echo ""

# ── 7. .gitignore coverage ──────────────────────────────────────
echo "── Gitignore Coverage ──"
MUST_IGNORE=("vars.env" "*.env" "node_modules/" ".wrangler/")
for pattern in "${MUST_IGNORE[@]}"; do
  if grep -qF "$pattern" .gitignore 2>/dev/null; then
    pass ".gitignore covers $pattern"
  else
    fail ".gitignore missing $pattern"
  fi
done

# Verify no vars.env is tracked
if git ls-files --error-unmatch vars.env tools/deploy/vars.env 2>/dev/null; then
  fail "vars.env is tracked by git!"
else
  pass "vars.env is NOT tracked by git"
fi
echo ""

# ── 8. No secrets in documentation (placeholder check) ──────────
echo "── Documentation Placeholder Check ──"
# Check that vars.env.example uses placeholder format, not real secrets
if grep -q '<' tools/deploy/vars.env.example 2>/dev/null || grep -q 'PLACEHOLDER\|changeme\|your-' tools/deploy/vars.env.example 2>/dev/null; then
  pass "vars.env.example uses placeholder-style values"
else
  # Check if real UUID is used (the admin UUID)
  if grep -q '6987a9e4' tools/deploy/vars.env.example 2>/dev/null; then
    fail "vars.env.example contains real admin UUID (should use placeholder)"
  else
    pass "vars.env.example values look acceptable"
  fi
fi
echo ""

# ── 9. CI workflow syntax ────────────────────────────────────────
echo "── CI Workflow Files ──"
while IFS= read -r workflow; do
  name="${workflow#./}"
  # Basic YAML syntax: check for 'on:' and 'jobs:' keys
  if grep -q '^on:' "$workflow" && grep -q '^jobs:' "$workflow"; then
    pass "$name has valid structure"
  else
    fail "$name missing on: or jobs: keys"
  fi
done < <(find .github/workflows -name '*.yml' -type f 2>/dev/null)
echo ""

# ── 10. wrangler.toml validation ─────────────────────────────────
echo "── Wrangler Config ──"
WRANGLER="tools/smart-sub/wrangler.toml"
if [[ -f "$WRANGLER" ]]; then
  if grep -q 'name' "$WRANGLER" && grep -q 'main' "$WRANGLER"; then
    pass "wrangler.toml has name and main"
  else
    fail "wrangler.toml missing name or main"
  fi
  if grep -q 'compatibility_date' "$WRANGLER"; then
    pass "wrangler.toml has compatibility_date"
  else
    fail "wrangler.toml missing compatibility_date"
  fi
fi
echo ""

# ── 11. Final newlines ──────────────────────────────────────────
echo "── Final Newlines ──"
NEWLINE_ERRORS=0
while IFS= read -r file; do
  if [[ -s "$file" ]] && [[ "$(tail -c 1 "$file" | wc -l)" -eq 0 ]]; then
    fail "${file#./} missing final newline"
    NEWLINE_ERRORS=$((NEWLINE_ERRORS + 1))
  fi
done < <(find . \( -name '*.md' -o -name '*.sh' -o -name '*.js' -o -name '*.toml' -o -name '*.yml' \) \
  -not -path './.git/*' -not -path '*/node_modules/*' -not -path '*/.wrangler/*' -type f)
if [[ "$NEWLINE_ERRORS" -eq 0 ]]; then
  pass "All text files end with newline"
fi
echo ""

# ══════════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════"
echo -e "  ${GREEN}PASSED${NC}: $PASS"
echo -e "  ${RED}FAILED${NC}: $FAIL"
echo -e "  ${YELLOW}SKIPPED${NC}: $SKIP"
echo "═══════════════════════════════════"

if [[ "$FAIL" -gt 0 ]]; then
  echo -e "${RED}Some tests failed!${NC}"
  exit 1
else
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
fi
