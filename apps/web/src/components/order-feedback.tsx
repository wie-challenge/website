'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  feedbackCategories,
  type FeedbackListResponse,
  type OrderFeedbackHistoryView,
  type OrderFeedbackView,
} from '@nasj/contracts';
import { apiFetch, ApiError } from '@/lib/api';
import { ResourceState, humanize, useResource } from './workspace-ui';
import { logisticsUpdatedEvent } from '@/lib/logistics-events';

/**
 * Private buyer satisfaction assessment. It is bound to a recorded receipt, never to an operator
 * delivery report or an accepted-piece projection, and it never creates a claim or a payment.
 */
const root = '/api/v1/collaboration';

function errorMessage(failure: unknown) {
  if (!(failure instanceof ApiError))
    return failure instanceof Error ? failure.message : 'Unable to complete this action.';
  if (failure.detail.code === 'STALE_VERSION')
    return 'Someone else changed this assessment. The latest version is loading; your unsent text is kept.';
  if (failure.detail.code === 'DUPLICATE_FEEDBACK')
    return 'You already assessed this order. Use the correction form below instead of a second assessment.';
  if (failure.detail.code === 'NO_CONFIRMED_RECEIPT')
    return 'Feedback follows your own confirmed receipt of this order. If nothing arrived, use a support claim instead.';
  if (failure.detail.code === 'RECEIPT_ORDER_MISMATCH')
    return 'That receipt belongs to another order. Choose a receipt confirmed for this order.';
  if (failure.detail.code === 'IDEMPOTENCY_CONFLICT')
    return 'This action was already submitted with different details. Reload and try again.';
  return failure.message;
}

/**
 * One idempotency key per intended command, retained across failures and only replaced after a
 * successful submission, so a network retry cannot create a second record.
 */
function useRetainedKey(scope: string) {
  const key = useRef<string>('');
  useEffect(() => {
    key.current = '';
  }, [scope]);
  const take = useCallback(() => {
    if (!key.current) key.current = crypto.randomUUID().replace(/-/g, '');
    return key.current;
  }, []);
  const clear = useCallback(() => {
    key.current = '';
  }, []);
  return { take, clear };
}

function useCommand() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const run = useCallback(async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
      return false;
    }
    setMessage(success);
    setBusy(false);
    return true;
  }, []);
  return { busy, error, message, run, setError };
}

