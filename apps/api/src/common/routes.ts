const exact = new Set([
  '/api/health/live',
  '/api/health/ready',
  '/api/v1/me',
  '/api/v1/me/sessions',
  '/api/v1/me/deactivate',
  '/api/v1/admin/users',
  '/api/auth/sign-in/email',
  '/api/auth/sign-up/email',
  '/api/auth/sign-out',
  '/api/auth/get-session',
  '/api/auth/request-password-reset',
  '/api/auth/reset-password',
  '/api/auth/send-verification-email',
  '/api/auth/verify-email',
  '/api/auth/change-password',
  '/api/auth/change-email',
  '/api/auth/two-factor/enable',
  '/api/auth/two-factor/disable',
  '/api/auth/two-factor/verify-totp',
  '/api/auth/two-factor/verify-backup-code',
  '/api/v1/settings/security',
  '/api/v1/settings/preferences',
  '/api/v1/notifications/preferences',
  '/api/v1/organizations',
  '/api/v1/invitations/accept',
  '/api/v1/consents',
  '/api/v1/privacy/requests',
  '/api/v1/privacy/requests/me',
  '/api/v1/privacy/export',
  '/api/v1/support/cases',
  '/api/v1/admin/support/cases',
  '/api/v1/admin/privacy-requests',
  '/api/v1/admin/audit-events',
  '/api/v1/admin/organizations',
  '/api/v1/admin/organizations/pending',
  '/api/v1/artisans/me',
  '/api/v1/artisans/assisted',
  '/api/v1/craft-skills',
  '/api/v1/associations',
  '/api/v1/me/responsibilities',
  '/api/v1/me/sessions/revoke-others',
]);
export function routeLabel(path: string) {
  if (exact.has(path)) return path;
  if (/^\/api\/v1\/me\/sessions\/[^/]+$/.test(path)) return '/api/v1/me/sessions/:id';
  if (/^\/api\/v1\/admin\/users\/[^/]+$/.test(path)) return '/api/v1/admin/users/:id';
  if (/^\/api\/v1\/users\/[^/]+$/.test(path)) return '/api/v1/users/:id';
  const templates = [
    /^\/api\/v1\/organizations\/[^/]+(?:\/(?:submit-approval|members|invitations|audit-events))?$/,
    /^\/api\/v1\/organizations\/[^/]+\/(?:members|invitations)\/[^/]+(?:\/(?:roles|resend))?$/,
    /^\/api\/v1\/admin\/organizations\/[^/]+(?:\/(?:approve|reject|suspend))?$/,
    /^\/api\/v1\/admin\/privacy-requests\/[^/]+$/,
    /^\/api\/v1\/support\/cases\/[^/]+(?:\/notify)?$/,
    /^\/api\/v1\/consents\/[^/]+$/,
    /^\/api\/v1\/artisans\/(?:me|[^/]+)(?:\/(?:skills|capacity|associations|delegations))?(?:\/[^/]+(?:\/coordinators)?)?$/,
  ];
  if (templates.some((pattern) => pattern.test(path))) {
    const literals = new Set([
      'api',
      'v1',
      'organizations',
      'members',
      'invitations',
      'roles',
      'resend',
      'submit-approval',
      'audit-events',
      'admin',
      'approve',
      'reject',
      'suspend',
      'privacy-requests',
      'support',
      'cases',
      'notify',
      'consents',
      'artisans',
      'me',
      'skills',
      'capacity',
      'associations',
      'delegations',
      'coordinators',
    ]);
    return path
      .split('/')
      .map((segment) => (segment && !literals.has(segment) ? ':id' : segment))
      .join('/');
  }
  return '/api/[unknown]';
}
