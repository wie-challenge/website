import { z } from 'zod';
import { DIRECTORY_COHORT_MINIMUM } from './directory.js';
import { formatTnd } from './domain.js';
import { requireRule, quantity } from './commerce/domain.js';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const count = z.number().int().min(0).max(1_000_000);
const positive = z.number().int().min(1).max(1_000_000);
const note = z.string().trim().max(240).default('');
const when = z.iso.datetime();

export const shipmentStatuses = [
  'PICKUP_SCHEDULED',
  'COLLECTED',
  'IN_TRANSIT',
  'DELIVERY_REPORTED',
  'BUYER_CONFIRMED',
  'DISCREPANCY',
  'CANCELLED',
] as const;
export type ShipmentStatus = (typeof shipmentStatuses)[number];
const shippedStatuses: readonly ShipmentStatus[] = [
  'IN_TRANSIT',
  'DELIVERY_REPORTED',
  'BUYER_CONFIRMED',
  'DISCREPANCY',
];
export function countsAsShipped(status: string) {
  return shippedStatuses.includes(status as ShipmentStatus);
}
export function fulfillmentStage(
  statuses: string[],
):
  | 'NOT_STARTED'
  | 'PICKUP_SCHEDULED'
  | 'IN_TRANSIT'
  | 'DELIVERY_REPORTED'
  | 'BUYER_CONFIRMED'
  | 'DISCREPANCY' {
  if (statuses.includes('DISCREPANCY')) return 'DISCREPANCY';
  if (statuses.includes('DELIVERY_REPORTED')) return 'DELIVERY_REPORTED';
  if (statuses.includes('IN_TRANSIT')) return 'IN_TRANSIT';
  if (statuses.includes('BUYER_CONFIRMED')) return 'BUYER_CONFIRMED';
  if (statuses.includes('COLLECTED') || statuses.includes('PICKUP_SCHEDULED'))
    return 'PICKUP_SCHEDULED';
  return 'NOT_STARTED';
}
export function assertShipmentEdge(from: ShipmentStatus, to: ShipmentStatus) {
  const allowed: Record<ShipmentStatus, ShipmentStatus[]> = {
    PICKUP_SCHEDULED: ['COLLECTED', 'CANCELLED'],
    COLLECTED: ['IN_TRANSIT'],
    IN_TRANSIT: ['DELIVERY_REPORTED'],
    DELIVERY_REPORTED: ['BUYER_CONFIRMED', 'DISCREPANCY'],
    BUYER_CONFIRMED: [],
    DISCREPANCY: [],
    CANCELLED: [],
  };
  requireRule(
    allowed[from].includes(to),
    'INVALID_TRANSITION',
    'That shipment change is not allowed from the current milestone.',
  );
}

export function allocatePieces(parts: { id: string; quantity: number }[], accepted: number) {
  for (const part of parts) quantity(part.quantity, true);
  quantity(accepted);
  const total = parts.reduce((sum, part) => sum + part.quantity, 0);
  requireRule(
    accepted <= total,
    'EXCESS_RECEIPT',
    'Accepted pieces cannot exceed the shipped pieces.',
  );
  if (total === 0) return parts.map((part) => ({ id: part.id, pieces: 0 }));
  const rows = parts.map((part) => {
    const product = accepted * part.quantity;
    return { ...part, pieces: Math.floor(product / total), remainder: product % total };
  });
  let left = accepted - rows.reduce((sum, row) => sum + row.pieces, 0);
  for (const row of [...rows].sort(
    (a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id),
  )) {
    if (left <= 0) break;
    if (row.pieces < row.quantity) {
      row.pieces += 1;
      left -= 1;
    }
  }
  requireRule(left === 0, 'EXCESS_RECEIPT', 'Accepted pieces could not be allocated.');
  return rows.map((row) => ({ id: row.id, pieces: row.pieces }));
}

export type ProducerShareAvailability =
  | 'AVAILABLE'
  | 'UNAVAILABLE_SMALL_GROUP'
  | 'UNAVAILABLE_DENOMINATOR';
