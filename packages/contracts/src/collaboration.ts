import { z } from 'zod';

/**
 * Operational collaboration: exceptions, schedule revisions, counteroffers, availability pauses,
 * support tickets and notifications. Pure rules live here; persistence and authorization live in
 * the API. Nothing in this module accepts work on an artisan's behalf.
 */

export const exceptionCategories = [
  'MATERIAL_SHORTAGE',
  'PRODUCTION_DELAY',
  'EQUIPMENT_PROBLEM',
  'INCORRECT_INSTRUCTIONS',
  'QUALITY_CONCERN',
] as const;
export type ExceptionCategory = (typeof exceptionCategories)[number];

export const exceptionStates = [
  'OPEN',
  'ACKNOWLEDGED',
  'UNDER_REVIEW',
  'ACTION_REQUIRED',
  'RESOLVED',
  'CLOSED',
] as const;
export type ExceptionState = (typeof exceptionStates)[number];

const exceptionTransitions: Record<ExceptionState, ExceptionState[]> = {
  OPEN: ['ACKNOWLEDGED', 'UNDER_REVIEW', 'CLOSED'],
  ACKNOWLEDGED: ['UNDER_REVIEW', 'ACTION_REQUIRED', 'RESOLVED'],
  UNDER_REVIEW: ['ACTION_REQUIRED', 'RESOLVED'],
  ACTION_REQUIRED: ['UNDER_REVIEW', 'RESOLVED'],
  RESOLVED: ['CLOSED'],
  CLOSED: [],
};

export function canTransitionException(from: ExceptionState, to: ExceptionState) {
  return exceptionTransitions[from]?.includes(to) ?? false;
}

/** Severity affects planning readiness only through documented rules, never a hidden score. */
export function exceptionBlocksReadiness(input: {
  category: ExceptionCategory;
  severity: string;
  state: ExceptionState;
}) {
  if (input.state === 'RESOLVED' || input.state === 'CLOSED') return false;
  if (input.category === 'MATERIAL_SHORTAGE') return input.severity === 'CRITICAL';
  if (input.category === 'PRODUCTION_DELAY') return false;
  return input.severity === 'CRITICAL';
}

export const scheduleRevisionStates = [
  'PENDING_APPROVAL',
  'AWAITING_ARTISAN',
  'APPROVED',
  'REJECTED',
] as const;
export type ScheduleRevisionState = (typeof scheduleRevisionStates)[number];

/**
 * A proposed schedule is not an approved amendment. Delaying a deadline needs the buyer's approval
 * because it changes a contractual commitment; only an approval changes the effective deadline.
 */
export function scheduleRevisionEffect(input: {
  status: ScheduleRevisionState;
  previousDeadline: string;
  proposedDeadline: string;
}) {
  // Only full approval applies the change. A buyer-only approval is still pending the artisan.
  const effectiveDeadline =
    input.status === 'APPROVED' ? input.proposedDeadline : input.previousDeadline;
  const deltaDays = Math.round(
    (new Date(input.proposedDeadline).getTime() - new Date(input.previousDeadline).getTime()) /
      86_400_000,
  );
  return {
    effectiveDeadline,
    changesContractualCommitment: deltaDays !== 0,
    deltaDays,
    requiresBuyerApproval: deltaDays !== 0,
    applied: input.status === 'APPROVED',
  };
}

export const counterofferStates = [
  'PROPOSED',
  'MANAGER_REVIEW',
  'ARTISAN_ACCEPTED',
  'DECLINED',
  'WITHDRAWN',
] as const;
export type CounterofferState = (typeof counterofferStates)[number];

/**
 * A counteroffer is never an acceptance. Only an explicit artisan acceptance of the final terms
 * creates agreement, and capacity reconciles only after that.
 */
export function counterofferCreatesAgreement(state: CounterofferState) {
  return state === 'ARTISAN_ACCEPTED';
}

export const availabilityPauseEffects = (input: {
  paused: boolean;
  hasAcceptedCommitments: boolean;
}) => ({
  blocksNewOffers: input.paused,
  preservesAcceptedCommitments: true,
  preservesAgreedCompensation: true,
  affectsFairnessEligibility: false,
  retainsHistory: true,
  acceptedCommitmentsUnchanged: input.hasAcceptedCommitments,
});

export const supportTicketCategories = [
  'COMMERCIAL',
  'PRODUCTION',
  'MATERIAL_DISCREPANCY',
  'QUALITY',
  'COMMUNICATION',
  'SUPPORT_REQUEST',
] as const;
export type SupportTicketCategory = (typeof supportTicketCategories)[number];

export const supportTicketStates = [
  'OPEN',
  'ASSIGNED',
  'IN_REVIEW',
  'IN_PROGRESS',
  'WAITING_ON_REPORTER',
  'ESCALATED',
  'RESOLVED',
  'WITHDRAWN',
  'CLOSED',
] as const;
export type SupportTicketState = (typeof supportTicketStates)[number];

