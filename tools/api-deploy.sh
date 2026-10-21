#!/usr/bin/env bash
# Driftsätter API-workern server/cap-api på Cloudflare (Workers + KV + egen domän cap-api.8bitcat.io).
#   bash tools/api-deploy.sh              # driftsätt
#   bash tools/api-deploy.sh --secrets    # första gången: ADMIN_LOSEN (nytt, sparas i .secrets) + PUSH_HEMLIG
#   bash tools/api-deploy.sh --r2         # skapar R2-bucketen cap-media (kräver R2 påslaget + R2-rättighet på token)
set -euo pipefail
cd "$(dirname "$0")/../server/cap-api"
export CLOUDFLARE_API_TOKEN="$(tr -d '\r\n ' < /c/Users/palss/.secrets/cloudflare-workers.txt)"
[ -d node_modules ] || npm install --no-audit --no-fund > /dev/null 2>&1
export CLOUDFLARE_ACCOUNT_ID="$(npx wrangler whoami 2>/dev/null | grep -oE '[0-9a-f]{32}' | head -1)"
if grep -q 'id = "KV_ID"' wrangler.toml; then
  KV="$(npx wrangler kv namespace create DB 2>&1 | grep -oE '[0-9a-f]{32}' | head -1 || true)"
  [ -n "$KV" ] || KV="$(npx wrangler kv namespace list 2>/dev/null | python -c 'import json,sys; print(next((n["id"] for n in json.load(sys.stdin) if n["title"].endswith("cap-api-DB")), ""))')"
  [ -n "$KV" ] || { echo "kunde inte skapa/hitta KV-namnrymden"; exit 1; }
  sed -i "s/id = \"KV_ID\"/id = \"$KV\"/" wrangler.toml
  echo "KV: ${KV:0:6}…"
fi
if [ "${1:-}" = "--r2" ]; then
  npx wrangler r2 bucket create cap-media 2>&1 | tail -2 || true
  sed -i 's/^# \[\[r2_buckets\]\]/[[r2_buckets]]/; s/^# binding = "MEDIA"/binding = "MEDIA"/; s/^# bucket_name = "cap-media"/bucket_name = "cap-media"/' wrangler.toml
fi
npx wrangler deploy 2>&1 | grep -vE "^\s*$" | tail -4
if [ "${1:-}" = "--secrets" ]; then
  F=/c/Users/palss/.secrets/cap-admin-losen.txt
  [ -s "$F" ] || python -c "import secrets; a='bdfghjklmnprstvz'; v='aeiouy'; import random; r=secrets.SystemRandom(); print(''.join(r.choice(a)+r.choice(v) for _ in range(3)) + '-' + str(r.randint(100,999)))" > "$F"
  tr -d '\r\n' < "$F" | npx wrangler secret put ADMIN_LOSEN > /dev/null && echo "ADMIN_LOSEN satt (står i $F)"
  tr -d '\r\n' < /c/Users/palss/.secrets/cap-push-admin.txt | npx wrangler secret put PUSH_HEMLIG > /dev/null && echo "PUSH_HEMLIG satt"
fi
echo "---"; curl -s https://cap-api.8bitcat.io/ || true; echo
