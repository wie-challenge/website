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

Populate `nasj_backup_files` with the following multiline entries. Do not use the
qualification Neon endpoint or expose the values in chat, command arguments, or diffs.

| Key | Required input |
| --- | --- |
| `backup.recipients` and `backup.identity` | Production Age recipient and its verification identity. Agree custody first and keep an independently recoverable copy in the operator's password vault or encrypted storage. Keep the Vault unlock material recoverable separately from the encrypted file. |
| `backup-neon.conf` | Existing production recovery project's direct `PGHOST`, dedicated `PGUSER`, and `PGDATABASE=neondb`. The role must connect and create candidates. Leave traditional negotiation at its default. |
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
  After separate consent, remove `--check`. Verify with
  `SELECT has_table_privilege('nasj_app','public._prisma_migrations','SELECT'), has_schema_privilege('nasj_app','public','CREATE');`
  in `nasj`; expect true and false. Rollback, if separately approved and before
  deploying software that needs the grant, is
  `REVOKE SELECT ON TABLE public._prisma_migrations FROM nasj_app;`.
- **A3:** Administrator SSH works with strict host-key checking. Provider firewall
  and independent console login are unverified. In FelCloud, open the existing VPS
  remote console, confirm login without relying on SSH, compare the host's
  `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` with the pinned host key, and
  review provider firewall rules. Keep the console and an independent admin SSH
  session open. Supply the dedicated public key as `nasj_deploy_public_key` and set
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
  `sudo /usr/local/libexec/nasj-notify nasj-qualification.service`; confirm delivery
  with the recipient. Do not enable timers. Roll back only the new
  `notify.curl` or restore its previous protected copy; if schedules are ever
  activated, stop and disable them under the applicable authorization.

Package B still requires a canonical live backup, independent Neon restore, and a
fresh verified off-host receipt. Package C still requires that receipt and separately
authorized maintenance, exact artifact deployment and rollback verification.
