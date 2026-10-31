import { z } from 'zod';
import { formatTnd, addTnd, prorateTnd } from './domain.js';

/**
 * Production intelligence.
 *
 * Every function here is deterministic and rule based and returns the inputs it used. Nothing
 * produces a probability, a confidence score or a machine-learning accuracy figure. Missing data is
 * reported as missing: it is never silently converted to a reassuring status, to zero, or to a
 * verified measurement.
 */

export const RISK_POLICY_VERSION = 3;
export const OBSERVED_EARNINGS_POLICY_VERSION = 2;
export const METRICS_POLICY_VERSION = 1;
export const MINIMUM_COHORT = 5;

/**
 * Reviewed, configurable reporting policy. A constant in code is not a reviewed policy: the
 * threshold and the producer-share denominator are read from stored, versioned configuration.
 */
export const DEFAULT_REPORTING_POLICY = {
  key: 'reporting',
  version: 1,
  minimumCohort: MINIMUM_COHORT,
  producerShareBasis: 'AGREED_PRODUCER_COMPENSATION_OVER_NET_QUOTATION_REVENUE',
} as const;

export type ReportingPolicy = {
  version: number;
  minimumCohort: number;
  producerShareBasis: string;
};

/* ------------------------------------------------------------------ delay risk */

export const riskStates = ['ON_TRACK', 'AT_RISK', 'OVERDUE', 'INSUFFICIENT_DATA'] as const;
export type RiskState = (typeof riskStates)[number];

export type RiskInputs = {
  now: string;
  deadline: string;
  acceptedQuantity: number | null;
  reportedProgress: number | null;
  /** Documented capacity available before the deadline, null when unknown. */
  confirmedCapacity: number | null;
  materialShortageOpen: boolean;
  qualityRejectionOpen: boolean;
  approvedScheduleChangeTo: string | null;
  /** True when a required input is missing rather than genuinely zero. */
  requiredInputsMissing: string[];
  lastProgressAt?: string | null;
  stalenessDays?: number;
};

export type RiskResult = {
  policyVersion: number;
  state: RiskState;
  reasons: { code: string; detail: string }[];
  unknowns: string[];
  remainingQuantity: number | null;
  daysToDeadline: number | null;
};

/**
 * Classify one batch. OVERDUE needs a deadline that has passed with work outstanding. AT_RISK
 * needs a positive, data-backed signal. INSUFFICIENT_DATA covers any batch whose remaining work
 * cannot be computed because progress or accepted quantity is unknown.
 */
