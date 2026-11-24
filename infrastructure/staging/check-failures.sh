#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID == 0 && $(hostname -s) == nasj-staging && -b /dev/vdb1 ]]
scratch=$(mktemp -d)
finish() {
  local status=$?
  trap - EXIT
  if ! mountpoint -q /srv/nasj-backups; then mount /srv/nasj-backups || status=1; fi
  rm -f -- "$scratch"/{bad-nginx.conf,nasj-invalid.service,bad-ssh.conf}
  rmdir "$scratch"
  exit "$status"
}
trap finish EXIT
printf '%s\n' 'this_is_not_a_valid_nginx_directive on;' > "$scratch/bad-nginx.conf"
printf '[Service]\nExecStart=\n' > "$scratch/nasj-invalid.service"
printf '%s\n' 'ThisIsNotAnSshOption yes' > "$scratch/bad-ssh.conf"
if nginx -t -c "$scratch/bad-nginx.conf" >/dev/null 2>&1; then exit 1; fi
if systemd-analyze verify "$scratch/nasj-invalid.service" >/dev/null 2>&1; then exit 1; fi
if /usr/sbin/sshd -tf "$scratch/bad-ssh.conf" >/dev/null 2>&1; then exit 1; fi
umount /srv/nasj-backups
if /etc/nasj/backup-before-migrate; then exit 1; fi
test "$(runuser -u postgres -- psql -XAt -d nasj_fixture -c 'SELECT id FROM fixture')" = 42
mount /srv/nasj-backups
mountpoint -q /srv/nasj-backups
for unit in nasj-api nasj-web nasj-worker nginx postgresql ssh; do systemctl is-active --quiet "$unit"; done
printf '%s\n' 'VM rejected invalid Nginx, systemd and SSH configuration; backup mount failure left PostgreSQL healthy'
