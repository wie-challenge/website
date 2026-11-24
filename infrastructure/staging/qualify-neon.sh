#!/usr/bin/env bash
# Run as root inside the qualified Ubuntu VM, using a dedicated synthetic Neon project.
set -Eeuo pipefail
umask 077
[[ $EUID == 0 && $(hostname -s) == nasj-staging ]]
[[ $# == 2 && $1 == *.neon.tech && $2 == *.neon.tech && $1 != "$2" ]]
# Ensure the actual project used by the hook is exactly the independently approved test host.
# shellcheck source=/dev/null
source /etc/nasj/backup-neon.conf
[[ $PGHOST == "$1" && $PGHOST != *-pooler.* && $PGHOST != "$2" ]]
[[ $(stat -c '%u:%a' /etc/nasj/backup-neon.pgpass) == 0:600 ]]
# shellcheck source=/dev/null
source /etc/nasj/backup.conf
[[ $BACKUP_DATABASE == nasj_fixture ]]
export PGHOST PGUSER PGDATABASE PGSSLMODE=verify-full PGCHANNELBINDING=require
export PGPASSFILE=/etc/nasj/backup-neon.pgpass PGCONNECT_TIMEOUT=15
export PGSSLROOTCERT=/etc/ssl/certs/ca-certificates.crt
sha=$(printf 'qualification-%s' "$(cat /proc/sys/kernel/random/uuid)" | sha1sum)
sha=${sha%% *}
/etc/nasj/backup-before-migrate "$sha"
state=/var/lib/nasj-backup
mapfile -t receipt < <(python3 - "$state/latest-offsite" "$sha" <<'PY'
import json, re, sys
with open(sys.argv[1], encoding="utf-8") as file:
    data = json.load(file)
if data["release"] != sys.argv[2] or not re.fullmatch(r"nasj_[a-z0-9]{40,58}", data["neon_database"]):
    raise SystemExit("Invalid release-bound receipt")
print(data["neon_database"])
print(data["evidence"])
print(data["sha256"])
print(data["id"])
PY
)
[[ ${#receipt[@]} == 4 ]]
pg=/usr/lib/postgresql/16/bin
actual=$("$pg/psql" -XqAt --no-password --set ON_ERROR_STOP=1 -d "${receipt[0]}" -f /usr/local/share/nasj/backup-evidence.sql)
[[ $actual == "${receipt[1]}" ]]
remote=$("$pg/psql" -XqAt --no-password --set ON_ERROR_STOP=1 -d "${receipt[0]}" \
  -c "SELECT id || ':' || release || ':' || archive_sha256 || ':' || evidence FROM nasj_recovery_metadata.receipt")
[[ $remote == "${receipt[3]}:$sha:${receipt[2]}:${receipt[1]}" ]]
before=$(sha256sum "$state/latest-offsite")
bad_id=$(date -u +%Y%m%dT%H%M%SZ)-$(cat /proc/sys/kernel/random/uuid)
# Supply the valid synthetic dump with intentionally different evidence. No remote deletion occurs.
if runuser -u postgres -- env -u PGHOST -u PGPASSFILE -u PGUSER -u PGDATABASE -u PGSSLMODE -u PGCHANNELBINDING -u PGSSLROOTCERT \
    "$pg/pg_dump" --no-password -Fc nasj_fixture |
    /usr/local/libexec/nasj-refresh-neon "$bad_id" \
      NASJ_EVIDENCE:0:0:00000000000000000000000000000000:00000000000000000000000000000000 \
      "$sha" "${receipt[2]}"; then
  echo 'Invalid remote evidence was accepted' >&2
  exit 1
fi
[[ $(sha256sum "$state/latest-offsite") == "$before" ]]
failed_db="nasj_${bad_id//-/}"
result=$("$pg/psql" -XqAt --no-password --set ON_ERROR_STOP=1 -d "${failed_db,,}" \
  -c "SELECT to_regclass('nasj_recovery_metadata.receipt') IS NULL")
[[ $result == t ]]
printf 'NEON_QUALIFIED db=%s release=%s failed_candidate_unmarked=true\n' "${receipt[0]}" "$sha"