export function assessDelayRisk(input: RiskInputs): RiskResult {
  const reasons: RiskResult['reasons'] = [];
  const unknowns = [...new Set(input.requiredInputsMissing)];
  // The clock is always "now". An approved schedule change replaces the applicable deadline.
  const now = new Date(input.now);
  const deadline = new Date(input.approvedScheduleChangeTo ?? input.deadline);
  const changed = Boolean(input.approvedScheduleChangeTo);
  if (
    input.lastProgressAt !== undefined &&
    (!input.lastProgressAt ||
      !Number.isFinite(new Date(input.lastProgressAt).getTime()) ||
      now.getTime() - new Date(input.lastProgressAt).getTime() >
        (input.stalenessDays ?? 7) * 86400000)
  ) {
    unknowns.push('PROGRESS_STALE');
    reasons.push({
      code: 'PROGRESS_STALE',
      detail:
        'The latest progress report is missing or older than the versioned seven-day review window.',
    });
  }
  if (Number.isNaN(deadline.getTime()) || Number.isNaN(now.getTime())) {
    unknowns.push('INVALID_RISK_INSTANT');
    unknown(unknowns);
    return {
      policyVersion: RISK_POLICY_VERSION,
      state: 'INSUFFICIENT_DATA',
      reasons,
      unknowns,
      remainingQuantity: null,
      daysToDeadline: null,
    };
  }
  const daysToDeadline = Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000);
  if (input.acceptedQuantity === null || input.reportedProgress === null) {
    unknown(unknowns);
    return {
      policyVersion: RISK_POLICY_VERSION,
      state: 'INSUFFICIENT_DATA',
      reasons,
      unknowns,
      remainingQuantity: null,
      daysToDeadline,
    };
  }
  const remaining = Math.max(0, input.acceptedQuantity - input.reportedProgress);
  if (changed)
    reasons.push({
      code: 'APPROVED_SCHEDULE_CHANGE',
      detail: 'An approved schedule change moves the applicable deadline.',
    });
  if (now.getTime() > deadline.getTime() && remaining > 0) {
    reasons.push({
      code: 'DEADLINE_PASSED',
      detail: `The applicable deadline ${deadline.toISOString()} has passed with ${remaining} piece(s) outstanding.`,
    });
    return {
      policyVersion: RISK_POLICY_VERSION,
      state: 'OVERDUE',
      reasons,
      unknowns,
      remainingQuantity: remaining,
      daysToDeadline,
    };
  }
  if (remaining === 0) {
    reasons.push({
      code: 'WORK_COMPLETE',
      detail: 'All accepted quantity is reported as produced.',
    });
    return {
      policyVersion: RISK_POLICY_VERSION,
      state: 'ON_TRACK',
      reasons,
      unknowns,
      remainingQuantity: 0,
      daysToDeadline,
    };
  }
  let atRisk = false;
  if (input.confirmedCapacity === null) unknowns.push('CONFIRMED_CAPACITY_UNKNOWN');
  else if (input.confirmedCapacity < remaining) {
    atRisk = true;
    reasons.push({
      code: 'CAPACITY_SHORTFALL',
      detail: `Remaining work (${remaining}) exceeds confirmed capacity (${input.confirmedCapacity}).`,
    });
  } else
    reasons.push({
      code: 'CAPACITY_SUFFICIENT',
      detail: 'Confirmed capacity covers the remaining work.',
    });
  if (input.materialShortageOpen) {
    atRisk = true;
    reasons.push({
      code: 'MATERIAL_SHORTAGE',
      detail: 'A material shortage exception is unresolved.',
    });
  }
  if (input.qualityRejectionOpen) {
    atRisk = true;
    reasons.push({
      code: 'QUALITY_REJECTION',
      detail: 'A quality rejection is open on this work.',
    });
  }
  // A batch close to its deadline with a large remainder is at risk only with a data-backed signal,
  // so the day threshold is part of the published policy rather than a hidden heuristic.
  if (daysToDeadline <= 3 && remaining > 0) {
    atRisk = true;
    reasons.push({
      code: 'DEADLINE_IMMINENT',
      detail: `${remaining} piece(s) remain with ${Math.max(0, daysToDeadline)} day(s) to the deadline.`,
    });
  }
  if (unknowns.length && !atRisk) {
    reasons.push({
      code: 'PARTIAL_DATA',
      detail: 'Some risk inputs are unknown; treat this as provisional.',
    });
  }
  return {
    policyVersion: RISK_POLICY_VERSION,
    state: atRisk ? 'AT_RISK' : unknowns.length ? 'INSUFFICIENT_DATA' : 'ON_TRACK',
    reasons,
    unknowns: [...new Set(unknowns)],
    remainingQuantity: remaining,
    daysToDeadline,
  };
}

function unknown(list: string[]) {
  if (!list.length) list.push('PROGRESS_OR_QUANTITY_UNKNOWN');
}

/* ------------------------------------------------------------------ forecast evaluation */

export type ForecastComparison = {
  policyVersion: number;
  forecastedFor: string;
  actualCompletedAt: string | null;
  observedDifferenceDays: number | null;
  absoluteErrorDays: number | null;
  status: 'COMPARABLE' | 'NOT_COMPLETED' | 'NO_FORECAST';
  note: string;
};

/**
 * Compare a preserved forecast with an observed completion. An error is only produced when both
 * the forecast instant and a genuine completion instant exist.
 */
