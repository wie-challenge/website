import { createHmac, randomUUID } from 'node:crypto';
import { prorateTnd } from '@nasj/contracts';
import { normalizeDhmadWebhookPayload, verifyDhmadWebhookSignature } from './dhmad.adapter.js';
import {
  type AccountVerificationResult,
  type CheckoutSessionRecord,
  type ContractRecord,
  type CreateCheckoutSessionRequest,
  type CreateEscrowRequest,
  type DisputeRecord,
  type EscrowRecord,
  type IdentityVerificationRecord,
  type NormalizedWebhookEvent,
  type PaymentProvider,
  ProviderError,
  type WebhookVerificationInput,
  mapDhmadEscrowStatus,
} from './provider.types.js';

/** An isolated test double. Its operations and results are NASJ test contracts, not DHMAD APIs. */
export type MockObligation = Readonly<{
  id: string;
  reference: string;
  amountMillimes: bigint;
  currency: 'TND';
  recipient: 'NASJ';
  status: 'PENDING' | 'FUNDED' | 'CANCELLED';
  provenance: 'MOCK_SIMULATION';
}>;

export class MockPaymentProvider {
  private readonly obligations = new Map<string, MockObligation>();

  constructor(private readonly capacity = 100) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 10000)
      throw new Error('Invalid mock capacity');
  }

  create(input: { reference: string; amountMillimes: bigint }): MockObligation {
    if (
      !/^[A-Za-z0-9_-]{1,128}$/.test(input.reference) ||
      input.amountMillimes <= 0n ||
      input.amountMillimes > 9223372036854775807n
    )
      throw new Error('Invalid mock obligation');
    const existing = this.obligations.get(input.reference);
    if (existing) {
      if (existing.amountMillimes !== input.amountMillimes) throw new Error('Reference conflict');
      return existing;
    }
    if (this.obligations.size >= this.capacity) throw new Error('Mock capacity exceeded');
    const record: MockObligation = Object.freeze({
      id: `mock-${input.reference}`,
      reference: input.reference,
      amountMillimes: input.amountMillimes,
      currency: 'TND',
      recipient: 'NASJ',
      status: 'PENDING',
      provenance: 'MOCK_SIMULATION',
    });
    this.obligations.set(input.reference, record);
    return record;
  }

  get(reference: string): MockObligation | undefined {
    return this.obligations.get(reference);
  }

  /** Test-only state changes never represent actual funding or settlement. */
  simulate(reference: string, next: 'FUNDED' | 'CANCELLED'): MockObligation {
    const current = this.obligations.get(reference);
    if (!current) throw new Error('Mock obligation not found');
    if (current.status === next) return current;
    if (current.status !== 'PENDING') throw new Error('Invalid mock transition');
    const updated = Object.freeze({ ...current, status: next });
    this.obligations.set(reference, updated);
    return updated;
  }
}

export type MockFaultMode =
  | 'NONE'
  | 'TIMEOUT_BEFORE_CREATE'
  | 'TIMEOUT_AFTER_CREATE'
  | 'RATE_LIMIT'
  | 'OUTAGE'
  | 'RECIPIENT_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'UNKNOWN_STATUS';

type InternalEscrow = EscrowRecord & {
  contractTerms?: string;
};

/**
 * Full deterministic sandbox mock implementing PaymentProvider.
 * All outcomes are MOCK_SIMULATION and never represent authenticated DHMAD calls.
 */
export class DeterministicMockPaymentProvider implements PaymentProvider {
  readonly name = 'mock' as const;
  readonly environment = 'mock' as const;
  readonly provenance = 'MOCK_SIMULATION' as const;

  private readonly escrows = new Map<string, InternalEscrow>();
  private readonly sessions = new Map<string, CheckoutSessionRecord>();
  private readonly verifications = new Map<string, IdentityVerificationRecord>();
  private readonly disputes = new Map<string, DisputeRecord>();
  private nextFault: MockFaultMode = 'NONE';
  private seq = 1;

  constructor(private readonly webhookSecret = 'mock_sandbox_webhook_secret_32chars') {}

  setNextFault(mode: MockFaultMode) {
    this.nextFault = mode;
  }

  private consumeFault(): MockFaultMode {
    const mode = this.nextFault;
    this.nextFault = 'NONE';
    return mode;
  }

  async verifyAccountAssociation(): Promise<AccountVerificationResult> {
    return {
      authenticated: true,
      environment: 'mock',
      developerEmail: 'nasj-mock-seller@sandbox.local',
      associatedBalanceAvailableTnd: '0.000',
      associatedAccountVerified: true,
      permissions: ['mock:all'],
    };
  }

