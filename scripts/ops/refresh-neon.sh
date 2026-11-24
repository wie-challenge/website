#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ $EUID == 0 && $# == 4 && $1 =~ ^[a-zA-Z0-9-]+$ && $4 =~ ^[0-9a-f]{64}$ ]]
[[ $3 == nightly || $3 =~ ^[0-9a-f]{40}$ ]]
[[ $2 =~ ^NASJ_EVIDENCE:[0-9]+:[0-9]+:[0-9a-f]{32}:[0-9a-f]{32}$ ]]
conf=/etc/nasj/backup-neon.conf
[[ -f $conf && ! -L $conf && $(stat -c '%u:%a' "$conf") == 0:600 ]]
# shellcheck source=/dev/null
source "$conf"
[[ $PGHOST == *.neon.tech && $PGHOST != *-pooler.* && $PGDATABASE == neondb ]]
export PGHOST PGUSER PGDATABASE PGSSLMODE=verify-full PGCHANNELBINDING=require
export PGPASSFILE=/etc/nasj/backup-neon.pgpass PGCONNECT_TIMEOUT=15
export PGSSLROOTCERT=/etc/ssl/certs/ca-certificates.crt
db="nasj_${1//-/}"
db=${db,,}
[[ $db =~ ^nasj_[a-z0-9]{40,58}$ ]]
pg=/usr/lib/postgresql/16/bin
timeout 60 "$pg/createdb" --no-password --maintenance-db=neondb "$db"
# Preserve every existing database, including the previous verified copy.
timeout 900 "$pg/pg_restore" --no-password --single-transaction --exit-on-error --no-owner --no-acl --dbname="$db"
actual=$(timeout 180 "$pg/psql" -XqAt --no-password --set ON_ERROR_STOP=1 --dbname="$db" -f /usr/local/share/nasj/backup-evidence.sql)
[[ $actual == "$2" ]]
# The receipt travels with Neon so complete VPS loss does not erase proof of verification.
# A candidate with incomplete restore or mismatched evidence never receives this marker.
receipt=$(timeout 60 "$pg/psql" -XqAt --no-password --set ON_ERROR_STOP=1 --dbname="$db" \
  -v "backup_id=$1" -v "release=$3" -v "archive_sha=$4" -v "evidence=$2" <<'SQL'
BEGIN;
CREATE SCHEMA nasj_recovery_metadata;
REVOKE ALL ON SCHEMA nasj_recovery_metadata FROM PUBLIC;
CREATE TABLE nasj_recovery_metadata.receipt (
  id text PRIMARY KEY, release text NOT NULL, archive_sha256 text NOT NULL,
  evidence text NOT NULL, verified_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO nasj_recovery_metadata.receipt (id, release, archive_sha256, evidence)
VALUES (:'backup_id', :'release', :'archive_sha', :'evidence');
COMMIT;
SELECT id || ':' || archive_sha256 FROM nasj_recovery_metadata.receipt;
SQL
)
[[ $receipt == "$1:$4" ]]
printf '%s\n' "$db"
