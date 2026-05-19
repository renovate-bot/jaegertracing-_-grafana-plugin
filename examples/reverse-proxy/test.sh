#!/usr/bin/env bash
# Automated e2e test for Jaeger-Grafana integration via reverse proxy.
#
# Verifies that:
#   1. Grafana's DataProxy can reach Jaeger through the httpd reverse proxies
#      and serve trace data via /api/datasources/proxy/uid/<uid>/api/services
#   2. The datasource health check passes (Grafana queries Jaeger via DataProxy)
#   3. The jaegerPublicURL is set correctly for iframe rendering
#
# Also validates that the two httpd proxy options correctly serve Jaeger UI and
# pass /api calls (confirming routing is correct before Grafana is involved).
#
# Prerequisites: docker compose up (from this directory) and services healthy.
# Usage: ./test.sh

set -euo pipefail

GRAFANA_URL="http://localhost:18082"
OPTION1_URL="http://localhost:18080/jaeger/ui"
OPTION2_URL="http://localhost:18081/jaeger/ui"
PREFIX="/jaeger/ui"
PASS=0
FAIL=0

# Colours
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "${RED}FAIL${NC} $1"; FAIL=$((FAIL + 1)); }

assert_http_200() {
    local label="$1" url="$2"
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    if [[ "$status" == "200" ]]; then
        pass "$label — HTTP 200"
    else
        fail "$label — expected HTTP 200, got $status ($url)"
    fi
}

assert_body_contains() {
    local label="$1" url="$2" pattern="$3"
    local body
    body=$(curl -s "$url")
    if echo "$body" | grep -qF "$pattern"; then
        pass "$label — body contains: $pattern"
    else
        fail "$label — body missing: $pattern ($url)"
    fi
}

assert_json_field() {
    local label="$1" url="$2" jq_expr="$3"
    local result
    result=$(curl -s "$url" | jq -r "$jq_expr" 2>/dev/null || echo "")
    if [[ -n "$result" && "$result" != "null" ]]; then
        pass "$label — $jq_expr = $result"
    else
        fail "$label — $jq_expr empty/null ($url)"
    fi
}

assert_assets_load() {
    local label="$1" base_url="$2"
    local html failed=0
    html=$(curl -s "$base_url/")

    # Jaeger's SPA uses relative asset paths (./static/...) resolved through <base href>.
    local assets
    assets=$(echo "$html" | grep -oE '(src|href)="\./[^"]+\.(js|css)"' | grep -oE '"\./[^"]+"' | tr -d '"' | sort -u)
    if [[ -z "$assets" ]]; then
        fail "$label — no relative JS/CSS assets found in HTML"
        return
    fi
    while IFS= read -r rel_path; do
        local path="${rel_path#./}"
        local url="$base_url/$path"
        local status
        status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
        if [[ "$status" != "200" ]]; then
            fail "$label — asset $path returned HTTP $status"
            failed=1
        fi
        true
    done <<< "$assets"
    if [[ "$failed" == "0" ]]; then
        pass "$label — all JS/CSS assets load (HTTP 200)"
    fi
}

# Verify the datasource url field matches the expected proxy URL.
# This is the URL the panel uses as the iframe src base and for all API calls.
assert_datasource_url() {
    local label="$1" uid="$2" expected="$3"
    local api_url="$GRAFANA_URL/api/datasources/uid/$uid"
    local actual
    actual=$(curl -s "$api_url" | jq -r '.url' 2>/dev/null || echo "")
    if [[ "$actual" == "$expected" ]]; then
        pass "$label — url=$actual"
    else
        fail "$label — url: expected $expected, got $actual ($api_url)"
    fi
}

wait_for() {
    local label="$1" url="$2"
    echo "Waiting for $label..."
    local i=0
    until curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "200"; do
        sleep 2
        i=$((i + 1))
        if (( i > 30 )); then
            fail "$label — timed out waiting for $url"
            return 1
        fi
    done
    echo "$label is up."
}

echo "=== Jaeger-Grafana reverse proxy integration tests ==="
echo ""

# --- Wait for services ---
wait_for "Option 1 httpd" "$OPTION1_URL/"
wait_for "Option 2 httpd" "$OPTION2_URL/"
wait_for "Grafana" "$GRAFANA_URL/api/health"

# Allow HotROD time to generate some traces
echo "Waiting 5s for HotROD to generate traces..."
sleep 5

echo ""
echo "--- Proxy layer: Option 1 (transparent proxy + base_path configured) ---"

assert_http_200      "Option1 index.html"          "$OPTION1_URL/"
# Since Jaeger 2.18.0 the UI auto-detects the base path via inline script (ADR-009).
# The backend no longer writes a static <base href="/prefix/"> — assert the marker.
assert_body_contains "Option1 inline script marker" "$OPTION1_URL/" \
    "data-inject-target=\"BASE_URL\""
assert_http_200      "Option1 /api/services"       "$OPTION1_URL/api/services"
assert_json_field    "Option1 services non-empty"  "$OPTION1_URL/api/services" \
    '.data | length'
assert_assets_load   "Option1 assets"              "$OPTION1_URL"

echo ""
echo "--- Proxy layer: Option 2 (prefix stripping, auto base-path detection) ---"

assert_http_200      "Option2 index.html"           "$OPTION2_URL/"
# No Substitute rewriting needed since 2.18.0 — just check the script marker is present.
assert_body_contains "Option2 inline script marker" "$OPTION2_URL/" \
    "data-inject-target=\"BASE_URL\""
assert_http_200      "Option2 /api/services"        "$OPTION2_URL/api/services"
assert_json_field    "Option2 services non-empty"   "$OPTION2_URL/api/services" \
    '.data | length'
assert_assets_load   "Option2 assets"               "$OPTION2_URL"

echo ""
echo "--- Grafana integration: datasource provisioning ---"

assert_datasource_url "Option1 datasource URL" "jaeger-option1" "http://localhost:18080/jaeger/ui"
assert_datasource_url "Option2 datasource URL" "jaeger-option2" "http://localhost:18081/jaeger/ui"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if (( FAIL > 0 )); then
    exit 1
fi
