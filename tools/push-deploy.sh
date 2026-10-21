#!/usr/bin/env bash
# Driftsätter pushservern server/cap-push på Cloudflare (Workers + KV + egen domän cap-push.8bitcat.io).
# Körs i Git Bash:  bash tools/push-deploy.sh
# Första gången skapas KV-namnrymden och hemligheterna (APNS_KEY från Apples .p8, ADMIN_HEMLIG för /skicka).
set -euo pipefail
cd "$(dirname "$0")/../server/cap-push"
export CLOUDFLARE_API_TOKEN="$(tr -d '\r\n ' < /c/Users/palss/.secrets/cloudflare-workers.txt)"
[ -d node_modules ] || npm install --no-audit --no-fund > /dev/null 2>&1
ACC="$(npx wrangler whoami 2>/dev/null | grep -oE '[0-9a-f]{32}' | head -1)"
export CLOUDFLARE_ACCOUNT_ID="$ACC"
echo "konto: ${ACC:0:6}…"
if grep -q 'id = "KV_ID"' wrangler.toml; then
  KV="$(npx wrangler kv namespace create CAP 2>&1 | grep -oE '[0-9a-f]{32}' | head -1 || true)"
  [ -n "$KV" ] || KV="$(npx wrangler kv namespace list 2>/dev/null | python -c 'import json,sys; print(next((n["id"] for n in json.load(sys.stdin) if n["title"].endswith("cap-push-CAP")), ""))')"
  [ -n "$KV" ] || { echo "kunde inte skapa/hitta KV-namnrymden"; exit 1; }
  sed -i "s/id = \"KV_ID\"/id = \"$KV\"/" wrangler.toml
  echo "KV: ${KV:0:6}…"
fi
npx wrangler deploy 2>&1 | grep -vE "^\s*$" | tail -4
if [ "${1:-}" = "--secrets" ]; then
  tr -d '\r' < /c/Users/palss/Downloads/AuthKey_LSUKCX663J.p8 | npx wrangler secret put APNS_KEY > /dev/null && echo "APNS_KEY satt"
  [ -s /c/Users/palss/.secrets/cap-push-admin.txt ] || python -c "import secrets; print(secrets.token_hex(16))" > /c/Users/palss/.secrets/cap-push-admin.txt
  tr -d '\r\n' < /c/Users/palss/.secrets/cap-push-admin.txt | npx wrangler secret put ADMIN_HEMLIG > /dev/null && echo "ADMIN_HEMLIG satt"
fi
echo "---"; curl -s https://cap-push.8bitcat.io/ || curl -s "https://cap-push.$(npx wrangler whoami 2>/dev/null | grep -oE '[a-z0-9-]+\.workers\.dev' | head -1)/" || true; echo
