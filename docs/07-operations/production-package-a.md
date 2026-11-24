# NASJ production preparation: Package A

This plan does not authorize apply, a database grant, SSH reload, timer activation,
a live backup, adoption, or deployment. Keep both GitHub activation flags unset.

The encrypted workstation starter is `~/.config/nasj/production-a.vault.yml`; its
local unlock file is `~/.config/nasj/production-a.vault-password`. Both are mode
0600 and outside Git. Edit only on the workstation:

```bash
d="$HOME/.config/nasj"
ansible-vault edit --vault-password-file "$d/production-a.vault-password" "$d/production-a.vault.yml"
```

The Age and Neon entries below are populated in the encrypted production Vault.
The approved notification destination is still required. Do not use the
qualification Neon endpoint or expose the values in chat, command arguments, or diffs.

| Key | Required input |
| --- | --- |
| `backup.recipients` and `backup.identity` | Generated on the workstation for production and loaded in Vault. Copy `~/.config/nasj/production-age.identity` into an operator-controlled password vault as a file or onto encrypted removable storage. Restore a temporary copy and compare it byte-for-byte with `cmp -s`; keep it accessible if both the VPS and workstation fail. Store Vault unlock material separately. |
| `backup-neon.conf` | Existing production recovery project's direct `PGHOST`, dedicated `PGUSER`, and `PGDATABASE=neondb`. The existing role authenticated with verified TLS and channel binding; a read-only SQL probe confirmed CONNECT and CREATEDB. No candidate was created. Leave traditional negotiation at its default for FelCloud. |
| `backup-neon.pgpass` | Exact host, port 5432, database wildcard, exact recovery role and its password, using libpq pgpass escaping. |
| `notify.curl` | Approved HTTPS destination and authentication in curl config syntax; use a target that accepts the documented JSON. |

The runtime and migration credentials already exist on FelCloud. Do not copy them
into a local plaintext file. Read-only inspection confirmed `nasj_app` and
`nasj_owner` both point to the local `nasj` database. The runtime role lacks
public schema CREATE and migration-history SELECT. The backup mount is already
ext4 on a separate disk with nosuid, nodev and noexec; do not remount or format it.

From `infrastructure/ansible`, use the following Bash command prefix for each plan:

```bash
d="$HOME/.config/nasj"
export ANSIBLE_HOST_KEY_CHECKING=True
a=(ansible-playbook -i inventories/production/hosts.yml
   --vault-password-file "$d/production-a.vault-password"
   -e "@$d/production-a.vault.yml")
"${a[@]}" playbooks/audit.yml --check -e nasj_show_audit=false
"${a[@]}" playbooks/configure.yml --check -e nasj_configure_backup=true
```

Do not use `--diff`. Check mode does not test package maintainer scripts, restore
permissions or alert delivery. Keep monitoring, backup timers, and SSH toggles false.

- **A1:** After reviewing the full dry run and obtaining approval, use
  `"${a[@]}" playbooks/configure.yml -e nasj_configure_backup=true -e nasj_production_apply=true`.
  Deploy config and backup inputs go in `/etc/nasj`; helpers go in
  `/usr/local/libexec`, the evidence SQL in `/usr/local/share/nasj`, and inactive
  units in `/etc/systemd/system`. The archive role restricts the mount root and
  prepares private backup and restore directories. Apt uses state present and
  suppresses package service autostarts; inspect the apt plan before applying.
  The existing env files need a separate on-server copy in the same approval:
  require both destinations absent, then as root use
  `install -o root -g nasj -m 0640 /srv/nasj/.env /etc/nasj/runtime.env`
  and `install -o root -g nasj-migrate -m 0640 /srv/nasj/.migration.env /etc/nasj/migration.env`.
  Verify ownership and `sudo -u nasj test -r /etc/nasj/runtime.env` and
  `sudo -u nasj-migrate test -r /etc/nasj/migration.env`; verify all live services
  and public readiness. No service restart is planned. Roll back by restoring
  captured configuration and mount-root permissions, or removing only files
  created by A1 after confirming no unit uses them. Preserve all backup data.
