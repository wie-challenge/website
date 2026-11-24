#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
unset PGHOST PGPORT PGUSER PGDATABASE PGSERVICE PGSERVICEFILE PGPASSWORD
[[ $EUID == 0 && $# -le 1 ]]
release=${1:-nightly}
[[ $release == nightly || $release =~ ^[0-9a-f]{40}$ ]]
config=/etc/nasj/backup.conf
[[ -f $config && ! -L $config && $(stat -c '%u:%a' "$config") == 0:600 ]]
# shellcheck source=/dev/null
source "$config"
[[ $BACKUP_DATABASE =~ ^[a-zA-Z_][a-zA-Z_0-9]*$ && $S3_ENDPOINT == https://* ]]
[[ $S3_BUCKET =~ ^[a-z0-9][a-z0-9.-]+$ ]]
[[ $S3_PREFIX =~ ^[a-zA-Z0-9/_-]+$ ]]
export AWS_SHARED_CREDENTIALS_FILE=/etc/nasj/backup.aws
export AWS_CONFIG_FILE=/dev/null AWS_EC2_METADATA_DISABLED=true AWS_DEFAULT_REGION="$S3_REGION"
state=/var/lib/nasj-backup
exec 9>"$state/lock"
flock -w 60 9
id=$(date -u +%Y%m%dT%H%M%SZ)-$(cat /proc/sys/kernel/random/uuid)
scratch=$(mktemp -d "$state/work.XXXXXX")
stage=initialize
finish() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then
    printf 'NASJ_BACKUP_FAILED id=%s stage=%s\n' "$id" "$stage" >&2
  fi
  rm -f -- "$scratch"/{dump,backup.age,download.age,manifest,manifest.download,evidence,diagnostics}
  rmdir "$scratch"
  exit "$status"
}
trap finish EXIT
trap 'exit 143' TERM INT HUP
exec 8>"$scratch/diagnostics"
pg=/usr/lib/postgresql/16/bin
stage=dump
timeout 300 runuser -u postgres -- "$pg/pg_dump" --no-password -Fc --no-owner --no-acl --dbname="$BACKUP_DATABASE" >"$scratch/dump" 2>&8
stage=encrypt
age -R /etc/nasj/backup.recipients -o "$scratch/backup.age" "$scratch/dump" 2>&8
digest=$(sha256sum "$scratch/backup.age"); digest=${digest%% *}
s3() { timeout 300 aws --endpoint-url "$S3_ENDPOINT" s3api "$@" --bucket "$S3_BUCKET" >&8 2>&8; }
# Lifecycle retention belongs on the bucket. Always keep a separately protected recovery copy.
class=daily
[[ $(date -u +%u) != 7 ]] || class=weekly
[[ $(date -u +%d) != 01 ]] || class=monthly
[[ $release == nightly ]] || class=pre-migration
key="$S3_PREFIX/$class/$id"
stage=upload
s3 put-object --key "$key.dump.age" --body "$scratch/backup.age"
stage=download
s3 get-object --key "$key.dump.age" "$scratch/download.age"
printf '%s  %s\n' "$digest" "$scratch/download.age" | sha256sum --check --status
stage=restore
# pg_virtualenv runs as an unprivileged account, with a disposable PostgreSQL 16 cluster.
age -d -i /etc/nasj/backup.identity "$scratch/download.age" 2>&8 |
  timeout 300 runuser -u nasj-backup -- pg_virtualenv -v 16 /usr/local/libexec/nasj-verify-backup >"$scratch/evidence" 2>&8
evidence=$(grep -E '^NASJ_EVIDENCE:' "$scratch/evidence")
[[ $evidence =~ ^NASJ_EVIDENCE:[0-9]+:[0-9]+:[0-9a-f]{32}:[0-9a-f]{32}$ ]]
stage=manifest
printf '{"id":"%s","release":"%s","sha256":"%s","key":"%s.dump.age","evidence":"%s"}\n' \
  "$id" "$release" "$digest" "$key" "$evidence" >"$scratch/manifest"
s3 put-object --key "$key.json" --body "$scratch/manifest"
s3 get-object --key "$key.json" "$scratch/manifest.download"
cmp "$scratch/manifest" "$scratch/manifest.download"
# Keep the verified recovery point outside all lifecycle-expiring prefixes.
stage=preserve
s3 put-object --key "$S3_PREFIX/protected/latest.dump.age" --body "$scratch/download.age"
s3 put-object --key "$S3_PREFIX/protected/latest.json" --body "$scratch/manifest"
install -m 600 "$scratch/manifest" "$state/latest.tmp"
mv -T "$state/latest.tmp" "$state/latest"
if [[ $release == nightly && ${NEON_REFRESH_ENABLED:-false} == true ]]; then
  stage=neon
  /usr/local/libexec/nasj-refresh-neon "$id" "$evidence" < "$scratch/dump" >&8 2>&8
fi
printf 'NASJ_BACKUP_READY id=%s release=%s\n' "$id" "$release"
