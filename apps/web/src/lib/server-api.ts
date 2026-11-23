import 'server-only';
import { headers } from 'next/headers';
import { isIP } from 'node:net';
import { cache } from 'react';
import type { IdentityContext, MeView } from '@nasj/contracts';
export class ServerRequestBlocked extends Error {
  constructor(readonly requestId: string | null) {
    super('Request protection blocked access.');
  }
}

export async function serverApi<T>(path: string): Promise<T | null> {
  if (!path.startsWith('/api/v1/')) throw new Error('Invalid server API destination.');
  const incoming = await headers();
  const origin = new URL(process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001');
  const upstreamHeaders: Record<string, string> = {
    Cookie: incoming.get('cookie') ?? '',
    Accept: 'application/json',
  };
  // Opt in only on loopback deployments where ingress replaces X-Forwarded-For.
  if (process.env.NASJ_TRUST_LOCAL_INGRESS === '1' && origin.hostname === '127.0.0.1') {
    const clientIp = incoming.get('x-forwarded-for');
    if (clientIp && isIP(clientIp)) upstreamHeaders['X-Forwarded-For'] = clientIp;
    const userAgent = incoming.get('user-agent');
    if (userAgent) upstreamHeaders['User-Agent'] = userAgent;
  }
  const response = await fetch(new URL(path, origin), {
    headers: upstreamHeaders,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 403) {
    const failure = await response.json().catch(() => null);
    if (failure?.code === 'SECURITY_DENIED')
      throw new ServerRequestBlocked(response.headers.get('x-request-id'));
    return null;
  }
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('The account service is temporarily unavailable.');
  return response.json() as Promise<T>;
}
export const getMe = cache(() => serverApi<MeView>('/api/v1/me'));

export const getIdentityContext = cache(() => serverApi<IdentityContext>('/api/v1/me/context'));
