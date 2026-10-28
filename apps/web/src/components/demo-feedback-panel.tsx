'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  demoFeedbackCategories,
  demoScreenKeys,
  demoFeedbackCommentMaxLength,
  demoFeedbackLimitations,
  type DemoFeedbackMineList,
  type DemoScreenKey,
} from '@nasj/contracts';
import { ApiError } from '@/lib/api';
import { demoFeedbackList, demoFeedbackRequest } from '@/lib/demo-api';
import { humanize } from './workspace-ui';
import { Button } from './ui/button';
import { Label } from './ui/label';

/**
 * Visitor "Share feedback" surface. Feedback concerns a synthetic demonstration only: it is never a
 * customer review, a claim, a payable or published material. A failed request keeps both the draft
 * text and the idempotency key so a retry cannot create a duplicate.
 */
function messageFor(failure: unknown) {
  if (!(failure instanceof ApiError))
    return failure instanceof Error ? failure.message : 'Unable to send feedback.';
  switch (failure.detail.code) {
    case 'FEEDBACK_LIMIT':
      return 'You have reached the feedback limit for this scenario. Start a fresh generation to continue.';
    case 'STALE_DEMO_SCENARIO':
      return 'This generation was archived. Resume your current scenario before leaving feedback.';
    case 'IDEMPOTENCY_CONFLICT':
      return 'This submission was already sent with different details. Review it and try again.';
    case 'DEMO_CSRF_REJECTED':
      return 'Your showroom proof expired. Refresh the demonstration and try again.';
    case 'DEMO_VISITOR_REQUIRED':
      return 'Your visitor session ended. Refresh the demonstration to continue.';
    default:
      return failure.message;
  }
}

export function DemoFeedbackPanel({
  scenarioId,
  csrfToken,
}: {
  scenarioId: string;
  csrfToken: string | undefined;
}) {
  const fieldId = useId();
  const [screenKey, setScreenKey] = useState<DemoScreenKey>('SHOWROOM_OVERVIEW');
  const [category, setCategory] = useState<string>('USABILITY');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [mine, setMine] = useState<DemoFeedbackMineList | null>(null);
  const key = useRef('');

  const loadMine = useCallback(async () => {
    try {
      setMine(await demoFeedbackList(scenarioId));
    } catch {
      setMine(null);
    }
  }, [scenarioId]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!csrfToken) {
      setError('Your showroom proof is unavailable. Refresh the demonstration and try again.');
      return;
    }
    if (!key.current) key.current = crypto.randomUUID().replace(/-/g, '');
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await demoFeedbackRequest(
        { scenarioId, screenKey, category: category as never, comment },
        { csrfToken, idempotencyKey: key.current },
      );
      key.current = '';
      setComment('');
      setStatus(
        'Recorded as feedback about this synthetic demonstration. It is not customer satisfaction or published evidence.',
      );
      await loadMine();
    } catch (failure) {
      setError(messageFor(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="share-feedback" className="grid gap-4">
      <h2 id="share-feedback">Share feedback</h2>
      <p>
        Tell the NASJ team what helped or confused you in this demonstration. Feedback is private to
        you and the reviewing team. Do not enter personal, financial or health details.
      </p>
      <form method="post" onSubmit={submit} className="grid gap-4">
        <fieldset disabled={busy} className="grid gap-4">
          <legend className="sr-only">Share feedback about this demonstration</legend>
          <div className="field">
            <Label htmlFor={`${fieldId}-screen`}>Screen or story</Label>
            <select
              id={`${fieldId}-screen`}
              value={screenKey}
              onChange={(event) => setScreenKey(event.target.value as DemoScreenKey)}
            >
              {demoScreenKeys.map((item) => (
                <option key={item} value={item}>
                  {humanize(
                    item
                      .replace('PRESENTATION:', 'Presentation: ')
                      .replace('WORKSPACE:', 'Workspace: '),
                  )}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <Label htmlFor={`${fieldId}-category`}>Category</Label>
            <select
              id={`${fieldId}-category`}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {demoFeedbackCategories.map((item) => (
                <option key={item} value={item}>
                  {humanize(item)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <Label htmlFor={`${fieldId}-comment`}>Comment (optional)</Label>
            <textarea
              id={`${fieldId}-comment`}
              rows={3}
              maxLength={demoFeedbackCommentMaxLength}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              aria-describedby={`${fieldId}-count`}
            />
            <p id={`${fieldId}-count`} className="text-sm text-muted-foreground">
              {comment.length} of {demoFeedbackCommentMaxLength} characters
            </p>
          </div>
          <Button type="submit">{busy ? 'Sending…' : 'Send private feedback'}</Button>
        </fieldset>
      </form>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="notice success" role="status">
          {status}
        </p>
      )}
      {mine && mine.items.length > 0 && (
        <details>
          <summary>Your feedback for this scenario ({mine.items.length})</summary>
          <ol>
            {mine.items.map((item) => (
              <li key={item.id}>
                <strong>{humanize(item.category)}</strong> ·{' '}
                {humanize(
                  item.screenKey
                    .replace('PRESENTATION:', 'Presentation: ')
                    .replace('WORKSPACE:', 'Workspace: '),
                )}{' '}
                · {new Date(item.createdAt).toLocaleString()} · {humanize(item.status)}
                {item.comment && <p>{item.comment}</p>}
              </li>
            ))}
          </ol>
        </details>
      )}
      <p className="notice" role="note">
        {demoFeedbackLimitations.map((line) => (
          <span key={line}>
            {line}
            <br />
          </span>
        ))}
      </p>
    </section>
  );
}
