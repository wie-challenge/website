import type { ApiFailure, MeView } from '@nasj/contracts';
import { safeApiPath } from './navigation';
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: ApiFailure,
  ) {
    super(
      ['SECURITY_DENIED', 'SECURITY_UNAVAILABLE'].includes(detail.code) && detail.requestId
        ? `${detail.message} Request reference: ${detail.requestId}`
        : detail.message,
    );
  }
}
export async function apiFetch<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    idempotencyKey?: string;
    csrfToken?: string;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  if (!safeApiPath(path)) throw new Error('Invalid API destination.');
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    if (path.startsWith('/api/v1/'))
      headers['X-CSRF-Token'] =
        options.csrfToken ?? (await apiFetch<MeView>('/api/v1/me')).csrfToken;
  }
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}),
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs ?? 15000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError')
      throw new ApiError(504, {
        code: 'API_TIMEOUT',
        message: 'The request took too long. Please try again.',
      });
    throw new ApiError(503, {
      code: 'API_UNAVAILABLE',
      message: 'The service is temporarily unavailable. Please try again.',
    });
  }
  const body = await response.json().catch(() => null);
  // The API rejects stale proofs before performing the mutation.
  if (options.csrfToken && response.status === 403 && body?.code === 'CSRF_REJECTED')
    return apiFetch<T>(path, { ...options, csrfToken: undefined });
  if (!response.ok)
    throw new ApiError(
      response.status,
      body?.code && typeof body.message === 'string'
        ? body
        : { code: 'REQUEST_FAILED', message: 'Unable to complete this request.' },
    );
  return body as T;
}
