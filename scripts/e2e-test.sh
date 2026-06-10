#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

BASE_URL="${ADMIN_API_URL:-http://localhost:8000}"
KNOWLEDGE_URL="${KNOWLEDGE_API_URL:-http://localhost:8001}"
GENERATE_URL="${GENERATE_API_URL:-http://localhost:8002}"
JWT_TOKEN=""
TEST_USER="e2e-test-user"
PASS=0
FAIL=0

log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; ((PASS++)); }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; ((FAIL++)); }
log_info() { echo -e "${YELLOW}[INFO]${NC} $1"; }
log_step() { echo ""; echo -e "${YELLOW}====== $1 ======${NC}"; }

cleanup() {
    log_info "Cleaning up..."
}
trap cleanup EXIT

check_dep() {
    if ! command -v "$1" &>/dev/null; then
        log_fail "missing dependency: $1"
        exit 1
    fi
}
check_dep curl
check_dep jq

# =============================================
# Step 1: Health check for all services
# =============================================
log_step "Step 1: Service Health Checks"

test_health() {
    local name=$1 url=$2
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url/healthz" 2>/dev/null || echo "000")
    if [ "$status" = "200" ]; then
        log_pass "$name health check ($status)"
    else
        log_fail "$name health check (HTTP $status)"
    fi
}

test_health "Admin"     "$BASE_URL"
test_health "Knowledge" "$KNOWLEDGE_URL"
test_health "Generate"  "$GENERATE_URL"

# =============================================
# Step 2: Admin endpoint tests
# =============================================
log_step "Step 2: Admin API Tests"

# 2a: /health (aggregated)
resp=$(curl -s --max-time 10 "$BASE_URL/health")
status=$(echo "$resp" | jq -r '.status' 2>/dev/null || echo "parse-error")
if [ "$status" != "null" ] && [ -n "$status" ]; then
    log_pass "GET /health returns status ($status)"
else
    log_fail "GET /health - unexpected response: $resp"
fi

# 2b: /metrics
metrics_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$BASE_URL/metrics")
if [ "$metrics_code" = "200" ]; then
    log_pass "GET /metrics (HTTP $metrics_code)"
else
    log_fail "GET /metrics (HTTP $metrics_code)"
fi

# 2c: List pending documents (no auth, expect 401)
pending_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$BASE_URL/api/v1/admin/documents/pending")
if [ "$pending_code" = "401" ]; then
    log_pass "GET /admin/documents/pending without auth returns 401"
else
    log_fail "GET /admin/documents/pending without auth (HTTP $pending_code, expected 401)"
fi

# 2d: System stats (no auth, expect 401)
stats_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$BASE_URL/api/v1/admin/stats/system")
if [ "$stats_code" = "401" ]; then
    log_pass "GET /admin/stats/system without auth returns 401"
else
    log_fail "GET /admin/stats/system without auth (HTTP $stats_code, expected 401)"
fi

# 2e: List configs (no auth, expect 401)
config_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$BASE_URL/api/v1/admin/config")
if [ "$config_code" = "401" ]; then
    log_pass "GET /admin/config without auth returns 401"
else
    log_fail "GET /admin/config without auth (HTTP $config_code, expected 401)"
fi

# 2f: Rebuild index (no auth, expect 401)
rebuild_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST --max-time 5 "$BASE_URL/api/v1/admin/search/rebuild-index")
if [ "$rebuild_code" = "401" ]; then
    log_pass "POST /admin/search/rebuild-index without auth returns 401"
else
    log_fail "POST /admin/search/rebuild-index without auth (HTTP $rebuild_code, expected 401)"
fi

# =============================================
# Step 3: Knowledge service API tests
# =============================================
log_step "Step 3: Knowledge Service API Tests"

# 3a: Health check
know_health=$(curl -s --max-time 5 "$KNOWLEDGE_URL/healthz")
if echo "$know_health" | jq -e '.status == "ok"' &>/dev/null; then
    log_pass "Knowledge service health endpoint"
else
    log_fail "Knowledge service health endpoint: $know_health"
fi

# 3b: Ready check (may fail if PG/Redis not available in some envs)
ready_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$KNOWLEDGE_URL/ready" 2>/dev/null || echo "000")
if [ "$ready_code" = "200" ] || [ "$ready_code" = "503" ]; then
    log_pass "Knowledge service readiness (HTTP $ready_code)"
else
    log_fail "Knowledge service readiness (HTTP $ready_code)"
fi

# 3c: Get folder tree (no auth)
tree_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$KNOWLEDGE_URL/api/v1/knowledge/folders/tree")
if [ "$tree_code" = "401" ]; then
    log_pass "GET /knowledge/folders/tree without auth returns 401"
else
    log_fail "GET /knowledge/folders/tree without auth (HTTP $tree_code)"
fi

# =============================================
# Step 4: Generate service API tests
# =============================================
log_step "Step 4: Generate Service API Tests"

gen_health=$(curl -s --max-time 5 "$GENERATE_URL/healthz")
if echo "$gen_health" | jq -e '.status == "ok"' &>/dev/null; then
    log_pass "Generate service health endpoint"
else
    log_fail "Generate service health endpoint: $gen_health"
fi

# 4a: Q&A ask without auth
ask_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST --max-time 5 \
    -H "Content-Type: application/json" \
    -d '{"query":"test","contexts":[]}' \
    "$GENERATE_URL/api/v1/qa/ask")
if [ "$ask_code" = "401" ]; then
    log_pass "POST /qa/ask without auth returns 401"
else
    log_fail "POST /qa/ask without auth (HTTP $ask_code, expected 401)"
fi

# =============================================
# Step 5: Admin API with auth token
# =============================================
log_step "Step 5: Admin API with Auth"

