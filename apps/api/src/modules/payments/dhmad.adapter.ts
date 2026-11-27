import { createHmac, timingSafeEqual } from 'node:crypto';
import { dhmadNumberToMillimes, formatTnd, millimesToDhmadNumber } from '@nasj/contracts';
import { z } from 'zod';
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

const dhmadEscrowSchema = z
  .object({
    id: z.string().min(1).optional(),
    _id: z.string().min(1).optional(),
    title: z.string().default(''),
    amount: z.number().nonnegative(),
    amountTnd: z.number().nonnegative().optional(),
    currency: z.string().default('TND'),
    escrowFee: z.number().nonnegative().optional(),
    feeBearer: z.enum(['seller', 'buyer']).default('seller'),
    buyerFundingTnd: z.number().nonnegative().optional(),
    releasedTotalTnd: z.number().nonnegative().optional(),
    refundedTotalTnd: z.number().nonnegative().optional(),
    status: z.string().min(1),
    mode: z.enum(['quick', 'standard']).default('quick'),
    deliveredAt: z.string().nullable().optional(),
    completionDeadline: z.string().nullable().optional(),
    completedAt: z.string().nullable().optional(),
    cancelledAt: z.string().nullable().optional(),
    seller: z
      .object({ email: z.string().nullable().optional() })
      .passthrough()
      .nullable()
      .optional(),
    sellerBusiness: z
      .object({ contactEmail: z.string().nullable().optional() })
      .passthrough()
      .nullable()
      .optional(),
    sellerEmail: z.string().nullable().optional(),
    buyer: z
      .object({ email: z.string().nullable().optional() })
      .passthrough()
      .nullable()
      .optional(),
    buyerEmail: z.string().nullable().optional(),
    disputeTicketId: z.string().nullable().optional(),
    disputeTicket: z
      .object({ ticketNumber: z.string().nullable().optional() })
      .passthrough()
      .nullable()
      .optional(),
    signatures: z
      .object({
        sellerSigned: z.boolean().optional(),
        buyerSigned: z.boolean().optional(),
        isFullySigned: z.boolean().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough()
  .refine((v) => Boolean(v.id ?? v._id), { message: 'Escrow id or _id is required', path: ['id'] });

const dhmadCreateEscrowResponseSchema = z
  .object({
    escrow: dhmadEscrowSchema,
    contract: z
      .object({
        id: z.string().optional(),
        _id: z.string().optional(),
        pdfUrl: z.string().nullable().optional(),
        sellerSigned: z.boolean().optional(),
        buyerSigned: z.boolean().optional(),
        isFullySigned: z.boolean().optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();

const dhmadKycSchema = z
  .object({
    id: z.string().min(1),
    email: z.string().email(),
    external_user_id: z.string().nullable().optional(),
    kyc_status: z.enum(['pending', 'approved', 'rejected']),
    needs_admin_review: z.boolean().default(false),
    claim_status: z.enum(['pending', 'linked']).default('pending'),
    linked_user_id: z.string().nullable().optional(),
    verification_email_sent: z.boolean().default(false),
    message: z.string().optional(),
  })
  .passthrough();

const dhmadDisputeSchema = z
  .object({
    id: z.string().min(1),
    ticketNumber: z.string().nullable().optional(),
    kind: z.string().default('escrow_dispute'),
    status: z.enum(['open', 'under_review', 'closed']),
    outcome: z.string().nullable().optional(),
    reason: z.string().default(''),
    openedAt: z.string(),
    closedAt: z.string().nullable().optional(),
    escrow: z.object({ id: z.string() }).passthrough().nullable().optional(),
  })
  .passthrough();

function mapEscrow(
  raw: z.infer<typeof dhmadEscrowSchema>,
  contract?: z.infer<typeof dhmadCreateEscrowResponseSchema>['contract'],
): EscrowRecord {
  const amountMillimes = dhmadNumberToMillimes(raw.amountTnd ?? raw.amount);
  const escrowFeeMillimes = raw.escrowFee !== undefined ? dhmadNumberToMillimes(raw.escrowFee) : 0n;
  const buyerFundingMillimes =
    raw.buyerFundingTnd !== undefined ? dhmadNumberToMillimes(raw.buyerFundingTnd) : amountMillimes;
  return {
    externalEscrowId: (raw.id ?? raw._id)!,
    title: raw.title,
    mode: raw.mode,
    rawStatus: raw.status,
    normalizedStatus: mapDhmadEscrowStatus(raw.status),
    amountMillimes,
    currency: raw.currency,
    feeBearer: raw.feeBearer === 'buyer' ? 'BUYER' : 'SELLER',
    escrowFeeMillimes,
    buyerFundingMillimes,
    releasedTotalMillimes:
      raw.releasedTotalTnd !== undefined ? dhmadNumberToMillimes(raw.releasedTotalTnd) : undefined,
    refundedTotalMillimes:
      raw.refundedTotalTnd !== undefined ? dhmadNumberToMillimes(raw.refundedTotalTnd) : undefined,
    sellerEmail: raw.seller?.email ?? raw.sellerEmail ?? raw.sellerBusiness?.contactEmail ?? null,
    buyerEmail: raw.buyer?.email ?? raw.buyerEmail ?? null,
    deliveredAt: raw.deliveredAt ?? null,
    completionDeadline: raw.completionDeadline ?? null,
    completedAt: raw.completedAt ?? null,
    cancelledAt: raw.cancelledAt ?? null,
    contractId: contract?.id ?? contract?._id ?? null,
    sellerSigned: raw.signatures?.sellerSigned ?? contract?.sellerSigned ?? false,
    buyerSigned: raw.signatures?.buyerSigned ?? contract?.buyerSigned ?? false,
    isFullySigned: raw.signatures?.isFullySigned ?? contract?.isFullySigned ?? false,
    contractPdfUrl: contract?.pdfUrl ?? null,
    disputeId: raw.disputeTicketId ?? null,
    disputeTicketNumber: raw.disputeTicket?.ticketNumber ?? null,
  };
}

function mapKyc(raw: z.infer<typeof dhmadKycSchema>): IdentityVerificationRecord {
  return {
    externalVerificationId: raw.id,
    email: raw.email,
    externalUserId: raw.external_user_id ?? null,
    kycStatus:
      raw.kyc_status === 'approved'
        ? 'APPROVED'
        : raw.kyc_status === 'rejected'
          ? 'REJECTED'
          : 'PENDING',
    claimStatus: raw.claim_status === 'linked' ? 'LINKED' : 'PENDING',
    needsAdminReview: raw.needs_admin_review,
    linkedUserId: raw.linked_user_id ?? null,
    verificationEmailSent: raw.verification_email_sent,
    message: raw.message,
  };
}

function mapDispute(raw: z.infer<typeof dhmadDisputeSchema>): DisputeRecord {
  return {
    externalDisputeId: raw.id,
    ticketNumber: raw.ticketNumber ?? null,
    kind: raw.kind,
    status:
      raw.status === 'closed' ? 'CLOSED' : raw.status === 'under_review' ? 'UNDER_REVIEW' : 'OPEN',
    outcome: raw.outcome ?? null,
    escrowId: raw.escrow?.id ?? null,
    reason: raw.reason,
    openedAt: raw.openedAt,
    closedAt: raw.closedAt ?? null,
  };
}

export function verifyDhmadWebhookSignature(
  input: WebhookVerificationInput,
  webhookSecret: string | undefined,
  nowMs = Date.now(),
): boolean {
  if (!webhookSecret || !input.signature || !input.timestamp || !input.webhookId) return false;
  const ts = Date.parse(input.timestamp);
  if (!Number.isFinite(ts)) return false;
  // Reject events older than 5 minutes or more than 5 minutes in the future.
  if (Math.abs(nowMs - ts) > 5 * 60 * 1000) return false;
  const sigBuf = Buffer.from(input.signature, 'utf8');
  const candidates = [input.rawBody];
  if (input.parsedBody !== undefined) {
    try {
      const compact = JSON.stringify(input.parsedBody);
      if (compact && compact !== input.rawBody) candidates.push(compact);
    } catch {
      // Ignore unserializable body.
    }
  }
  return candidates.some((candidate) => {
    const expected = createHmac('sha256', webhookSecret).update(candidate, 'utf8').digest('hex');
    const expBuf = Buffer.from(expected, 'utf8');
    return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
  });
}

export function normalizeDhmadWebhookPayload(
  webhookId: string,
  eventType: string,
  timestamp: Date,
  payload: unknown,
): NormalizedWebhookEvent {
  if (!payload || typeof payload !== 'object') {
    return { kind: 'UNHANDLED', webhookId, eventType, timestamp };
  }
  const root = payload as { data?: Record<string, unknown> };
  const data = root.data ?? {};
  if (
    [
      'escrow.status.updated',
      'escrow.updated',
      'escrow.cancellation.requested',
      'escrow.cancellation.rejected',
      'escrow.cancellation.accepted',
      'escrow.delivery.rejected',
      'escrow.funds.added',
      'escrow.funds.refunded',
    ].includes(eventType) &&
    data.escrow
  ) {
    const parsed = dhmadEscrowSchema.safeParse(data.escrow);
    if (parsed.success) {
      return {
        kind: 'ESCROW_STATUS',
        webhookId,
        eventType,
        timestamp,
        escrow: mapEscrow(parsed.data),
      };
    }
  }
  if (eventType === 'contract.signed' && data.contract && data.escrow) {
    const contract = data.contract as Record<string, unknown>;
    const escrow = data.escrow as Record<string, unknown>;
    if (typeof contract.id === 'string' && typeof escrow.id === 'string') {
      return {
        kind: 'CONTRACT_SIGNED',
        webhookId,
        eventType,
        timestamp,
        externalEscrowId: escrow.id,
        contractId: contract.id,
        signedBy:
          contract.signedBy === 'seller' || contract.signedBy === 'buyer'
            ? contract.signedBy
            : 'unknown',
        isFullySigned: Boolean(contract.isFullySigned),
      };
    }
  }
  if (
    eventType === 'identity.verification.updated' ||
    eventType === 'identity.verification.linked'
  ) {
    const parsed = dhmadKycSchema.safeParse(data);
    if (parsed.success) {
      return {
        kind: eventType === 'identity.verification.linked' ? 'KYC_LINKED' : 'KYC_UPDATED',
        webhookId,
        eventType,
        timestamp,
        verification: mapKyc(parsed.data),
      };
    }
  }
  if (eventType.startsWith('dispute.') && data.dispute) {
    const parsed = dhmadDisputeSchema.safeParse(data.dispute);
    if (parsed.success) {
      return {
        kind: 'DISPUTE_EVENT',
        webhookId,
        eventType,
        timestamp,
        dispute: mapDispute(parsed.data),
      };
    }
  }
  return { kind: 'UNHANDLED', webhookId, eventType, timestamp };
}

export const REQUIRED_DHMAD_PERMISSIONS = ['disputes:read', 'disputes:write'] as const;

export class DhmadSandboxAdapter implements PaymentProvider {
  readonly name = 'dhmad' as const;
  readonly environment = 'sandbox' as const;
  readonly provenance = 'DHMAD_SANDBOX' as const;
  private readonly baseUrl: string;

  constructor(
    private readonly options: {
      baseUrl?: string;
      apiKey?: string;
      webhookSecret?: string;
      allowLoopbackForTest?: boolean;
      timeoutMs?: number;
    },
  ) {
    const raw = (options.baseUrl ?? 'https://sandbox.dhmad.tn/api').replace(/\/+$/, '');
    const parsed = new URL(raw);
    const isSandbox = parsed.origin === 'https://sandbox.dhmad.tn';
    const isLoopback =
      Boolean(options.allowLoopbackForTest) &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
    if (!isSandbox && !isLoopback) {
      throw new ProviderError(
        'UNSUPPORTED_CAPABILITY',
        'NON_SANDBOX_URL_FORBIDDEN',
        'Only the DHMAD sandbox origin is permitted.',
      );
    }
    this.baseUrl = raw;
  }

  private assertConfiguredKey(): string {
    const key = this.options.apiKey;
    if (!key) {
      throw new ProviderError(
        'AUTH_FAILED',
        'DHMAD_CREDENTIALS_MISSING',
        'DHMAD sandbox API key is not configured.',
      );
    }
    if (!key.startsWith('sk_sandbox_')) {
      throw new ProviderError(
        'AUTH_FAILED',
        'LIVE_KEY_FORBIDDEN',
        'Only sk_sandbox_ keys are permitted.',
      );
    }
    return key;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    schema: z.ZodType<T>,
    options: { body?: unknown; headers?: Record<string, string>; isMutation: boolean },
  ): Promise<T> {
    const apiKey = this.assertConfiguredKey();
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(options.headers ?? {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 30000),
      });
    } catch (error) {
      const category = options.isMutation ? 'AMBIGUOUS_TIMEOUT' : 'RETRYABLE_READ';
      throw new ProviderError(
        category,
        'DHMAD_NETWORK_OR_TIMEOUT',
        error instanceof Error ? error.message : 'DHMAD request failed or timed out.',
      );
    }

    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (!res.ok) {
      const errObj = (payload && typeof payload === 'object' ? payload : {}) as {
        error?: string | { code?: string; message?: string; user_message?: string };
        message?: string;
      };
      const code =
        typeof errObj.error === 'object' && errObj.error?.code
          ? errObj.error.code
          : typeof errObj.error === 'string'
            ? errObj.error
            : `HTTP_${res.status}`;
      const message =
        (typeof errObj.error === 'object' ? errObj.error?.message : undefined) ??
        errObj.message ??
        `DHMAD API responded with HTTP ${res.status}`;

      if (res.status === 401) throw new ProviderError('AUTH_FAILED', code, message, 401);
      if (res.status === 403)
        throw new ProviderError('PERMISSION_OR_ASSOCIATION_DENIED', code, message, 403);
      if (res.status === 429) {
        const resetHeader = res.headers.get('X-RateLimit-Reset');
        const retryAfter = resetHeader
          ? Math.max(1, Math.ceil((Date.parse(resetHeader) - Date.now()) / 1000))
          : 60;
        throw new ProviderError('RATE_LIMITED', 'RATE_LIMITED', message, 429, retryAfter);
      }
      if (res.status >= 500) {
        throw new ProviderError(
          options.isMutation ? 'AMBIGUOUS_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
          code,
          message,
          res.status,
        );
      }
      throw new ProviderError('DEFINITIVE_REJECTION', code, message, res.status);
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ProviderError(
        'INVALID_RESPONSE',
        'INVALID_PROVIDER_SCHEMA',
        `DHMAD response failed validation: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
      );
    }
    return parsed.data;
  }

  async verifyAccountAssociation(): Promise<AccountVerificationResult> {
    const meSchema = z
      .object({
        apiKey: z.object({
          environment: z.string(),
          isActive: z.boolean(),
          permissions: z.array(z.string()).default([]),
        }),
        developer: z.object({ email: z.string() }),
      })
      .passthrough();
    const balanceSchema = z
      .object({
        balance: z.object({
          available: z.number(),
          pending: z.number(),
          escrow: z.number(),
        }),
      })
      .passthrough();

    const me = await this.request('GET', '/v1/me', meSchema, { isMutation: false });
    if (me.apiKey.environment !== 'sandbox' || !me.apiKey.isActive) {
      throw new ProviderError(
        'AUTH_FAILED',
        'INVALID_KEY_ENVIRONMENT',
        'API key must be an active sandbox key.',
      );
    }
    const missingPermissions = REQUIRED_DHMAD_PERMISSIONS.filter(
      (perm) => !me.apiKey.permissions.includes(perm),
    );
    let escrowReadVerified = false;
    try {
      await this.request(
        'GET',
        '/v1/escrows?limit=1&role=seller',
        z.object({ escrows: z.array(z.unknown()) }).passthrough(),
        { isMutation: false },
      );
      escrowReadVerified = true;
    } catch {
      escrowReadVerified = false;
    }
    try {
      const bal = await this.request('GET', '/v1/balance', balanceSchema, { isMutation: false });
      return {
        authenticated: true,
        environment: 'sandbox',
        developerEmail: me.developer.email,
        associatedBalanceAvailableTnd: formatTnd(dhmadNumberToMillimes(bal.balance.available)),
        associatedAccountVerified: true,
        escrowReadVerified,
        permissions: me.apiKey.permissions,
        missingPermissions,
      };
    } catch (error) {
      if (error instanceof ProviderError && error.category === 'PERMISSION_OR_ASSOCIATION_DENIED') {
        return {
          authenticated: true,
          environment: 'sandbox',
          developerEmail: me.developer.email,
          associatedAccountVerified: false,
          escrowReadVerified,
          permissions: me.apiKey.permissions,
          missingPermissions,
        };
      }
      throw error;
    }
  }

  async createEscrow(input: CreateEscrowRequest): Promise<EscrowRecord> {
    // Pass NASJ's verified sellerEmail when configured so DHMAD binds the KYC-verified seller user.
    const body: Record<string, unknown> = {
      title: input.title,
      amount: millimesToDhmadNumber(input.amountMillimes),
      currency: input.currency,
      buyerEmail: input.buyerEmail,
      ...(input.sellerEmail ? { sellerEmail: input.sellerEmail } : {}),
      mode: input.mode,
      feeBearer: input.feeBearer === 'BUYER' ? 'buyer' : 'seller',
      completionPolicy: {
        type: 'delivery_confirmation',
        buyerReviewDeadlineHours: input.reviewHours,
      },
    };
    if (input.mode === 'standard') {
      body.contractTerms = input.contractTerms;
      if (input.autoSignSeller !== undefined) body.autoSign = input.autoSignSeller;
    }
    const res = await this.request('POST', '/v1/escrows', dhmadCreateEscrowResponseSchema, {
      body,
      isMutation: true,
    });
    return mapEscrow(res.escrow, res.contract);
  }

  async getEscrow(externalEscrowId: string): Promise<EscrowRecord> {
    const res = await this.request(
      'GET',
      `/v1/escrows/${encodeURIComponent(externalEscrowId)}`,
      z.object({ escrow: dhmadEscrowSchema }).passthrough(),
      { isMutation: false },
    );
    return mapEscrow(res.escrow);
  }

  async listEscrows(params?: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<EscrowRecord[]> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    qs.set('role', 'seller');
    const res = await this.request(
      'GET',
      `/v1/escrows?${qs.toString()}`,
      z.object({ escrows: z.array(dhmadEscrowSchema) }).passthrough(),
      { isMutation: false },
    );
    return res.escrows.map((e) => mapEscrow(e));
  }

  async getContract(externalEscrowId: string): Promise<ContractRecord> {
    const res = await this.request(
      'GET',
      `/v1/escrows/${encodeURIComponent(externalEscrowId)}/contract`,
      z
        .object({
          contract: z
            .object({
              id: z.string().optional(),
              _id: z.string().optional(),
              escrow: z.union([
                z.string(),
                z.object({ id: z.string().optional(), _id: z.string().optional() }).passthrough(),
              ]),
              terms: z.string(),
              language: z.string().default('en'),
              pdfUrl: z.string().nullable().optional(),
              sellerSignature: z.unknown().nullable().optional(),
              buyerSignature: z.unknown().nullable().optional(),
              isFullySigned: z.boolean().default(false),
            })
            .passthrough()
            .refine((v) => Boolean(v.id ?? v._id), {
              message: 'Contract id or _id is required',
              path: ['id'],
            }),
        })
        .passthrough(),
      { isMutation: false },
    );
    const escrowId =
      typeof res.contract.escrow === 'string'
        ? res.contract.escrow
        : (res.contract.escrow.id ?? res.contract.escrow._id ?? externalEscrowId);
    return {
      contractId: (res.contract.id ?? res.contract._id)!,
      escrowId,
      terms: res.contract.terms,
      language: res.contract.language,
      pdfUrl: res.contract.pdfUrl ?? null,
      sellerSigned: Boolean(res.contract.sellerSignature),
      buyerSigned: Boolean(res.contract.buyerSignature),
      isFullySigned: res.contract.isFullySigned,
    };
  }

  async cancelEscrow(externalEscrowId: string): Promise<EscrowRecord> {
    const res = await this.request(
      'POST',
      `/v1/escrows/${encodeURIComponent(externalEscrowId)}/cancel`,
      z.object({ escrow: dhmadEscrowSchema }).passthrough(),
      { isMutation: true },
    );
    return mapEscrow(res.escrow);
  }

  async deliverEscrow(externalEscrowId: string): Promise<EscrowRecord> {
    const res = await this.request(
      'POST',
      `/v1/escrows/${encodeURIComponent(externalEscrowId)}/deliver`,
      z.object({ escrow: dhmadEscrowSchema }).passthrough(),
      { isMutation: true },
    );
    return mapEscrow(res.escrow);
  }

  async createCheckoutSession(input: CreateCheckoutSessionRequest): Promise<CheckoutSessionRecord> {
    const res = await this.request(
      'POST',
      `/v1/escrows/${encodeURIComponent(input.externalEscrowId)}/sessions`,
      z
        .object({
          sessionId: z.string().min(1),
          url: z.string().url(),
          expiresAt: z.string(),
        })
        .passthrough(),
      {
        body: {
          action: input.action,
          targetUserEmail: input.targetUserEmail,
          redirectUrl: input.redirectUrl,
          metadata: input.metadata ?? {},
        },
        isMutation: true,
      },
    );
    return {
      externalSessionId: res.sessionId,
      externalEscrowId: input.externalEscrowId,
      action: input.action,
      targetUserEmail: input.targetUserEmail,
      url: res.url,
      status: 'pending',
      expiresAt: res.expiresAt,
      completedAt: null,
    };
  }

  async getCheckoutSession(externalSessionId: string): Promise<CheckoutSessionRecord> {
    const res = await this.request(
      'GET',
      `/v1/sessions/${encodeURIComponent(externalSessionId)}`,
      z
        .object({
          session: z
            .object({
              sessionId: z.string(),
              escrowId: z.string(),
              action: z.string(),
              targetUserEmail: z.string(),
              status: z.enum(['pending', 'completed', 'expired', 'cancelled']),
              expiresAt: z.string().nullable().optional(),
              completedAt: z.string().nullable().optional(),
            })
            .passthrough(),
        })
        .passthrough(),
      { isMutation: false },
    );
    return {
      externalSessionId: res.session.sessionId,
      externalEscrowId: res.session.escrowId,
      action: res.session.action,
      targetUserEmail: res.session.targetUserEmail,
      status: res.session.status,
      expiresAt: res.session.expiresAt ?? null,
      completedAt: res.session.completedAt ?? null,
    };
  }

  async createIdentityVerification(input: {
    email: string;
    externalUserId: string;
    redirectUrl?: string;
  }): Promise<IdentityVerificationRecord> {
    const res = await this.request('POST', '/v1/identity-verifications', dhmadKycSchema, {
      body: {
        email: input.email.toLowerCase(),
        external_user_id: input.externalUserId,
        ...(input.redirectUrl ? { redirect_url: input.redirectUrl } : {}),
      },
      isMutation: true,
    });
    return mapKyc(res);
  }

  async getIdentityVerification(
    externalVerificationId: string,
  ): Promise<IdentityVerificationRecord> {
    const res = await this.request(
      'GET',
      `/v1/identity-verifications/${encodeURIComponent(externalVerificationId)}`,
      dhmadKycSchema,
      { isMutation: false },
    );
    return mapKyc(res);
  }

  async listDisputes(): Promise<DisputeRecord[]> {
    const res = await this.request(
      'GET',
      '/v1/disputes',
      z.object({ disputes: z.array(dhmadDisputeSchema) }).passthrough(),
      { isMutation: false },
    );
    return res.disputes.map(mapDispute);
  }

  async getDispute(externalDisputeId: string): Promise<DisputeRecord> {
    const res = await this.request(
      'GET',
      `/v1/disputes/${encodeURIComponent(externalDisputeId)}`,
      z.object({ dispute: dhmadDisputeSchema }).passthrough(),
      { isMutation: false },
    );
    return mapDispute(res.dispute);
  }

  async replyDispute(
    externalDisputeId: string,
    body: string,
    idempotencyKey: string,
  ): Promise<void> {
    await this.request(
      'POST',
      `/v1/disputes/${encodeURIComponent(externalDisputeId)}/messages`,
      z.object({}).passthrough(),
      {
        body: { body },
        headers: { 'Idempotency-Key': idempotencyKey },
        isMutation: true,
      },
    );
  }

  verifyWebhook(input: WebhookVerificationInput): boolean {
    return verifyDhmadWebhookSignature(input, this.options.webhookSecret);
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
