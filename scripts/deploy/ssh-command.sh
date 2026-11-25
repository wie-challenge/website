#!/usr/bin/env bash
# Install root-owned at /usr/local/libexec/nasj-ssh-command; force it in authorized_keys.
set -euo pipefail
if [[ "${SSH_ORIGINAL_COMMAND:-}" =~ ^deploy\ ([0-9a-f]{40})\ (sha256:[0-9a-f]{64})$ ]]; then
  exec /usr/bin/sudo -n /usr/local/sbin/nasj-deploy "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
fi
if [[ "${SSH_ORIGINAL_COMMAND:-}" =~ ^deploy-attested\ ([0-9a-f]{40})\ (sha256:[0-9a-f]{64})$ ]]; then
  exec /usr/bin/sudo -n /usr/local/sbin/nasj-deploy "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" --attested
fi
printf 'Only an immutable NASJ deployment command is allowed.\n' >&2
exit 1
