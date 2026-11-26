#!/usr/bin/env bash
set -euo pipefail
[[ ${SSH_ORIGINAL_COMMAND:-} == plan ]] || exit 1
exec /usr/bin/sudo -n /usr/local/libexec/nasj-infra-plan-probe
