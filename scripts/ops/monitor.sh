#!/usr/bin/env bash
set -euo pipefail
umask 077
failed=false
fault() { printf 'NASJ_MONITOR_FAILURE check=%s\n' "$1" >&2; failed=true; }
for unit in nasj-api nasj-web nasj-worker postgresql nginx; do
  systemctl is-active --quiet "$unit" || fault "$unit"
done
pg_isready -h 127.0.0.1 -q || fault postgres-tcp
curl -fsS --max-time 10 http://127.0.0.1:3000/ >/dev/null || fault web
curl -fsS --max-time 10 http://127.0.0.1:3001/api/health/ready |
  python3 -c 'import json,sys; sys.exit(json.load(sys.stdin).get("status") != "ready")' || fault api
# shellcheck source=/dev/null
source /etc/nasj/deploy.conf
timeout 15 runuser -u "$RUNTIME_USER" -- "$NODE_BIN" --env-file="$RUNTIME_ENV" \
  "$CURRENT_LINK/apps/api/dist/jobs/main.js" --status >/dev/null 2>&1 || fault worker-status
curl -fsS --max-time 10 "$PUBLIC_HEALTH_URL" |
  python3 -c 'import json,sys; sys.exit(json.load(sys.stdin).get("status") != "ready")' || fault https
host=${PUBLIC_HEALTH_URL#https://}; host=${host%%/*}
timeout 15 openssl s_client -servername "$host" -connect "$host:443" </dev/null 2>/dev/null |
  openssl x509 -noout -checkend 1209600 >/dev/null || fault tls-expiry
(( $(df -PB1 /srv | awk 'END {print $4}') >= 5368709120 )) || fault disk
awk '/^MemAvailable:/ {exit ($2 < 262144)}' /proc/meminfo || fault memory
awk -v cpu="$(nproc)" '{exit ($2 > cpu * 2)}' /proc/loadavg || fault load
[[ ! -e /var/lib/nasj-deploy/pending ]] || fault interrupted-deployment
latest=/var/lib/nasj-backup/latest
[[ -s $latest && $(($(date +%s) - $(stat -c %Y "$latest"))) -le 93600 ]] || fault backup-freshness
[[ $failed == false ]]
