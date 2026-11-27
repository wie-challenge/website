import type { JournalAccountCode } from '@nasj/contracts';
import { fail } from '../../common/errors.js';
import type { Db } from '../foundation/transaction.js';
import type { ProviderProvenance } from './provider.types.js';

export type JournalLineInput = {
  accountCode: JournalAccountCode;
  side: 'DEBIT' | 'CREDIT';
  amountMillimes: bigint;
  artisanProfileId?: string;
};

export async function postJournalBatch(
  tx: Db,
  input: {
    obligationId?: string;
    payoutSimulationId?: string;
    sourceType: string;
    sourceId: string;
    idempotencyKey: string;
    description: string;
    provenance: ProviderProvenance;
    lines: readonly JournalLineInput[];
  },
) {
  const existing = await tx.journalBatch.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { entries: true },
  });
  if (existing) return existing;

  if (input.lines.length < 2) {
    fail(400, 'UNBALANCED_JOURNAL', 'A journal batch requires at least two lines.');
  }
  let debits = 0n;
  let credits = 0n;
  for (const line of input.lines) {
    if (line.amountMillimes <= 0n) {
      fail(400, 'INVALID_JOURNAL_AMOUNT', 'Journal amounts must be positive.');
    }
    if (line.side === 'DEBIT') debits += line.amountMillimes;
    else credits += line.amountMillimes;
  }
  if (debits !== credits || debits <= 0n) {
    fail(400, 'UNBALANCED_JOURNAL', 'Journal debits must equal credits.');
  }

  return tx.journalBatch.create({
    data: {
      obligationId: input.obligationId ?? null,
      payoutSimulationId: input.payoutSimulationId ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      idempotencyKey: input.idempotencyKey,
      description: input.description,
      provenance: input.provenance,
      entries: {
        create: input.lines.map((line) => ({
          accountCode: line.accountCode,
          side: line.side,
          amountMillimes: line.amountMillimes,
          currency: 'TND',
          artisanProfileId: line.artisanProfileId ?? null,
        })),
      },
    },
    include: { entries: true },
  });
}

export async function getTrialBalance(tx: Db, obligationId?: string) {
  const entries = await tx.journalEntry.findMany({
    where: obligationId ? { batch: { obligationId } } : undefined,
    select: { accountCode: true, side: true, amountMillimes: true },
  });
  const totals = new Map<string, { debitMillimes: bigint; creditMillimes: bigint }>();
  let totalDebits = 0n;
  let totalCredits = 0n;
  for (const entry of entries) {
    const current = totals.get(entry.accountCode) ?? { debitMillimes: 0n, creditMillimes: 0n };
    if (entry.side === 'DEBIT') {
      current.debitMillimes += entry.amountMillimes;
      totalDebits += entry.amountMillimes;
    } else {
      current.creditMillimes += entry.amountMillimes;
      totalCredits += entry.amountMillimes;
    }
    totals.set(entry.accountCode, current);
  }
  return {
    balanced: totalDebits === totalCredits,
    totalDebitsMillimes: totalDebits,
    totalCreditsMillimes: totalCredits,
    accounts: [...totals.entries()].map(([accountCode, v]) => ({
      accountCode,
      debitMillimes: v.debitMillimes,
      creditMillimes: v.creditMillimes,
      netDebitMillimes: v.debitMillimes - v.creditMillimes,
    })),
  };
}
