#!/usr/bin/env bash
# Manual smoke test for the auth and audit-log endpoints.
# Needs the app running:  pnpm db:up && pnpm db:setup && pnpm dev
# Run:                    pnpm smoke        (or BASE_URL=http://host:port pnpm smoke)
#
# Note: this uses the seed users in the dev database. The lockout check makes
# bob@releaseshop.test unable to log in for 15 minutes (re-run pnpm db:setup to reset).

set -u
BASE_URL="${BASE_URL:-http://localhost:3000}"
JAR_DIR="$(mktemp -d)"
trap 'rm -rf "$JAR_DIR"' EXIT
JSON='content-type: application/json'
FAILED=0

# check <description> <expected status> <curl args...>
check() {
  local desc="$1" expected="$2"; shift 2
  local status
  status=$(curl -s -o "$JAR_DIR/body" -w '%{http_code}' "$@")
  if [ "$status" = "$expected" ]; then
    echo "PASS  $desc ($status)"
  else
    echo "FAIL  $desc (expected $expected, got $status)"
    sed 's/^/      /' "$JAR_DIR/body"; echo
    FAILED=1
  fi
}

check "admin login"                        200 -c "$JAR_DIR/admin" -X POST "$BASE_URL/api/auth/login" -H "$JSON" \
  -d '{"email":"admin@releaseshop.test","password":"Admin-Pass-123"}'
check "admin session"                      200 -b "$JAR_DIR/admin" "$BASE_URL/api/auth/session"
check "admin reads audit log"              200 -b "$JAR_DIR/admin" "$BASE_URL/api/admin/audit-log"

check "customer login"                     200 -c "$JAR_DIR/alice" -X POST "$BASE_URL/api/auth/login" -H "$JSON" \
  -d '{"email":"alice@releaseshop.test","password":"Alice-Pass-123"}'
check "customer blocked from audit log"    403 -b "$JAR_DIR/alice" "$BASE_URL/api/admin/audit-log"

check "no cookie gives 401"                401 "$BASE_URL/api/auth/session"
check "wrong password gives 401"           401 -X POST "$BASE_URL/api/auth/login" -H "$JSON" \
  -d '{"email":"alice@releaseshop.test","password":"wrong"}'
check "other website's Origin refused"     403 -X POST "$BASE_URL/api/auth/login" -H "$JSON" -H 'Origin: https://evil.example' \
  -d '{"email":"alice@releaseshop.test","password":"Alice-Pass-123"}'

for _ in 1 2 3 4 5; do
  curl -s -o /dev/null -X POST "$BASE_URL/api/auth/login" -H "$JSON" -d '{"email":"bob@releaseshop.test","password":"nope"}'
done
check "locked after 5 failures (right password)" 429 -X POST "$BASE_URL/api/auth/login" -H "$JSON" \
  -d '{"email":"bob@releaseshop.test","password":"Bob-Pass-123"}'

check "admin logout"                       200 -b "$JAR_DIR/admin" -X POST "$BASE_URL/api/auth/logout"
check "session gone after logout"          401 -b "$JAR_DIR/admin" "$BASE_URL/api/auth/session"

exit $FAILED
