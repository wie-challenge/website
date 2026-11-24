#!/usr/bin/env bash
# Recover only the latest release-bound synthetic candidate inside the test VM.
set -Eeuo pipefail
[[ $EUID == 0 && $(hostname -s) == nasj-staging && $# == 2 && $1 != "$2" ]]
umask 077
source /etc/nasj/backup.conf
[[ $BACKUP_DATABASE == nasj_fixture ]]
source /etc/nasj/backup-neon.conf
[[ $PGHOST == "$1" && $PGHOST == *.neon.tech && $PGHOST != *-pooler.* ]]
export PGHOST PGUSER PGSSLMODE=verify-full PGCHANNELBINDING=require
export PGSSLROOTCERT=/etc/ssl/certs/ca-certificates.crt PGPASSFILE=/etc/nasj/backup-neon.pgpass PGCONNECT_TIMEOUT=15
case ${NEON_SSL_NEGOTIATION:-postgres} in
  postgres) export PGSSLNEGOTIATION=postgres ;;
  direct) export PGSSLNEGOTIATION=direct ;;
  *) exit 1 ;;
esac
mapfile -t record < <(python3 - <<'PY'
import json, re
with open("/var/lib/nasj-backup/latest-offsite", encoding="utf-8") as f:
    d = json.load(f)
assert re.fullmatch(r"nasj_[a-z0-9]{40,58}",d["neon_database"])
assert re.fullmatch(r"NASJ_EVIDENCE:[0-9]+:[0-9]+:[a-f0-9]{32}:[a-f0-9]{32}",d["evidence"])
print(d["neon_database"], d["evidence"], sep="\n")
PY
)
[[ ${#record[@]} == 2 ]]
start=$SECONDS
actual=$(
  timeout 300 /usr/lib/postgresql/18/bin/pg_dump --no-password --no-owner --no-acl -d "${record[0]}" |
    # Only the first PostgreSQL 17+ session header is removed for PostgreSQL 16.
    awk '!removed && $0 == "SET transaction_timeout = 0;" { removed=1; next } { print }' |
    timeout 300 runuser -u nasj-backup -- env -i PATH=/usr/bin:/bin TMPDIR=/srv/nasj-backups/restore-tmp \
    pg_virtualenv -v 16 bash -ec '
      set -o pipefail
      /usr/lib/postgresql/16/bin/psql -Xq --set ON_ERROR_STOP=1 --single-transaction -d postgres
      /usr/lib/postgresql/16/bin/psql -XqAt --set ON_ERROR_STOP=1 -d postgres -f /usr/local/share/nasj/backup-evidence.sql
    ' | grep '^NASJ_EVIDENCE:'
)
[[ $actual == "${record[1]}" ]]
printf 'NEON_RECOVERY_PG16_VERIFIED elapsed_seconds=%s\n' "$((SECONDS - start))"
