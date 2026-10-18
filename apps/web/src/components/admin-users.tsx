'use client';
import { useHydrated } from '@/lib/use-hydrated';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { AccountUpdate, Page, UserView } from '@hirfacare/contracts';
import { apiFetch, ApiError } from '@/lib/api';
export function AdminUsers({ initial }: { initial: Page<UserView> }) {
  const router = useRouter();
  const ready = useHydrated();
  const [data, setData] = useState(initial);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  function load(page: number) {
    start(async () => {
      setError('');
      try {
        setData(
          await apiFetch(
            `/api/v1/admin/users?page=${page}&pageSize=20&q=${encodeURIComponent(query)}`,
          ),
        );
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Unable to load users.');
      }
    });
  }
  function update(user: UserView, input: AccountUpdate) {
    start(async () => {
      setError('');
      setMessage('');
      try {
        const updated = await apiFetch<UserView>(`/api/v1/admin/users/${user.id}`, {
          method: 'PATCH',
          body: input,
        });
        setData((previous) => ({
          ...previous,
          items: previous.items.map((item) => (item.id === user.id ? updated : item)),
        }));
        setMessage('Account access updated. Existing sessions were revoked.');
        router.refresh();
      } catch (failure) {
        if (failure instanceof ApiError && failure.status === 401) router.replace('/auth/login');
        setError(failure instanceof Error ? failure.message : 'Unable to update account.');
      }
    });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h1>People.</h1>
          <p className="lead">Manage account access with care.</p>
        </div>
        <span className="badge">{data.total} accounts</span>
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      <section className="panel">
        <form
          className="search-form"
          onSubmit={(event) => {
            event.preventDefault();
            load(1);
          }}
        >
          <label htmlFor="search">Search by name or email</label>
          <div>
            <input
              id="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={120}
            />
            <button type="submit" className="button secondary" disabled={pending || !ready}>
              Search
            </button>
          </div>
        </form>
        <div className="table-scroll">
          <table>
            <caption className="sr-only">User administration</caption>
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Verification</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.name}</strong>
                    <span>{user.email}</span>
                  </td>
                  <td>{user.emailVerified ? 'Verified' : 'Pending'}</td>
                  <td>
                    <select
                      aria-label={`Role for ${user.name}`}
                      value={user.role}
                      disabled={pending || !user.emailVerified}
                      onChange={(event) =>
                        update(user, { role: event.target.value as UserView['role'] })
                      }
                    >
                      <option value="USER">User</option>
                      <option value="ADMIN">Administrator</option>
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label={`Status for ${user.name}`}
                      value={user.status}
                      disabled={pending || !ready}
                      onChange={(event) =>
                        update(user, { status: event.target.value as UserView['status'] })
                      }
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="SUSPENDED">Suspended</option>
                      <option value="DISABLED">Disabled</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.items.length === 0 && <p>No matching accounts.</p>}
        <div className="pagination">
          <button
            type="button"
            className="text-button"
            disabled={pending || data.page === 1}
            onClick={() => load(data.page - 1)}
          >
            Previous
          </button>
          <span>
            Page {data.page} · {data.total} accounts
          </span>
          <button
            type="button"
            className="text-button"
            disabled={pending || data.page * data.pageSize >= data.total}
            onClick={() => load(data.page + 1)}
          >
            Next
          </button>
        </div>
      </section>
    </>
  );
}
