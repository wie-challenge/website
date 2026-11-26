const exact = new Set([
  '/api/v1/assistant/chat',
  '/api/v1/me/context',
  '/api/v1/authorization-policies',
  '/api/v1/admin/authorization-policies',
  '/api/v1/associations/me',
  '/api/v1/associations/me/coordinators',
  '/api/v1/associations/me/artisans',
  '/api/v1/admin/coordinators',
  '/api/v1/admin/operators',
  '/api/v1/admin/access-report',
  '/api/v1/admin/personnel/invite',
  '/api/v1/admin/operator-assignments',
  '/api/v1/operator/dashboard',
  '/api/v1/operator/activity',
  '/api/v1/participant-concerns',
  '/api/v1/admin/participant-concerns',
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
  '/api/v1/market/files',
  '/api/v1/market/organizations',
  '/api/v1/market/products',
  '/api/v1/market/products/mine',
  '/api/v1/market/products/review',
  '/api/v1/market/products/import',
  '/api/v1/market/cart',
  '/api/v1/market/billing',
  '/api/v1/market/cart/invoice.pdf',
  '/api/v1/market/cart/checkout',
  '/api/v1/market/orders',
  '/api/v1/market/orders/custom',
  '/api/v1/market/payments',
  '/api/v1/market/counts',
  '/api/v1/market/notifications',
  '/api/v1/market/notifications/read',
  '/api/v1/market/associations',
  '/api/v1/market/women',
  '/api/v1/market/crafts',
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
  if (/^\/api\/v1\/procurement(?:\/|$)/.test(path)) {
    const words = new Set([
      'api',
      'v1',
      'procurement',
      'rfqs',
      'documents',
      'products',
      'activity',
      'revisions',
      'submit',
      'review',
      'attachments',
      'remove',
      'token',
      'content',
      'questions',
      'answer',
      'thread',
      'samples',
      'sample-decisions',
      'quotes',
      'accept',
      'download',
      'status',
      'reorder',
    ]);
    return path
      .split('/')
      .map((s) => (s && !words.has(s) ? ':id' : s))
      .join('/');
  }
  if (exact.has(path)) return path;
  if (/^\/api\/v1\/me\/sessions\/[^/]+$/.test(path)) return '/api/v1/me/sessions/:id';
  if (/^\/api\/v1\/admin\/users\/[^/]+$/.test(path)) return '/api/v1/admin/users/:id';
  if (/^\/api\/v1\/users\/[^/]+$/.test(path)) return '/api/v1/users/:id';
  if (/^\/api\/v1\/market\/files\/[^/]+$/.test(path)) return '/api/v1/market/files/:id';
  if (/^\/api\/v1\/market\/track\/[^/]+$/.test(path)) return '/api/v1/market/track/:token';
  const marketItem =
    /^\/api\/v1\/market\/(products|cart|women)\/[^/]+(?:\/(archive|review))?$/.exec(path);
  if (marketItem)
    return `/api/v1/market/${marketItem[1]}/:id${marketItem[2] ? `/${marketItem[2]}` : ''}`;
  if (/^\/api\/v1\/market\/orders\/[^/]+\/artisanes\/[^/]+\/(paid|payment-check)$/.test(path))
    return `/api/v1/market/orders/:id/artisanes/:id/${path.split('/').at(-1)}`;
  if (
    /^\/api\/v1\/market\/orders\/[^/]+(?:\/(invoice\.pdf|qr\.png|cancel|route|accept|decline|price|finance-price|company-price|assign|almost-ready|send-to-nasj|arrived|quality|pack|confirm|rate|invoice-check))?$/.test(
      path,
    )
  ) {
    const action = path.split('/')[6];
    return action ? `/api/v1/market/orders/:id/${action}` : '/api/v1/market/orders/:id';
  }
  const marketAction = /^\/api\/v1\/market\/organizations\/[^/]+\/(review|submit)$/.exec(path);
  if (marketAction) return `/api/v1/market/organizations/:id/${marketAction[1]}`;
  const templates = [
    /^\/api\/v1\/associations\/me\/artisans\/[^/]+(?:\/(?:skills|capacity|authorization|assignments)(?:\/[^/]+\/withdraw)?)?$/,
    /^\/api\/v1\/admin\/(?:coordinators|artisans|authorization-policies|participant-concerns)\/[^/]+(?:\/(?:status|transfer|assignment|link-account))?$/,
    /^\/api\/v1\/operator\/organizations\/[^/]+\/(?:participants|duplicate-reviews)$/,
    /^\/api\/v1\/organizations\/[^/]+\/members\/[^/]+\/permissions$/,

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
      'authorization-policies',
      'participant-concerns',
      'status',
      'transfer',
      'assignment',
      'assignments',
      'link-account',
      'operator',
      'participants',
      'duplicate-reviews',
      'permissions',
      'capacity',
      'authorization',
      'withdraw',
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
