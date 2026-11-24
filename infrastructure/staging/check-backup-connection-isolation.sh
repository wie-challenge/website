#!/usr/bin/env bash
# Run inside the configured disposable guest. Never connects to Neon.
set -Eeuo pipefail
[[ $EUID == 0 && $(hostname -s) == nasj-staging ]]
source /etc/nasj/backup.conf
[[ $BACKUP_DATABASE == nasj_fixture && ${NEON_REFRESH_ENABLED:-false} == false ]]
env PGHOST=invalid PGHOSTADDR=192.0.2.1 PGPORT=1 PGUSER=invalid \
  PGDATABASE=invalid PGPASSWORD=invalid PGPASSFILE=/nonexistent \
  PGSSLMODE=verify-full PGSSLROOTCERT=/nonexistent PGCHANNELBINDING=require \
  PGSSLNEGOTIATION=direct \
  PGOPTIONS='-c search_path=nonexistent' PGSERVICE=invalid PGSERVICEFILE=/nonexistent \
  /etc/nasj/backup-before-migrate
