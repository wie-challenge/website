#!/usr/bin/env bash
# Build output only: no install/build/credential files are shipped from the VPS.
set -euo pipefail
sha=${1:?Usage: package-release.sh FULL_SHA [OUTPUT_DIRECTORY]}
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || exit 2
output=${2:-.local/release}
mkdir -p "$output"
output=$(realpath "$output")
manifest=$(mktemp -d)
trap 'rm -rf "$manifest"' EXIT
RELEASE_SHA="$sha" node --input-type=module -e '
import { writeFileSync } from "node:fs";
writeFileSync(process.argv[1], JSON.stringify({sha:process.env.RELEASE_SHA,node:process.version,platform:process.platform,arch:process.arch})+"\n");
' "$manifest/.release.json"
for path in apps/api/dist/main.js apps/web/.next/BUILD_ID apps/api/scripts/deploy-check-schema.mjs; do test -f "$path"; done
tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
  --exclude='apps/web/.next/cache' --exclude='node_modules/.cache' \
  --exclude='*/.claude' --exclude='*.key' --exclude='*.pem' --exclude='*.dump' --exclude='*.hcab' \
  --exclude='*/.env' --exclude='*/.env.*' --exclude='*.tsbuildinfo' \
  -czf "$output/release.tar.gz" \
  package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json \
  node_modules packages/contracts/package.json packages/contracts/dist packages/contracts/node_modules \
  apps/api/package.json apps/api/dist apps/api/prisma apps/api/prisma.config.ts apps/api/node_modules \
  apps/api/scripts/deploy-check-schema.mjs \
  apps/web/package.json apps/web/next.config.ts apps/web/.next apps/web/public apps/web/node_modules \
  -C "$manifest" .release.json
sha256sum "$output/release.tar.gz" | cut -d ' ' -f 1 > "$output/release.sha256"
printf 'PACKAGED_RELEASE sha=%s\n' "$sha"
