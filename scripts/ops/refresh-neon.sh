#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ $EUID == 0 && $# == 2 && $1 =~ ^[a-zA-Z0-9-]+$ ]]
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
printf '%s\n' "$db" > /var/lib/nasj-backup/neon-latest.tmp
mv -T /var/lib/nasj-backup/neon-latest.tmp /var/lib/nasj-backup/neon-latest
printf '%s\n' "$db"
