#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
started=$SECONDS
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
# Local peers use the default socket and explicit database name. The remote
# helper loads its own connection settings from the protected Neon config.
unset PGHOST PGHOSTADDR PGPORT PGUSER PGDATABASE PGPASSWORD PGPASSFILE \
  PGSSLMODE PGSSLROOTCERT PGCHANNELBINDING PGOPTIONS PGSERVICE PGSERVICEFILE \
  PGCONNECT_TIMEOUT
[[ $EUID == 0 && $# -le 1 ]]
release=${1:-nightly}
[[ $release == nightly || $release =~ ^[0-9a-f]{40}$ ]]
config=/etc/nasj/backup.conf
[[ -f $config && ! -L $config && $(stat -c '%u:%a' "$config") == 0:600 ]]
# shellcheck source=/dev/null
source "$config"
[[ $BACKUP_DATABASE =~ ^[a-zA-Z_][a-zA-Z_0-9]*$ ]]
store=/srv/nasj-backups
state=/var/lib/nasj-backup
exec 9>"$state/lock"
flock -w 60 9
# Missing mounts must never divert writes onto the primary database filesystem.
mountpoint -q "$store"
[[ ! -L $store && $(stat -c '%u:%a' "$store") == 0:711 ]]
[[ $(stat -c %d "$store") != "$(stat -c %d /var/lib/postgresql)" ]]
mount_options=,$(findmnt -n -o OPTIONS --mountpoint "$store"),
for flag in nodev nosuid noexec; do [[ $mount_options == *",$flag,"* ]]; done
limit=${BACKUP_MAX_MIB:-256}
[[ $limit =~ ^[1-9][0-9]{0,3}$ ]]
available_bytes=$(df -PB1 "$store" | awk 'END {print $4}')
required_bytes=$(awk -v limit="$limit" 'BEGIN {printf "%.0f", (limit * 6 + 512) * 1048576}')
[[ $available_bytes -ge $required_bytes ]]
# Bash reports file size blocks in KiB outside POSIX mode.
ulimit -f "$((limit * 1024))"
id=$(date -u +%Y%m%dT%H%M%SZ)-$(cat /proc/sys/kernel/random/uuid)
scratch=$(mktemp -d "$store/.incoming.XXXXXX")
stage=initialize
finish() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then
    printf 'NASJ_BACKUP_FAILED id=%s stage=%s\n' "$id" "$stage" >&2
  fi
  rm -f -- "$scratch"/{backup.age,manifest.json,evidence,diagnostics}
  rmdir "$scratch"
  exit "$status"
}
trap finish EXIT
trap 'exit 143' TERM INT HUP
exec 8>"$scratch/diagnostics"
pg=/usr/lib/postgresql/16/bin
stage=encrypt
timeout 300 runuser -u postgres -- "$pg/pg_dump" --no-password -Fc --no-owner --no-acl --dbname="$BACKUP_DATABASE" 2>&8 |
  age -R /etc/nasj/backup.recipients -o "$scratch/backup.age" 2>&8
digest=$(sha256sum "$scratch/backup.age"); digest=${digest%% *}
archive_bytes=$(stat -c %s "$scratch/backup.age")
stage=restore
age -d -i /etc/nasj/backup.identity "$scratch/backup.age" 2>&8 |
  timeout 300 runuser -u nasj-backup -- env TMPDIR="$store/restore-tmp" pg_virtualenv -v 16 /usr/local/libexec/nasj-verify-backup >"$scratch/evidence" 2>&8
evidence=$(grep -E '^NASJ_EVIDENCE:' "$scratch/evidence")
[[ $evidence =~ ^NASJ_EVIDENCE:[0-9]+:[0-9]+:[0-9a-f]{32}:[0-9a-f]{32}$ ]]
stage=publish
class=daily
[[ $(date -u +%u) != 7 ]] || class=weekly
[[ $(date -u +%d) != 01 ]] || class=monthly
[[ $release == nightly ]] || class=pre-migration
key="$class/$id"
printf '{"id":"%s","release":"%s","sha256":"%s","key":"%s.dump.age","evidence":"%s","location":"same-vps","bytes":%s,"elapsed_seconds":%s}\n' \
  "$id" "$release" "$digest" "$key" "$evidence" "$archive_bytes" "$((SECONDS - started))" >"$scratch/manifest.json"
mv -T -- "$scratch/backup.age" "$store/archives/$key.dump.age"
printf '%s  %s\n' "$digest" "$store/archives/$key.dump.age" | sha256sum --check --status
mv -T -- "$scratch/manifest.json" "$store/archives/$key.json"
sync -f "$store"
install -m 600 "$store/archives/$key.json" "$state/latest.tmp"
mv -T "$state/latest.tmp" "$state/latest"
stage=retention
/usr/local/libexec/nasj-backup-retention "$store/archives" "$key"
if [[ $release != nightly || ${NEON_REFRESH_ENABLED:-false} == true ]]; then
  stage=neon
  # The helper creates a new remote database, validates it and prints its identity only after success.
  neon_db=$(age -d -i /etc/nasj/backup.identity "$store/archives/$key.dump.age" 2>&8 |
    /usr/local/libexec/nasj-refresh-neon "$id" "$evidence" "$release" "$digest" 2>&8)
  expected_db="nasj_${id//-/}"
  [[ $neon_db == "${expected_db,,}" ]]
  printf '{"id":"%s","release":"%s","neon_database":"%s","sha256":"%s","evidence":"%s","bytes":%s,"elapsed_seconds":%s}\n' \
    "$id" "$release" "$neon_db" "$digest" "$evidence" "$archive_bytes" "$((SECONDS - started))" > "$state/latest-offsite.tmp"
  mv -T "$state/latest-offsite.tmp" "$state/latest-offsite"
  sync -f "$state"
fi
printf 'NASJ_BACKUP_READY id=%s release=%s\n' "$id" "$release"
