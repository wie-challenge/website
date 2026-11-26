import {
  assistantChatSchema,
  assistantEventSchema,
  type AssistantChat,
  type MeView,
} from '@nasj/contracts';
import { apiFetch } from './api';

export async function readAssistantStream(response: Response, onText: (text: string) => void) {
  if (
    response.status === 503 &&
    response.headers.get('content-type')?.startsWith('application/json')
  ) {
    const body: unknown = await response.json().catch(() => null);
    if (
      body &&
      typeof body === 'object' &&
      'code' in body &&
      (body.code === 'ASSISTANT_NOT_CONFIGURED' || body.code === 'ASSISTANT_UNAVAILABLE')
    ) {
      throw new Error('ASSISTANT_GUIDE_FALLBACK');
    }
  }
  if (
    !response.ok ||
    !response.headers.get('content-type')?.startsWith('application/x-ndjson') ||
    !response.body
  )
    throw new Error('ASSISTANT_UNAVAILABLE');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  let requestId: string | undefined;
  let seq = 0;
  let length = 0;
  let done = false;
  const line = (text: string) => {
    const event = assistantEventSchema.parse(JSON.parse(text));
    requestId ??= event.requestId;
    if (done || event.requestId !== requestId || event.seq !== seq++)
      throw new Error('INVALID_STREAM');
    if (event.type === 'error') throw new Error(event.code);
    if (event.type === 'done') {
      done = true;
      return;
    }
    length += event.text.length;
    if (length > 16000) throw new Error('INVALID_STREAM');
    onText(event.text);
  };
  try {
    while (!done) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const value of lines) {
        if (value.length > 20000) throw new Error('INVALID_STREAM');
        if (value.trim()) line(value);
      }
      if (buffer.length > 20000) throw new Error('INVALID_STREAM');
      if (chunk.done) {
        if (buffer.trim()) line(buffer);
        if (!done) throw new Error('INCOMPLETE_STREAM');
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function streamAssistant(
  chat: AssistantChat,
  signal: AbortSignal,
  onText: (text: string) => void,
) {
  assistantChatSchema.parse(chat);
  const { csrfToken } = await apiFetch<MeView>('/api/v1/me');
  signal.throwIfAborted();
  const response = await fetch('/api/v1/assistant/chat', {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
    headers: {
      Accept: 'application/x-ndjson',
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify(chat),
    signal: AbortSignal.any([signal, AbortSignal.timeout(65000)]),
  });
  await readAssistantStream(response, onText);
}