export function agreedProducerShare(input: {
  compensationMillimes: bigint;
  quotationMillimes: bigint;
  refundMillimes: bigint;
  artisanCount: number;
}) {
  requireRule(
    input.refundMillimes >= 0n && input.refundMillimes <= input.quotationMillimes,
    'INVALID_QUANTITY',
    'A refund cannot exceed the quotation.',
  );
  const denominator = input.quotationMillimes - input.refundMillimes;
  const base = {
    basis: 'AGREED_NOT_PAID' as const,
    numeratorMillimes: input.compensationMillimes,
    denominatorMillimes: denominator,
    cohortMinimum: DIRECTORY_COHORT_MINIMUM,
  };
  if (input.artisanCount < DIRECTORY_COHORT_MINIMUM)
    return { ...base, availability: 'UNAVAILABLE_SMALL_GROUP' as const, basisPoints: null };
  if (denominator <= 0n)
    return { ...base, availability: 'UNAVAILABLE_DENOMINATOR' as const, basisPoints: null };
  const scaled = input.compensationMillimes * 10_000n;
  const basisPoints = scaled / denominator + (2n * (scaled % denominator) >= denominator ? 1n : 0n);
  requireRule(
    basisPoints <= 100_000n,
    'INVALID_QUANTITY',
    'The producer share is outside the supported range.',
  );
  return { ...base, availability: 'AVAILABLE' as const, basisPoints: Number(basisPoints) };
}
export function formatShare(basisPoints: number | null) {
  if (basisPoints === null) return null;
  return `${Math.floor(basisPoints / 100)}.${String(basisPoints % 100).padStart(2, '0')}%`;
}
export function formatMillimes(value: bigint) {
  return formatTnd(value);
}
export function plannedContribution(revenueMillimes: bigint, costMillimes: bigint) {
  if (costMillimes > revenueMillimes) return { status: 'UNAVAILABLE' as const, millimes: null };
  return { status: 'PLANNED' as const, millimes: revenueMillimes - costMillimes };
}
export function buyerReceipt(input: {
  reported: number;
  received: number;
  accepted: number;
  missing: number;
  damaged?: number;
}) {
  const damaged = input.damaged ?? input.received - input.accepted;
  requireRule(
    input.reported >= 0 &&
      input.received >= 0 &&
      input.accepted >= 0 &&
      input.missing >= 0 &&
      damaged >= 0 &&
      input.received + input.missing === input.reported &&
      input.accepted + damaged === input.received,
    'DELIVERY_MISMATCH',
    'Received and missing pieces must equal the reported delivery, and accepted plus damaged pieces must equal the received pieces.',
  );
  return { damaged, discrepancy: input.missing > 0 || damaged > 0 };
}

export const shipmentCreateSchema = z
  .object({
    items: z
      .array(z.object({ preparationItemId: id, quantity: positive }).strict())
      .min(1)
      .max(20),
    hub: z.string().trim().min(2).max(120),
    windowStart: when,
    windowEnd: when,
    coordinatorId: id,
  })
  .strict();
export const pickupSchema = z
  .object({
    version: z.number().int().min(1),
    hub: z.string().trim().min(2).max(120),
    windowStart: when,
    windowEnd: when,
    coordinatorId: id,
  })
  .strict();
export const handoverSchema = z
  .object({
    version: z.number().int().min(1),
    eventType: z.enum(['COLLECTED_FROM_ASSOCIATION', 'RECEIVED_AT_HUB', 'HANDED_TO_TRANSPORT']),
    quantity: positive,
    occurredAt: when,
    note,
    priorHandoverId: id.optional(),
  })
  .strict();
export const deliveryReportSchema = z
  .object({ version: z.number().int().min(1), quantity: positive, occurredAt: when, note })
  .strict();
export const buyerConfirmationSchema = z
  .object({
    version: z.number().int().min(1),
    received: count,
    accepted: count,
    missing: count,
    damaged: count.optional(),
    occurredAt: when,
    note,
  })
  .strict();
export const shipmentCancelSchema = z.object({ version: z.number().int().min(1) }).strict();
export const traceabilityDraftSchema = z
  .object({ story: z.string().trim().min(20).max(400) })
  .strict();
export const traceabilityReasonSchema = z
  .object({ reason: z.string().trim().min(2).max(240) })
  .strict();
export const payableReconcileSchema = z
  .object({ milestone: z.enum(['BUYER_ACCEPTED_PIECE', 'QUALITY_APPROVED']) })
  .strict();
export const simulationSchema = z
  .object({
    side: z.enum(['BUYER', 'ARTISAN']),
    payableId: id.optional(),
    dueAt: when,
    retryOf: id.optional(),
  })
  .strict();
export const simulationAdvanceSchema = z
  .object({ next: z.enum(['SIMULATED_INITIATED', 'SIMULATED_SETTLED', 'SIMULATED_FAILED']) })
  .strict();

export type ShipmentCreateInput = z.infer<typeof shipmentCreateSchema>;
export type PickupInput = z.infer<typeof pickupSchema>;
export type HandoverInput = z.infer<typeof handoverSchema>;
export type DeliveryReportInput = z.infer<typeof deliveryReportSchema>;
export type BuyerConfirmationInput = z.infer<typeof buyerConfirmationSchema>;
export type ShipmentCancelInput = z.infer<typeof shipmentCancelSchema>;
export type TraceabilityDraftInput = z.infer<typeof traceabilityDraftSchema>;
export type PayableReconcileInput = z.infer<typeof payableReconcileSchema>;
export type SimulationInput = z.infer<typeof simulationSchema>;
export type SimulationAdvanceInput = z.infer<typeof simulationAdvanceSchema>;