- **A2:** Review `"${a[@]}" playbooks/database-grant.yml --check -e nasj_confirm_database_grant=true`.
  After separate consent, remove `--check`. The exact change is
  `GRANT SELECT ON TABLE public._prisma_migrations TO nasj_app;`. Verify with
  `SELECT has_table_privilege('nasj_app','public._prisma_migrations','SELECT'), has_schema_privilege('nasj_app','public','CREATE');`
  in `nasj`; expect true and false. Rollback, if separately approved and before
  deploying software that needs the grant, is
  `REVOKE SELECT ON TABLE public._prisma_migrations FROM nasj_app;`.
- **A3:** Administrator SSH works with strict host-key checking. Provider firewall
  and independent console login are unverified. In FelCloud, open the existing VPS
  remote console, confirm login without relying on SSH, verify `sudo -v`, and compare the host's
  `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` with the pinned host key, and
  review the firewall attached to this exact VPS: confirm inbound SSH from the
  administrator and the approved deployment path, public web ports 80/443, no
  public PostgreSQL 5432, and outbound HTTPS and Neon 5432. Record observations
  without changing rules. Keep the console and an independent admin SSH
  session open. The dedicated public key is already staged as `nasj_deploy_public_key`. Set
  `nasj_recovery_access_verified: true` only after that check. Review
  `configure.yml --check -e nasj_install_deploy_ssh=true`; apply only with explicit
  approval and keep reload false until separately authorized. This adds
  `/etc/ssh/authorized_keys/nasj-deploy` and
  `/etc/ssh/sshd_config.d/60-nasj-deploy.conf`. Validate `sshd -t`, effective
  settings and `visudo -c`. For the separately approved reload, use
  `sudo sshd -t && sudo systemctl reload ssh.service` from the admin session;
  an unchanged Ansible repeat will not trigger the role reload. Test a new admin login
  and verify deployment key restrictions. Roll back from the open console
  by restoring only those two files, running `sshd -t`, and reloading
  `ssh.service` under rollback authorization. The separate infrastructure
  workflow identity and protected Environment remain a later activation step.
- **A4:** Install the protected alert config through A1 or an independently
  reviewed repeat of that play. Before sending a separately approved test,
  verify the notification recipient and 0600 ownership. The actual test is
  the systemd command below; confirm delivery
  with the recipient. Do not enable timers. Roll back only the new
  `notify.curl` or restore its previous protected copy; if schedules are ever
  activated, stop and disable them under the applicable authorization.

Package B still requires a canonical live backup, independent Neon restore, and a
fresh verified off-host receipt. Package C still requires that receipt and separately
authorized maintenance, exact artifact deployment and rollback verification.

### Discord and generic HTTPS notifications

Production uses the private NASJ operations channel. Its encrypted Vault already
contains `nasj_backup_files["notify.env"]` with
`NASJ_NOTIFY_FORMAT=discord` and `NASJ_NOTIFY_ENVIRONMENT=production`.
The notifier sends a Discord `content` message containing only service, environment,
UTC timestamp and failure status, with mentions disabled. Generic HTTPS remains
the default and sends the existing `unit` and `state` fields plus `environment`
and `timestamp`. Requests verify HTTPS certificates, reject redirects, and allow
at most three attempts within curl's connect, request and retry limits.

In Discord, open the private NASJ operations channel and create an incoming
webhook under **Edit Channel → Integrations → Webhooks**. Copy the webhook URL
into the encrypted Vault only, as the multiline value for
`nasj_backup_files["notify.curl"]`:

```yaml
    notify.curl: |
      url = "https://discord.com/api/webhooks/REPLACE_WITH_PRIVATE_URL"
```

Replace the entire example URL with the copied URL. Do not paste the real URL
in chat, Git, logs or a shell command. The URL is the credential. The Ansible
role installs `notify.curl` and `notify.env` at mode 0600. The dry run includes
these files with `no_log` and no diff, and skips notification execution.

After separate approval for one live delivery test, use the configured systemd
unit so it reads `notify.env`:
`sudo systemctl daemon-reload` then
`sudo systemctl start nasj-notify@nasj-qualification.service.service`.
Confirm successful completion and the single test message in the private
channel. A retry after an ambiguous delivery failure can produce a duplicate.
Keep backup and monitor timers disabled. To roll back A4, restore the previous
two settings files and notification unit (or remove only the newly installed
files), reload systemd metadata under approval, and rotate the webhook in
Discord if it was exposed.

