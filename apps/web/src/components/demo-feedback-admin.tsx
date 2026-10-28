'use client';
import { useState } from 'react';
import {
  demoFeedbackCategories,
  demoFeedbackStatuses,
  type DemoFeedbackAdminList,
  type DemoFeedbackAdminView,
} from '@nasj/contracts';
import { apiFetch } from '@/lib/api';
import {
  ActionForm,
  ResourceState,
  Select,
  Workspace,
  humanize,
  text,
  useResource,
} from './workspace-ui';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Pagination } from './governance';

/**
 * Team moderation of showroom feedback. Administrator-only: the API rejects every other identity,
 * including a genuine synthetic SUPPORT persona.
 */
export function DemoFeedbackAdmin() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const query = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (status) query.set('status', status);
  if (category) query.set('category', category);
  const resource = useResource<DemoFeedbackAdminList>(
    `/api/v1/admin/demo-feedback?${query.toString()}`,
  );
  const data = resource.data;
  return (
    <Workspace
      title="Showroom feedback"
      description="Triage structured feedback left by visitors exploring the synthetic demonstration. Nothing here is a customer review or a claim."
    >
      <ResourceState {...resource} retry={resource.reload} />
      {data && (
        <>
          <fieldset className="flex flex-wrap gap-3">
            <legend className="sr-only">Feedback filters</legend>
            <div className="field">
              <label htmlFor="feedback-status-filter">Status</label>
              <select
                id="feedback-status-filter"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {demoFeedbackStatuses.map((item) => (
                  <option key={item} value={item}>
                    {humanize(item)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="feedback-category-filter">Category</label>
              <select
                id="feedback-category-filter"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All categories</option>
                {demoFeedbackCategories.map((item) => (
                  <option key={item} value={item}>
                    {humanize(item)}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>
          <p aria-live="polite">
            {data.summary.map((row) => `${humanize(row.status)}: ${row.count}`).join(' · ')}
          </p>
          {data.items.length === 0 && <p>No showroom feedback has been submitted yet.</p>}
          <div className="grid gap-4">
            {data.items.map((item) => (
              <FeedbackCard key={item.id} item={item} reload={resource.reload} />
            ))}
          </div>
          <Pagination data={data} page={page} change={setPage} />
          <p className="notice" role="note">
            {data.limitations.map((line) => (
              <span key={line}>
                {line}
                <br />
              </span>
            ))}
          </p>
        </>
      )}
    </Workspace>
  );
}

function FeedbackCard({ item, reload }: { item: DemoFeedbackAdminView; reload: () => unknown }) {
  const closed = item.status === 'ACTIONED' || item.status === 'DISMISSED';
  const nextStatuses = demoFeedbackStatuses.filter((candidate) => candidate !== item.status);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>
            {humanize(item.category)} · {humanize(item.status)}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p>
          Screen:{' '}
          {humanize(
            item.screenKey
              .replace('PRESENTATION:', 'Presentation: ')
              .replace('WORKSPACE:', 'Workspace: '),
          )}
        </p>
        <p>
          Scenario {item.scenarioId} · generation {item.generation} ·{' '}
          {new Date(item.createdAt).toLocaleString()}
        </p>
        <p className="notice" role="note">
          {item.sourceLabel}. This does not prove a real participant view or product result.
        </p>
        {item.comment && <p>{item.comment}</p>}
        <details>
          <summary>Moderation history ({item.events.length})</summary>
          <ol>
            {item.events.map((event) => (
              <li key={event.id}>
                <strong>{humanize(event.kind)}</strong> · {event.actorName} ·{' '}
                {new Date(event.createdAt).toLocaleString()}
                {event.fromStatus && event.toStatus
                  ? ` · ${humanize(event.fromStatus)} to ${humanize(event.toStatus)}`
                  : ''}
                {event.note && <p>{event.note}</p>}
              </li>
            ))}
          </ol>
        </details>
        {!closed && (
          <ActionForm
            label="Record moderation decision"
            action={(form) =>
              apiFetch(`/api/v1/admin/demo-feedback/${encodeURIComponent(item.id)}`, {
                method: 'PATCH',
                body: {
                  expectedStatus: item.status,
                  status: text(form, 'status'),
                  note: text(form, 'note'),
                },
              })
            }
            onSuccess={reload}
            successMessage="Moderation recorded. The submitted words are unchanged."
          >
            <Select
              name="status"
              label="Next status"
              options={nextStatuses.map((candidate) => ({
                value: candidate,
                label: humanize(candidate),
              }))}
            />
            <div className="field">
              <label htmlFor={`note-${item.id}`}>Reason (required to close out)</label>
              <textarea id={`note-${item.id}`} name="note" rows={2} maxLength={1000} />
            </div>
          </ActionForm>
        )}
      </CardContent>
    </Card>
  );
}
