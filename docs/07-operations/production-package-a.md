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
