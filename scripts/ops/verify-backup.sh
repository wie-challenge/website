#!/usr/bin/env bash
set -Eeuo pipefail
pg_restore --no-owner --no-acl --exit-on-error --single-transaction -d postgres
psql -XqAt --set ON_ERROR_STOP=1 -d postgres -f /usr/local/share/nasj/backup-evidence.sql