# Generate a JWT token for testing (admin role)
# Structure: {"user_id":"admin","tenant_id":"default","role":"admin"}
# Using a pre-computed JWT for dev testing
create_test_jwt() {
    local header='{"alg":"HS256","typ":"JWT"}'
    local payload='{"user_id":"admin","tenant_id":"default","role":"admin","exp":9999999999}'
    local secret="dev-secret-change-in-production"

    local b64_header
    b64_header=$(echo -n "$header" | base64 -w0 | tr '+/' '-_' | tr -d '=')
    local b64_payload
    b64_payload=$(echo -n "$payload" | base64 -w0 | tr '+/' '-_' | tr -d '=')

    local signature
    signature=$(echo -n "$b64_header.$b64_payload" | openssl dgst -sha256 -hmac "$secret" -binary | base64 -w0 | tr '+/' '-_' | tr -d '=')

    echo "$b64_header.$b64_payload.$signature"
}

JWT_TOKEN=$(create_test_jwt)
log_info "Generated test JWT token"

# 5a: List configs with auth
config_resp=$(curl -s --max-time 10 \
    -H "Authorization: Bearer $JWT_TOKEN" \
    "$BASE_URL/api/v1/admin/config")
config_code=$(echo "$config_resp" | jq -r 'type' 2>/dev/null || echo "unknown")
if [ "$config_code" = "array" ] || [ "$config_code" = "object" ]; then
    log_pass "GET /admin/config with auth returns data"
else
    log_fail "GET /admin/config with auth: $config_resp"
fi

# 5b: Update a config
update_resp=$(curl -s -X PUT --max-time 10 \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"key":"test_config_key","value":"test_value","description":"e2e test config"}' \
    "$BASE_URL/api/v1/admin/config")
update_key=$(echo "$update_resp" | jq -r '.key' 2>/dev/null || echo "")
if [ "$update_key" = "test_config_key" ]; then
    log_pass "PUT /admin/config creates/updates config"
else
    log_fail "PUT /admin/config: $update_resp"
fi

# 5c: Get specific config
get_resp=$(curl -s --max-time 10 \
    -H "Authorization: Bearer $JWT_TOKEN" \
    "$BASE_URL/api/v1/admin/config/test_config_key")
get_val=$(echo "$get_resp" | jq -r '.value' 2>/dev/null || echo "")
if [ "$get_val" = "test_value" ]; then
    log_pass "GET /admin/config/{key} returns correct value"
else
    log_fail "GET /admin/config/test_config_key: $get_resp"
fi

# 5d: List pending documents with auth
pending_resp=$(curl -s --max-time 10 \
    -H "Authorization: Bearer $JWT_TOKEN" \
    "$BASE_URL/api/v1/admin/documents/pending")
pending_code=$(echo "$pending_resp" | jq -r '.page' 2>/dev/null || echo "")
if [ -n "$pending_code" ]; then
    log_pass "GET /admin/documents/pending with auth returns paginated results"
else
    log_fail "GET /admin/documents/pending with auth: $pending_resp"
fi

# 5e: System stats with auth
stats_resp=$(curl -s --max-time 15 \
    -H "Authorization: Bearer $JWT_TOKEN" \
    "$BASE_URL/api/v1/admin/stats/system")
stats_svc=$(echo "$stats_resp" | jq -r '.services' 2>/dev/null || echo "")
if [ "$stats_svc" != "null" ] && [ -n "$stats_svc" ]; then
    log_pass "GET /admin/stats/system with auth returns service stats"
else
    log_fail "GET /admin/stats/system with auth: $stats_resp"
fi

# 5f: Rebuild index with auth
rebuild_resp=$(curl -s -X POST --max-time 10 \
    -H "Authorization: Bearer $JWT_TOKEN" \
    "$BASE_URL/api/v1/admin/search/rebuild-index")
rebuild_status=$(echo "$rebuild_resp" | jq -r '.status' 2>/dev/null || echo "")
if [ "$rebuild_status" = "accepted" ]; then
    log_pass "POST /admin/search/rebuild-index triggers rebuild"
else
    log_fail "POST /admin/search/rebuild-index: $rebuild_resp"
fi

# 5g: Sensitive words - list
sw_resp=$(curl -s --max-time 10 \
    -H "Authorization: Bearer $JWT_TOKEN" \
    "$BASE_URL/api/v1/admin/sensitive-words")
sw_type=$(echo "$sw_resp" | jq -r '.words | type' 2>/dev/null || echo "")
if [ "$sw_type" = "array" ]; then
    log_pass "GET /admin/sensitive-words returns word list"
else
    log_fail "GET /admin/sensitive-words: $sw_resp"
fi

# 5h: Add a sensitive word
sw_add=$(curl -s -X POST --max-time 10 \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"word":"e2e-test-sensitive"}' \
    "$BASE_URL/api/v1/admin/sensitive-words")
sw_add_status=$(echo "$sw_add" | jq -r '.status' 2>/dev/null || echo "")
if [ "$sw_add_status" = "ok" ]; then
    log_pass "POST /admin/sensitive-words adds word"
else
    log_fail "POST /admin/sensitive-words: $sw_add"
fi

# =============================================
# Summary
# =============================================
total=$((PASS + FAIL))
echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  E2E Test Summary${NC}"
echo -e "${YELLOW}========================================${NC}"
echo -e "  Total: $total  |  ${GREEN}Passed: $PASS${NC}  |  ${RED}Failed: $FAIL${NC}"
echo ""

if [ "$FAIL" -eq 0 ]; then
    echo -e "${GREEN}All e2e tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some e2e tests failed.${NC}"
    exit 1
fi