  async createEscrow(input: CreateEscrowRequest): Promise<EscrowRecord> {
    const fault = this.consumeFault();
    if (fault === 'TIMEOUT_BEFORE_CREATE') {
      throw new ProviderError(
        'AMBIGUOUS_TIMEOUT',
        'MOCK_TIMEOUT_BEFORE_CREATE',
        'Simulated network timeout before provider write.',
      );
    }
    if (fault === 'RATE_LIMIT') {
      throw new ProviderError('RATE_LIMITED', 'RATE_LIMITED', 'Simulated 429 rate limit.', 429, 5);
    }
    if (fault === 'OUTAGE') {
      throw new ProviderError(
        'AMBIGUOUS_TIMEOUT',
        'PROVIDER_OUTAGE',
        'Simulated provider 503 outage.',
        503,
      );
    }

    const feeMillimes = prorateTnd(input.amountMillimes, 500n, 10000n);
    const buyerFundingMillimes =
      input.feeBearer === 'BUYER' ? input.amountMillimes + feeMillimes : input.amountMillimes;
    const id = `mock_esc_${this.seq++}_${input.externalReference.slice(0, 16)}`;
    const contractId = input.mode === 'standard' ? `mock_ctr_${this.seq++}` : null;
    const record: InternalEscrow = {
      externalEscrowId: id,
      externalReference: input.externalReference,
      title: input.title,
      mode: input.mode,
      rawStatus: fault === 'UNKNOWN_STATUS' ? 'mystery_pending_v9' : 'pending',
      normalizedStatus: fault === 'UNKNOWN_STATUS' ? 'UNKNOWN' : 'AWAITING_PAYMENT',
      amountMillimes:
        fault === 'AMOUNT_MISMATCH' ? input.amountMillimes + 5000n : input.amountMillimes,
      currency: 'TND',
      feeBearer: input.feeBearer,
      escrowFeeMillimes: feeMillimes,
      buyerFundingMillimes,
      sellerEmail:
        fault === 'RECIPIENT_MISMATCH'
          ? 'rogue-recipient@example.com'
          : 'nasj-mock-seller@sandbox.local',
      buyerEmail: input.buyerEmail,
      deliveredAt: null,
      completionDeadline: null,
      completedAt: null,
      cancelledAt: null,
      contractId,
      sellerSigned: input.mode === 'standard' ? Boolean(input.autoSignSeller) : false,
      buyerSigned: false,
      isFullySigned: false,
      contractPdfUrl: contractId ? `https://mock.dhmad.local/contracts/${contractId}.pdf` : null,
      contractTerms: input.contractTerms,
      disputeId: null,
      disputeTicketNumber: null,
    };
    this.escrows.set(id, record);

    if (fault === 'TIMEOUT_AFTER_CREATE') {
      throw new ProviderError(
        'AMBIGUOUS_TIMEOUT',
        'MOCK_TIMEOUT_AFTER_CREATE',
        'Simulated timeout after provider created escrow.',
      );
    }
    return { ...record };
  }

  async getEscrow(externalEscrowId: string): Promise<EscrowRecord> {
    const fault = this.consumeFault();
    if (fault === 'OUTAGE') {
      throw new ProviderError('PROVIDER_UNAVAILABLE', 'PROVIDER_OUTAGE', 'Simulated outage.', 503);
    }
    const row = this.escrows.get(externalEscrowId);
    if (!row)
      throw new ProviderError('DEFINITIVE_REJECTION', 'NOT_FOUND', 'Escrow not found.', 404);
    return { ...row };
  }

  async listEscrows(): Promise<EscrowRecord[]> {
    return [...this.escrows.values()].map((e) => ({ ...e }));
  }

  async getContract(externalEscrowId: string): Promise<ContractRecord> {
    const row = this.escrows.get(externalEscrowId);
    if (row?.mode !== 'standard' || !row.contractId) {
      throw new ProviderError(
        'DEFINITIVE_REJECTION',
        'NO_CONTRACT',
        'Quick escrow has no contract.',
        404,
      );
    }
    return {
      contractId: row.contractId,
      escrowId: row.externalEscrowId,
      terms: row.contractTerms ?? 'Standard NASJ B2B Escrow Contract',
      language: 'en',
      pdfUrl: row.contractPdfUrl ?? null,
      sellerSigned: Boolean(row.sellerSigned),
      buyerSigned: Boolean(row.buyerSigned),
      isFullySigned: Boolean(row.isFullySigned),
    };
  }

