#!/usr/bin/env bash
set -Eeuo pipefail
/usr/lib/postgresql/16/bin/pg_restore --no-owner --no-acl --exit-on-error --single-transaction -d postgres
/usr/lib/postgresql/16/bin/psql -XqAt --set ON_ERROR_STOP=1 -d postgres -f /usr/local/share/nasj/backup-evidence.sql
