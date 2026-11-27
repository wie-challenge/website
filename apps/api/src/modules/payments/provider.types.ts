import type {
  CheckoutAction,
  FeeBearer,
  KycStatus,
  PaymentObligationStatus,
} from '@nasj/contracts';

export type ProviderName = 'mock' | 'dhmad';
export type ProviderEnvironment = 'mock' | 'sandbox';
export type ProviderProvenance = 'MOCK_SIMULATION' | 'DHMAD_SANDBOX';

export type ProviderErrorCategory =
  | 'AUTH_FAILED'
  | 'PERMISSION_OR_ASSOCIATION_DENIED'
  | 'DEFINITIVE_REJECTION'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'AMBIGUOUS_TIMEOUT'
  | 'RETRYABLE_READ'
  | 'UNSUPPORTED_CAPABILITY'
  | 'INVALID_RESPONSE';

export class ProviderError extends Error {
  constructor(
    public readonly category: ProviderErrorCategory,
    public readonly code: string,
    message: string,
    public readonly httpStatus?: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export type CreateEscrowRequest = {
  externalReference: string;
  title: string;
  amountMillimes: bigint;
  currency: 'TND';
  buyerEmail: string;
  sellerEmail?: string;
  mode: 'quick' | 'standard';
  feeBearer: FeeBearer;
  reviewHours: number;
  contractTerms?: string;
  autoSignSeller?: boolean;
};

export type EscrowRecord = {
  externalEscrowId: string;
  externalReference?: string;
  title: string;
  mode: 'quick' | 'standard';
  rawStatus: string;
  normalizedStatus: PaymentObligationStatus | 'UNKNOWN';
  amountMillimes: bigint;
  currency: string;
  feeBearer: FeeBearer;
  escrowFeeMillimes: bigint;
  buyerFundingMillimes: bigint;
  releasedTotalMillimes?: bigint;
  refundedTotalMillimes?: bigint;
  sellerEmail?: string | null;
  buyerEmail?: string | null;
  deliveredAt?: string | null;
  completionDeadline?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  contractId?: string | null;
  sellerSigned?: boolean;
  buyerSigned?: boolean;
  isFullySigned?: boolean;
  contractPdfUrl?: string | null;
  disputeId?: string | null;
  disputeTicketNumber?: string | null;
};

export type ContractRecord = {
  contractId: string;
  escrowId: string;
  terms: string;
  language: string;
  pdfUrl: string | null;
  sellerSigned: boolean;
  buyerSigned: boolean;
  isFullySigned: boolean;
};

export type CreateCheckoutSessionRequest = {
  externalEscrowId: string;
  action: CheckoutAction;
  targetUserEmail: string;
  redirectUrl: string;
  metadata?: Record<string, string>;
};

export type CheckoutSessionRecord = {
  externalSessionId: string;
  externalEscrowId: string;
  action: string;
  targetUserEmail: string;
  url?: string;
  status: 'pending' | 'completed' | 'expired' | 'cancelled';
  expiresAt?: string | null;
  completedAt?: string | null;
};

export type IdentityVerificationRecord = {
  externalVerificationId: string;
  email: string;
  externalUserId: string | null;
  kycStatus: Exclude<KycStatus, 'NOT_STARTED'>;
  claimStatus: 'PENDING' | 'LINKED';
  needsAdminReview: boolean;
  linkedUserId: string | null;
  verificationEmailSent: boolean;
  message?: string;
};

export type DisputeRecord = {
  externalDisputeId: string;
  ticketNumber: string | null;
  kind: string;
  status: 'OPEN' | 'UNDER_REVIEW' | 'CLOSED';
  outcome: string | null;
  escrowId: string | null;
  reason: string;
  openedAt: string;
  closedAt: string | null;
};

export type WebhookVerificationInput = {
  rawBody: string;
  parsedBody: unknown;
  signature: string | undefined;
  timestamp: string | undefined;
  webhookId: string | undefined;
  eventHeader: string | undefined;
};

export type NormalizedWebhookEvent =
  | {
      kind: 'ESCROW_STATUS';
      webhookId: string;
      eventType: string;
      timestamp: Date;
      escrow: EscrowRecord;
    }
  | {
      kind: 'CONTRACT_SIGNED';
      webhookId: string;
      eventType: string;
      timestamp: Date;
      externalEscrowId: string;
      contractId: string;
      signedBy: 'seller' | 'buyer' | 'unknown';
      isFullySigned: boolean;
    }
  | {
      kind: 'KYC_UPDATED' | 'KYC_LINKED';
      webhookId: string;
      eventType: string;
      timestamp: Date;
      verification: IdentityVerificationRecord;
    }
  | {
      kind: 'DISPUTE_EVENT';
      webhookId: string;
      eventType: string;
      timestamp: Date;
      dispute: DisputeRecord;
    }
  | {
      kind: 'UNHANDLED';
      webhookId: string;
      eventType: string;
      timestamp: Date;
    };

export type AccountVerificationResult = {
  authenticated: boolean;
  environment: ProviderEnvironment;
  developerEmail?: string;
  associatedBalanceAvailableTnd?: string;
  associatedAccountVerified: boolean;
  escrowReadVerified?: boolean;
  permissions: string[];
  missingPermissions?: string[];
};

export interface PaymentProvider {
  readonly name: ProviderName;
  readonly environment: ProviderEnvironment;
  readonly provenance: ProviderProvenance;

  verifyAccountAssociation(): Promise<AccountVerificationResult>;
  createEscrow(input: CreateEscrowRequest): Promise<EscrowRecord>;
  getEscrow(externalEscrowId: string): Promise<EscrowRecord>;
  listEscrows(params?: { status?: string; page?: number; limit?: number }): Promise<EscrowRecord[]>;
  getContract(externalEscrowId: string): Promise<ContractRecord>;
  cancelEscrow(externalEscrowId: string): Promise<EscrowRecord>;
  deliverEscrow(externalEscrowId: string): Promise<EscrowRecord>;

  createCheckoutSession(input: CreateCheckoutSessionRequest): Promise<CheckoutSessionRecord>;
  getCheckoutSession(externalSessionId: string): Promise<CheckoutSessionRecord>;

  createIdentityVerification(input: {
    email: string;
    externalUserId: string;
    redirectUrl?: string;
  }): Promise<IdentityVerificationRecord>;
  getIdentityVerification(externalVerificationId: string): Promise<IdentityVerificationRecord>;

  listDisputes(): Promise<DisputeRecord[]>;
  getDispute(externalDisputeId: string): Promise<DisputeRecord>;
  replyDispute(externalDisputeId: string, body: string, idempotencyKey: string): Promise<void>;

  verifyWebhook(input: WebhookVerificationInput): boolean;
  normalizeWebhookEvent(
    webhookId: string,
    eventType: string,
    timestamp: Date,
    payload: unknown,
  ): NormalizedWebhookEvent;
}

/** Unknown provider states never map to paid or settled; callers must quarantine unknown states. */
export function mapDhmadEscrowStatus(rawStatus: string): PaymentObligationStatus | 'UNKNOWN' {
  switch (rawStatus.toLowerCase()) {
    case 'pending':
      return 'AWAITING_PAYMENT';
    case 'paid':
      return 'FUNDS_SECURED';
    case 'delivered':
      return 'AWAITING_DELIVERY_ACCEPTANCE';
    case 'completed':
      return 'SETTLED';
    case 'cancelled':
      return 'CANCELLED';
    case 'disputed':
      return 'DISPUTED';
    case 'refunded':
      return 'REFUNDED';
    case 'failed':
      return 'FAILED';
    default:
      return 'UNKNOWN';
  }
}