### Combined check-mode invocation

After operator confirmation of Age custody, console login with sudo, and firewall
review, preview all configuration without reloading SSH or starting timers:

```bash
"${a[@]}" playbooks/configure.yml --check \
  -e '{"nasj_configure_backup":true,"nasj_install_deploy_ssh":true,"nasj_recovery_access_verified":true,"nasj_reload_ssh":false,"nasj_enable_backup_timer":false,"nasj_enable_monitoring":false,"nasj_production_apply":false}'
```

Ansible previews copying notification settings without validating the URL or
sending a request. Confirm the replacement URL separately before approval.
A1 and A4 require separate consent: the backup role installs both sets of files
if both are present in Vault. Obtain both approvals before using the combined
Vault for an apply, or use a separately reviewed encrypted input that omits
`notify.curl` and `notify.env` for A1. Leave the SSH role off for either operation.

### A1 and A4 installation record

A1 and A4 configuration installation was authorized and applied from the
CI-passing implementation at `3546a4c`. The apply ran with restricted SSH, reload
and both timers off. It changed 10 tasks and had zero failures. Apt installed
Age 1.1.1 only; PostgreSQL client 16.15 remained in place. The runtime and
migration env files were copied inside FelCloud using no-overwrite links. Both
copies match their protected originals and have mode 0640 with the respective
service groups. The backup and notifier inputs are root-only 0600. The mount
remains on `/dev/vdb` and PostgreSQL on `/dev/vda1`; the archive mount root is now
0711. The original env files, fstab and scoped sudo rule passed checksum checks.
The API, web, worker, PostgreSQL and Nginx were active, public HTTPS reported
ready, and recorded service start times were unchanged. Installed backup,
monitor and notifier units were inactive. The Discord settings passed local
validation without sending a request.

The protected server rollback snapshot is
`/root/nasj-package-a-rollback.AlLB1Y`. It contains `previous.tar`, an inventory
of prior and absent paths, original modes and checksums, and the service start
time snapshot. For an approved rollback, list the archive with
`sudo tar -tf /root/nasj-package-a-rollback.AlLB1Y/previous.tar` and restore only
a reviewed prior path with `sudo tar -xpf SNAPSHOT -C / PATH_IN_ARCHIVE`.
Remove only files confirmed to have been created by A1/A4. Restore the
mount-root mode from `original.stat` (0755 before apply). Do not unmount the
volume, remove archives, restore the entire archive over unrelated files, or
remove packages without reviewing their dependents. Recheck application health
and the protected original checksums after rollback.

The database grant, restricted SSH installation/reload, and a single live
Discord delivery test remain separate operations requiring authorization.
No production backup, adoption, deployment or timer start was run.

Post-apply Ansible check mode returned 21 OK, zero changes, 10 skipped and zero
failures for the approved scope. Systemd unit validation succeeded with a
host IPv6 availability warning; the units were neither loaded for activation
nor started. Seven installed helpers matched the reviewed source checksums.

### A2, staged A3, and live Discord qualification

A2 ran the database grant playbook: three OK, one changed, zero failures. The
only ACL delta on `nasj.public._prisma_migrations` was non-grantable SELECT for
`nasj_app`. Effective SELECT is true, public-schema CREATE is false, and the
migration history checksum is unchanged. No migration ran. If separately
approved and safe for the active release, roll back as PostgreSQL administrator
in the `nasj` database with:

```sql
REVOKE SELECT ON TABLE public._prisma_migrations FROM nasj_app;
```

A3 staged three changes with zero failures: the root-owned key directory and
the two reviewed SSH files. Strict host-key administrator access and the
operator's console-with-sudo and firewall confirmations were recorded.
`sshd -t`, `visudo -c`, the key fingerprint and the on-disk effective
`sshd -T -C user=nasj-deploy,host=localhost,addr=127.0.0.1` values passed.
They show public-key authentication, password authentication disabled, no TTY,
no forwarding, and the forced command. SSH daemon PID and start time are
unchanged. The new rules have not been qualified through a live SSH session.

