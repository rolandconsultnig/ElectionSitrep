#!/usr/bin/env bash
# API base: app.json extra.apiBaseUrl (production http://13.53.33.63:5530; cleartext enabled).
# Requires: Node 20+, JDK 17+, full Android SDK + NDK (Studio → SDK Manager → NDK; folder must contain `platforms`).
# Set ANDROID_HOME or ANDROID_SDK_ROOT when `local.properties` is not present.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export NODE_ENV="${NODE_ENV:-production}"
npm ci

npx expo prebuild --platform android "$@"

PROP="$ROOT/android/local.properties"
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [[ -n "$SDK" ]] && [[ ! -f "$PROP" ]]; then
  mkdir -p "$ROOT/android"
  printf 'sdk.dir=%s\n' "$SDK" > "$PROP"
fi

node scripts/run-release-build.cjs