export function compareForecast(input: {
  forecastedFor: string | null;
  actualCompletedAt: string | null;
}): ForecastComparison {
  if (!input.forecastedFor)
    return {
      policyVersion: RISK_POLICY_VERSION,
      forecastedFor: '',
      actualCompletedAt: input.actualCompletedAt,
      observedDifferenceDays: null,
      absoluteErrorDays: null,
      status: 'NO_FORECAST',
      note: 'No forecast snapshot exists for this batch.',
    };
  if (!input.actualCompletedAt)
    return {
      policyVersion: RISK_POLICY_VERSION,
      forecastedFor: input.forecastedFor,
      actualCompletedAt: null,
      observedDifferenceDays: null,
      absoluteErrorDays: null,
      status: 'NOT_COMPLETED',
      note: 'The batch has not completed, so no error can be computed.',
    };
  const forecast = new Date(input.forecastedFor);
  const actual = new Date(input.actualCompletedAt);
  if (Number.isNaN(forecast.getTime()) || Number.isNaN(actual.getTime()))
    return {
      policyVersion: RISK_POLICY_VERSION,
      forecastedFor: input.forecastedFor,
      actualCompletedAt: input.actualCompletedAt,
      observedDifferenceDays: null,
      absoluteErrorDays: null,
      status: 'NOT_COMPLETED',
      note: 'A recorded instant is malformed, so no error is computed.',
    };
  const difference = Math.round((actual.getTime() - forecast.getTime()) / 86_400_000);
  return {
    policyVersion: RISK_POLICY_VERSION,
    forecastedFor: forecast.toISOString(),
    actualCompletedAt: actual.toISOString(),
    observedDifferenceDays: difference,
    absoluteErrorDays: Math.abs(difference),
    status: 'COMPARABLE',
    note: 'Positive differences mean completion took longer than forecast.',
  };
}

/**
 * Aggregate error metrics. Returns null when no comparable observation exists: an empty set must not
 * be rendered as a perfect score.
 */
export function forecastErrorSummary(comparisons: ForecastComparison[]) {
  const comparable = comparisons.filter(
    (row): row is ForecastComparison & { absoluteErrorDays: number } =>
      row.status === 'COMPARABLE' && row.absoluteErrorDays !== null,
  );
  if (!comparable.length)
    return {
      observations: 0,
      meanAbsoluteErrorDays: null,
      meanSignedErrorDays: null,
      note: 'No comparable observed completion exists. No accuracy figure is reported.',
    };
  const totalAbsolute = comparable.reduce((sum, row) => sum + row.absoluteErrorDays, 0);
  const totalSigned = comparable.reduce((sum, row) => sum + (row.observedDifferenceDays ?? 0), 0);
  return {
    observations: comparable.length,
    meanAbsoluteErrorDays: Math.round((totalAbsolute / comparable.length) * 100) / 100,
    meanSignedErrorDays: Math.round((totalSigned / comparable.length) * 100) / 100,
    note: 'Computed only from batches with both a preserved forecast and an observed completion.',
  };
}

/* ------------------------------------------------------------------ fairness */

export type DistributionCount = {
  artisanProfileId: string;
  offered: number;
  accepted: number;
  declined: number;
  expired: number;
  paidParticipation?: number;
};

/**
 * Offer distribution with cohort suppression. Any group smaller than the minimum cohort is
 * withheld entirely rather than reported with a masked or rounded figure.
 */
export function offerDistribution(rows: DistributionCount[], minimumCohort = MINIMUM_COHORT) {
  const MINIMUM_COHORT = minimumCohort;
  const eligible = rows.length;
  const suppressed = eligible > 0 && eligible < MINIMUM_COHORT;
  if (suppressed)
    return {
      cohort: eligible,
      minimumCohort: MINIMUM_COHORT,
      suppressed: true,
      rows: [],
      note: 'The participating group is too small to report without risk of identifying a person.',
    };
  const offered = rows.reduce((sum, row) => sum + row.offered, 0);
  return {
    cohort: eligible,
    minimumCohort: MINIMUM_COHORT,
    suppressed: false,
    rows: rows.map((row) => ({
      ...row,
      sharePercent: offered === 0 ? null : Math.round((row.offered / offered) * 10000) / 100,
    })),
    note: 'Distribution counts offers, not merit. A decline is a voluntary choice and is not a penalty.',
  };
}

/* ------------------------------------------------------------------ metrics */

export type FulfillmentMetrics = {
  rfqs: number;
  acceptedQuotations: number;
  offeredQuantity: number;
  artisanAcceptedQuantity: number;
  producedPieces: number;
  qualityApprovedPieces: number;
  shippedPieces: number;
  receivedPieces?: number;
  buyerAcceptedPieces: number;
  requiredQuantity: number;
};

