#!/usr/bin/env bash
set -Eeuo pipefail
root=$(cd "$(dirname "$0")" && pwd)
name="nasj-backup-test-$(cat /proc/sys/kernel/random/uuid)"
trap 'docker stop "$name" >/dev/null 2>&1 || true' EXIT
docker run --rm --name "$name" -d --network none -e POSTGRES_HOST_AUTH_METHOD=trust \
  -v "$root/backup-evidence.sql:/evidence.sql:ro" postgres:16.11-alpine >/dev/null
for _attempt in {1..60}; do
  docker exec "$name" pg_isready -h 127.0.0.1 -U postgres >/dev/null && break
  sleep .5
done
sql() { docker exec "$name" psql -XqAt -U postgres -d "$1" -v ON_ERROR_STOP=1 "${@:2}"; }
docker exec -i "$name" psql -XqAt -U postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE "_prisma_migrations" (migration_name text, checksum text, finished_at timestamptz, rolled_back_at timestamptz);
INSERT INTO "_prisma_migrations" VALUES ('demo','hash',now(),NULL);
CREATE TABLE sample(id int PRIMARY KEY);
INSERT INTO sample VALUES (42);
SQL
docker exec "$name" createdb -U postgres restore
docker exec "$name" pg_dump -Fc -U postgres postgres |
  docker exec -i "$name" pg_restore --exit-on-error --single-transaction -U postgres -d restore
original=$(sql postgres -f /evidence.sql)
restored=$(sql restore -f /evidence.sql)
[[ $original =~ ^NASJ_EVIDENCE:2:1: && $original == "$restored" ]]
# Execute the same receipt transaction used by the remote candidate verifier.
receipt=$(awk '/<<.SQL./ {printing=1; next} /^SQL$/ {printing=0} printing' "$root/refresh-neon.sh" |
  docker exec -i "$name" psql -XqAt -U postgres -d restore -v ON_ERROR_STOP=1 \
    -v backup_id=synthetic -v release=nightly -v archive_sha=fixture-hash -v "evidence=$original")
[[ $receipt == synthetic:fixture-hash ]]
[[ $(sql restore -c 'SELECT release FROM nasj_recovery_metadata.receipt') == nightly ]]
[[ $(sql restore -f /evidence.sql) == "$original" ]]
sql restore -c 'DELETE FROM sample'
[[ $(sql restore -f /evidence.sql) != "$original" ]]
sql restore -c 'UPDATE "_prisma_migrations" SET finished_at=NULL'
if sql restore -f /evidence.sql >/dev/null 2>&1; then exit 1; fi
echo 'Backup evidence matches a real restore and detects missing rows and unfinished migrations'
