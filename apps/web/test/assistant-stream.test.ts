import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readAssistantStream } from '../src/lib/assistant-stream';

const requestId = '12345678-1234-4234-8234-123456789abc';
const delta = { version: 1, requestId, seq: 0, type: 'delta', text: 'مرحبا à NASJ' };
const done = { version: 1, requestId, seq: 1, type: 'done', provider: 'fake' };
function stream(events: unknown[], bytewise = false) {
  const bytes = new TextEncoder().encode(`${events.map((e) => JSON.stringify(e)).join('\n')}\n`);
  return new Response(
    new ReadableStream({
      start(c) {
        if (bytewise) for (const b of bytes) c.enqueue(new Uint8Array([b]));
        else c.enqueue(bytes);
        c.close();
      },
    }),
    { headers: { 'Content-Type': 'application/x-ndjson' } },
  );
}
test('reads streaming NDJSON with split Arabic/French UTF-8 bytes', async () => {
  let text = '';
  await readAssistantStream(stream([delta, done], true), (d) => {
    text += d;
  });
  assert.equal(text, delta.text);
});
test('rejects truncated, cross-request, out-of-order, malformed and error streams', async () => {
  for (const events of [
    [delta],
    [delta, { ...done, requestId: '22345678-1234-4234-8234-123456789abc' }],
    [{ ...delta, seq: 1 }, done],
    [{ unknown: true }],
    [{ version: 1, requestId, seq: 0, type: 'error', code: 'ASSISTANT_UNAVAILABLE' }],
  ])
    await assert.rejects(readAssistantStream(stream(events), () => {}));
});

test('offers the guide only for recognized pre-stream 503 errors', async () => {
  await assert.rejects(
    readAssistantStream(
      Response.json({ code: 'ASSISTANT_NOT_CONFIGURED' }, { status: 503 }),
      () => {},
    ),
    { message: 'ASSISTANT_GUIDE_FALLBACK' },
  );
  await assert.rejects(
    readAssistantStream(
      Response.json({ code: 'ASSISTANT_UNAVAILABLE' }, { status: 503 }),
      () => {},
    ),
    { message: 'ASSISTANT_GUIDE_FALLBACK' },
  );
});