/**
 * Fulfillment ratios with explicit denominators. A ratio whose denominator is zero is reported as
 * unavailable rather than as zero percent.
 */
export function fulfillmentMetrics(input: FulfillmentMetrics) {
  const ratio = (numerator: number) => ({
    numerator,
    denominator: input.requiredQuantity,
    value:
      input.requiredQuantity === 0
        ? null
        : Math.round((numerator / input.requiredQuantity) * 10000) / 100,
  });
  return {
    policyVersion: METRICS_POLICY_VERSION,
    counts: input,
    produced: ratio(input.producedPieces),
    qualityApproved: ratio(input.qualityApprovedPieces),
    shipped: ratio(input.shippedPieces),
    received: ratio(input.receivedPieces ?? 0),
    buyerAccepted: ratio(input.buyerAcceptedPieces),
    note: 'Each ratio states its numerator and denominator. Undefined ratios are null, not zero.',
  };
}

export type CompensationMetrics = {
  agreedMillimes: string;
  earnedMillimes: string;
  payableMillimes: string;
  simulatedPaidMillimes: string;
  verifiedPaidMillimes: string;
};

/* ------------------------------------------------------- settlement evidence */

/**
 * The single authoritative definition of "independently verified payment". A settlement counts as
 * verified paid participation only when the finance stream has recorded it as settled AND the bank
 * reconciliation flag is set. Every other state - planned, initiated, failed, retried, simulated,
 * or settled-but-unreconciled - is evidence of an intent to pay, never of payment.
 *
 * This predicate is shared so that participation, timeliness and compensation figures cannot drift
 * apart. `SimulatedSettlement` rows are synthetic tools: `advance` pins `bankVerified` to false, so
 * a synthetic row can never satisfy this check.
 */
export function isVerifiedSettlement(row: { status: string; bankVerified: boolean }): boolean {
  return row.status === 'VERIFIED_SETTLED' && row.bankVerified === true;
}

/**
 * Settlement states that are still live attempts rather than completed or abandoned money movement.
 * Used where a retry must be refused; never used to recognise payment.
 */
export function isOpenSettlement(row: { status: string }): boolean {
  return ['SCHEDULED', 'INITIATED', 'PENDING', 'RETRY', 'SIMULATED_INITIATED'].includes(row.status);
}

/**
 * Verified amounts are summed per payable rather than per settlement record so that a duplicated,
 * replayed or retired attempt cannot inflate the total. Only the largest single verified amount for
 * a payable is credited, and never more than the payable itself is worth.
 */
export function verifiedPaidMillimes(
  settlements: {
    status: string;
    bankVerified: boolean;
    amountMillimes: bigint;
    subjectKey: string;
  }[],
): bigint {
  const best = new Map<string, bigint>();
  for (const row of settlements) {
    if (!isVerifiedSettlement(row)) continue;
    if (row.amountMillimes <= 0n) continue;
    const seen = best.get(row.subjectKey);
    if (seen === undefined || row.amountMillimes > seen)
      best.set(row.subjectKey, row.amountMillimes);
  }
  let total = 0n;
  for (const amount of best.values()) total += amount;
  return total;
}

/**
 * Simulated totals are reported separately and deliberately do not exclude anything: the point of
 * the figure is to show how much synthetic money movement exists beside the verified figure.
 */
export function simulatedPaidMillimes(
  settlements: { status: string; amountMillimes: bigint }[],
): bigint {
  let total = 0n;
  for (const row of settlements) {
    if (!['SIMULATED_SETTLED', 'SIMULATED_INITIATED'].includes(row.status)) continue;
    if (row.amountMillimes <= 0n) continue;
    total += row.amountMillimes;
  }
  return total;
}

/**
 * Compensation is split into four separate figures that are never summed into one "paid" number.
 * Agreed is a contractual figure, earned is recognised from accepted work, payable is owed now,
 * simulated paid is a synthetic settlement, and verified paid requires real evidence.
 */
