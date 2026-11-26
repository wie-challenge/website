# NASJ AI pilot provisioning and rollback

AI-P1 and AI-P2 cover synthetic qualification only. Production apply,
live replies and unattended AI deployment each require separate approval.

## Inputs and release

- Review the exact website and AI revisions, the role, and the disposable
  capacity results. Keep website D5 and the AI and D6 approval boundaries
  independent.
- Use the approved Ubuntu 24.04 package source and record the RabbitMQ
  and Erlang package versions before applying. The broker, Erlang
  distribution and epmd listeners must all bind to loopback. Keep
  RabbitMQ state on its default root-backed location, not the backup volume.
- Generate four independent broker passwords. Store them only in the
  operator secret store, create their RabbitMQ SHA-256 salted hashes, and
  put the hashes plus the website worker AMQP URL in an encrypted Ansible
  Vault. The four account names are `website_api`, `website_worker`,
  `legacy_client`, and `legacy_worker`. Generate random alphanumeric
  passwords or correctly URL-encode reserved characters. The operator's
  website publisher password remains separate from the worker credential.
  RabbitMQ hashes use four random salt bytes followed by SHA-256 of salt
  concatenated with the password, encoded as Base64. Use Vault keys
  `ai_assistant_password_hashes` and `ai_assistant_worker_amqp_url`.
- Build the reviewed AI commit with Python 3.12 on Ubuntu 24.04 x86_64.
  Use locked `uv export --no-dev --no-emit-project` output with hashes,
  `uv build --wheel`, and a binary wheelhouse for all locked runtime
  dependencies. Include `SHA256SUMS`, the exact source SHA, and the tested
  platform in the manifest. Publish a single artifact after successful CI
  and record artifact ID, runner workflow/run/attempt and archive digest.
  The production operator independently verifies the successful run and
  archive digest and approves that exact tuple. Existing website deploy
  credentials, signing or replay state have no role in this approval.
- Verify the archive and its manifest on the host before extracting.
  Reject unexpected paths, links and duplicate entries. Create a root-owned
  versioned directory below `/srv/nasj-ai-releases`. Build the venv there
  using the exact verified wheelhouse with `pip --no-index --require-hashes`
  for dependencies and install the verified application wheel with
  `--no-deps`. Perform the build as an unprivileged installer, then lock
  ownership down so the service account cannot modify its release.
  Under an AI-specific lock, atomically point `/srv/nasj-ai/current` at the
  candidate release. Keep the approved artifact and previous release.
  The role expects `/srv/nasj-ai/current/venv/bin/python` to exist.

## Reviewed production steps after approval

1. Prepare an explicit inventory group `nasj_ai_pilot` for the approved
   target. Use `infrastructure/ansible` as the working directory.
2. Run `ansible-playbook -i "$inventory" playbooks/ai-assistant.yml --check -e "@$vault"`
   and review output privately. The playbook is separate from the normal
   production configure workflow. Actual application requires explicit
   approval. Keep `ai_assistant_start=false` during installation and
   qualification review, then run with `-e ai_assistant_start=true`
   only during the approved service start.
3. Verify both vhosts and queue isolation, broker connection permissions,
   loopback-only listeners, memory and CPU caps, and the active monitor.
   Bring up only `nasj-ai-worker`; no legacy worker, Redis or model
   service starts. The role enforces the fake provider and the worker
   service restricts networking to loopback.
4. Run a synthetic fake-provider HTTP round trip in a private
   qualification context. Keep live public replies off. Review any
   provider architecture, credentials, spend and prompt-data policy
   before changing the pilot service or enabling live replies.
5. For a future approved website connection, store only the
   `website_api` AMQP URL in the protected existing API runtime
   configuration. Enable the switch under the approved change and verify
   that failures recover to the labeled guide as intended.

## Stop and recover

Keep pending errors, logs and prior releases. Disable live integration
with `ASSISTANT_LIVE_ENABLED=false` and restart only the API in the approved
window. Confirm the guide and website readiness. To isolate the pilot,
stop `nasj-ai-monitor.timer` and `nasj-ai-worker.service`, then stop
`rabbitmq-server.service` if necessary. Restart the broker and worker
together after a planned broker stop. Preserve definitions and logs.
Restore the verified previous AI symlink under an AI-specific lock and
restart only the AI worker. Confirm a synthetic reply before any approved
reconnection. Website D5 rollback is needed only if the website release
itself regresses.

