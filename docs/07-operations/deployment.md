# Production deployment and recovery

GitHub Actions runs quality, security, integration, browser and build checks. A successful
main build packages the application with its locked dependencies and smoke-tests the extracted
release with disposable PostgreSQL 16. The deployment job uses the same artifact ID and
SHA-256. The server runs the existing systemd services and does not build from source.

GitHub requires the aggregate `required` check on main, including for administrators.
Maintainers can review and merge their own pull requests after CI passes. Force pushes and
deletion are disabled. Keep `PRODUCTION_DEPLOY_ENABLED` unset through qualification. The production
Environment restricts deployment to main and holds the dedicated SSH credentials and endpoint
variables. Verify the digest from the reviewed build before authorizing deployment.

## Server preparation

Verify an encrypted off-host PostgreSQL backup by restoring it to an isolated PostgreSQL 16
instance. Schedule the cutover after that drill. Preserve the existing database, Nginx, TLS,
systemd units and runtime configuration. Use the verified template in
[deploy.conf.example](../../deploy/deploy.conf.example). Never overwrite existing secrets with
template values.

Install the following files from the reviewed revision as root-owned, mode 0755:

- `scripts/deploy/deploy.sh` at `/usr/local/sbin/nasj-deploy`.
- `scripts/deploy/extract-release.py` at `/usr/local/libexec/nasj-extract-release.py`.
- `scripts/deploy/ssh-command.sh` at `/usr/local/libexec/nasj-ssh-command`.

Create root-owned `/etc/nasj` mode 0711 and put the root-owned deploy config there at mode
0600. Create root-owned `/etc/nasj/releases`, `/etc/nasj/approvals`, `/var/lib/nasj-deploy`
and `/var/log/nasj-deploy` at mode 0700. Create `/srv/nasj-releases` at mode 0755 on the
same filesystem as `/srv`. Copy existing runtime and migration credentials privately
to the configured paths with mode 0640 and separate runtime and migration groups. The runtime
database role needs read access to migration history and must lack schema ownership.

Use a dedicated SSH user and the public half of the Actions key. Keep its authorized keys
in a root-owned path. Prefix the key with
`restrict,command="/usr/local/libexec/nasj-ssh-command"`. Disable password login, TTY and
forwarding for that user in sshd. The only sudo permission is
`nasj-deploy ALL=(root) NOPASSWD: NOSETENV: /usr/local/sbin/nasj-deploy *`, with
`env_reset`. Validate with `visudo -c` and `sshd -t`. Test restricted key behavior and
administrator access before the cutover.

## Adoption and release

Hold the lock at `/var/lib/nasj-deploy/deploy.lock`. Confirm the previous release path,
then stop the worker, API and web. Move the existing real `/srv/nasj` directory to an
unused path under `/srv/nasj-releases` and link `/srv/nasj` to it. Start API and web,
verify local API and web readiness plus public HTTPS readiness, then start and verify
the worker. If adoption fails, restore the original directory path and restart the
original services before proceeding.

Authorize the exact reviewed artifact by writing `sha256:ARTIFACT_SHA256` into
`/etc/nasj/releases/FULL_SHA`. Once the host and governance checks are complete, set
`PRODUCTION_DEPLOY_ENABLED=true` for eligible main runs. A job that failed awaiting
authorization can be retried against its original artifact while it remains available.

For pending migrations, additionally record
`expand-contract PREVIOUS_FULL_SHA sha256:ARTIFACT_SHA256` in
`/etc/nasj/approvals/FULL_SHA`. Review compatibility with both app versions. Install
a root-owned executable `/etc/nasj/backup-before-migrate` that accepts the candidate SHA
and succeeds only after it has verified the required encrypted off-host backup. A missing
or failed hook blocks migration. Deployment never reverses database migrations.

## Recovery

The deploy helper attempts application rollback on restart, readiness or worker failure.
Inspect protected deployment logs and the three service journals, and verify HTTPS
readiness and worker status. A failed rollback or interrupted switch requires an operator.
Under the deployment lock, inspect `/var/lib/nasj-deploy/pending` for previous and candidate
paths. If there is no pending marker, use the recorded `previous` path and check it
against the live symlink. Confirm the rollback target is under `/srv/nasj-releases`
and compatible with the current schema. Stop the worker, atomically replace the live link
using a temporary symlink beside it, restart API and web, and verify local and public
readiness before starting the worker. Reconcile the current and previous state files and
archive the pending marker only after verification. Investigate migration state separately
when failure occurred during migration.

See [infrastructure qualification](infrastructure-qualification.md) for the audit, Ansible, backup, and cutover procedures.