export function compensationMetrics(input: CompensationMetrics) {
  const agreed = addTnd(0n, BigInt(input.agreedMillimes));
  const earned = BigInt(input.earnedMillimes);
  const payable = BigInt(input.payableMillimes);
  const simulated = BigInt(input.simulatedPaidMillimes);
  const verified = BigInt(input.verifiedPaidMillimes);
  return {
    policyVersion: METRICS_POLICY_VERSION,
    currency: 'TND' as const,
    agreed: formatTnd(agreed),
    earned: formatTnd(earned),
    payable: formatTnd(payable),
    simulatedPaid: formatTnd(simulated),
    verifiedPaid: formatTnd(verified),
    verifiedAvailable: verified > 0n,
    note: 'Agreed, earned, payable, simulated and verified amounts are distinct. They are never combined.',
  };
}

/* ------------------------------------------------------------------ earnings and hours */

/**
 * Effective earnings per observed hour. Unknown hours stay unknown; they are never treated as zero
 * and never inferred from wearable or strain data.
 */
export function effectiveEarnings(input: {
  agreedMillimes: string | null;
  observedMinutes: number | null;
  scope: string;
}) {
  if (input.agreedMillimes === null)
    return {
      status: 'UNAVAILABLE' as const,
      reason: 'Agreed compensation is not recorded for this work.',
      hourlyTnd: null,
      observedMinutes: input.observedMinutes,
      scope: input.scope,
    };
  if (input.observedMinutes === null)
    return {
      status: 'UNAVAILABLE' as const,
      reason: 'Observed hours are UNKNOWN. An unknown duration is not zero.',
      hourlyTnd: null,
      observedMinutes: null,
      scope: input.scope,
    };
  if (input.observedMinutes <= 0)
    return {
      status: 'UNAVAILABLE' as const,
      reason: 'An observed duration of zero cannot produce an hourly rate.',
      hourlyTnd: null,
      observedMinutes: input.observedMinutes,
      scope: input.scope,
    };
  const hourly = prorateTnd(BigInt(input.agreedMillimes), 60n, BigInt(input.observedMinutes));
  return {
    status: 'AVAILABLE' as const,
    reason: 'Computed from agreed compensation and recorded observed time for the stated scope.',
    hourlyTnd: formatTnd(hourly),
    observedMinutes: input.observedMinutes,
    scope: input.scope,
  };
}

/* ------------------------------------------------------------------ association outcomes */

export type AssociationOutcome = {
  groupCount: number;
  acceptedProduction: number;
  deliveredOutput: number;
  qualityApproved: number;
  aggregateCompensationTnd: string;
  period: string;
  evidence: 'SYNTHETIC' | 'OBSERVED';
};

export function supressOutcome(outcome: AssociationOutcome, minimumCohort = MINIMUM_COHORT) {
  const MINIMUM_COHORT = minimumCohort;
  if (outcome.groupCount < MINIMUM_COHORT)
    return {
      suppressed: true as const,
      minimumCohort: MINIMUM_COHORT,
      note: `Fewer than ${MINIMUM_COHORT} participating groups. Aggregate outcomes are withheld to protect individuals.`,
    };
  return { suppressed: false as const, minimumCohort: MINIMUM_COHORT, outcome };
}

/* ------------------------------------------------------------------ producer share */

/**
 * Aggregate producer share with its formula and denominator disclosed. It is never computed for a
 * cohort below the reviewed threshold, and it is a modelled ratio of agreed compensation to net
 * quotation revenue — not cash paid or verified income.
 */