const ticketTransitions: Record<SupportTicketState, SupportTicketState[]> = {
  OPEN: ['ASSIGNED', 'IN_REVIEW', 'IN_PROGRESS', 'ESCALATED', 'WITHDRAWN', 'CLOSED'],
  ASSIGNED: ['IN_REVIEW', 'IN_PROGRESS', 'ESCALATED', 'WITHDRAWN'],
  IN_REVIEW: ['WAITING_ON_REPORTER', 'ESCALATED', 'RESOLVED', 'WITHDRAWN'],
  ESCALATED: ['IN_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'WITHDRAWN'],
  WITHDRAWN: [],
  IN_PROGRESS: ['WAITING_ON_REPORTER', 'ESCALATED', 'RESOLVED', 'WITHDRAWN'],
  WAITING_ON_REPORTER: ['IN_PROGRESS', 'WITHDRAWN', 'CLOSED'],
  RESOLVED: ['CLOSED'],
  CLOSED: [],
};

export function canTransitionTicket(from: SupportTicketState, to: SupportTicketState) {
  return ticketTransitions[from]?.includes(to) ?? false;
}

export const notificationCategories = [
  'NEW_OFFER',
  'OFFER_EXPIRY',
  'COUNTEROFFER_RESPONSE',
  'PRODUCTION_EXCEPTION',
  'SCHEDULE_CHANGE',
  'BUYER_QUESTION',
  'MATERIAL_DISCREPANCY',
  'SUPPORT_CASE_UPDATE',
  'APPROVAL_DECISION',
] as const;
export type NotificationCategory = (typeof notificationCategories)[number];

export const inAppChannel = 'IN_APP';

/**
 * Delivery status is honest: without a configured external provider, an external channel is
 * recorded as UNDELIVERABLE rather than as sent.
 */
export function notificationPlan(input: {
  category: NotificationCategory;
  preference: { channel: string; optedIn: boolean } | null;
  providerConfigured: boolean;
}) {
  if (!input.preference?.optedIn)
    return {
      deliver: false,
      channel: input.preference?.channel ?? null,
      status: 'SKIPPED_NO_OPT_IN' as const,
      note: 'The recipient has not opted in to this category.',
    };
  if (input.preference.channel !== inAppChannel && !input.providerConfigured)
    return {
      deliver: false,
      channel: input.preference.channel,
      status: 'UNDELIVERABLE_NO_PROVIDER' as const,
      note: 'No external delivery provider is configured. Nothing was sent.',
    };
  return {
    deliver: true,
    channel: input.preference.channel,
    status: 'PENDING' as const,
    note: 'Queued for the opted-in channel.',
  };
}

/* ------------------------------------------------------------------ schemas */

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const text = z.string().trim().min(2).max(4000);

export const exceptionReportSchema = z
  .object({
    batchId: id,
    category: z.enum(exceptionCategories),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    description: text,
    evidenceReference: z.string().trim().max(500).default(''),
    affectedQuantity: z.number().int().min(0).max(1000000).optional(),
    affectedDate: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();
export type ExceptionReportInput = z.infer<typeof exceptionReportSchema>;

export const exceptionUpdateSchema = z
  .object({
    status: z.enum(exceptionStates),
    resolution: z.string().trim().max(2000).default(''),
  })
  .strict();

export const scheduleRevisionSchema = z
  .object({
    batchId: id,
    proposedDeadline: z.iso.datetime({ offset: true }),
    reason: text,
  })
  .strict();

export const scheduleDecisionSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    note: z.string().trim().max(2000).default(''),
  })
  .strict();

export const counterofferSchema = z
  .object({
    offerId: id,
    proposedQuantity: z.number().int().positive().max(1000000),
    proposedDeadline: z.iso.datetime({ offset: true }),
    clarification: z.string().trim().max(2000).default(''),
  })
  .strict();

export const counterofferReviewSchema = z
  .object({
    decision: z.enum(['APPROVE_TERMS', 'DECLINE']),
    note: z.string().trim().max(2000).default(''),
  })
  .strict();

export const availabilityPauseSchema = z
  .object({
    reason: z.string().trim().max(1000).default(''),
    effectiveFrom: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export const ticketCreateSchema = z
  .object({
    category: z.enum(supportTicketCategories),
    relatedType: z.enum(['ORDER', 'BATCH', 'OFFER', 'PAYABLE', 'NONE']).default('NONE'),
    relatedId: id.optional(),
    description: z.string().trim().max(4000).default(''),
    evidenceReference: z.string().trim().max(500).default(''),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH']).default('NORMAL'),
    privacyScope: z.enum(['SUPPORT_ONLY', 'ORGANIZATION_SUPPORT']).default('SUPPORT_ONLY'),
  })
  .strict()
  .refine((input) => input.category === 'SUPPORT_REQUEST' || input.description.length >= 2, {
    message: 'Describe the case, or choose voluntary support without a justification.',
    path: ['description'],
  });

export const ticketUpdateSchema = z
  .object({
    status: z.enum(supportTicketStates),
    resolution: z.string().trim().max(2000).default(''),
    ownerId: id.optional(),
    dueAt: z.iso.datetime({ offset: true }).optional(),
    remedyReference: z.string().trim().max(500).optional(),
  })
  .strict();

export const ticketCorrectionSchema = z.object({ detail: text }).strict();
export const supportAttachmentSchema = z
  .object({
    filename: z.string().regex(/^[a-zA-Z0-9_. -]{1,100}$/),
    mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    base64: z.string().min(4).max(349528),
  })
  .strict();

export const discussionPostSchema = z
  .object({ body: text, internalOnly: z.boolean().default(false) })
  .strict();

export const notificationPreferenceSchema = z
  .object({
    category: z.enum(notificationCategories),
    channel: z.enum(['IN_APP', 'EMAIL']),
    optedIn: z.boolean(),
    language: z.enum(['en', 'fr', 'ar']).optional(),
  })
  .strict();

export type ExceptionUpdateInput = z.infer<typeof exceptionUpdateSchema>;
export type ScheduleRevisionInput = z.infer<typeof scheduleRevisionSchema>;
export type ScheduleDecisionInput = z.infer<typeof scheduleDecisionSchema>;
export type CounterofferInput = z.infer<typeof counterofferSchema>;
export type CounterofferReviewInput = z.infer<typeof counterofferReviewSchema>;
export type TicketCreateInput = z.infer<typeof ticketCreateSchema>;
export type TicketUpdateInput = z.infer<typeof ticketUpdateSchema>;
export type DiscussionPostInput = z.infer<typeof discussionPostSchema>;
export type NotificationPreferenceInput = z.infer<typeof notificationPreferenceSchema>;
export type AvailabilityPauseInput = z.infer<typeof availabilityPauseSchema>;

/* ------------------------------------------------------------------ views */

/** Strip control characters and bound length. Discussion content is displayed to other people. */
export function sanitizeDiscussionBody(value: string) {
  const cleaned = Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || code >= 32;
    })
    .join('')
    .replace(/<[^>]*>/g, '')
    .trim();
  return cleaned.slice(0, 4000);
}

export type ExceptionView = {
  id: string;
  affectedQuantity: number | null;
  affectedDate: string | null;
  batchId: string;
  orderId: string;
  category: ExceptionCategory;
  severity: string;
  description: string;
  evidenceReference: string;
  status: ExceptionState;
  reporterRole: string;
  resolution: string;
  createdAt: string;
  blocksReadiness: boolean;
};

export type ScheduleRevisionView = {
  id: string;
  batchId: string;
  previousDeadline: string;
  proposedDeadline: string;
  reason: string;
  status: ScheduleRevisionState;
  effect: ReturnType<typeof scheduleRevisionEffect>;
  impact: unknown;
  buyerApproved: boolean;
  artisanApproved: boolean;
  createdAt: string;
};

export type CounterofferView = {
  id: string;
  offerId: string;
  revisedOfferId: string | null;
  unitPayTnd: string;
  totalPayTnd: string;
  effort: string;
  materials: string;
  proposedQuantity: number;
  proposedDeadline: string;
  clarification: string;
  status: CounterofferState;
  createsAgreement: boolean;
  createdAt: string;
};

export type TicketView = {
  id: string;
  category: SupportTicketCategory;
  relatedType: string | null;
  relatedId: string | null;
  description: string;
  status: SupportTicketState;
  priority: string;
  resolution: string;
  createdAt: string;
  privacyScope: string;
  ownerId: string | null;
  dueAt: string | null;
  attachments: { id: string; filename: string; mime: string; sha256: string }[];
  events: { id: string; kind: string; detail: string; createdAt: string }[];
};

export type CollaborationWorkspaceView = {
  exceptions: ExceptionView[];
  scheduleRevisions: ScheduleRevisionView[];
  counteroffers: CounterofferView[];
  availabilityPause: { pausedAt: string; effectiveFrom: string; reason: string } | null;
  tickets: TicketView[];
  discussions: {
    id: string;
    orderId: string;
    body: string;
    createdAt: string;
    messages: {
      id: string;
      body: string;
      internalOnly: boolean;
      createdAt: string;
      deliveryStatus: string;
    }[];
  }[];
  notificationPreferences: { category: string; channel: string; optedIn: boolean }[];
  notifications: {
    id: string;
    category: string;
    channel: string;
    subject: string;
    status: string;
    createdAt: string;
  }[];
  limitations: string[];
};

/** Generic event templates keep contractual and personal details behind the authenticated workspace. */
export function localizedNotification(category: NotificationCategory, language: string) {
  const locale = ['en', 'fr', 'ar'].includes(language) ? language : 'en';
  const templates = {
    en: {
      subject: 'NASJ: an update is available',
      body: 'Sign in to review this update in Collaboration and support.',
    },
    fr: {
      subject: 'NASJ : une mise à jour est disponible',
      body: 'Connectez-vous pour consulter cette mise à jour dans Collaboration et assistance.',
    },
    ar: {
      subject: 'نسج: يتوفر تحديث',
      body: 'سجّل الدخول لمراجعة التحديث في مساحة التعاون والدعم.',
    },
  };
  return {
    ...templates[locale as keyof typeof templates],
    locale,
    templateKey: `${category}.${locale}.v1`,
  };
}
