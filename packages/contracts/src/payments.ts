import { z } from 'zod';
import { tndSchema } from './commerce/contracts.js';
import { parseTnd } from './domain.js';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const reason = z.string().trim().min(2).max(2000);

export const PAYMENT_OBLIGATION_STATES = [
  'AWAITING_PAYMENT',
  'PAYMENT_PENDING',
  'FUNDS_SECURED',
  'AWAITING_DELIVERY_ACCEPTANCE',
  'SETTLED',
  'CANCELLED',
  'FAILED',
  'REFUNDED',
  'DISPUTED',
] as const;
export type PaymentObligationStatus = (typeof PAYMENT_OBLIGATION_STATES)[number];

export const PAYMENT_CHANNELS = ['B2C', 'B2B'] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

export const FEE_BEARERS = ['SELLER', 'BUYER'] as const;
export type FeeBearer = (typeof FEE_BEARERS)[number];

export const KYC_STATUSES = ['NOT_STARTED', 'PENDING', 'APPROVED', 'REJECTED'] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

export const CHECKOUT_ACTIONS = [
  'accept_pay',
  'sign_contract',
  'complete',
  'dispute',
  'request_cancellation',
  'cancel_escrow',
  'accept_cancellation',
  'reject_cancellation',
  'refund_funds',
] as const;
export type CheckoutAction = (typeof CHECKOUT_ACTIONS)[number];

export const JOURNAL_ACCOUNTS = [
  'CUSTOMER_RECEIVABLE',
  'ESCROW_HELD',
  'PROVIDER_FEES_EXPENSE',
  'NASJ_SETTLED_CLEARING',
  'ARTISAN_PAYABLE_LIABILITY',
  'ARTISAN_PAYOUT_CLEARING',
  'SIMULATED_CASH_OUT',
  'REFUND_LIABILITY',
  'DISPUTE_HOLD',
  'NASJ_CONTRIBUTION_RESERVE',
] as const;
export type JournalAccountCode = (typeof JOURNAL_ACCOUNTS)[number];

export const PAYOUT_SIMULATION_STATES = [
  'PAYOUT_SCHEDULED',
  'PAYOUT_PROCESSING',
  'PAID',
  'FAILED',
  'ON_HOLD',
  'REVERSED',
] as const;
export type PayoutSimulationStatus = (typeof PAYOUT_SIMULATION_STATES)[number];

export const createPaymentObligationSchema = z
  .object({
    channel: z.enum(PAYMENT_CHANNELS),
    orderId: id,
    feeBearer: z.enum(FEE_BEARERS).default('SELLER'),
    buyerEmail: z.string().email().max(254),
    title: z.string().trim().min(2).max(200).optional(),
    contractTerms: z.string().trim().min(10).max(10000).optional(),
    reason,
  })
  .strict();

export const createCheckoutSessionSchema = z
  .object({
    action: z.enum(CHECKOUT_ACTIONS),
    targetUserEmail: z.string().email().max(254).optional(),
    redirectPath: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .regex(/^\/[a-zA-Z0-9/_?=&%-]*$/, 'Use a relative application path starting with /.')
      .default('/orders'),
  })
  .strict();

export const deliverEscrowSchema = z
  .object({
    reason,
  })
  .strict();

export const cancelEscrowSchema = z
  .object({
    reason,
  })
  .strict();

export const initiateKycSchema = z
  .object({
    email: z.string().email().max(254),
    consentConfirmed: z.literal(true),
    redirectPath: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .regex(/^\/[a-zA-Z0-9/_?=&%-]*$/)
      .optional(),
  })
  .strict();

export const reviewKycSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    note: reason,
  })
  .strict();

export const b2cAllocationPlanSchema = z
  .object({
    basis: z.enum(['GROSS', 'AFTER_MATERIALS', 'AFTER_DIRECT_COSTS']).default('GROSS'),
    materialCostTnd: tndSchema.default('0.000'),
    otherDirectCostTnd: tndSchema.default('0.000'),
    expectedFeeTnd: tndSchema.default('0.000'),
    artisans: z
      .array(z.object({ artisanId: id, basisPoints: z.number().int().min(0).max(10000) }).strict())
      .min(1)
      .max(100),
    reason,
  })
  .strict();

export const simulatePayoutSchema = z
  .object({
    payoutRequestId: id,
    reference: z.string().trim().min(3).max(128),
    outcome: z.enum(['PAID', 'FAILED', 'ON_HOLD']).default('PAID'),
    reason,
  })
  .strict();

export const resolveDiscrepancySchema = z
  .object({
    resolution: z.enum(['ACKNOWLEDGED', 'RESOLVED']),
    note: reason,
  })
  .strict();

export const providerDisputeReplySchema = z
  .object({
    body: z.string().trim().min(2).max(4000),
  })
  .strict();

/** Converts a numeric JSON TND value into exact integer millimes without float drift. */
export function dhmadNumberToMillimes(value: number | string): bigint {
  if (typeof value === 'string') return parseTnd(value);
  if (!Number.isFinite(value) || value < 0) throw new RangeError('Invalid provider TND amount.');
  const rounded = value.toFixed(3);
  return parseTnd(rounded);
}

/** Converts integer millimes to decimal TND number only for outbound DHMAD JSON payloads. */
export function millimesToDhmadNumber(millimes: bigint): number {
  if (millimes < 0n) throw new RangeError('Amount must be nonnegative.');
  return Number((millimes / 1000n).toString()) + Number(millimes % 1000n) / 1000;
}
