'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import {
  ActionForm,
  Input,
  ResourceState,
  Select,
  humanize,
  text,
  useResource,
} from './workspace-ui';

const payRoot = '/api/v1/payments';
const finRoot = '/api/v1/finance';
const post = (path: string, body: unknown = {}) =>
  apiFetch(path, { method: 'POST', body, idempotencyKey: crypto.randomUUID() });

type CheckoutSessionView = {
  id: string;
  action: string;
  status: string;
  checkoutUrl: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type ObligationView = {
  id: string;
  channel: 'B2C' | 'B2B';
  currency: string;
  amountTnd: string;
  feeBearer: string;
  expectedFeeTnd: string;
  buyerFundingTnd: string;
  status: string;
  reconciliationStatus: string;
  sandboxOnly: boolean;
  escrow: {
    id: string;
    provider: string;
    environment: string;
    externalEscrowId: string | null;
    mode: string;
    status: string;
    providerStatus: string;
    reviewHours: number;
    deliveredAt: string | null;
    completionDeadline: string | null;
    sellerSigned: boolean;
    buyerSigned: boolean;
    isFullySigned: boolean;
    contractPdfUrl: string | null;
    provenance: string;
    sessions?: CheckoutSessionView[];
  } | null;
};

type FinancialPlansView = {
  locked: boolean;
  snapshots: {
    id: string;
    revision: number;
    calculationBase: string;
    customerPriceMillimes: string;
    baseMillimes: string;
    contributionMillimes: string;
    approvalReason: string;
    allocations: { artisanProfileId: string; basisPoints: number; amountMillimes: string }[];
  }[];
  drafts: {
    id: string;
    actorId: string;
    status: string;
    reason: string;
    data: { targetRevision?: number; isAmendment?: boolean };
  }[];
};

function parseArtisanPairs(raw: string) {
  return raw
    .split(/[\n,;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [artisanId, bps] = part.split(':').map((s) => s.trim());
      return { artisanId, basisPoints: Number(bps) };
    });
}

export function OrderEscrowPanel({
  channel,
  orderId,
  isFinance,
}: {
  channel: 'B2C' | 'B2B';
  orderId: string;
  isFinance: boolean;
}) {
  const obligations = useResource<ObligationView[]>(
    `${payRoot}/orders/${channel}/${orderId}/obligations`,
  );
  const [redirectReturnPath] = useState(channel === 'B2C' ? `/orders/${orderId}` : '/procurement');

  return (
    <section className="panel" aria-label="Escrow and payment">
      <h3>Escrow and checkout (Sandbox only)</h3>
      <p>
        <strong>Sandbox mode:</strong> All escrow operations use synthetic or sandbox test
        credentials. No real money or live bank transfers occur. Buyers pay NASJ centrally; NASJ
        manages artisan compensation separately.
      </p>
      <ResourceState {...obligations} retry={obligations.reload} />
      {obligations.data?.map((ob) => (
        <article key={ob.id} className="section-gap">
          <p>
            Obligation {ob.id} · {ob.amountTnd} {ob.currency} (Buyer funding {ob.buyerFundingTnd}{' '}
            TND, fee bearer: {humanize(ob.feeBearer)}) · <strong>{humanize(ob.status)}</strong> ·
            Reconciliation: {humanize(ob.reconciliationStatus)}
          </p>
          {ob.escrow && (
            <>
              <p>
                Provider: {ob.escrow.provider} ({ob.escrow.environment} ·{' '}
                {humanize(ob.escrow.provenance)}) · Mode: {ob.escrow.mode} · Provider status:{' '}
                {ob.escrow.providerStatus} · Review window: {ob.escrow.reviewHours}h
              </p>
              {ob.escrow.mode === 'standard' && (
                <p>
                  B2B Contract signatures — Seller signed: {ob.escrow.sellerSigned ? 'Yes' : 'No'} ·
                  Buyer signed: {ob.escrow.buyerSigned ? 'Yes' : 'No'} · Fully signed:{' '}
                  {ob.escrow.isFullySigned ? 'Yes' : 'No'}
                </p>
              )}
              <ActionForm
                label="Create hosted checkout session"
                onSuccess={obligations.reload}
                action={(form) =>
                  post(`${payRoot}/obligations/${ob.id}/checkout-sessions`, {
                    action: text(form, 'action'),
                    redirectPath: redirectReturnPath,
                  })
                }
              >
                <Select
                  name="action"
                  label="Checkout action"
                  options={
                    channel === 'B2B'
                      ? [
                          'sign_contract',
                          'accept_pay',
                          'complete',
                          'dispute',
                          'request_cancellation',
                          ...(isFinance ? ['cancel_escrow'] : []),
                        ]
                      : [
                          'accept_pay',
                          'complete',
                          'dispute',
                          'request_cancellation',
                          ...(isFinance ? ['cancel_escrow'] : []),
                        ]
                  }
                />
              </ActionForm>
              {ob.escrow.sessions?.map((session) => (
                <div key={session.id}>
                  <p>
                    Session {session.action} · {humanize(session.status)}
                    {session.checkoutUrl ? (
                      <>
                        {' · '}
                        <a href={session.checkoutUrl} target="_blank" rel="noreferrer">
                          Open hosted checkout
                        </a>
                      </>
                    ) : null}
                  </p>
                  <ActionForm
                    label={`Verify session ${session.action} with provider`}
                    onSuccess={obligations.reload}
                    action={() => post(`${payRoot}/checkout-sessions/${session.id}/sync`)}
                  />
                </div>
              ))}
              {isFinance && ob.status === 'FUNDS_SECURED' && (
                <ActionForm
                  label="Declare physical delivery to provider"
                  onSuccess={obligations.reload}
                  action={(form) =>
                    post(`${payRoot}/obligations/${ob.id}/deliver`, {
                      reason: text(form, 'reason'),
                    })
                  }
                >
                  <Input name="reason" label="Physical delivery evidence reference" required />
                </ActionForm>
              )}
              {isFinance && ob.status === 'AWAITING_PAYMENT' && (
                <ActionForm
                  label="Cancel pending unfunded escrow"
                  onSuccess={obligations.reload}
                  action={(form) =>
                    post(`${payRoot}/obligations/${ob.id}/cancel`, {
                      reason: text(form, 'reason'),
                    })
                  }
                >
                  <Input name="reason" label="Cancellation reason" required />
                </ActionForm>
              )}
            </>
          )}
        </article>
      ))}
      {(!obligations.data || obligations.data.length === 0) && (
        <ActionForm
          label="Create payment obligation and escrow"
          onSuccess={obligations.reload}
          action={(form) =>
            post(`${payRoot}/obligations`, {
              channel,
              orderId,
              buyerEmail: text(form, 'buyerEmail'),
              feeBearer: text(form, 'feeBearer'),
              reason: text(form, 'reason'),
            })
          }
        >
          <Input name="buyerEmail" label="Buyer email for DHMAD checkout" type="email" required />
          <Select name="feeBearer" label="Fee bearer" options={['SELLER', 'BUYER']} />
          <Input name="reason" label="Initiation note" required />
        </ActionForm>
      )}
    </section>
  );
}

export function FinancialPlanPanel({
  orderId,
  canDraft,
  canApprove,
}: {
  orderId: string;
  canDraft: boolean;
  canApprove: boolean;
}) {
  const plans = useResource<FinancialPlansView>(`${finRoot}/orders/${orderId}/financial-plans`);
  const hasSnapshot = Boolean(plans.data?.snapshots.length);

  return (
    <section className="panel" aria-label="Dynamic financial plan and artisan allocations">
      <h3>Request financial plan and artisan allocations</h3>
      <ResourceState {...plans} retry={plans.reload} />
      {plans.data && (
        <>
          <p>
            Snapshot status: <strong>{plans.data.locked ? 'LOCKED BY ESCROW' : 'OPEN'}</strong>
          </p>
          {plans.data.snapshots.map((snap) => (
            <article key={snap.id}>
              <p>
                Revision v{snap.revision} · Basis: {humanize(snap.calculationBase)} · Approval:{' '}
                {snap.approvalReason}
              </p>
              <ul>
                {snap.allocations.map((a) => (
                  <li key={a.artisanProfileId}>
                    Artisan {a.artisanProfileId}: {a.basisPoints / 100}% ({a.amountMillimes}{' '}
                    millimes)
                  </li>
                ))}
              </ul>
            </article>
          ))}
          {plans.data.drafts.map((draft) => (
            <article key={draft.id}>
              <p>
                Draft {draft.id} ({draft.data?.isAmendment ? 'Amendment' : 'Initial'}) ·{' '}
                {draft.reason}
              </p>
              {canApprove && !plans.data?.locked && (
                <ActionForm
                  label="Independently approve financial plan"
                  onSuccess={plans.reload}
                  action={(form) =>
                    post(`${finRoot}/orders/${orderId}/financial-plan-drafts/${draft.id}/approve`, {
                      reason: text(form, 'reason'),
                    })
                  }
                >
                  <Input name="reason" label="Independent approval reason" required />
                </ActionForm>
              )}
            </article>
          ))}
          {canDraft && !plans.data.locked && (
            <ActionForm
              label={
                hasSnapshot ? 'Draft authorized plan amendment' : 'Draft initial financial plan'
              }
              onSuccess={plans.reload}
              action={(form) =>
                post(
                  `${finRoot}/orders/${orderId}/${
                    hasSnapshot ? 'financial-plan-amendments' : 'financial-plan-drafts'
                  }`,
                  {
                    basis: text(form, 'basis'),
                    expectedFeeTnd: text(form, 'expectedFeeTnd'),
                    artisans: parseArtisanPairs(text(form, 'artisans')),
                    reason: text(form, 'reason'),
                  },
                )
              }
            >
              <Select
                name="basis"
                label="Calculation base"
                options={['GROSS', 'AFTER_MATERIALS', 'AFTER_DIRECT_COSTS']}
              />
              <Input name="expectedFeeTnd" label="Expected fee (TND)" value="0.000" required />
              <Input
                name="artisans"
                label="Artisan allocations (artisanId:basisPoints, comma-separated)"
                required
              />
              <Input name="reason" label="Allocation rationale" required />
            </ActionForm>
          )}
        </>
      )}
    </section>
  );
}

export function PaymentsOperationsPanel() {
  const status = useResource<{
    enabled: boolean;
    provider: string;
    environment: string;
    associatedAccountVerified: boolean;
    realPayoutsEnabled: boolean;
    errorCode?: string;
  }>(`${payRoot}/provider/status`);
  const trialBalance = useResource<{
    balanced: boolean;
    totalDebitsTnd: string;
    totalCreditsTnd: string;
    accounts: { accountCode: string; debitTnd: string; creditTnd: string }[];
  }>(`${payRoot}/ledger/trial-balance`);
  const discrepancies = useResource<
    { id: string; kind: string; severity: string; status: string; obligationId: string | null }[]
  >(`${payRoot}/reconciliation/discrepancies`);
  const inbox = useResource<
    { id: string; webhookId: string; eventType: string; status: string; attempts: number }[]
  >(`${payRoot}/webhooks/inbox`);

  return (
    <section className="panel" aria-label="Payments operations and reconciliation">
      <h2>DHMAD Sandbox, Ledger and Reconciliation</h2>
      <ResourceState {...status} retry={status.reload} />
      {status.data && (
        <p>
          Provider: <strong>{status.data.provider}</strong> ({status.data.environment}) · Enabled:{' '}
          {status.data.enabled ? 'Yes' : 'No'} · Associated account verified:{' '}
          {status.data.associatedAccountVerified ? 'Yes' : 'No'} · Real payouts enabled:{' '}
          {status.data.realPayoutsEnabled ? 'Yes' : 'No (Simulation only)'}
        </p>
      )}
      <h3>Financial subledger trial balance</h3>
      <ResourceState {...trialBalance} retry={trialBalance.reload} />
      {trialBalance.data && (
        <>
          <p>
            Balanced: <strong>{trialBalance.data.balanced ? 'YES' : 'NO'}</strong> · Debits:{' '}
            {trialBalance.data.totalDebitsTnd} TND · Credits: {trialBalance.data.totalCreditsTnd}{' '}
            TND
          </p>
          <ul>
            {trialBalance.data.accounts.map((acc) => (
              <li key={acc.accountCode}>
                {acc.accountCode}: DR {acc.debitTnd} / CR {acc.creditTnd} TND
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>Reconciliation</h3>
      <ActionForm
        label="Run reconciliation check"
        onSuccess={() => {
          discrepancies.reload();
          trialBalance.reload();
        }}
        action={() => post(`${payRoot}/reconciliation/run`)}
      />
      <ResourceState {...discrepancies} retry={discrepancies.reload} />
      {discrepancies.data?.map((d) => (
        <article key={d.id}>
          <p>
            [{d.severity}] {d.kind} · {humanize(d.status)} · Obligation {d.obligationId ?? 'n/a'}
          </p>
          {d.status === 'OPEN' && (
            <ActionForm
              label="Resolve discrepancy"
              onSuccess={discrepancies.reload}
              action={(form) =>
                post(`${payRoot}/reconciliation/discrepancies/${d.id}/resolve`, {
                  resolution: text(form, 'resolution'),
                  note: text(form, 'note'),
                })
              }
            >
              <Select name="resolution" label="Resolution" options={['ACKNOWLEDGED', 'RESOLVED']} />
              <Input name="note" label="Resolution note" required />
            </ActionForm>
          )}
        </article>
      ))}
      <h3>Durable webhook inbox</h3>
      <ResourceState {...inbox} retry={inbox.reload} />
      {inbox.data?.slice(0, 20).map((evt) => (
        <article key={evt.id}>
          <p>
            {evt.eventType} ({evt.webhookId}) · {humanize(evt.status)} · Attempts: {evt.attempts}
          </p>
          {evt.status === 'QUARANTINED' && (
            <ActionForm
              label="Replay quarantined event"
              onSuccess={inbox.reload}
              action={() => post(`${payRoot}/webhooks/inbox/${evt.id}/replay`)}
            />
          )}
        </article>
      ))}
    </section>
  );
}

export function ArtisanFinancePanel({ artisanProfileId }: { artisanProfileId: string }) {
  const finance = useResource<{
    artisanProfileId: string;
    kyc: {
      id: string;
      kycStatus: string;
      claimStatus: string;
      provenance: string;
      email: string;
    } | null;
    allocations: {
      obligationId: string;
      channel: string;
      orderId: string | null;
      obligationStatus: string;
      myShareBasisPoints: number | null;
      myExpectedCompensationTnd: string | null;
    }[];
    payables: { id: string; orderId: string | null; status: string; amountTnd: string }[];
    payoutSimulations: {
      id: string;
      reference: string;
      status: string;
      isSimulated: boolean;
      amountTnd: string;
    }[];
  }>(`${payRoot}/artisan/me`);

  return (
    <section className="panel wide" id="kyc-and-earnings">
      <h2>Identity verification (KYC) and your earnings</h2>
      <p>
        Earnings and payouts shown here are request-specific payables and sandbox payout
        simulations—never a withdrawable wallet or live bank transfer.
      </p>
      <ResourceState {...finance} retry={finance.reload} />
      {finance.data?.kyc ? (
        <p>
          KYC Status: <strong>{humanize(finance.data.kyc.kycStatus)}</strong> (Source:{' '}
          {humanize(finance.data.kyc.provenance)} · Email: {finance.data.kyc.email})
        </p>
      ) : (
        <p>KYC Status: Not started.</p>
      )}
      <ActionForm
        label="Initiate pre-account DHMAD KYC"
        onSuccess={finance.reload}
        action={(form) =>
          post(`${payRoot}/artisans/${artisanProfileId}/kyc`, {
            email: text(form, 'email'),
            consentConfirmed: form.has('consentConfirmed'),
            redirectPath: '/artisan',
          })
        }
      >
        <Input name="email" label="Your verification email" type="email" required />
        <label className="check-label">
          <input type="checkbox" name="consentConfirmed" required />I consent to pre-account
          identity verification through DHMAD.
        </label>
      </ActionForm>
      <h3>Your assigned compensation allocations</h3>
      {finance.data?.allocations.length ? (
        <ul>
          {finance.data.allocations.map((a) => (
            <li key={a.obligationId}>
              {a.channel} Order {a.orderId}: {a.myExpectedCompensationTnd ?? 'n/a'} TND (
              {a.myShareBasisPoints != null ? `${a.myShareBasisPoints / 100}%` : 'n/a'}) ·{' '}
              {humanize(a.obligationStatus)}
            </li>
          ))}
        </ul>
      ) : (
        <p>No assigned payment allocations yet.</p>
      )}
      <h3>Recognized payables and simulated payouts</h3>
      {finance.data?.payables.map((p) => (
        <p key={p.id}>
          Payable {p.id}: {p.amountTnd} TND · {humanize(p.status)}
        </p>
      ))}
      {finance.data?.payoutSimulations.map((s) => (
        <p key={s.id}>
          <strong>SIMULATED PAYOUT</strong> {s.reference}: {s.amountTnd} TND · {humanize(s.status)}
        </p>
      ))}
    </section>
  );
}
