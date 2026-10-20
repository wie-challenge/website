'use client';
import { useRef } from 'react';
import Link from 'next/link';
import { CommerceReport } from './commerce-report';
import type {
  CommerceWorkspaceView,
  CommercialRfqView,
  CommercialOrderView,
  CommercialBatchView,
} from '@hirfacare/contracts';
import { apiFetch } from '@/lib/api';
import {
  Workspace,
  ResourceState,
  ActionForm,
  Input,
  Select,
  useResource,
  text,
  humanize,
} from './workspace-ui';

type Mode = 'buyer' | 'artisan' | 'operator';
function LongText({ name, label, value }: { name: string; label: string; value?: string }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <textarea name={name} defaultValue={value} required maxLength={2000} rows={3} />
    </label>
  );
}
function asDate(data: FormData, name: string) {
  return new Date(text(data, name)).toISOString();
}
function useCommand() {
  const pending = useRef(new Map<string, string>());
  return async (path: string, body: object, method: 'POST' | 'PATCH' = 'POST') => {
    const signature = JSON.stringify({ path, body, method });
    let key = pending.current.get(signature);
    if (!key) {
      key = crypto.randomUUID();
      pending.current.set(signature, key);
    }
    const result = await apiFetch(`/api/v1/commerce/${path}`, {
      method,
      body,
      idempotencyKey: key,
    });
    pending.current.delete(signature);
    return result;
  };
}
export function CommerceWorkspace({ mode }: { mode: Mode }) {
  const resource = useResource<CommerceWorkspaceView>('/api/v1/commerce/workspace');
  const inbox =
    useResource<{ id: string; code: string; createdAt: string }[]>('/api/v1/commerce/inbox');
  const send = useCommand();
  const data = resource.data;
  const titles = {
    buyer: 'Buyer requests',
    artisan: 'Artisan offers and production',
    operator: 'Operator review',
  };
  const roles = (id: string) => data?.operatorOrganizations.find((o) => o.id === id)?.roles ?? [];
  const buyer = (id: string) => Boolean(data?.buyerOrganizations.some((o) => o.id === id));
  const action = (path: string, next: string, version: number, extra: object = {}) =>
    send(`${path}/actions`, { next, version, ...extra });
  function rfqFields(rfq?: CommercialRfqView) {
    return (
      <>
        <Input name="title" label="Request title" value={rfq?.title} required />
        <Select
          name="craftSkillId"
          label="Craft"
          value={rfq?.craftSkillId}
          options={data?.crafts.map((c) => ({ value: c.id, label: c.name })) ?? []}
          required
        />
        <LongText name="specification" label="Craft specification" value={rfq?.specification} />
        <LongText
          name="designRequirements"
          label="Design requirements"
          value={rfq?.designRequirements}
        />
        <Input
          name="quantity"
          label="Requested pieces"
          type="number"
          min="1"
          max="1000000"
          step="1"
          value={rfq?.quantity}
          required
        />
        <Input
          name="deliveryAt"
          label="Delivery deadline"
          type="datetime-local"
          value={
            rfq
              ? new Date(
                  new Date(rfq.deliveryAt).getTime() -
                    new Date(rfq.deliveryAt).getTimezoneOffset() * 60000,
                )
                  .toISOString()
                  .slice(0, 16)
              : undefined
          }
          required
        />
        <Input
          name="deliveryLocation"
          label="Delivery location"
          value={rfq?.deliveryLocation}
          required
        />
      </>
    );
  }
  const rfqBody = (f: FormData) => ({
    title: text(f, 'title'),
    craftSkillId: text(f, 'craftSkillId'),
    specification: text(f, 'specification'),
    designRequirements: text(f, 'designRequirements'),
    quantity: Number(text(f, 'quantity')),
    deliveryAt: asDate(f, 'deliveryAt'),
    deliveryLocation: text(f, 'deliveryLocation'),
  });
  function orderCard(order: CommercialOrderView) {
    const ownBuyer = buyer(order.buyerOrganizationId),
      permission = roles(order.operatorOrganizationId);
    const production = permission.includes('PRODUCTION_MANAGER'),
      finance = permission.includes('FINANCE_MANAGER'),
      quality = permission.includes('QUALITY_INSPECTOR'),
      logistics = permission.includes('INVENTORY_LOGISTICS_COORDINATOR');
    const rfq = data!.rfqs.find((r) => r.id === order.rfqId);
    const next: Record<string, { state: string; label: string; allow: boolean }> = {
      APPROVED: { state: 'FUNDING_CONFIRMED', label: 'Confirm simulated funding', allow: finance },
      FUNDING_CONFIRMED: {
        state: 'PLANNING',
        label: 'Start allocation planning',
        allow: production,
      },
      PLANNING: { state: 'IN_PRODUCTION', label: 'Release order to production', allow: production },
      IN_PRODUCTION: {
        state: 'QUALITY_REVIEW',
        label: 'Request order quality review',
        allow: production,
      },
      QUALITY_REVIEW: {
        state: 'READY_TO_SHIP',
        label: 'Approve order for shipment',
        allow: quality,
      },
      READY_TO_SHIP: { state: 'IN_TRANSIT', label: 'Record synthetic shipment', allow: logistics },
      IN_TRANSIT: { state: 'DELIVERED', label: 'Record synthetic delivery', allow: logistics },
      DELIVERED: { state: 'BUYER_ACCEPTED', label: 'Accept delivered order', allow: ownBuyer },
      BUYER_ACCEPTED: { state: 'SETTLED', label: 'Reconcile simulated settlement', allow: finance },
    };
    return (
      <article className="panel commerce-card" key={order.id} aria-label={`Order ${order.title}`}>
        <h3>{order.title}</h3>
        <p>Order · {humanize(order.status)} · Synthetic</p>
        <dl className="commerce-facts">
          <dt>Requested</dt>
          <dd>{order.quantity} pieces</dd>
          <dt>Accepted assignments</dt>
          <dd>{order.allocated}</dd>
          <dt>Produced</dt>
          <dd>{order.produced}</dd>
          <dt>QA-approved</dt>
          <dd>{order.approved}</dd>
          <dt>Delivered</dt>
          <dd>{order.delivered}</dd>
          {order.quoteTnd && (
            <>
              <dt>Buyer quote</dt>
              <dd>{order.quoteTnd} TND</dd>
            </>
          )}
        </dl>
        <CommerceReport orderId={order.id} />
        {next[order.status]?.allow && (
          <ActionForm
            label={next[order.status].label}
            action={() => action(`orders/${order.id}`, next[order.status].state, order.version)}
            onSuccess={resource.reload}
          />
        )}
        {order.status === 'SETTLED' && finance && (
          <ActionForm
            label="Close reconciled synthetic order"
            onSuccess={resource.reload}
            action={(f) =>
              action(`orders/${order.id}`, 'CLOSED', order.version, {
                materialsResolved: f.get('materialsResolved') === 'on',
                dispositionNote: text(f, 'dispositionNote'),
              })
            }
          >
            <label className="check-label">
              <input name="materialsResolved" type="checkbox" required />I confirm synthetic
              materials and returns are resolved
            </label>
            <LongText name="dispositionNote" label="Material disposition note" />
          </ActionForm>
        )}
        {production && order.status === 'PLANNING' && (
          <details>
            <summary>Create a voluntary artisan offer</summary>
            <p>This reserves declared piece capacity until expiry. Only the artisan can accept.</p>
            <ActionForm
              label="Send synthetic offer"
              onSuccess={resource.reload}
              action={(f) =>
                send('offers', {
                  orderId: order.id,
                  capacityDeclarationId: text(f, 'capacityDeclarationId'),
                  quantity: Number(text(f, 'quantity')),
                  unitPayTnd: text(f, 'unitPayTnd'),
                  estimatedHours: text(f, 'estimatedHours'),
                  expiresAt: asDate(f, 'expiresAt'),
                  materials: text(f, 'materials'),
                  reworkTerms: text(f, 'reworkTerms'),
                  paymentConditions: text(f, 'paymentConditions'),
                  provenance: 'SYNTHETIC',
                })
              }
            >
              <Select
                name="capacityDeclarationId"
                label="Artisan declared capacity"
                options={data!.candidates
                  .filter(
                    (c) =>
                      c.craftSkillId === rfq?.craftSkillId &&
                      new Date(c.effectiveTo) >= new Date(rfq!.deliveryAt) &&
                      new Date(c.effectiveFrom) <= new Date(rfq!.deliveryAt),
                  )
                  .map((c) => ({
                    value: c.capacityDeclarationId,
                    label: `${c.displayName} · ${c.quantity} pieces declared`,
                  }))}
                required
              />
              <Input
                name="quantity"
                label="Offered pieces"
                type="number"
                min="1"
                max={String(order.quantity)}
                step="1"
                required
              />
              <Input name="unitPayTnd" label="Agreed artisan pay per piece (TND)" required />
              <Input name="estimatedHours" label="Estimated effort range (hours)" required />
              <Input name="expiresAt" label="Offer expiry" type="datetime-local" required />
              <LongText name="materials" label="Material responsibility" />
              <LongText name="reworkTerms" label="Quality and rework terms" />
              <LongText name="paymentConditions" label="Agreed payment conditions" />
            </ActionForm>
          </details>
        )}
        {finance && !['CLOSED', 'SETTLED', 'CANCELLED', 'DISPUTED'].includes(order.status) && (
          <details>
            <summary>Schedule a simulated payment</summary>
            <p>No bank transfer or real money movement occurs.</p>
            <ActionForm
              label="Schedule simulated payment"
              onSuccess={resource.reload}
              action={(f) =>
                send('payments', {
                  orderId: order.id,
                  kind: text(f, 'kind'),
                  ...(text(f, 'kind') === 'ARTISAN_PAYOUT' ? { batchId: text(f, 'batchId') } : {}),
                  amountTnd: text(f, 'amountTnd'),
                  provenance: 'SYNTHETIC',
                })
              }
            >
              <Select
                name="kind"
                label="Payment ledger"
                options={['BUYER_RECEIPT', 'ARTISAN_PAYOUT']}
              />
              <Select
                name="batchId"
                label="Artisan batch (payouts only)"
                options={[
                  { value: '', label: 'Not applicable to buyer receipt' },
                  ...data!.batches
                    .filter((b) => b.orderId === order.id)
                    .map((b) => ({
                      value: b.id,
                      label: `Batch ${b.id} · ${b.approved} QA-approved pieces`,
                    })),
                ]}
              />
              <Input name="amountTnd" label="Simulated payment amount (TND)" required />
            </ActionForm>
          </details>
        )}
      </article>
    );
  }
  function batchCard(batch: CommercialBatchView) {
    const order = data!.orders.find((o) => o.id === batch.orderId);
    const permission = order ? roles(order.operatorOrganizationId) : [];
    const own = batch.artisanProfileId === data!.artisanProfileId;
    return (
      <article
        className="panel commerce-card"
        key={batch.id}
        aria-label={`Production batch ${batch.id}`}
      >
        <h3>Production batch</h3>
        <p className="hint">{batch.id}</p>
        <p>{humanize(batch.status)} · Synthetic</p>
        <dl className="commerce-facts">
          <dt>Accepted pieces</dt>
          <dd>{batch.quantity}</dd>
          <dt>Produced</dt>
          <dd>{batch.produced}</dd>
          <dt>Submitted</dt>
          <dd>{batch.submitted}</dd>
          <dt>QA-approved</dt>
          <dd>{batch.approved}</dd>
          <dt>Rejected</dt>
          <dd>{batch.rejected}</dd>
          <dt>Pending QA</dt>
          <dd>{batch.pending}</dd>
        </dl>
        {permission.includes('PRODUCTION_MANAGER') && batch.status === 'ACCEPTED' && (
          <ActionForm
            label="Confirm synthetic material readiness"
            action={() => action(`batches/${batch.id}`, 'MATERIAL_READY', batch.version)}
            onSuccess={resource.reload}
          />
        )}
        {own && batch.status === 'MATERIAL_READY' && (
          <ActionForm
            label="Start accepted production"
            action={() => action(`batches/${batch.id}`, 'IN_PROGRESS', batch.version)}
            onSuccess={resource.reload}
          />
        )}
        {own && batch.status === 'IN_PROGRESS' && (
          <>
            <ActionForm
              label="Save cumulative progress"
              onSuccess={resource.reload}
              action={(f) =>
                send(`batches/${batch.id}/progress`, {
                  version: batch.version,
                  produced: Number(text(f, 'produced')),
                })
              }
            >
              <p>Enter the total produced so far, including previously reported pieces.</p>
              <Input
                name="produced"
                label="Total pieces produced so far"
                type="number"
                min={String(batch.produced)}
                max={String(batch.quantity)}
                step="1"
                value={batch.produced}
                required
              />
            </ActionForm>
            <ActionForm
              label="Submit produced pieces for QA"
              action={() => action(`batches/${batch.id}`, 'SUBMITTED', batch.version)}
              onSuccess={resource.reload}
            />
          </>
        )}
        {permission.includes('QUALITY_INSPECTOR') && batch.status === 'SUBMITTED' && (
          <ActionForm
            label="Start quality inspection"
            action={() => action(`batches/${batch.id}`, 'INSPECTION', batch.version)}
            onSuccess={resource.reload}
          />
        )}
        {permission.includes('QUALITY_INSPECTOR') && batch.status === 'INSPECTION' && (
          <>
            <ActionForm
              label="Save reconciled inspection"
              onSuccess={resource.reload}
              action={(f) =>
                send(`batches/${batch.id}/inspections`, {
                  version: batch.version,
                  approved: Number(text(f, 'approved')),
                  rejected: Number(text(f, 'rejected')),
                  pending: Number(text(f, 'pending')),
                  defectReason: text(f, 'defectReason'),
                })
              }
            >
              <p>Approved + rejected + pending must equal {batch.submitted} submitted pieces.</p>
              <Input
                name="approved"
                label="Approved pieces"
                type="number"
                min={String(batch.approved)}
                max={String(batch.submitted)}
                value={batch.approved}
                required
              />
              <Input
                name="rejected"
                label="Rejected pieces"
                type="number"
                min="0"
                value={batch.rejected}
                required
              />
              <Input
                name="pending"
                label="Pending pieces"
                type="number"
                min="0"
                value={batch.pending}
                required
              />
              <Input name="defectReason" label="Defect reason (required for rejection)" />
            </ActionForm>
            <ActionForm
              label="Approve inspected batch"
              action={() => action(`batches/${batch.id}`, 'APPROVED', batch.version)}
              onSuccess={resource.reload}
            />
            <ActionForm
              label="Request rework under agreed terms"
              action={() => action(`batches/${batch.id}`, 'REWORK_REQUESTED', batch.version)}
              onSuccess={resource.reload}
            />
          </>
        )}
        {own && batch.status === 'REWORK_REQUESTED' && (
          <>
            <ActionForm
              label="Accept agreed rework"
              action={() =>
                action(`batches/${batch.id}`, 'IN_PROGRESS', batch.version, {
                  reworkAccepted: true,
                })
              }
              onSuccess={resource.reload}
            />
            <ActionForm
              label="Dispute rework"
              action={() => action(`batches/${batch.id}`, 'DISPUTED', batch.version)}
              onSuccess={resource.reload}
            />
          </>
        )}
        {permission.includes('PRODUCTION_MANAGER') && batch.status === 'APPROVED' && (
          <ActionForm
            label="Complete approved batch"
            action={() => action(`batches/${batch.id}`, 'COMPLETED', batch.version)}
            onSuccess={resource.reload}
          />
        )}
      </article>
    );
  }
  return (
    <Workspace
      title={titles[mode]}
      description="Synthetic commerce demonstration. Requests, production records and settlement results here are fictional and do not establish real contracts or move money."
    >
      <nav className="workspace-tabs" aria-label="Commerce journeys">
        <Link href="/commerce/buyer" aria-current={mode === 'buyer' ? 'page' : undefined}>
          Buyer requests
        </Link>
        <Link href="/commerce/artisan" aria-current={mode === 'artisan' ? 'page' : undefined}>
          Artisan decisions and progress
        </Link>
        <Link href="/commerce/operator" aria-current={mode === 'operator' ? 'page' : undefined}>
          Operator review
        </Link>
      </nav>
      <details>
        <summary>Commerce notifications</summary>
        <button className="btn-secondary" type="button" onClick={inbox.reload}>
          Refresh notifications
        </button>
        <ResourceState {...inbox} retry={inbox.reload} />
        {inbox.data &&
          (inbox.data.length ? (
            <ul>
              {inbox.data.map((notice) => (
                <li key={notice.id}>
                  {humanize(notice.code.replace('commerce.', '').replaceAll('.', ' '))} ·{' '}
                  <time dateTime={notice.createdAt}>
                    {new Date(notice.createdAt).toLocaleString()}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p>No processed commerce notifications yet.</p>
          ))}
        <p>Refresh to check for new commerce updates.</p>
      </details>
      <ResourceState {...resource} retry={resource.reload} />
      {data && (
        <>
          {mode === 'buyer' && (
            <section aria-labelledby="buyer-heading">
              <h2 id="buyer-heading">Create and track a buyer RFQ</h2>
              {!data.buyerOrganizations.length ? (
                <p>
                  An approved buyer organization membership is required.{' '}
                  <Link href="/settings/organizations">Manage organizations</Link>.
                </p>
              ) : (
                <details>
                  <summary>Create a synthetic request</summary>
                  <ActionForm
                    label="Save RFQ draft"
                    onSuccess={resource.reload}
                    action={(f) =>
                      send('rfqs', {
                        ...rfqBody(f),
                        buyerOrganizationId: text(f, 'buyerOrganizationId'),
                        operatorOrganizationId: text(f, 'operatorOrganizationId'),
                        provenance: 'SYNTHETIC',
                      })
                    }
                  >
                    <Select
                      name="buyerOrganizationId"
                      label="Buyer organization"
                      options={data.buyerOrganizations.map((o) => ({ value: o.id, label: o.name }))}
                      required
                    />
                    <Select
                      name="operatorOrganizationId"
                      label="Responsible operator organization"
                      options={data.operatorCatalog.map((o) => ({ value: o.id, label: o.name }))}
                      required
                    />
                    {rfqFields()}
                  </ActionForm>
                </details>
              )}
            </section>
          )}
          {mode !== 'artisan' && (
            <section aria-labelledby="rfq-heading">
              <h2 id="rfq-heading">{mode === 'buyer' ? 'Your requests' : 'Assigned requests'}</h2>
              <p>
                Submitted content is locked. Accepting the exact unexpired quote creates one
                synthetic order.
              </p>
              {!data.rfqs.filter((r) =>
                mode === 'buyer'
                  ? buyer(r.buyerOrganizationId)
                  : roles(r.operatorOrganizationId).length > 0,
              ).length && <p>No requests in this workspace yet.</p>}
              {data.rfqs
                .filter((r) =>
                  mode === 'buyer'
                    ? buyer(r.buyerOrganizationId)
                    : roles(r.operatorOrganizationId).length > 0,
                )
                .map((r) => (
                  <article key={r.id} className="panel commerce-card" aria-label={`RFQ ${r.title}`}>
                    <h3>{r.title}</h3>
                    <p>
                      {humanize(r.status)} · Version {r.version} · Synthetic
                    </p>
                    <dl className="commerce-facts">
                      <dt>Quantity</dt>
                      <dd>{r.quantity} pieces</dd>
                      <dt>Specification</dt>
                      <dd>{r.specification}</dd>
                      <dt>Design requirements</dt>
                      <dd>{r.designRequirements}</dd>
                      <dt>Delivery</dt>
                      <dd>
                        {new Date(r.deliveryAt).toLocaleString()} · {r.deliveryLocation}
                      </dd>
                      {r.quoteTnd && (
                        <>
                          <dt>Exact quote</dt>
                          <dd>{r.quoteTnd} TND</dd>
                          <dt>Quote expires</dt>
                          <dd>{r.quoteExpiresAt && new Date(r.quoteExpiresAt).toLocaleString()}</dd>
                        </>
                      )}
                    </dl>
                    {buyer(r.buyerOrganizationId) && r.status === 'DRAFT' && (
                      <>
                        <details>
                          <summary>Edit saved draft</summary>
                          <ActionForm
                            label="Save draft changes"
                            onSuccess={resource.reload}
                            action={(f) =>
                              send(`rfqs/${r.id}`, { ...rfqBody(f), version: r.version }, 'PATCH')
                            }
                          >
                            {rfqFields(r)}
                          </ActionForm>
                        </details>
                        <ActionForm
                          label="Submit RFQ for review"
                          action={() => action(`rfqs/${r.id}`, 'SUBMITTED', r.version)}
                          onSuccess={resource.reload}
                        />
                      </>
                    )}
                    {roles(r.operatorOrganizationId).includes('PRODUCTION_MANAGER') &&
                      r.status === 'SUBMITTED' && (
                        <ActionForm
                          label="Start RFQ review"
                          action={() => action(`rfqs/${r.id}`, 'UNDER_REVIEW', r.version)}
                          onSuccess={resource.reload}
                        />
                      )}
                    {roles(r.operatorOrganizationId).includes('FINANCE_MANAGER') &&
                      r.status === 'UNDER_REVIEW' && (
                        <ActionForm
                          label="Issue synthetic quote"
                          onSuccess={resource.reload}
                          action={(f) =>
                            action(`rfqs/${r.id}`, 'QUOTED', r.version, {
                              quoteTnd: text(f, 'quoteTnd'),
                              quoteExpiresAt: asDate(f, 'quoteExpiresAt'),
                            })
                          }
                        >
                          <Input name="quoteTnd" label="Exact buyer quote (TND)" required />
                          <Input
                            name="quoteExpiresAt"
                            label="Quote expiry"
                            type="datetime-local"
                            required
                          />
                        </ActionForm>
                      )}
                    {buyer(r.buyerOrganizationId) && r.status === 'QUOTED' && (
                      <>
                        <ActionForm
                          label="Accept exact synthetic quote"
                          action={() => action(`rfqs/${r.id}`, 'ACCEPTED', r.version)}
                          onSuccess={resource.reload}
                        />
                        <ActionForm
                          label="Decline quote"
                          action={() => action(`rfqs/${r.id}`, 'DECLINED', r.version)}
                          onSuccess={resource.reload}
                        />
                      </>
                    )}
                  </article>
                ))}
            </section>
          )}
          {mode !== 'artisan' && (
            <section aria-labelledby="orders-heading">
              <h2 id="orders-heading">
                {mode === 'buyer' ? 'Your orders' : 'Production and fulfillment review'}
              </h2>
              {!data.orders.length && <p>No accepted orders yet.</p>}
              {data.orders
                .filter((o) =>
                  mode === 'buyer'
                    ? buyer(o.buyerOrganizationId)
                    : roles(o.operatorOrganizationId).length > 0,
                )
                .map(orderCard)}
            </section>
          )}
          {mode !== 'buyer' && (
            <section aria-labelledby="offers-heading">
              <h2 id="offers-heading">
                {mode === 'artisan' ? 'Voluntary offer decisions' : 'Offer review'}
              </h2>
              <p>
                Declining an offer or refusing a wearable carries no eligibility penalty. Only the
                named artisan may accept an offer.
              </p>
              {!data.offers.length && (
                <p>
                  No offers available. Artisans can{' '}
                  <Link href="/artisan/capacity">declare voluntary piece capacity</Link>.
                </p>
              )}
              {data.offers
                .filter((o) => mode === 'operator' || o.artisanProfileId === data.artisanProfileId)
                .map((o) => (
                  <article
                    className="panel commerce-card"
                    key={o.id}
                    aria-label={`Artisan offer ${o.id}`}
                  >
                    <h3>Artisan offer · {humanize(o.status)}</h3>
                    <p className="hint">{o.id} · Synthetic</p>
                    <dl className="commerce-facts">
                      <dt>Quantity</dt>
                      <dd>{o.quantity} pieces</dd>
                      <dt>Estimated effort</dt>
                      <dd>{o.estimatedHours} hours</dd>
                      <dt>Agreed unit pay</dt>
                      <dd>{o.unitPayTnd ?? 'Restricted'} TND</dd>
                      <dt>Total agreed pay</dt>
                      <dd>{o.totalPayTnd ?? 'Restricted'} TND</dd>
                      <dt>Craft specification</dt>
                      <dd>{o.specification}</dd>
                      <dt>Material responsibility</dt>
                      <dd>{o.materials}</dd>
                      <dt>Quality/rework terms</dt>
                      <dd>{o.reworkTerms}</dd>
                      <dt>Payment conditions</dt>
                      <dd>{o.paymentConditions}</dd>
                      <dt>Offer expires</dt>
                      <dd>{new Date(o.expiresAt).toLocaleString()}</dd>
                      <dt>Delivery deadline</dt>
                      <dd>{new Date(o.deliveryAt).toLocaleString()}</dd>
                    </dl>
                    {o.artisanProfileId === data.artisanProfileId && o.status === 'OFFERED' && (
                      <>
                        <ActionForm
                          label="Accept this offer voluntarily"
                          action={() => action(`offers/${o.id}`, 'ACCEPTED', o.version)}
                          onSuccess={resource.reload}
                        />
                        <ActionForm
                          label="Decline offer without penalty"
                          action={() => action(`offers/${o.id}`, 'DECLINED', o.version)}
                          onSuccess={resource.reload}
                        />
                      </>
                    )}
                  </article>
                ))}
            </section>
          )}
          {mode !== 'buyer' && (
            <section aria-labelledby="batches-heading">
              <h2 id="batches-heading">
                {mode === 'artisan' ? 'Your accepted production' : 'Batch and quality review'}
              </h2>
              {!data.batches.length && <p>No accepted production batches yet.</p>}
              {data.batches
                .filter((b) => mode === 'operator' || b.artisanProfileId === data.artisanProfileId)
                .map(batchCard)}
            </section>
          )}
          <section aria-labelledby="payments-heading">
            <h2 id="payments-heading">Simulated payment records</h2>
            <p>
              Buyer receipts and individual artisan payouts use separate ledgers. “Settled” here
              always means simulated settlement, never an actual transfer.
            </p>
            {!data.payments.length && <p>No simulated payments in your permitted scope.</p>}
            {data.payments.map((p) => {
              const order = data.orders.find((o) => o.id === p.orderId);
              const finance =
                order && roles(order.operatorOrganizationId).includes('FINANCE_MANAGER');
              const next: Record<string, string> = {
                SCHEDULED: 'APPROVED',
                APPROVED: 'INITIATED',
                INITIATED: 'SETTLED',
              };
              return (
                <article
                  className="panel commerce-card"
                  key={p.id}
                  aria-label={`Simulated payment ${p.id}`}
                >
                  <h3>
                    {humanize(p.kind)} · {p.amountTnd} TND
                  </h3>
                  <p>
                    {humanize(p.status)} ·{' '}
                    {p.evidenceType === 'SIMULATED_SETTLEMENT'
                      ? 'Simulated settlement recorded'
                      : 'Synthetic demonstration only'}
                  </p>
                  {finance && next[p.status] && (
                    <ActionForm
                      label={`Mark simulated payment ${humanize(next[p.status]).toLowerCase()}`}
                      action={() =>
                        action(
                          `payments/${p.id}`,
                          next[p.status],
                          p.version,
                          next[p.status] === 'SETTLED'
                            ? { evidenceType: 'SIMULATED_SETTLEMENT' }
                            : {},
                        )
                      }
                      onSuccess={resource.reload}
                    />
                  )}
                </article>
              );
            })}
          </section>
          <p className="hint">
            Each list shows at most 100 records. This bounded prototype does not implement real
            contracts, banking, automatic matching or wearable ingestion.
          </p>
        </>
      )}
    </Workspace>
  );
}
