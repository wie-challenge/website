#!/usr/bin/env bash
# Controller-side runner. All writes go to the loopback VM created by prepare-vm.py.
set -Eeuo pipefail
umask 077
root=$(cd "$(dirname "$0")/.." && pwd)
vm=$(realpath "${1:?VM directory required}")
port=${2:-22224}
[[ $port =~ ^[0-9]+$ && -s $vm/known_hosts && -s $vm/admin ]]
export ANSIBLE_SSH_COMMON_ARGS="-o UserKnownHostsFile=$vm/known_hosts -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes"
ssh_cmd=(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$vm/known_hosts" -o IdentitiesOnly=yes -i "$vm/admin" -p "$port" ubuntu@127.0.0.1)
# shellcheck disable=SC2016 # Evaluate the hostname in the guest.
"${ssh_cmd[@]}" 'test "$(hostname -s)" = nasj-staging && cloud-init status --wait'
deploy_pub=$(awk '{print $1, $2}' "$vm/deploy.pub")
cat >"$vm/inventory.yml" <<YAML
all:
  vars:
    nasj_environment: staging
    nasj_public_health_url: https://localhost/api/health/ready
  children:
    nasj:
      hosts:
        fixture:
          ansible_host: 127.0.0.1
          ansible_user: ubuntu
          ansible_port: $port
YAML
cd "$root/ansible"
common=(-i "$vm/inventory.yml" --private-key "$vm/admin")
if [[ ${NASJ_VM_RESUME:-false} != true ]]; then
ansible-playbook "${common[@]}" -e nasj_confirm_bootstrap=true playbooks/bootstrap.yml
"${ssh_cmd[@]}" 'sudo -n bash -s' < "$root/staging/seed-fixture.sh"
"${ssh_cmd[@]}" 'sudo -n cat /root/nasj-fixture/identity' > "$vm/age.identity"
"${ssh_cmd[@]}" 'sudo -n cat /root/nasj-fixture/recipients' > "$vm/age.recipients"
VM_DIR="$vm" DEPLOY_PUB="$deploy_pub" python3 - <<'PY'
import json
import os
from pathlib import Path
p = Path(os.environ["VM_DIR"])
data = {
    "nasj_configure_backup": True,
    "nasj_install_deploy_ssh": True,
    "nasj_recovery_access_verified": True,
    "nasj_reload_ssh": True,
    "nasj_deploy_public_key": os.environ["DEPLOY_PUB"],
    "nasj_deploy_config": """RELEASE_ROOT=/srv/nasj-releases
CURRENT_LINK=/srv/nasj
RUNTIME_ENV=/etc/nasj/runtime.env
MIGRATION_ENV=/srv/nasj/.env
RUNTIME_USER=nasj
MIGRATION_USER=nasj-migrate
NODE_BIN=/usr/local/libexec/nasj-fixture-runtime
PUBLIC_HEALTH_URL=https://localhost/api/health/ready
LEGACY_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
""",
    "nasj_backup_files": {
        "backup.conf": "BACKUP_DATABASE=nasj_fixture\nNEON_REFRESH_ENABLED=false\n",
        "backup.identity": (p / "age.identity").read_text(),
        "backup.recipients": (p / "age.recipients").read_text(),
    },
}
(p / "vars.json").write_text(json.dumps(data))
PY
ansible-playbook "${common[@]}" -e "@$vm/vars.json" playbooks/configure.yml
ANSIBLE_NOCOLOR=1 ansible-playbook "${common[@]}" -e "@$vm/vars.json" playbooks/configure.yml |
  tee "$vm/idempotency.log"
grep -Eq 'changed=0 .*unreachable=0 .*failed=0' "$vm/idempotency.log"
fi
ansible-playbook "${common[@]}" playbooks/verify.yml
deploy_ssh=(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$vm/known_hosts" -o IdentitiesOnly=yes -i "$vm/deploy" -p "$port" nasj-deploy@127.0.0.1)
if "${deploy_ssh[@]}" id >"$vm/ssh-rejection.log" 2>&1; then
  echo 'FAIL: deployment key accepted an arbitrary command' >&2
  exit 1
fi
grep -q 'Only an immutable NASJ deployment command is allowed' "$vm/ssh-rejection.log"
if [[ ${NASJ_VM_DEPLOY_ONLY:-false} != true ]]; then
ansible-playbook "${common[@]}" -e nasj_run_backup=true playbooks/backup.yml
"${ssh_cmd[@]}" 'sudo -n test -s /var/lib/nasj-backup/latest'
if "${ssh_cmd[@]}" 'sudo -n /etc/nasj/backup-before-migrate aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; then
  echo 'FAIL: a local backup satisfied the off-host migration gate' >&2
  exit 1
fi
"${ssh_cmd[@]}" 'sudo -n test ! -e /var/lib/nasj-backup/latest-offsite'
printf '%s\n' 'VM provisioning, idempotency, TLS health, SSH restriction, encrypted restore and migration failure gate passed'
"${ssh_cmd[@]}" 'sudo -n bash -s' <<'GUEST'
set -Eeuo pipefail
[[ $(hostname -s) == nasj-staging ]]
python3 - <<'PYTHON'
import json
import os
import time
from pathlib import Path
root = Path("/srv/nasj-backups/archives")
folder = root / "daily"
for name, age in (
    ("20000101T000000Z-00000000-0000-0000-0000-000000000001", 70),
    ("20000101T000000Z-00000000-0000-0000-0000-000000000002", 60),
):
    archive = folder / (name + ".dump.age")
    archive.write_bytes(b"synthetic retention fixture")
    manifest = folder / (name + ".json")
    manifest.write_text(json.dumps({"location": "same-vps", "key": "daily/" + archive.name}))
    os.utime(manifest, (time.time() - age * 86400,) * 2)
PYTHON
keep=daily/20000101T000000Z-00000000-0000-0000-0000-000000000002
/usr/local/libexec/nasj-backup-retention /srv/nasj-backups/archives "$keep"
test -f "/srv/nasj-backups/archives/$keep.json"
test ! -e /srv/nasj-backups/archives/daily/20000101T000000Z-00000000-0000-0000-0000-000000000001.json
unlink "/srv/nasj-backups/archives/$keep.json"
unlink "/srv/nasj-backups/archives/$keep.dump.age"
GUEST
# Inject a synthetic off-host receipt solely to exercise the guest's cutover mechanics.
"${ssh_cmd[@]}" 'sudo -n bash -s' <<'GUEST'
set -Eeuo pipefail
test "$(hostname -s)" = nasj-staging
umask 077
python3 - <<'PYTHON'
import json
from pathlib import Path
state = Path("/var/lib/nasj-backup")
receipt = json.loads((state / "latest").read_text())
receipt["neon_database"] = "nasj_" + ("0" * 48)
(state / "latest-offsite").write_text(json.dumps(receipt))
PYTHON
GUEST
ansible-playbook "${common[@]}" -e nasj_confirm_adoption=true playbooks/adopt-release.yml
ansible-playbook "${common[@]}" -e nasj_confirm_adoption=true playbooks/adopt-release.yml
ansible-playbook "${common[@]}" playbooks/verify.yml
fi
# Reproduce the production parent mode only inside the isolated guest.
"${ssh_cmd[@]}" 'sudo -n bash -s' <<'GUEST'
set -Eeuo pipefail
[[ $(hostname -s) == nasj-staging ]]
getent group syslog >/dev/null || groupadd --system syslog
chown root:syslog /var/log
chmod 0775 /var/log
install -d -o root -g root -m 0700 /var/log/nasj-deploy
test "$(stat -c '%a %U:%G' /var/log)" = '775 root:syslog'
sed 's|^log_dir=.*|log_dir=/var/log/nasj-deploy|' /usr/local/sbin/nasj-deploy >/root/nasj-test-unsafe-log.sh
if bash /root/nasj-test-unsafe-log.sh bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
    sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd </dev/null >/root/nasj-test-unsafe-log.out 2>&1; then
  exit 1
fi
grep -Fxq 'Unsafe trusted path parent: /var/log' /root/nasj-test-unsafe-log.out
printf '%s\n' 'Unsafe legacy parent rejected; exercising corrected path on the same host'
GUEST
make_candidate() {
  local sha=$1 fault=$2
  python3 - "$vm/$sha.tar.gz" "$sha" "$fault" <<'PY'
import io, json, sys, tarfile
out, sha, failure = sys.argv[1:]
files = {
    ".release.json": json.dumps({"sha": sha, "platform": "linux", "arch": "x64", "node": "v24.20.0"}),
    "apps/api/dist/main.js": "",
    "apps/api/dist/jobs/main.js": "",
    "apps/api/scripts/deploy-check-schema.mjs": "",
    "apps/api/prisma.config.ts": "",
    "apps/api/node_modules/prisma/build/index.js": "",
    "apps/web/node_modules/next/dist/bin/next": "",
    "apps/web/.next/BUILD_ID": "synthetic",
}
if failure in {"worker", "public"}:
    files["apps/api/dist/fail-" + failure] = ""
with tarfile.open(out, "w:gz") as tar:
    for name, value in files.items():
        payload = value.encode()
        entry = tarfile.TarInfo(name)
        entry.size = len(payload)
        tar.addfile(entry, io.BytesIO(payload))
PY
  local digest
  digest=$(sha256sum "$vm/$sha.tar.gz"); digest=${digest%% *}
  printf 'sha256:%s\n' "$digest" | "${ssh_cmd[@]}" "sudo -n tee /etc/nasj/releases/$sha >/dev/null"
  if [[ $fault == false ]]; then
    "${deploy_ssh[@]}" "deploy $sha sha256:$digest" < "$vm/$sha.tar.gz"
  else
    local out="$vm/$sha.rollback.log"
    if "${deploy_ssh[@]}" "deploy $sha sha256:$digest" < "$vm/$sha.tar.gz" >"$out" 2>&1; then
      echo 'FAIL: readiness or worker fault did not roll back deployment' >&2
      exit 1
    fi
    grep -q '^ROLLBACK_READY sha=' "$out"
    printf '%s\n' "Synthetic $fault failure triggered verified rollback"
  fi
}
good=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
bad=cccccccccccccccccccccccccccccccccccccccc
make_candidate "$good" false
make_candidate "$bad" worker
make_candidate dddddddddddddddddddddddddddddddddddddddd public
"${ssh_cmd[@]}" "test \"\$(readlink -f /srv/nasj)\" = /srv/nasj-releases/$good"
ansible-playbook "${common[@]}" playbooks/verify.yml
"${ssh_cmd[@]}" 'sudo -n bash -s' <<'GUEST'
set -Eeuo pipefail
[[ $(hostname -s) == nasj-staging ]]
printf 'url = "https://localhost/test-alert"\n' >/etc/nasj/notify.curl
chmod 600 /etc/nasj/notify.curl
systemctl daemon-reload
systemctl start nasj-notify@nasj-monitor.service.service
grep -q 'POST /test-alert .* 204 ' /var/log/nginx/access.log
source /etc/nasj/deploy.conf
test "$(stat -c '%a %U:%G' /var/lib/nasj-deploy/logs)" = '700 root:root'
test -z "$(find /var/lib/nasj-deploy/logs -type f \( ! -perm 0600 -o ! -user root -o ! -group root \) -print -quit)"
test -n "$(find /var/lib/nasj-deploy/logs -type f -name '*.log' -print -quit)"
! runuser -u nasj-deploy -- test -w /var/lib/nasj-deploy/logs
! runuser -u nasj -- test -w /var/lib/nasj-deploy/logs
test -z "$(find /var/log/nasj-deploy -type f -print -quit)"
printf '%s\n%s\n' "$RELEASE_ROOT/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
  "$RELEASE_ROOT/cccccccccccccccccccccccccccccccccccccccc" > /var/lib/nasj-deploy/pending
if /usr/local/sbin/nasj-deploy bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
  sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd </dev/null; then
  exit 1
fi
mv -T /var/lib/nasj-deploy/pending /var/lib/nasj-deploy/reconciled-staging
install -d -m 700 /var/lib/nasj-recovery
archive=$(find /srv/nasj-backups/archives -name '*.dump.age' -type f | sort | tail -n 1)
test -n "$archive"
age -d -i /etc/nasj/backup.identity "$archive" >/var/lib/nasj-recovery/fixture.dump
chmod 600 /var/lib/nasj-recovery/fixture.dump
GUEST
ansible-playbook "${common[@]}" playbooks/disaster-recovery.yml \
  -e nasj_confirm_restore=true -e nasj_recovery_database=nasj_recovery_fixture \
  -e nasj_verified_dump=/var/lib/nasj-recovery/fixture.dump

# shellcheck disable=SC2016 # The database query runs inside the guest.
"${ssh_cmd[@]}" 'test "$(sudo -n -u postgres psql -XAt -d nasj_recovery_fixture -c "select id from fixture")" = 42'
printf '%s\n' 'VM adoption, signed TLS readiness, authorized deployment, rollback, recovery gate, alert delivery and restore passed'
"${ssh_cmd[@]}" 'sudo -n bash -s' < "$root/staging/check-failures.sh"