  async cancelEscrow(externalEscrowId: string): Promise<EscrowRecord> {
    const row = this.escrows.get(externalEscrowId);
    if (!row)
      throw new ProviderError('DEFINITIVE_REJECTION', 'NOT_FOUND', 'Escrow not found.', 404);
    if (row.rawStatus !== 'pending') {
      throw new ProviderError(
        'DEFINITIVE_REJECTION',
        'ESCROW_NOT_PENDING',
        'Only pending escrows can be cancelled directly via API.',
        400,
      );
    }
    row.rawStatus = 'cancelled';
    row.normalizedStatus = 'CANCELLED';
    row.cancelledAt = new Date().toISOString();
    return { ...row };
  }

  async deliverEscrow(externalEscrowId: string): Promise<EscrowRecord> {
    const row = this.escrows.get(externalEscrowId);
    if (!row)
      throw new ProviderError('DEFINITIVE_REJECTION', 'NOT_FOUND', 'Escrow not found.', 404);
    if (row.rawStatus !== 'paid') {
      throw new ProviderError(
        'DEFINITIVE_REJECTION',
        'ESCROW_NOT_PAID',
        'Escrow must be in paid status before delivery.',
        400,
      );
    }
    const now = new Date();
    row.rawStatus = 'delivered';
    row.normalizedStatus = 'AWAITING_DELIVERY_ACCEPTANCE';
    row.deliveredAt = now.toISOString();
    row.completionDeadline = new Date(now.getTime() + 72 * 3600_000).toISOString();
    return { ...row };
  }

  async createCheckoutSession(input: CreateCheckoutSessionRequest): Promise<CheckoutSessionRecord> {
    const row = this.escrows.get(input.externalEscrowId);
    if (!row)
      throw new ProviderError('DEFINITIVE_REJECTION', 'NOT_FOUND', 'Escrow not found.', 404);
    if (input.action === 'sign_contract' && row.mode === 'quick') {
      throw new ProviderError(
        'DEFINITIVE_REJECTION',
        'QUICK_ESCROW_NO_CONTRACT',
        'Quick escrow has no contract.',
        400,
      );
    }
    if (input.action === 'complete' && row.rawStatus === 'paid') {
      throw new ProviderError(
        'DEFINITIVE_REJECTION',
        'DELIVERY_REQUIRED',
        'Delivery required before completion.',
        400,
      );
    }
    const sessionId = `mock_sess_${randomUUID()}`;
    const record: CheckoutSessionRecord = {
      externalSessionId: sessionId,
      externalEscrowId: input.externalEscrowId,
      action: input.action,
      targetUserEmail: input.targetUserEmail,
      url: `${input.redirectUrl}${input.redirectUrl.includes('?') ? '&' : '?'}session_id=${sessionId}&status=completed&mock=true`,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      completedAt: null,
    };
    this.sessions.set(sessionId, record);
    return { ...record };
  }

  async getCheckoutSession(externalSessionId: string): Promise<CheckoutSessionRecord> {
    const s = this.sessions.get(externalSessionId);
    if (!s) throw new ProviderError('DEFINITIVE_REJECTION', 'NOT_FOUND', 'Session not found.', 404);
    return { ...s };
  }

  /** Test helper to simulate hosted checkout completion + state progression. */
  simulateSessionCompletion(externalSessionId: string) {
    const s = this.sessions.get(externalSessionId);
    if (!s) throw new Error('Mock session not found');
    const escrow = this.escrows.get(s.externalEscrowId);
    if (!escrow) throw new Error('Mock escrow not found');
    s.status = 'completed';
    s.completedAt = new Date().toISOString();
    if (s.action === 'sign_contract') {
      escrow.buyerSigned = true;
      escrow.isFullySigned = Boolean(escrow.sellerSigned && escrow.buyerSigned);
    } else if (s.action === 'accept_pay') {
      if (escrow.mode === 'standard') {
        escrow.buyerSigned = true;
        escrow.isFullySigned = Boolean(escrow.sellerSigned && escrow.buyerSigned);
      }
      escrow.rawStatus = 'paid';
      escrow.normalizedStatus = 'FUNDS_SECURED';
    } else if (s.action === 'complete') {
      escrow.rawStatus = 'completed';
      escrow.normalizedStatus = 'SETTLED';
      escrow.completedAt = new Date().toISOString();
      escrow.releasedTotalMillimes =
        escrow.feeBearer === 'SELLER'
          ? escrow.amountMillimes - escrow.escrowFeeMillimes
          : escrow.amountMillimes;
    } else if (s.action === 'dispute') {
      escrow.rawStatus = 'disputed';
      escrow.normalizedStatus = 'DISPUTED';
      const dispId = `mock_disp_${this.seq++}`;
      escrow.disputeId = dispId;
      escrow.disputeTicketNumber = `MOCK-${this.seq}`;
      this.disputes.set(dispId, {
        externalDisputeId: dispId,
        ticketNumber: escrow.disputeTicketNumber,
        kind: 'escrow_dispute',
        status: 'OPEN',
        outcome: null,
        escrowId: escrow.externalEscrowId,
        reason: 'Mock buyer dispute',
        openedAt: new Date().toISOString(),
        closedAt: null,
      });
    } else if (s.action === 'cancel_escrow' || s.action === 'accept_cancellation') {
      escrow.rawStatus = 'cancelled';
      escrow.normalizedStatus = 'REFUNDED';
      escrow.refundedTotalMillimes = escrow.buyerFundingMillimes;
      escrow.cancelledAt = new Date().toISOString();
    }
    return { session: { ...s }, escrow: { ...escrow } };
  }

