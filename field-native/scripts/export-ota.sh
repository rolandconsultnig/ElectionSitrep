#!/usr/bin/env bash
# Builds an over-the-air update bundle for the self-hosted update server.
# Upload the resulting directory to <server>/ota/<runtimeVersion>/<updateId>/ .
set -euo pipefail
cd "$(dirname "$0")/.."
RUNTIME=$(node -p "require('./app.json').expo.runtimeVersion")
UPDATE_ID=$(date -u +%Y%m%d%H%M%S)
OUT="dist-ota/$RUNTIME/$UPDATE_ID"
rm -rf dist-ota
npx expo export --platform android --output-dir "$OUT"
npx expo config --json --type public > "$OUT/expoConfig.json"
tar -czf "dist-ota/ota-$RUNTIME-$UPDATE_ID.tar.gz" -C dist-ota "$RUNTIME/$UPDATE_ID"
echo "$OUT"
echo "dist-ota/ota-$RUNTIME-$UPDATE_ID.tar.gz"
