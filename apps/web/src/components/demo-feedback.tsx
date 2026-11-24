'use client';
import { useEffect, useId, useRef, useState } from 'react';
import {
  demoFeedbackCategories,
  demoFeedbackLimitations,
  demoScreenKeys,
  type DemoFeedbackCategory,
  type DemoFeedbackCreateInput,
  type DemoFeedbackView,
  type DemoScreenKey,
} from '@nasj/contracts';
import { ApiError } from '@/lib/api';
import { demoFeedbackList, demoFeedbackRequest } from '@/lib/demo-api';
import { humanize } from './workspace-ui';

type Command = {
  readonly payload: Readonly<DemoFeedbackCreateInput>;
  readonly key: string;
  readonly csrfToken: string;
};

export function DemoFeedback({
  scenarioId,
  csrfToken,
  authorized = true,
}: {
  scenarioId: string;
  csrfToken: string;
  authorized?: boolean;
}) {
  const id = useId();
  const [category, setCategory] = useState<DemoFeedbackCategory>('USABILITY');
  const [screenKey, setScreenKey] = useState<DemoScreenKey>('SHOWROOM_OVERVIEW');
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState<Command | null>(null);
  const [accepted, setAccepted] = useState<DemoFeedbackView | null>(null);
  const [preservedEdits, setPreservedEdits] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const draft = useRef({ category, screenKey, comment });
  draft.current = { category, screenKey, comment };
  useEffect(() => {
    if (!authorized) {
      setAccepted(null);
      setError(
        'Your visitor session ended. Your unsent draft is kept; reopen the showroom for a new scenario.',
      );
    }
  }, [authorized]);

  async function submit() {
    if (inFlight.current || (!authorized && !pending)) return;
    const operation = pending ?? {
      payload: Object.freeze({ scenarioId, category, screenKey, comment }),
      key: crypto.randomUUID(),
      csrfToken,
    };
    inFlight.current = true;
    setBusy(true);
    setError('');
    setPending(operation);
    try {
      const result = await demoFeedbackRequest(operation.payload, {
        csrfToken: operation.csrfToken,
        idempotencyKey: operation.key,
      });
      // A replay receipt alone is not current authority: confirm through the visitor-scoped read.
      const latest = await demoFeedbackList(scenarioId);
      const visible = latest.items.find((item) => item.id === result.id);
      if (!visible) throw new Error('Accepted feedback is unavailable. Restore access and retry.');
      const edited =
        draft.current.category !== operation.payload.category ||
        draft.current.screenKey !== operation.payload.screenKey ||
        draft.current.comment !== operation.payload.comment;
      setAccepted(visible);
      setPending(null);
      setPreservedEdits(edited);
      if (!edited) setComment('');
    } catch (failure) {
      if (failure instanceof ApiError) {
        // Validation/cap rejections are definitive; the preserved draft gets a fresh command.
        if (failure.status === 400 || failure.status === 409) setPending(null);
        if ([401, 403, 404].includes(failure.status)) {
          setAccepted(null);
          setError(
            'Your visitor session ended. Your unsent draft is kept; reopen the showroom for a new scenario.',
          );
          return;
        }
      }
      setError(
        failure instanceof Error ? failure.message : 'The demonstration service is unavailable.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="panel grid gap-4">
      <h2 id={`${id}-heading`}>Share feedback</h2>
      {demoFeedbackLimitations.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <fieldset disabled={busy} className="grid gap-3">
          <label htmlFor={`${id}-category`}>Category</label>
          <select
            id={`${id}-category`}
            value={category}
            onChange={(event) => setCategory(event.target.value as DemoFeedbackCategory)}
          >
            {demoFeedbackCategories.map((value) => (
              <option key={value} value={value}>
                {humanize(value)}
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-screen`}>Screen or story</label>
          <select
            id={`${id}-screen`}
            value={screenKey}
            onChange={(event) => setScreenKey(event.target.value as DemoScreenKey)}
          >
            {demoScreenKeys.map((value) => (
              <option key={value} value={value}>
                {humanize(value.replaceAll(':', ' '))}
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-comment`}>Comment (optional)</label>
          <textarea
            id={`${id}-comment`}
            value={comment}
            maxLength={2000}
            rows={4}
            onChange={(event) => setComment(event.target.value)}
          />
          <button className="button" type="submit">
            {busy
              ? 'Sending…'
              : pending
                ? 'Retry original feedback'
                : preservedEdits
                  ? 'Send edited feedback as new submission'
                  : 'Send private feedback'}
          </button>
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {accepted && (
        <section aria-label="Accepted feedback" className="notice success">
          <h3>Accepted feedback</h3>
          <p>{accepted.sourceLabel}</p>
          <p>{accepted.comment || 'No comment provided.'}</p>
        </section>
      )}
    </section>
  );
}