export function producerShare(input: {
  agreedCompensationMillimes: string;
  netQuotationRevenueMillimes: string;
  cohort: number;
  minimumCohort?: number;
}) {
  const threshold = input.minimumCohort ?? MINIMUM_COHORT;
  if (input.cohort < threshold)
    return {
      suppressed: true as const,
      minimumCohort: threshold,
      cohort: input.cohort,
      formula: DEFAULT_REPORTING_POLICY.producerShareBasis,
      note: 'The participating cohort is below the reviewed reporting threshold.',
    };
  const revenue = BigInt(input.netQuotationRevenueMillimes);
  if (revenue <= 0n)
    return {
      suppressed: false as const,
      cohort: input.cohort,
      minimumCohort: threshold,
      formula: DEFAULT_REPORTING_POLICY.producerShareBasis,
      sharePercent: null,
      numeratorTnd: formatTnd(BigInt(input.agreedCompensationMillimes)),
      denominatorTnd: formatTnd(revenue),
      note: 'Net quotation revenue is zero, so the share is undefined rather than zero.',
    };
  const numerator = BigInt(input.agreedCompensationMillimes);
  return {
    suppressed: false as const,
    cohort: input.cohort,
    minimumCohort: threshold,
    formula: DEFAULT_REPORTING_POLICY.producerShareBasis,
    sharePercent: Math.round(Number((numerator * 10000n) / revenue) / 100),
    numeratorTnd: formatTnd(numerator),
    denominatorTnd: formatTnd(revenue),
    note: 'Modelled aggregate share of agreed artisan compensation in net quotation revenue.',
  };
}

/* ------------------------------------------------------------------ observed time */

/**
 * Full-scope agreed compensation may be divided only by complete observed time for that scope.
 * Every current record must retain consent, positive integer minutes/units, a valid nonoverlapping
 * reporting period, and an accepted evidence class. Units must sum exactly to the covered quantity.
 * Partial coverage is unavailable: no partial denominator is paired with the full compensation.
 * SYNTHETIC evidence stays synthetic; this estimate is neither earned nor verified paid income.
 */
export function earningsFromObservedTime(input: {
  agreedMillimes: string | null;
  coveredQuantity: number;
  records: {
    consented: boolean;
    observedMinutes: number | null;
    observedUnits: number;
    periodFrom: string | Date;
    periodTo: string | Date;
    evidence: string;
  }[];
  scope: string;
}) {
  const unavailable = (reason: string) => ({
    policyVersion: OBSERVED_EARNINGS_POLICY_VERSION,
    status: 'UNAVAILABLE' as const,
    reason,
    hourlyTnd: null,
    observedMinutes: null,
    scope: input.scope,
  });
  if (input.agreedMillimes === null) return unavailable('Agreed compensation is not recorded.');
  if (!Number.isSafeInteger(input.coveredQuantity) || input.coveredQuantity <= 0)
    return unavailable('The compensation scope must have a known positive covered quantity.');
  if (!input.records.length)
    return unavailable('Complete consented observed time is missing. Unknown time is not zero.');
  // Sort a copy so validation is deterministic and never mutates caller-owned evidence.
  const periods = input.records
    .map((row) => ({
      ...row,
      start: new Date(row.periodFrom).getTime(),
      end: new Date(row.periodTo).getTime(),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  if (periods.some((row) => !row.consented))
    return unavailable('Consent is missing or withdrawn for part of the compensation scope.');
  if (
    periods.some(
      (row) =>
        !['SYNTHETIC', 'OBSERVED'].includes(row.evidence) ||
        !Number.isSafeInteger(row.observedMinutes) ||
        (row.observedMinutes ?? 0) <= 0 ||
        !Number.isSafeInteger(row.observedUnits) ||
        row.observedUnits <= 0 ||
        !Number.isFinite(row.start) ||
        !Number.isFinite(row.end) ||
        row.end <= row.start ||
        (row.observedMinutes ?? 0) > (row.end - row.start) / 60000,
    )
  )
    return unavailable(
      'Every covered record needs valid positive observed time, units and a reporting period. Unknown time is not zero.',
    );
  if (periods.some((row, i) => i > 0 && row.start < periods[i - 1]!.end))
    return unavailable(
      'Reporting periods overlap; full-scope observed time cannot be established.',
    );
  if (periods.reduce((sum, row) => sum + row.observedUnits, 0) !== input.coveredQuantity)
    return unavailable('Observed units do not exactly cover the full compensation scope.');
  const minutes = periods.reduce((sum, row) => sum + row.observedMinutes!, 0);
  if (!Number.isSafeInteger(minutes))
    return unavailable('Total observed time exceeds the supported integer range.');
  return {
    policyVersion: OBSERVED_EARNINGS_POLICY_VERSION,
    status: 'AVAILABLE' as const,
    reason:
      'Full-scope agreed compensation divided by complete consented observed time; this is not verified paid income.',
    hourlyTnd: formatTnd(prorateTnd(BigInt(input.agreedMillimes), 60n, BigInt(minutes))),
    observedMinutes: minutes,
    scope: input.scope,
  };
}

/* ------------------------------------------------------------------ alert identity */

/** Stable identity for an alert so the same condition is not raised repeatedly. */
export function alertIdentity(input: {
  batchId: string;
  ruleVersion: number;
  reasons: { code: string }[];
  observedAt: string;
}) {
  const codes = input.reasons
    .map((reason) => reason.code)
    .sort()
    .join('|');
  // The observation day is part of the identity: a persistent condition re-alerts on a new day
  // but not on every poll.
  const day = input.observedAt.slice(0, 10);
  return `${input.batchId}:${input.ruleVersion}:${codes}:${day}`;
}

/* ------------------------------------------------------------------ request schemas */

export const associationOutcomeQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
  })
  .strict();

export type RiskBatchView = {
  batchId: string;
  orderId: string;
  artisanDisplayName: string;
  quantity: number;
  deadline: string;
  risk: RiskResult;
  evaluatedAt: string;
  interventionOwner: string;
};

export type IntelligenceWorkspaceView = {
  generatedAt: string;
  period: { from: string; to: string; timezone: string };
  alerts: {
    id: string;
    batchId: string;
    status: string;
    kind: string;
    ownerRole: string;
    createdAt: string;
  }[];
  riskPolicyVersion: number;
  metricsPolicyVersion: number;
  batches: RiskBatchView[];
  forecasts: {
    batchId: string;
    evidence: string;
    comparison: ForecastComparison;
  }[];
  forecastSummary: ReturnType<typeof forecastErrorSummary>;
  syntheticForecastSummary: ReturnType<typeof forecastErrorSummary>;
  fairness: ReturnType<typeof offerDistribution>;
  fulfillment: ReturnType<typeof fulfillmentMetrics>;
  compensation: ReturnType<typeof compensationMetrics> | null;
  producerShare: ReturnType<typeof producerShare>;
  reportingPolicy: ReportingPolicy;
  rankingAudit: {
    policyVersion: number;
    snapshots: number;
    overrides: number;
    excludedCandidates: number;
  };
  limitations: string[];
};

export const intelligencePeriodSchema = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
  })
  .strict();
