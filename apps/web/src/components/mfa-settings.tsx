'use client';
import { useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { SectionShell, ResourceState, ActionForm, Input, useResource, text } from './workspace-ui';
type Security = {
  sessionVerified: boolean;
  twoFactorEnabled: boolean;
  privilegedMfaRequired: boolean;
  hasPrivilegedAccess: boolean;
};
type Enrollment = { totpURI: string; backupCodes: string[] };
const securityPath = '/api/v1/settings/security';
const mfaRequest = <T,>(
  action: 'enable' | 'verify-totp' | 'disable',
  body: Record<string, string>,
) => apiFetch<T>(`/api/auth/two-factor/${action}`, { method: 'POST', body, timeoutMs: 35000 });

export function MfaSettings({ embedded = false }: { embedded?: boolean }) {
  const resource = useResource<Security>(securityPath);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  async function startEnrollment(data: FormData) {
    setNeedsSignIn(false);
    try {
      const setup = await mfaRequest<Enrollment | null>('enable', {
        password: String(data.get('password') ?? ''),
      });
      if (!setup?.totpURI || !Array.isArray(setup.backupCodes))
        throw new ApiError(503, {
          code: 'MFA_SETUP_INCOMPLETE',
          message: 'Setup details were incomplete.',
        });
      setEnrollment(setup);
    } catch (error) {
      if (error instanceof ApiError) {
        setNeedsSignIn(
          ['ACCOUNT_UNAVAILABLE', 'REAUTHENTICATION_REQUIRED'].includes(error.detail.code),
        );
        if (error.status >= 500)
          throw new Error(
            'We couldn’t load your setup key. Select Set up authenticator to try again.',
          );
      }
      throw error;
    }
  }
  async function verifyCode(data: FormData) {
    setNeedsSignIn(false);
    try {
      await mfaRequest('verify-totp', { code: text(data, 'code') });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status < 500) throw error;
      const security = await apiFetch<Security>(securityPath).catch((failure: unknown) => {
        if (failure instanceof ApiError && failure.status === 401) setNeedsSignIn(true);
        return null;
      });
      if (!security?.sessionVerified || !security.twoFactorEnabled)
        throw new Error(
          'We couldn’t confirm verification. Keep your authenticator entry and recovery codes. If prompted to sign in again, use that authenticator.',
        );
    }
    setEnrollment(null);
    await resource.reload();
  }
  return (
    <SectionShell
      embedded={embedded}
      title="Account security."
      description="Protect your account with an authenticator app and recovery codes."
    >
      <ResourceState {...resource} retry={resource.reload} />
      {resource.data && (
        <section className="panel">
          <h2>Two-factor authentication</h2>
          <p>
            {resource.data.twoFactorEnabled
              ? 'Two-factor authentication is enabled.'
              : 'Two-factor authentication is not enabled.'}
          </p>
          {resource.data.privilegedMfaRequired && (
            <p className="notice">
              Two-factor authentication is required for privileged actions. Complete enrollment
              before managing organization access or administration.
            </p>
          )}
          {!resource.data.twoFactorEnabled && !enrollment && (
            <ActionForm label="Set up authenticator" action={startEnrollment}>
              <Input
                name="password"
                label="Password for authenticator setup"
                type="password"
                autoComplete="current-password"
                required
              />
            </ActionForm>
          )}
          {enrollment && (
            <>
              <h3>Add to your authenticator</h3>
              <p>Import this setup URI into your authenticator app. Keep it private.</p>
              <label className="field">
                <span className="label">Authenticator setup URI</span>
                <input readOnly value={enrollment.totpURI} autoComplete="off" />
              </label>
              <h3>Save your recovery codes</h3>
              <p>
                Store these codes somewhere private. Each code can be used once if you lose access
                to the authenticator.
              </p>
              <pre className="recovery-codes">{enrollment.backupCodes.join('\n')}</pre>
              <ActionForm label="Confirm authenticator code" action={verifyCode}>
                <Input name="code" label="Six-digit authenticator code" required />
              </ActionForm>
            </>
          )}
          {resource.data.twoFactorEnabled && !resource.data.sessionVerified && (
            <ActionForm label="Verify this session" action={verifyCode}>
              <Input name="code" label="Authenticator code for this session" required />
            </ActionForm>
          )}
          {resource.data.twoFactorEnabled &&
            resource.data.hasPrivilegedAccess &&
            resource.data.privilegedMfaRequired && (
              <p>Your privileged access requires two-factor authentication to remain enabled.</p>
            )}
          {resource.data.twoFactorEnabled &&
            !(resource.data.hasPrivilegedAccess && resource.data.privilegedMfaRequired) && (
              <ActionForm
                label="Disable two-factor authentication"
                confirm="Disable two-factor authentication? Privileged operations will require re-enrollment."
                onSuccess={resource.reload}
                action={(data) =>
                  mfaRequest('disable', { password: String(data.get('password') ?? '') })
                }
              >
                <Input
                  name="password"
                  label="Password to disable two-factor authentication"
                  type="password"
                  required
                />
              </ActionForm>
            )}
          {needsSignIn && (
            <p>
              <Link href="/auth/login?next=%2Fsettings%2Fprofile">Sign in again</Link> to continue
              setting up two-factor authentication.
            </p>
          )}
        </section>
      )}
    </SectionShell>
  );
}