The root-only pre-A3 snapshot is
`/root/nasj-package-a3-rollback.GuZIma`. It contains the prior SSH configuration,
checksums for the main file, host public key and sudo policy, and daemon state.
Both deploy-specific files were absent before A3.

For a separately approved reload, keep the FelCloud recovery console and a
working admin SSH session open. From that admin session run:

```bash
sudo /usr/sbin/sshd -t && sudo systemctl reload ssh.service
```

From a second terminal verify a fresh admin login with
`ssh -o BatchMode=yes -o StrictHostKeyChecking=yes nasj true`. With the
separate deployment identity, run `ssh -o BatchMode=yes -o IdentitiesOnly=yes
-o StrictHostKeyChecking=yes -i PATH_TO_DEPLOY_KEY -l nasj-deploy nasj id`
and require exit 1 with the forced-command rejection text rather than an
authentication failure. Confirm effective TTY/forwarding denial and public
readiness. Do not send an artifact. If the new SSH configuration must be
rolled back, from the console remove only the new
`/etc/ssh/sshd_config.d/60-nasj-deploy.conf` and
`/etc/ssh/authorized_keys/nasj-deploy` (both absent originally), then run
`sudo /usr/sbin/sshd -t && sudo systemctl reload ssh.service` under rollback
authorization and verify a fresh admin login.

One authorized production-format Discord qualification was sent through the
installed notifier with the synthetic identifier
`nasj-qualification-test-not-a-real-failure.service`. Discord returned HTTP 200
with wait enabled and certificate verification result 0. The notifier provided
the production environment, UTC timestamp and disabled mentions, without
including application data. Recipient confirmation remains pending. No
persistent notification configuration changed and timers stayed disabled.

### A3 reload and live access qualification

The operator confirmed the FelCloud recovery console was open, logged in with
sudo, and would remain open. A separate strict-host-key admin SSH session was
held through validation. Read-only preflight found low load, no failed units or
matching kernel events in the prior 12 hours, and ready public HTTPS. The latest
historical soft lockup was a 45-second event at 00:56:46 UTC on 2026-11-24, with
a virtio GPU/framebuffer stack. Previous RCU stalls and other lockups remain a
stability watch item; the root cause is unconfirmed.

The authorized `sudo /usr/sbin/sshd -t && sudo systemctl reload ssh.service`
succeeded. A fresh strict-host-key admin connection and sudo passed. The
dedicated key authenticated and the forced command denied `id`; active probes
also confirmed PTY and forwarding denial, and the server offered public-key
authentication only. The forced-command wrapper has no read-only status verb,
so no deployment command or artifact was sent. No rollback was needed. The
API, web, worker, PostgreSQL and Nginx remained active and public HTTPS ready.

### Package B authorization proposal

After separate approval, from `infrastructure/ansible` using the protected
Vault command prefix above, run:

```bash
"${a[@]}" playbooks/backup.yml -e nasj_run_backup=true
```

This starts only the canonical backup oneshot, not either timer. It reads a
consistent snapshot from local PostgreSQL, encrypts it on the dedicated
volume, restores into disposable PostgreSQL 16, and writes one fresh candidate
database in the existing production Neon recovery project. It may apply the
documented retention to eligible local archive pairs; it does not delete
existing Neon recovery points. No application restart, migration, adoption
or CD activation is involved. Expect temporary CPU, I/O and network load,
plus Neon storage usage. Recheck host health and space first and stop if
kernel stalls recur.

Validate the archive SHA-256 and protected local receipt, reconcile the remote
receipt and table/migration evidence, then independently export the new Neon
candidate using a compatible client and restore into a controlled disposable
PostgreSQL 16 environment approved for production data. Do not copy unencrypted
data to the workstation or put it in logs. Recheck matching evidence, readiness
and receipt age under 24 hours against the adoption prerequisites without
invoking adoption. Stop on any mismatch; preserve previous recovery points
and do not edit receipts. If the qualified receipt is stale by the time a
maintenance window opens, require a freshly authorized recovery verification.
