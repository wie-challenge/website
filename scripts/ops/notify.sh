#!/usr/bin/env bash
set -euo pipefail
[[ ${1:-} =~ ^nasj-[a-zA-Z0-9_.@-]+$ ]]
# The protected curl config provides the HTTPS webhook URL and any authentication.
curl --config /etc/nasj/notify.curl --proto '=https' --max-time 15 --fail --silent \
  --output /dev/null --header 'Content-Type: application/json' --data "{\"unit\":\"$1\",\"state\":\"failed\"}"