The default exchange requires exchange-wide publish permission within a
vhost. Restrict credentials to those vhosts and use a different named
exchange design if finer publisher isolation is required. The v1 worker
does not receive cancellation while waiting for the first provider
event. It stops when the reply queue is gone or the deadline expires.
Legacy worker quota waits and redelivery remain outside the pilot. The
single broker shares the root filesystem and failure domain with the
application. Queue limits, rate-limited rotating logs and disk alarms
bound the pilot; they do not provide a dedicated disk quota or HA.

## Disposable qualification, 26 November 2026

**Contract passed. Capacity gate failed. Production provisioning stays
on hold.** The guest ran Ubuntu 24.04 with two vCPUs, 3,936 MiB configured
RAM, PostgreSQL 16 and the archive-verified native website release
bundles `d63a7aa` and `65ef683`. It used a synthetic migrated database,
a fake model provider, and no real Arcjet, SMTP, Neon or Discord accounts.
The canonical backup wrote an Age-encrypted local archive and verified
its restore. It performed no remote backup. Guest storage and the
synthetic dataset are smaller than production.

- Broker contract probes passed English, French and Arabic, three
  parallel replies, mismatched correlation, expiry, cross-vhost login
  denial and protocol queue isolation. With the worker stopped, the
  broker rejected message 101. The dedicated worker restarted and
  served requests again.
- The authenticated HTTP integration test passed over the actual broker.
  The tests exercised the switch-off and unreachable broker responses
  before streaming, and a synthetic provider fixture exercised first-event
  failure, timeout, partial reply failure and disconnect/reuse. Client
  parsing tests verified the labeled-guide trigger only applies before
  streaming and that a partial stream cannot be treated as complete.
- Ansible finished successfully and the second apply reported
  `ok=16 changed=0 failed=0`. AMQP, epmd and Erlang distribution listened
  on loopback. The worker used its systemd credential, and the legacy
  worker and Redis were inactive. A stopped-worker alert passed via the
  existing HTTPS notifier to a certificate-validated disposable
  Discord-format receiver. No production notification was sent.

| Measurement | Steady baseline | Deployment + backup + assistant load | Deployment + backup, no assistant load |
|---|---:|---:|---:|
| Nginx website p50 / p95 / p99, ms | 3.90 / 6.74 / 15.76 | 3.87 / 11.20 / 20.55 | 3.87 / 12.28 / 15.73 |
| Failed API readiness probes / total | 0 / 177 | 4 / 255 | 4 / 216 |
| Failed website probes | 0 | 1 | 1 |
| PostgreSQL `SELECT 1` p95, ms | 34.05 | 36.45 | 45.47 |
| Peak sampled guest CPU | 79.02% | 81.16% | 71.92% |
| Minimum memory available | 2,701 MiB | 2,553 MiB | 2,509 MiB |
| Peak sampled broker / worker cgroup memory | 142.4 / 38.0 MiB | 135.2 / 38.3 MiB | 134.2 / 38.1 MiB |
| Peak I/O pressure avg10, some / full | 2.44% / 1.32% | 2.64% / 2.00% | 0.98% / 0.82% |
| Backup wall time | — | 3.44 s | 3.13 s |

The loaded run delivered 534 replies at 19.97 / 40.69 / 98.52 ms
assistant p50 / p95 / p99. A periodic sample during that run saw zero
ready or unacknowledged messages and one consumer. It does not establish
the queue's peak. No OOM events or failed PostgreSQL probes occurred.
The loaded deployment completed in 17.23 seconds and the backup passed.
All failed readiness probes clustered in the API restart window, which
also failed in the control. Starting the API and web on the new release
before switching traffic is the proposed correction for the zero-failure
gate. Qualify that change separately to D5, then repeat matched load and
control trials. The loaded website p95 was about 66% above the steady
baseline and below the one cutover control. These runs do not isolate an
AI resource bottleneck or establish capacity for live inference.
