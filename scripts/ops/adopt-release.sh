#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
[[ $EUID == 0 && ${1:-} == --confirm-adoption ]]
state=/var/lib/nasj-deploy
exec 9>"$state/deploy.lock"
flock -w 60 9
[[ ! -e $state/pending ]]
if [[ -L /srv/nasj ]]; then
  actual=$(readlink -f /srv/nasj)
  [[ $actual == /srv/nasj-releases/* && -d $actual ]]
  echo NASJ_ALREADY_ADOPTED
  exit 0
fi
verified=/var/lib/nasj-backup/latest-offsite
[[ -s $verified && $(($(date +%s) - $(stat -c %Y "$verified"))) -le 86400 ]]
python3 - "$verified" <<'PYTHON'
import json
import re
import sys

with open(sys.argv[1], encoding="utf-8") as receipt:
    backup = json.load(receipt)
if not re.fullmatch(r"nasj_[a-z0-9]{40,58}", backup.get("neon_database", "")):
    raise SystemExit("No verified Neon recovery receipt")
if not re.fullmatch(r"[0-9a-f]{64}", backup.get("sha256", "")):
    raise SystemExit("Invalid recovery checksum")
PYTHON
[[ -d /srv/nasj && -d /srv/nasj-releases && ! -L /srv/nasj-releases ]]
[[ $(stat -c %d /srv/nasj) == "$(stat -c %d /srv/nasj-releases)" ]]
(( $(df -PB1 /srv/nasj-releases | awk 'END {print $4}') >= 5368709120 ))
# shellcheck source=/dev/null
source /etc/nasj/deploy.conf
[[ $CURRENT_LINK == /srv/nasj && $RELEASE_ROOT == /srv/nasj-releases ]]
target="$RELEASE_ROOT/legacy-$(date -u +%Y%m%dT%H%M%SZ)"
[[ ! -e $target && ! -L $target ]]
for unit in nasj-api nasj-web nasj-worker; do systemctl is-active --quiet "$unit"; done
log_dir=$state/logs
[[ -d $log_dir && ! -L $log_dir && $(stat -c '%u:%g:%a' "$log_dir") == 0:0:700 ]]
worker_log=$(mktemp "$log_dir/adoption-worker.XXXXXXXX.log")
printf '%s\n%s\n' /srv/nasj "$target" > "$state/pending.tmp"
mv -T "$state/pending.tmp" "$state/pending"
sync -f "$state"
health() {
  local attempt body
  for ((attempt=0; attempt<45; attempt++)); do
    if body=$(curl -fsS --max-time 5 http://127.0.0.1:3001/api/health/ready) &&
       [[ $body =~ \"status\"[[:space:]]*:[[:space:]]*\"ready\" ]] &&
       curl -fsS --max-time 5 http://127.0.0.1:3000/ >/dev/null &&
       body=$(curl -fsS --max-time 5 "$PUBLIC_HEALTH_URL") &&
       [[ $body =~ \"status\"[[:space:]]*:[[:space:]]*\"ready\" ]]; then return 0; fi
    sleep 2
  done
  return 1
}
worker() (
  ulimit -f 1024
  systemctl start nasj-worker &&
  systemctl is-active --quiet nasj-worker &&
  runuser -u nasj -- "$NODE_BIN" --env-file=/srv/nasj/.env /srv/nasj/apps/api/dist/jobs/main.js --status     >"$worker_log" 2>&1
)
restore() {
  local code=$?
  trap - EXIT
  if (( code != 0 )); then
    if systemctl stop nasj-worker nasj-api nasj-web &&
       { [[ ! -L /srv/nasj ]] || unlink /srv/nasj; } &&
       { [[ ! -d $target ]] || mv -T "$target" /srv/nasj; } &&
       systemctl start nasj-api nasj-web && health && worker; then
      mv -T "$state/pending" "$state/adoption-rolled-back"
    else
      echo NASJ_ADOPTION_RECOVERY_REQUIRED >&2
    fi
  fi
  exit "$code"
}
trap restore EXIT
trap 'exit 143' TERM HUP INT
systemctl stop nasj-worker
systemctl stop nasj-api nasj-web
mv -T /srv/nasj "$target"
ln -s "$target" /srv/nasj
systemctl start nasj-api nasj-web
health
worker
printf '%s\n' "$target" > "$state/adopted-release.tmp"
mv -T "$state/adopted-release.tmp" "$state/adopted-release"
mv -T "$state/pending" "$state/adoption-complete"
echo NASJ_ADOPTION_READY
