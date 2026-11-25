# D6 hosted plan-only provisioning proposal

The disposable guest qualified the existing Ansible check-mode sequence.
The current hosted workflow combines plan and apply and uses SSH credentials
that can run Ansible with elevation. Do not give that identity to a plan-only
job. Check mode controls normal playbook behavior, not the credential's
ability to write.

Before creating credentials on FelCloud, review a separate workflow and
root-owned fixed probe in the disposable guest. The probe must accept exactly
one fixed `plan` verb, no caller-supplied playbook, paths, variables or shell
fragments. Deny shell, password, TTY and forwarding access. The plan account
must have no administrative group membership and either no sudo or one
specific root-owned command with no arguments or environment overrides.
Limit output to approved facts: package versions, mount and unit metadata,
protected-file modes and hashes (never their contents), and bounded health
results. The hosted workflow compares those facts against reviewed desired
configuration; it does not run privileged arbitrary Ansible on FelCloud.
Keep the apply workflow and credentials separate and disabled.

Operator steps, after reviewing the proposed plan-only workflow:

1. In GitHub repository **Settings → Environments**, create
   `production-infrastructure-plan`. Select **Selected branches and tags**,
   add only branch `main`, leave tags out, and require approval from a designated
   reviewer. Disable administrator bypass if available. If independent review
   is required by policy, name a second trusted account and prevent self-review.
2. Approve installation of the dedicated `nasj-infra-plan` account and forced
   probe after verifying independent console access. Make the key and SSH
   configuration installation and reload separately authorized. Do not reuse
   `nasj-deploy`, the admin identity or the future infrastructure apply key.
3. Generate a dedicated Ed25519 key in a private directory (0700), provision
   only the public key with the forced restriction, and compare the server host
   public-key fingerprint against the already verified console. Store the private
   key as Environment secret `INFRA_PLAN_SSH_KEY` and the pinned host entry as
   `INFRA_PLAN_KNOWN_HOSTS`. Set non-secret Environment variables
   `INFRA_PLAN_HOST` and `INFRA_PLAN_PORT`. Do not provide an apply key,
   sudo password, raw Ansible extra vars or production secrets to the plan job.
4. In the disposable guest, prove that arbitrary commands, alternate verbs,
   forwarding, TTY, and privileged writes fail while the fixed read-only
   operation succeeds. Compare protected hashes, timestamps and service
   start times before and after.
5. Authorize one hosted plan-only run after workflow and credential review.
   Leave `INFRA_WORKFLOW_ENABLED` unset; it controls the existing apply-capable
   workflow. Do not apply infrastructure. Review the sanitized result before
   separately considering apply credentials or activation.

Manual input needed: the designated reviewer(s) and whether independent
review is required; operator confirmation of the Environment protections
and the trusted host fingerprint; and separate approval for installing the
reviewed plan identity and dispatching the first hosted plan. No production
account, Environment or secrets were created by this proposal.

## Reviewed fixture and exact provisioning

The isolated files are `scripts/ops/infra-plan-ssh-command.sh`,
`scripts/ops/infra-plan-probe.py`, and
`.github/workflows/infrastructure-plan-only.yml`. The workflow is input-free,
uses no GitHub token permissions and never checks out code or invokes an apply
workflow. Its output is a bounded list of findings for services, protected
file metadata, mount isolation, release shape and pending state. Missing or
bad facts fail the job or appear as findings. It is a scoped drift report,
not a full privileged Ansible dry run.

After separate approval, the operator prepares the private key with
`ssh-keygen -t ed25519 -f PRIVATE_DIRECTORY/nasj-infra-plan -C nasj-infra-plan`.
Set a main-only branch policy and required reviewers on
`production-infrastructure-plan`; the operator selects the reviewer and
verifies they can approve independently. Confirm the host key in the FelCloud
recovery console using `sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`.
Compare it against the already trusted local known-hosts entry (include the
port in the host field when nonstandard). Never use a fresh network scan as
the sole source of trust.

On FelCloud, the separately approved installation would use root:root 0755
for both helpers at `/usr/local/libexec/nasj-infra-plan-ssh-command` and
`/usr/local/libexec/nasj-infra-plan-probe`. The dedicated system user has no
home or administrative group. Root owns
`/etc/ssh/authorized_keys/nasj-infra-plan` and
`/etc/ssh/sshd_config.d/61-nasj-infra-plan.conf`, both 0644. The authorized
key starts with `restrict,command="/usr/local/libexec/nasj-infra-plan-ssh-command"`;
the Match block sets that ForceCommand, public-key-only authentication,
`DisableForwarding yes` and `PermitTTY no`. The one permitted sudo command,
in root-owned 0440 `/etc/sudoers.d/nasj-infra-plan`, is:

```sudoers
Defaults:nasj-infra-plan env_reset
nasj-infra-plan ALL=(root) NOPASSWD: NOSETENV: /usr/local/libexec/nasj-infra-plan-probe ""
```

The empty quoted argument list matters: arbitrary arguments are not permitted.
Validate with `visudo -c` and `sshd -t`. Reload only under separate authority
with console and admin session open. Once approved, add only the plan key and
verified known-hosts value to the Environment secrets named above, set
the two endpoint variables, and dispatch
`gh workflow run infrastructure-plan-only.yml --ref main` once. No global flag
is required for this separate workflow. Revoke by removing the plan key
from the Environment and host authorized-keys file; remove the plan-specific
sudo and SSH drop-in files under authorization, validate and reload SSH from
the console. Leave application SSH settings untouched.

The disposable Ubuntu guest verified the real forced-command login and scoped
output. Arbitrary and extra-argument commands, TTY, forwarding and general
sudo were denied. Sampled protected hashes and service start timestamps stayed
unchanged. No production identity or hosted plan was created.
