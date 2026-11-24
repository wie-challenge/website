#!/usr/bin/env bash
set -euo pipefail
[[ $# == 1 && $1 =~ ^nasj-[a-zA-Z0-9_.@-]{1,200}$ ]]
environment=${NASJ_NOTIFY_ENVIRONMENT:-unspecified}
[[ $environment =~ ^[a-zA-Z0-9_-]{1,32}$ ]]
timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
case ${NASJ_NOTIFY_FORMAT:-generic} in
  generic)
    printf -v payload '{"unit":"%s","state":"failed","environment":"%s","timestamp":"%s"}' \
      "$1" "$environment" "$timestamp"
    ;;
  discord)
    printf -v payload '{"content":"NASJ %s | %s failed | %s","allowed_mentions":{"parse":[]}}' \
      "$environment" "$1" "$timestamp"
    ;;
  *) exit 2 ;;
esac
# Credentials stay in the protected curl config, never in the payload or argv.
curl --disable --config "${NASJ_NOTIFY_CURL_CONFIG:-/etc/nasj/notify.curl}" \
  --proto '=https' --no-insecure --no-location --connect-timeout 4 --max-time 8 \
  --retry 2 --retry-max-time 18 --fail --silent --output /dev/null \
  --header 'Content-Type: application/json' --data-binary "$payload"