export const forecastSnapshotSchema = z
  .object({
    forecastedFor: z.iso.datetime({ offset: true }),
    assumptions: z.string().trim().min(20).max(2000),
    evidence: z.enum(['SYNTHETIC', 'OBSERVED']),
  })
  .strict();
export const productionTimeSchema = z
  .object({
    consented: z.literal(true),
    periodFrom: z.iso.datetime({ offset: true }),
    periodTo: z.iso.datetime({ offset: true }),
    unitContext: z.string().trim().min(5).max(500),
    observedMinutes: z.number().int().positive().max(525600).nullable(),
    evidence: z.enum(['SYNTHETIC', 'OBSERVED']),
    provenance: z.string().trim().min(10).max(1000),
    observedUnits: z.number().int().min(0).max(1000000).default(0),
    correctionOfId: z.string().min(1).max(128).optional(),
  })
  .strict()
  .refine(
    (v) => new Date(v.periodTo) > new Date(v.periodFrom),
    'The reporting window must have positive duration.',
  )
  .refine(
    (v) =>
      v.observedMinutes === null ||
      v.observedMinutes <=
        (new Date(v.periodTo).getTime() - new Date(v.periodFrom).getTime()) / 60000,
    'Observed time must fit within the reporting window.',
  );
export const alertDecisionSchema = z
  .object({
    action: z.enum(['ACKNOWLEDGE', 'RESOLVE']),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();
export const reportingPolicySchema = z
  .object({
    minimumCohort: z.number().int().min(5).max(100),
    reviewReference: z.string().trim().min(20).max(1000),
  })
  .strict();
export const rankingAuditFindingSchema = z
  .object({
    orderId: z.string().min(1).max(128),
    purpose: z.string().trim().min(10).max(500),
    finding: z.string().trim().min(10).max(2000),
    correctiveDecision: z.string().trim().min(10).max(2000),
  })
  .strict();
