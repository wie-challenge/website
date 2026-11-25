#!/usr/bin/env bash
# Administrator-installed helper for the existing FelCloud systemd services.
set -Eeuo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
umask 077
[[ ( $# == 2 || ( $# == 3 && $3 == --attested ) ) && "$1" =~ ^[0-9a-f]{40}$ && "$2" =~ ^sha256:[0-9a-f]{64}$ ]] || exit 2
sha=$1 digest=${2#sha256:} mode=${3:-manual}
config_dir=/etc/nasj
state_dir=/var/lib/nasj-deploy
log_dir=$state_dir/logs
extractor=/usr/local/libexec/nasj-extract-release.py
for trusted_path in "$config_dir" "$state_dir" "$log_dir" /usr/local/sbin/nasj-deploy "$extractor"; do
  [[ ! -L "$trusted_path" ]] || { echo "Unsafe symlink: $trusted_path" >&2; exit 1; }
done
[[ $(stat -c '%u' "$config_dir") == 0 && $(stat -c '%a' "$config_dir") == 711 ]]
[[ -f "$config_dir/deploy.conf" && ! -L "$config_dir/deploy.conf" ]]
[[ $(stat -c '%u' "$config_dir/deploy.conf") == 0 && $(stat -c '%a' "$config_dir/deploy.conf") == 600 ]]
for trusted_path in / /etc /var /var/lib /usr /usr/local /usr/local/libexec /usr/local/sbin; do
  [[ $(stat -c '%u' "$trusted_path") == 0 && ! -L "$trusted_path" && $((8#$(stat -c '%a' "$trusted_path") & 022)) == 0 ]] || { echo "Unsafe trusted path parent: $trusted_path" >&2; exit 1; }
done
# Validate every ancestor of the log directory, including ancestors that are
# not on the other trusted paths.
trusted_path=$log_dir
while [[ $trusted_path != / ]]; do
  trusted_path=$(dirname -- "$trusted_path")
  [[ -d "$trusted_path" && $(stat -c '%u' "$trusted_path") == 0 && ! -L "$trusted_path" && $((8#$(stat -c '%a' "$trusted_path") & 022)) == 0 ]] || {
    echo "Unsafe trusted path parent: $trusted_path" >&2
    exit 1
  }
done
for trusted_path in "$state_dir" "$log_dir"; do
  [[ -d "$trusted_path" && $(stat -c '%u:%g:%a' "$trusted_path") == 0:0:700 ]] || {
    echo "Unsafe deployment directory: $trusted_path" >&2
    exit 1
  }
done
exec 9>"$state_dir/deploy.lock"
flock -w 900 9 || { echo 'DEPLOY_LOCK_TIMEOUT'; exit 1; }
pending="$state_dir/pending"
[[ ! -e "$pending" ]] || { echo 'RECOVERY_REQUIRED: inspect the pending deployment'; exit 1; }
unset BASH_ENV ENV CDPATH
# shellcheck source=/dev/null
source "$config_dir/deploy.conf"
for required in RELEASE_ROOT CURRENT_LINK RUNTIME_ENV MIGRATION_ENV RUNTIME_USER MIGRATION_USER NODE_BIN PUBLIC_HEALTH_URL; do
  [[ -n "${!required:-}" ]] || { echo "Missing deploy setting: $required" >&2; exit 2; }
done
[[ $(stat -c '%u:%a' "$RELEASE_ROOT") == 0:755 ]]
[[ "$PUBLIC_HEALTH_URL" =~ ^https://[a-zA-Z0-9.-]+/api/health/ready$ ]] || exit 2
[[ "$RELEASE_ROOT" == /* && "$CURRENT_LINK" == /* ]]
# Initial adoption is a separate reviewed cutover. Never replace an existing real live directory.
if [[ ! -L "$CURRENT_LINK" || ! -d "$RELEASE_ROOT" ]]; then
  echo 'NATIVE_BOOTSTRAP_REQUIRED: preserve the existing live directory before enabling CD' >&2
  exit 1
fi
[[ $(stat -c '%u:%a' "$(dirname "$CURRENT_LINK")") == 0:755 && ! -L "$RELEASE_ROOT" ]]
[[ $(stat -c '%d' "$(dirname "$CURRENT_LINK")") == $(stat -c '%d' "$RELEASE_ROOT") ]]
old_target=$(readlink -f "$CURRENT_LINK")
[[ "$old_target" == "$RELEASE_ROOT/"* && -d "$old_target" ]]
old_sha=${LEGACY_SHA:-bootstrap}
if [[ -f "$old_target/.release.json" ]]; then
  old_sha=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["sha"])' "$old_target/.release.json")
fi
# Keep historical evidence. Refuse new attempts before the budget fills; an
# operator can archive old logs outside this tree under the deployment lock.
read -r log_bytes _ < <(du -sb -- "$log_dir")
if [[ $log_bytes -ge 61865984 || $(find "$log_dir" -mindepth 1 -printf . | wc -c) -ge 1019 ]]; then
  echo 'DEPLOY_LOG_BUDGET_EXHAUSTED: archive reviewed logs before retrying' >&2
  exit 1
fi
log=$(mktemp "$log_dir/$(date -u +%Y%m%dT%H%M%S)-$sha.XXXXXXXX.log")
# Bound captured output without cutting off the authenticated SSH response.
exec > >(tee -p >(head -c 1048576 >"$log")) 2>&1
incoming=$(mktemp "$state_dir/incoming.XXXXXX")
staging="$RELEASE_ROOT/.incoming-$sha-$$"
release="$RELEASE_ROOT/$sha"
switched=false
switch_to() {
  local target=$1 temporary
  [[ $(stat -c '%d' "$(dirname "$CURRENT_LINK")") == $(stat -c '%d' "$RELEASE_ROOT") ]] || return 1
  temporary=$(mktemp -d "$(dirname "$CURRENT_LINK")/.nasj-switch.XXXXXX") || return 1
  ln -s "$target" "$temporary/current" || return 1
  mv -Tf "$temporary/current" "$CURRENT_LINK" || return 1
  rmdir "$temporary"
}

probe() {
  local body
  body=$(curl --fail --silent --show-error --connect-timeout 3 --max-time 5 "$1") || return 1
  [[ "$body" =~ \"status\"[[:space:]]*:[[:space:]]*\"ready\" ]]
}
ready() {
  local _attempt
  for _attempt in {1..60}; do
    if probe http://127.0.0.1:3001/api/health/ready && \
       curl --fail --silent --show-error --max-time 5 --output /dev/null http://127.0.0.1:3000/; then
      probe "$PUBLIC_HEALTH_URL"
      return $?
    fi
    sleep 2
  done
  return 1
}
worker_ready() (
  ulimit -f 1024
  systemctl is-active --quiet nasj-worker.service || return 1
  runuser -u "$RUNTIME_USER" -- "$NODE_BIN" --env-file="$RUNTIME_ENV" \
    "$CURRENT_LINK/apps/api/dist/jobs/main.js" --status >"$log.worker" 2>&1
)
finish() {
  local status=$?
  trap - EXIT
  if [[ "$status" != 0 ]]; then
    echo "DEPLOY_FAILED sha=$sha"
    if [[ "$switched" == true ]]; then
      if systemctl stop nasj-worker.service && switch_to "$old_target" && \
         systemctl restart nasj-api.service nasj-web.service && ready && \
         systemctl start nasj-worker.service && worker_ready; then
        rm -f "$pending"
        echo "ROLLBACK_READY sha=$old_sha"
      else
        echo 'ROLLBACK_FAILED: operator intervention required'
      fi
    fi
  fi
  rm -f "$incoming"
  # Failed/staged releases are retained for administrator diagnosis; no data or volumes are pruned.
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
# The transport credential alone cannot approve code for execution on this host.
authorization="$config_dir/releases/$sha"
if [[ $mode == manual ]] && [[ ! -f "$authorization" || -L "$authorization" || $(cat "$authorization") != "sha256:$digest" ]]; then
  echo 'RELEASE_AUTHORIZATION_REQUIRED'
  exit 1
fi
# Limit the authenticated upload before considering any live-service changes (1 GiB compressed).
timeout 600 head -c 1073741825 > "$incoming"
[[ $(stat -c %s "$incoming") -le 1073741824 ]]
actual=$(sha256sum "$incoming"); actual=${actual%% *}
[[ "$actual" == "$digest" ]]
if [[ $mode == --attested ]]; then
  enabled=$config_dir/enable-attested
  [[ -f $enabled && ! -L $enabled && $(stat -c '%u:%g:%a' "$enabled") == 0:0:600 ]]
  verifier=/usr/local/libexec/nasj-verify-release-provenance
  claims=$state_dir/provenance-claims
  [[ -f $verifier && ! -L $verifier && $(stat -c '%u:%g:%a' "$verifier") == 0:0:755 ]]
  [[ -d $claims && ! -L $claims && $(stat -c '%u:%g:%a' "$claims") == 0:0:700 ]]
  "$verifier" "$incoming" "$sha" "$digest"
  # Consume the source SHA while holding the canonical lock. A crash, failed
  # release or rollback never makes that automated authorization reusable.
  if ! mkdir -m 0700 -- "$claims/$sha" 2>/dev/null; then
    # Identical delivery is a no-op only while that exact release is healthy
    # and active, never after interruption or a rollback to an older release.
    if [[ $old_target == "$release" && -f $claims/$sha/digest &&
          $(cat "$claims/$sha/digest") == "sha256:$digest" &&
          -f $state_dir/current && $(cat "$state_dir/current") == "$sha $digest" ]] &&
       ready && worker_ready; then
      echo "DEPLOY_ALREADY_CURRENT sha=$sha"
      exit 0
    fi
    echo 'PROVENANCE_REPLAY_REJECTED' >&2
    exit 1
  fi
  printf 'sha256:%s\n' "$digest" > "$claims/$sha/digest"
  sync -f "$claims"
fi
if [[ -e "$release" ]]; then
  [[ -f "$release/.artifact-sha256" && "$(cat "$release/.artifact-sha256")" == "$digest" ]]
else
  [[ ! -e "$release" && ! -L "$release" ]]
  python3 "$extractor" "$incoming" "$staging" "$sha"
  chown -R root:root "$staging"
  expected_node=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["node"])' "$staging/.release.json")
  [[ $("$NODE_BIN" --version) == "$expected_node" ]]
  printf '%s\n' "$digest" > "$staging/.artifact-sha256"
  chmod 444 "$staging/.artifact-sha256"
  [[ ! -e "$staging/.env" && ! -L "$staging/.env" ]]
  ln -s "$RUNTIME_ENV" "$staging/.env"
  install -d -o "$RUNTIME_USER" -g "$RUNTIME_USER" -m 700 "$staging/apps/web/.next/cache"
  mv "$staging" "$release"
fi
# A reused immutable release still needs runtime compatibility verification.
expected_node=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["node"])' "$release/.release.json")
[[ $("$NODE_BIN" --version) == "$expected_node" ]]
echo "RELEASE_VERIFIED sha=$sha sha256=$digest"
schema() (
  ulimit -f 1024
  runuser -u "$RUNTIME_USER" -- "$NODE_BIN" --env-file="$RUNTIME_ENV" \
    "$release/apps/api/scripts/deploy-check-schema.mjs"
)
schema_status=0
schema >"$log.schema" 2>&1 || schema_status=$?
case "$schema_status" in
  0) ;;
  10)
    [[ -f "$config_dir/approvals/$sha" && "$(cat "$config_dir/approvals/$sha")" == "expand-contract $old_sha sha256:$digest" ]]
    [[ -x "$config_dir/backup-before-migrate" ]]
    # Drain excess diagnostics without limiting the backup program's archive writes.
    "$config_dir/backup-before-migrate" "$sha" > >(head -c 1048576 >"$log.backup"; cat >/dev/null) 2>&1
    (
      ulimit -f 1024
      cd "$release/apps/api"
      runuser -u "$MIGRATION_USER" -- "$NODE_BIN" --env-file="$MIGRATION_ENV" \
        node_modules/prisma/build/index.js migrate deploy
    ) >"$log.migration" 2>&1
    schema >"$log.schema" 2>&1
    ;;
  *) echo 'SCHEMA_CHECK_FAILED: running application unchanged'; false ;;
esac
if [[ "$old_target" == "$release" ]]; then
  ready && worker_ready
  echo "DEPLOY_ALREADY_CURRENT sha=$sha"
  exit 0
fi
if [[ $mode == --attested ]]; then
  "$verifier" --main-head "$sha"
fi
printf '%s\n%s\n' "$old_target" "$release" > "$pending.tmp"
mv -T "$pending.tmp" "$pending"
sync -f "$state_dir"
switched=true
systemctl stop nasj-worker.service
switch_to "$release"
systemctl restart nasj-api.service nasj-web.service
ready
systemctl start nasj-worker.service
worker_ready
printf '%s\n' "$old_target" > "$state_dir/previous.tmp"
mv "$state_dir/previous.tmp" "$state_dir/previous"
printf '%s %s\n' "$sha" "$digest" > "$state_dir/current.tmp"
mv "$state_dir/current.tmp" "$state_dir/current"
rm -f "$pending"
echo "DEPLOY_READY sha=$sha sha256=$digest"