  /** Test helper to mutate mock escrow state directly (e.g. for reconciliation drift tests). */
  mutateEscrowForTest(
    externalEscrowId: string,
    patch: Partial<
      Pick<
        EscrowRecord,
        | 'rawStatus'
        | 'amountMillimes'
        | 'sellerEmail'
        | 'currency'
        | 'releasedTotalMillimes'
        | 'escrowFeeMillimes'
      >
    >,
  ) {
    const row = this.escrows.get(externalEscrowId);
    if (!row) throw new Error('Mock escrow not found');
    Object.assign(row, patch);
    if (patch.rawStatus) row.normalizedStatus = mapDhmadEscrowStatus(patch.rawStatus);
    return { ...row };
  }

  async createIdentityVerification(input: {
    email: string;
    externalUserId: string;
  }): Promise<IdentityVerificationRecord> {
    const id = `mock_kyc_${this.seq++}`;
    const rec: IdentityVerificationRecord = {
      externalVerificationId: id,
      email: input.email.toLowerCase(),
      externalUserId: input.externalUserId,
      kycStatus: 'APPROVED',
      claimStatus: 'PENDING',
      needsAdminReview: false,
      linkedUserId: null,
      verificationEmailSent: false,
      message: 'MOCK_SIMULATION: Sandbox KYC auto-approved.',
    };
    this.verifications.set(id, rec);
    return { ...rec };
  }

  async getIdentityVerification(
    externalVerificationId: string,
  ): Promise<IdentityVerificationRecord> {
    const rec = this.verifications.get(externalVerificationId);
    if (!rec)
      throw new ProviderError('DEFINITIVE_REJECTION', 'NOT_FOUND', 'Verification not found.', 404);
    return { ...rec };
  }

  async listDisputes(): Promise<DisputeRecord[]> {
    return [...this.disputes.values()].map((d) => ({ ...d }));
  }

  async getDispute(externalDisputeId: string): Promise<DisputeRecord> {
    const d = this.disputes.get(externalDisputeId);
    if (!d) throw new ProviderError('DEFINITIVE_REJECTION', 'NOT_FOUND', 'Dispute not found.', 404);
    return { ...d };
  }

  async replyDispute(externalDisputeId: string): Promise<void> {
    if (!this.disputes.has(externalDisputeId)) {
      throw new ProviderError('DEFINITIVE_REJECTION', 'NOT_FOUND', 'Dispute not found.', 404);
    }
  }

  signWebhookForTest(payload: unknown): {
    signature: string;
    rawBody: string;
    timestamp: string;
    webhookId: string;
  } {
    const rawBody = JSON.stringify(payload);
    const signature = createHmac('sha256', this.webhookSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    const root = (payload ?? {}) as { id?: string; timestamp?: string };
    return {
      signature,
      rawBody,
      timestamp: root.timestamp ?? new Date().toISOString(),
      webhookId: root.id ?? randomUUID(),
    };
  }

  verifyWebhook(input: WebhookVerificationInput): boolean {
    return verifyDhmadWebhookSignature(input, this.webhookSecret);
  }

  normalizeWebhookEvent(
    webhookId: string,
    eventType: string,
    timestamp: Date,
    payload: unknown,
  ): NormalizedWebhookEvent {
    return normalizeDhmadWebhookPayload(webhookId, eventType, timestamp, payload);
  }
}