export function BuyerOrderFeedback({ orderId }: { orderId: string }) {
  const resource = useResource<FeedbackListResponse>(
    `${root}/order-feedback?orderId=${encodeURIComponent(orderId)}`,
  );
  const data = resource.data;
  const reloadFeedback = resource.reload;
  useEffect(() => {
    const handler = () => void reloadFeedback();
    window.addEventListener(logisticsUpdatedEvent, handler);
    return () => window.removeEventListener(logisticsUpdatedEvent, handler);
  }, [reloadFeedback]);
  const [receiptId, setReceiptId] = useState('');
  const [category, setCategory] = useState<string>('OVERALL');
  const [rating, setRating] = useState('');
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState<OrderFeedbackHistoryView | null>(null);
  const command = useCommand();
  const nextKey = useRetainedKey(`${orderId}:${data?.items[0]?.currentVersion ?? 0}`);
  const correctionKey = useRetainedKey(`correction:${orderId}`);
  const fieldId = useId();

  const own: OrderFeedbackView | undefined = data?.items.find(
    (item) => item.canCorrect || item.reporterId,
  );
  const eligible = data?.eligibleReceipts ?? [];
  const selectedReceipt = receiptId || eligible[0]?.confirmationId || '';

  const loadHistory = useCallback(async (feedbackId: string) => {
    try {
      setHistory(
        await apiFetch<OrderFeedbackHistoryView>(
          `${root}/order-feedback/${encodeURIComponent(feedbackId)}/history`,
        ),
      );
    } catch {
      setHistory(null);
    }
  }, []);

  useEffect(() => {
    if (own) void loadHistory(own.id);
  }, [own, loadHistory]);

  async function submitCreate() {
    const ok = await command.run(
      () =>
        apiFetch(`${root}/orders/${encodeURIComponent(orderId)}/feedback`, {
          method: 'POST',
          idempotencyKey: nextKey.take(),
          body: {
            receiptConfirmationId: selectedReceipt,
            category,
            ...(rating ? { rating: Number(rating) } : {}),
            comment,
          },
        }),
      'Private assessment recorded. Only you and the assigned support team can see it.',
    );
    if (ok) {
      nextKey.clear();
      setComment('');
      setRating('');
      await resource.reload();
    }
  }

  async function submitCorrection() {
    if (!own) return;
    const ok = await command.run(
      () =>
        apiFetch(`${root}/order-feedback/${encodeURIComponent(own.id)}/corrections`, {
          method: 'POST',
          // A correction is a distinct command, so it keeps its own retained key.
          idempotencyKey: correctionKey.take(),
          body: {
            expectedVersion: own.currentVersion,
            category,
            ...(rating ? { rating: Number(rating) } : {}),
            comment,
            reason: reason.trim() || 'Buyer correction',
          },
        }),
      'Correction recorded as a new version. The original statement is preserved.',
    );
    if (ok) {
      correctionKey.clear();
      setReason('');
      await resource.reload();
    }
  }

  return (
    <section className="section-gap order-feedback-panel" aria-labelledby="buyer-feedback-heading">
      <h2 id="buyer-feedback-heading">Your delivery feedback</h2>
      <p>
        Feedback is private to you and the assigned support team. A recorded receipt is not payment
        or commercial acceptance, and feedback never resolves a claim or changes an amount.
      </p>
      <ResourceState {...resource} retry={resource.reload} />
      {data && !eligible.length && !own && (
        <p className="notice" role="status">
          Feedback becomes available after you confirm receipt of at least one piece on a shipment
          for this order. If nothing arrived, open a support claim instead.
        </p>
      )}
      {own && (
        <article aria-labelledby="current-assessment">
          <h3 id="current-assessment">Your current assessment (version {own.currentVersion})</h3>
          <p>
            {humanize(own.category)} · {own.rating ? `${own.rating} of 5` : 'No rating'} ·{' '}
            {new Date(own.createdAt).toLocaleString()}
          </p>
          {own.comment && <p>{own.comment}</p>}
          <p>
            Follow-up status: <strong>{humanize(own.followUpStatus)}</strong>
            {own.followUpOwnerName ? ` · owner ${own.followUpOwnerName}` : ''}
          </p>
          {own.linkedTicketId && (
            <p>
              Formal claim status: <strong>{humanize(own.linkedTicketStatus ?? 'OPEN')}</strong>.
              The claim keeps its own lifecycle; this assessment never resolves it.
            </p>
          )}
          <p className="notice" role="note">
            {own.sourceLabel}. This label does not prove a real purchase or verified satisfaction.
          </p>
          {history && (
            <details>
              <summary>Assessment history ({history.total} versions)</summary>
              {history.notesWithheld && <p>Internal support notes are not shown to buyers.</p>}
              <ol>
                {history.items.map((item) => (
                  <li key={item.id}>
                    <strong>v{item.version}</strong> {humanize(item.kind)} · {item.actorName} ·{' '}
                    {new Date(item.createdAt).toLocaleString()}
                    <br />
                    {humanize(item.category)}
                    {item.rating ? ` · ${item.rating} of 5` : ''} · {humanize(item.followUpStatus)}
                    {item.comment && <p>{item.comment}</p>}
                    {item.reason && <p>Reason: {item.reason}</p>}
                  </li>
                ))}
              </ol>
            </details>
          )}
          <h3>Correct your assessment</h3>
          <p>
            A correction adds a new version. Your original words stay in the private history and
            support follow-up is carried forward.
          </p>
          <div className="field">
            <label htmlFor={`${fieldId}-category`}>Category</label>
            <select
              id={`${fieldId}-category`}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              disabled={command.busy}
            >
              {feedbackCategories.map((item) => (
                <option key={item} value={item}>
                  {humanize(item)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${fieldId}-rating`}>Rating (optional, 1 to 5)</label>
            <input
              id={`${fieldId}-rating`}
              type="number"
              min="1"
              max="5"
              value={rating}
              onChange={(event) => setRating(event.target.value)}
              disabled={command.busy}
            />
          </div>
          <div className="field">
            <label htmlFor={`${fieldId}-comment`}>Comment (optional, plain text)</label>
            <textarea
              id={`${fieldId}-comment`}
              rows={3}
              maxLength={2000}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              disabled={command.busy}
            />
          </div>
          <div className="field">
            <label htmlFor={`${fieldId}-reason`}>Why are you correcting this?</label>
            <input
              id={`${fieldId}-reason`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={command.busy}
            />
          </div>
          <button type="button" onClick={submitCorrection} disabled={command.busy}>
            Save correction
          </button>
        </article>
      )}
      {data && eligible.length > 0 && !own && (
        <article aria-labelledby="new-assessment">
          <h3 id="new-assessment">Record a private assessment</h3>
          <div className="field">
            <label htmlFor={`${fieldId}-receipt`}>Confirmed receipt</label>
            <select
              id={`${fieldId}-receipt`}
              value={selectedReceipt}
              onChange={(event) => setReceiptId(event.target.value)}
              disabled={command.busy}
            >
              {eligible.map((receipt) => (
                <option key={receipt.confirmationId} value={receipt.confirmationId}>
                  Received {receipt.received}, accepted {receipt.accepted}, missing{' '}
                  {receipt.missing}, damaged {receipt.damaged}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${fieldId}-new-category`}>Category</label>
            <select
              id={`${fieldId}-new-category`}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              disabled={command.busy}
            >
              {feedbackCategories.map((item) => (
                <option key={item} value={item}>
                  {humanize(item)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${fieldId}-new-rating`}>Rating (optional, 1 to 5)</label>
            <input
              id={`${fieldId}-new-rating`}
              type="number"
              min="1"
              max="5"
              value={rating}
              onChange={(event) => setRating(event.target.value)}
              disabled={command.busy}
            />
          </div>
          <div className="field">
            <label htmlFor={`${fieldId}-new-comment`}>Comment (optional, plain text)</label>
            <textarea
              id={`${fieldId}-new-comment`}
              rows={3}
              maxLength={2000}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              disabled={command.busy}
            />
          </div>
          <p>
            Fragile or short delivery? You can still record feedback. Nothing received at all
            belongs in a support claim.
          </p>
          <button type="button" onClick={submitCreate} disabled={command.busy}>
            Submit private assessment
          </button>
        </article>
      )}
      {command.error && (
        <p className="notice" role="alert">
          {command.error}
        </p>
      )}
      {command.message && (
        <p className="notice success" role="status">
          {command.message}
        </p>
      )}
      {data && (
        <p className="notice" role="note">
          {data.limitations.map((line) => (
            <span key={line}>
              {line}
              <br />
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
