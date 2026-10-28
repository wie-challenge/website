import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionException,
  exceptionBlocksReadiness,
  scheduleRevisionEffect,
  counterofferCreatesAgreement,
  availabilityPauseEffects,
  canTransitionTicket,
  notificationPlan,
  sanitizeDiscussionBody,
  localizedNotification,
  availabilityPauseSchema,
} from '@nasj/contracts';

test('exception lifecycle follows the documented order and a coordinator can close', () => {
  assert.equal(canTransitionException('OPEN', 'ACKNOWLEDGED'), true);
  assert.equal(canTransitionException('ACKNOWLEDGED', 'UNDER_REVIEW'), true);
  assert.equal(canTransitionException('UNDER_REVIEW', 'RESOLVED'), true);
  assert.equal(canTransitionException('RESOLVED', 'CLOSED'), true);
  assert.equal(
    canTransitionException('CLOSED', 'OPEN'),
    false,
    'a closed exception is not reopened',
  );
  assert.equal(canTransitionException('OPEN', 'RESOLVED'), false);
});

test('only a critical unresolved material shortage blocks readiness', () => {
  assert.equal(
    exceptionBlocksReadiness({
      category: 'MATERIAL_SHORTAGE',
      severity: 'CRITICAL',
      state: 'OPEN',
    }),
    true,
  );
  assert.equal(
    exceptionBlocksReadiness({ category: 'MATERIAL_SHORTAGE', severity: 'LOW', state: 'OPEN' }),
    false,
  );
  assert.equal(
    exceptionBlocksReadiness({ category: 'PRODUCTION_DELAY', severity: 'CRITICAL', state: 'OPEN' }),
    false,
  );
  assert.equal(
    exceptionBlocksReadiness({
      category: 'MATERIAL_SHORTAGE',
      severity: 'CRITICAL',
      state: 'RESOLVED',
    }),
    false,
  );
});

test('a proposed schedule change does not alter the contractual deadline until approved', () => {
  const pending = scheduleRevisionEffect({
    status: 'PENDING_APPROVAL',
    previousDeadline: '2026-11-12T17:00:00.000+01:00',
    proposedDeadline: '2026-11-19T17:00:00.000+01:00',
  });
  assert.equal(pending.applied, false);
  assert.equal(pending.effectiveDeadline, '2026-11-12T17:00:00.000+01:00');
  assert.equal(pending.requiresBuyerApproval, true);
  assert.equal(pending.deltaDays, 7);
  const approved = scheduleRevisionEffect({
    status: 'APPROVED',
    previousDeadline: '2026-11-12T17:00:00.000+01:00',
    proposedDeadline: '2026-11-19T17:00:00.000+01:00',
  });
  assert.equal(approved.applied, true);
  assert.equal(approved.effectiveDeadline, '2026-11-19T17:00:00.000+01:00');
  const earlier = scheduleRevisionEffect({
    status: 'APPROVED',
    previousDeadline: '2026-11-19T17:00:00.000+01:00',
    proposedDeadline: '2026-11-12T17:00:00.000+01:00',
  });
  assert.equal(
    earlier.requiresBuyerApproval,
    true,
    'an earlier date also changes contractual obligations',
  );
});

test('a counteroffer is never an agreement', () => {
  assert.equal(counterofferCreatesAgreement('PROPOSED'), false);
  assert.equal(counterofferCreatesAgreement('MANAGER_REVIEW'), false);
  assert.equal(counterofferCreatesAgreement('DECLINED'), false);
  assert.equal(counterofferCreatesAgreement('ARTISAN_ACCEPTED'), true);
});

test('availability pause preserves commitments and fairness eligibility', () => {
  const effects = availabilityPauseEffects({ paused: true, hasAcceptedCommitments: true });
  assert.equal(effects.blocksNewOffers, true);
  assert.equal(effects.preservesAcceptedCommitments, true);
  assert.equal(effects.affectsFairnessEligibility, false);
  assert.equal(effects.acceptedCommitmentsUnchanged, true);
});

test('support ticket lifecycle reaches closure only through resolution', () => {
  assert.equal(canTransitionTicket('OPEN', 'IN_PROGRESS'), true);
  assert.equal(canTransitionTicket('IN_PROGRESS', 'RESOLVED'), true);
  assert.equal(canTransitionTicket('RESOLVED', 'CLOSED'), true);
  assert.equal(canTransitionTicket('CLOSED', 'OPEN'), false);
  assert.equal(canTransitionTicket('OPEN', 'CLOSED'), true, 'a duplicate may be closed directly');
});

test('notifications never claim delivery without an opted-in channel and provider', () => {
  const noPreference = notificationPlan({
    category: 'NEW_OFFER',
    preference: null,
    providerConfigured: false,
  });
  assert.equal(noPreference.deliver, false);
  assert.equal(noPreference.status, 'SKIPPED_NO_OPT_IN');
  const noProvider = notificationPlan({
    category: 'NEW_OFFER',
    preference: { channel: 'EMAIL', optedIn: true },
    providerConfigured: false,
  });
  assert.equal(noProvider.deliver, false);
  assert.equal(noProvider.status, 'UNDELIVERABLE_NO_PROVIDER');
  const inApp = notificationPlan({
    category: 'NEW_OFFER',
    preference: { channel: 'IN_APP', optedIn: true },
    providerConfigured: false,
  });
  assert.equal(inApp.deliver, true);
  assert.equal(inApp.status, 'PENDING');
});

test('discussion bodies are sanitised before display', () => {
  const raw = '  <script>alert(1)</script>Hello\u0007 world  ';
  const safe = sanitizeDiscussionBody(raw);
  assert.ok(!safe.includes('<script>'), 'markup is stripped');
  assert.ok(!safe.includes('\u0007'), 'control characters are stripped');
  assert.ok(safe.includes('Hello world'));
  assert.equal(sanitizeDiscussionBody('x'.repeat(5000)).length, 4000, 'bounded length');
});

test('a schedule change is not applied until both parties approve', () => {
  const awaiting = scheduleRevisionEffect({
    status: 'AWAITING_ARTISAN',
    previousDeadline: '2026-11-12T17:00:00.000+01:00',
    proposedDeadline: '2026-11-19T17:00:00.000+01:00',
  });
  assert.equal(awaiting.applied, false);
  assert.equal(awaiting.effectiveDeadline, '2026-11-12T17:00:00.000+01:00');
});

test('withdrawal and escalation preserve the case lifecycle', () => {
  assert.equal(canTransitionTicket('OPEN', 'WITHDRAWN'), true);
  assert.equal(canTransitionTicket('IN_PROGRESS', 'ESCALATED'), true);
  assert.equal(canTransitionTicket('ESCALATED', 'RESOLVED'), true);
  assert.equal(canTransitionTicket('WITHDRAWN', 'IN_PROGRESS'), false);
});
test('pause accepts an effective date and no justification', () => {
  assert.equal(availabilityPauseSchema.parse({ effectiveFrom: '2027-01-01T00:00:00Z' }).reason, '');
});
test('notifications localize generic content without exposing facts', () => {
  assert.equal(localizedNotification('SUPPORT_CASE_UPDATE', 'fr').locale, 'fr');
  assert.equal(localizedNotification('SUPPORT_CASE_UPDATE', 'ar').locale, 'ar');
  assert.equal(localizedNotification('SUPPORT_CASE_UPDATE', 'unsupported').locale, 'en');
  assert.notEqual(
    localizedNotification('SUPPORT_CASE_UPDATE', 'en').body,
    localizedNotification('SUPPORT_CASE_UPDATE', 'fr').body,
  );
});
